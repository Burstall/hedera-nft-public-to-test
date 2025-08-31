/* eslint-disable space-before-function-paren */
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

// Environment variables will be checked in main() when needed
let testnetOperatorId;
let testnetOperatorKey;

const MIRROR_NODE = 'https://mainnet-public.mirrornode.hedera.com';
const MAX_TX_FEE = new Hbar(80);

const SUPPLY_KEY = process.env.SUPPLY_KEY ? PrivateKey.fromStringED25519(process.env.SUPPLY_KEY) : PrivateKey.generate();

async function fetchTokenData(token) {
	try {
		const tokenDetails = await getTokenDetails(token);
		if (!tokenDetails || tokenDetails.type != 'NON_FUNGIBLE_UNIQUE') {
			return null;
		}
		const nfts = [];
		let route = `/api/v1/tokens/${token}/nfts?limit=100`;
		do {
			const url = `${MIRROR_NODE}${route}`;
			const response = await axios.get(url);
			const jsonResponse = response.data;
			for (const nft of jsonResponse.nfts) {
				nfts.push({
					serial_number: Number(nft.serial_number),
					metadata: Buffer.from(nft.metadata, 'base64').toString('utf-8'),
					deleted: nft.deleted,
				});
			}
			route = jsonResponse.links.next;
		} while (route != null);
		return { tokenDetails, nfts };
	}
	catch (err) {
		console.error(err);
		return null;
	}
}

