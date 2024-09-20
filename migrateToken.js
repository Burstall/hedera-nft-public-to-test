require('dotenv').config();
const {
	AccountId,
	PrivateKey,
	Client,
	TokenCreateTransaction,
	TokenType,
	Hbar,
	TokenSupplyType,
	CustomRoyaltyFee,
	CustomFixedFee,
	HbarUnit,
	TokenMintTransaction,
	TokenBurnTransaction,
} = require('@hashgraph/sdk');
const axios = require('axios');
const fs = require('fs');

if (process.env.ACCOUNT_ID == null || process.env.PRIVATE_KEY == null) {
	throw new Error('Environment variables OPERATOR_ID and OPERATOR_KEY must be present');
}

const testnetOperatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const testnetOperatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);

const MIRROR_NODE = 'https://mainnet-public.mirrornode.hedera.com';
const MAX_TX_FEE = new Hbar(80);

const client = Client.forTestnet();
client.setOperator(testnetOperatorId, testnetOperatorKey);

const SUPPLY_KEY = process.env.SUPPLY_KEY ? PrivateKey.fromStringED25519(process.env.SUPPLY_KEY) : PrivateKey.generate();

async function main() {
	// if -h flag is passed, print help
	if (process.argv.includes('-h')) {
		console.log('Usage: node migrateToken.js <tokenList>');
		console.log('tokenList: a comma separated list of token IDs to migrate to testnet');
		return;
	}

	// get the token list as first argument
	const tokenList = process.argv[2].split(',');

	if (tokenList.length === 0) {
		throw new Error('Token list is empty');
	}

	if (!process.env.SUPPLY_KEY) {
		console.log('No supply key provided. Generating a new one and saving it to file');
		saveKeyToFile(tokenList);
	}

	const strOutput = [];

	for (const token of tokenList) {
		const tokenDetails = await getTokenDetails(token);
		if (tokenDetails === null) {
			console.error(`Token ${token} not found on mirror node`);
			continue;
		}
		else if (tokenDetails.type != 'NON_FUNGIBLE_UNIQUE') {
			console.error(`Token ${token} is not an NFT. Only NFTs are not supported for migration`);
			continue;
		}

		console.log(`Migrating token ${token} named ${tokenDetails.name} with symbol ${tokenDetails.symbol} and supply ${tokenDetails.max_supply}`);

		const tokenCreateTx = new TokenCreateTransaction()
			.setTokenType(TokenType.NonFungibleUnique)
			.setTokenName(tokenDetails.name)
			.setTokenSymbol(tokenDetails.symbol)
			.setTokenMemo(tokenDetails.memo)
			.setInitialSupply(0)
			.setTreasuryAccountId(testnetOperatorId)
			.setAutoRenewAccountId(testnetOperatorId)
			.setSupplyKey(SUPPLY_KEY)
			.setMaxTransactionFee(MAX_TX_FEE);

		if (Number(tokenDetails.max_supply) > 0) {
			tokenCreateTx.setMaxSupply(Number(tokenDetails.max_supply))
				.setSupplyType(TokenSupplyType.Finite);
		}
		else {
			tokenCreateTx.setSupplyType(TokenSupplyType.Infinite);
		}

		// if the token had fees add some to testnet
		if (tokenDetails.custom_fees) {
			let fee;
			if (tokenDetails.custom_fees.royalty_fees) {
				if (!fee) fee = new CustomRoyaltyFee();

				fee.setNumerator(1)
					.setDenominator(100)
					.setFeeCollectorAccountId(testnetOperatorId);

			}

			if (tokenDetails.custom_fees.fixed_fees) {
				if (!fee) fee = new CustomRoyaltyFee().setFeeCollectorAccountId(testnetOperatorId);

				fee.setFallbackFee(new CustomFixedFee().setHbarAmount(new Hbar(1, HbarUnit.Hbar)));
			}

			if (fee) tokenCreateTx.setCustomFees([fee]);
		}

		const executionResponse = await tokenCreateTx.execute(client);

		/* Get the receipt of the transaction */
		const createTokenRx = await executionResponse.getReceipt(client).catch((e) => {
			console.log(e);
			console.log('Token Create **FAILED*');
			process.exit(1);
		});

		const newToken = createTokenRx.tokenId;

		console.log(`Token ${token} created with ID ${newToken.toString()}`);

		// now read each NFT from mainnet mirror and mint it on testnet
		let route = `/api/v1/tokens/${token}/nfts?limit=100`;

		const serials = [];
		const metadata = [];
		const deleteIds = [];
		do {
			const url = `${MIRROR_NODE}${route}`;
			await axios.get(url)
				.then((response) => {
					const jsonResponse = response.data;

					for (const nft of jsonResponse.nfts) {
						serials.push(Number(nft.serial_number));
						metadata.push(Buffer.from(nft.metadata, 'base64').toString('utf-8'));
						deleteIds.push(nft.deleted);
					}
					route = jsonResponse.links.next;
				})
				.catch(function(err) {
					console.error(err);
					return null;
				});
		}
		while (route != null);

		console.log(`Found ${serials.length} NFTs to migrate`);

		// invert the order of each array
		serials.reverse();
		metadata.reverse();
		deleteIds.reverse();

		// now parse the metadata and mint the NFTs in bacthes of 10
		const batchSize = 10;

		for (let i = 0; i < serials.length; i += batchSize) {
			const mintTx = new TokenMintTransaction()
				.setTokenId(newToken);

			for (let j = i; j < i + batchSize && j < serials.length; j++) {
				mintTx.addMetadata(Buffer.from(metadata[j]));
			}

			mintTx.setMaxTransactionFee(MAX_TX_FEE);

			const signedTx = await mintTx.freezeWith(client).sign(SUPPLY_KEY);

			const mintResponse = await signedTx.execute(client);

			const mintReceipt = await mintResponse.getReceipt(client).catch((e) => {
				console.log(e);
				console.log('Token Mint **FAILED**');
				process.exit(1);
			});

			console.log(`Minted ${mintReceipt.serials.length} NFTs`);

			// get the equivalent slice from deleteIds and filter for serials that are marked true
			const deleteSlice = deleteIds.slice(i, i + batchSize);
			const serialSlice = serials.slice(i, i + batchSize);

			const toDelete = serialSlice.filter((serial, index) => deleteSlice[index]);

			if (toDelete.length > 0) {
				const deleteTx = new TokenBurnTransaction()
					.setTokenId(newToken)
					.setSerials(toDelete);

				const deleteTxSigned = await deleteTx.freezeWith(client).sign(SUPPLY_KEY);

				const deleteResponse = await deleteTxSigned.execute(client);

				const deleteReceipt = await deleteResponse.getReceipt(client).catch((e) => {
					console.log(e);
					console.log('Token Burn **FAILED**');
					process.exit(1);
				});

				console.log(`Burnt ${toDelete.length} NFTs [${toDelete.join(', ')}]: ${deleteReceipt.status.toString()}`);
			}
		}

		strOutput.push(`Mainnet Token ${token} migrated to Testnet ${newToken.toString()}`);
	}

	console.log('Migration complete');
	console.log(strOutput.join('\n'));
}

function saveKeyToFile(tokens) {
	const startTime = new Date();
	const timestamp = startTime.toISOString().split('.')[0].replaceAll(':', '-');
	const filename = `./migration-keys-${timestamp}.txt`;

	const outputString = `Mainnet Tokens: ${tokens.join(', ')}\nSupply Key: ${SUPPLY_KEY.toString()}\n`;

	fs.writeFile(filename, outputString, { flag: 'w' }, function(err) {
		if (err) {return console.error(err);}
		// read it back in to be sure it worked.
		fs.readFile(filename, 'utf-8', function(err) {
			if (err) {
				console.log('Reading file failed -- printing to console');
				console.log(outputString);
			}
			console.log('Token details file created', filename);
		});
	});
}


/**
 * Get the token decimal from mirror
 * @param {TokenId|string} _tokenId
 * @returns {Object} details of the token
 */
async function getTokenDetails(_tokenId) {
	const tokenAsString = typeof _tokenId === 'string' ? _tokenId : _tokenId.toString();
	const url = `${MIRROR_NODE}/api/v1/tokens/${tokenAsString}`;
	let rtnVal = null;
	await axios.get(url)
		.then((response) => {
			const jsonResponse = response.data;
			rtnVal = {
				symbol: jsonResponse.symbol,
				name: jsonResponse.name,
				max_supply: jsonResponse.max_supply,
				type: jsonResponse.type,
				custom_fees: jsonResponse.custom_fees,
				memo: jsonResponse.memo,
			};
		})
		.catch(function(err) {
			console.error(err);
			return null;
		});

	return rtnVal;
}

main().catch((err) => {
	console.error(err);
});