async function main() {
	// if -h flag is passed, print help
	if (process.argv.includes('-h')) {
		console.log('Usage: node migrateToken.js <tokenList> [--network <testnet|previewnet|local>] [--cache] [--name <name>] [--royalty-mode <operator|skip|custom>]');
		console.log('tokenList: a comma separated list of token IDs to migrate');
		console.log('--network: target network, default testnet');
		console.log('--cache: create cache files instead of migrating');
		console.log('--name: base name for cache files, default token name');
		console.log('--royalty-mode: how to handle royalties - operator (default), skip, or custom');
		console.log('');
		console.log('ROYALTY MODES:');
		console.log('  operator: Replace all royalty collectors with migration operator (current behavior)');
		console.log('  skip: Remove all royalties from migrated token');
		console.log('  custom: Prompt for new royalty collector accounts');
		return;
	}

	let network = 'testnet';
	let cacheMode = false;
	let baseName = null;
	let tokenListArg = null;
	let royaltyMode = 'operator';
	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === '--network' && i + 1 < process.argv.length) {
			network = process.argv[i + 1];
			i++;
		}
		else if (arg === '--cache') {
			cacheMode = true;
		}
		else if (arg === '--name' && i + 1 < process.argv.length) {
			baseName = process.argv[i + 1];
			i++;
		}
		else if (arg === '--royalty-mode' && i + 1 < process.argv.length) {
			royaltyMode = process.argv[i + 1];
			i++;
		}
		else if (arg === '-h') {
			// already handled
		}
		else if (!tokenListArg) {
			tokenListArg = arg;
		}
		else {
			throw new Error('Invalid argument: ' + arg);
		}
	}
	if (!tokenListArg) {
		throw new Error('Token list is required');
	}
	const tokenList = tokenListArg.split(',');

	// Check environment variables only if not in cache mode
	if (!cacheMode) {
		if (process.env.ACCOUNT_ID == null || process.env.PRIVATE_KEY == null) {
			console.log('❌ Configuration Error:');
			console.log('   Environment variables ACCOUNT_ID and PRIVATE_KEY are required for migration');
			console.log('   Please ensure your .env file contains:');
			console.log('   - ACCOUNT_ID=your_account_id');
			console.log('   - PRIVATE_KEY=your_private_key');
			console.log('');
			console.log('   For cache-only mode, use: --cache');
			process.exit(1);
		}

		testnetOperatorId = AccountId.fromString(process.env.ACCOUNT_ID);
		testnetOperatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
	}

	let client;
	if (network === 'testnet') {
		client = Client.forTestnet();
	}
	else if (network === 'previewnet') {
		client = Client.forPreviewnet();
	}
	else if (network === 'local') {
		client = Client.forLocalNode();
	}
	else {
		throw new Error('Invalid network: ' + network);
	}

	// Set operator only if not in cache mode
	if (!cacheMode) {
		client.setOperator(testnetOperatorId, testnetOperatorKey);
	}

	if (tokenList.length === 0) {
		throw new Error('Token list is empty');
	}

	if (!process.env.SUPPLY_KEY) {
		console.log('No supply key provided. Generating a new one and saving it to file');
		saveKeyToFile(tokenList);
	}

	const strOutput = [];

	for (const token of tokenList) {
		let data;
		if (cacheMode) {
			data = await fetchTokenData(token);
			if (!data) {
				console.error(`Token ${token} not found or not NFT`);
				continue;
			}
			const fileName = baseName ? `${baseName}-${token}.json` : `${data.tokenDetails.name.replace(/[^a-zA-Z0-9]/g, '_')}-${token}.json`;
			fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
			console.log(`Cached data for ${token} to ${fileName}`);
			continue;
		}
		else {
			const fileName = baseName ? `${baseName}-${token}.json` : `${token}.json`;
			if (fs.existsSync(fileName)) {
				data = JSON.parse(fs.readFileSync(fileName, 'utf8'));
				console.log(`Loaded cached data for ${token} from ${fileName}`);
			}
			else {
				data = await fetchTokenData(token);
				if (!data) {
					console.error(`Token ${token} not found or not NFT`);
					continue;
				}
			}
		}
		const tokenDetails = data.tokenDetails;

		console.log(`Migrating token ${token} named ${tokenDetails.name} with symbol ${tokenDetails.symbol} and supply ${tokenDetails.max_supply}`); const tokenCreateTx = new TokenCreateTransaction()
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

		// Handle royalties - CRITICAL: Original collectors won't work on testnet
		if (tokenDetails.custom_fees) {
			console.log('⚠️  WARNING: Token has custom fees/royalties!');
			console.log('   Original fee collectors from mainnet cannot receive royalties on testnet');

			if (royaltyMode === 'operator') {
				console.log('   Royalty mode: Replace all royalty collectors with migration operator');
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
			else if (royaltyMode === 'skip') {
				console.log('   Royalty mode: Skipping all royalties (token will have no fees)');
				// Don't set any custom fees
			}
			else if (royaltyMode === 'custom') {
				console.log('   Royalty mode: Custom royalty collectors');
				console.log('   ❗ This feature requires additional implementation');
				console.log('   For now, falling back to operator mode');
				// TODO: Implement custom royalty collector prompting
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
			else {
				console.log(`   ❌ Unknown royalty mode: ${royaltyMode}`);
				console.log('   Valid modes: operator, skip, custom');
				process.exit(1);
			}

			console.log('');
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
		const nfts = data.nfts;
		const serials = nfts.map(n => n.serial_number);
		const metadata = nfts.map(n => n.metadata);
		const deleteIds = nfts.map(n => n.deleted);
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

		strOutput.push(`${tokenDetails.name}: Mainnet Token ${token} migrated to ${network} ${newToken.toString()}`);
	}

	console.log('Migration complete');
	console.log(strOutput.join('\n'));
}

function saveKeyToFile(tokens) {
	const startTime = new Date();
	const timestamp = startTime.toISOString().split('.')[0].replaceAll(':', '-');
	const filename = `./migration-keys-${timestamp}.txt`;

	const outputString = `Mainnet Tokens: ${tokens.join(', ')}\nSupply Key: ${SUPPLY_KEY.toString()}\n`;

	fs.writeFile(filename, outputString, { flag: 'w' }, function (err) {
		if (err) { return console.error(err); }
		// read it back in to be sure it worked.
		fs.readFile(filename, 'utf-8', function (err) {
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
		.catch(function (err) {
			console.error(err);
			return null;
		});

	return rtnVal;
}

main().catch((err) => {
	console.error(err);
});