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

// Import new modules
const { MigrationState } = require('./lib/migrationState');
const { OutputHandler, EXIT_CODES } = require('./lib/outputHandler');
const { loadCoreTokens, getTokensForProfile, listProfiles } = require('./lib/coreTokens');
const { retryWithBackoff, isRetryableError, TransactionPipeline } = require('./lib/asyncHelpers');
const { getBaseURL } = require('./utils/hederaMirrorHelpers');

// Environment variables will be checked in main() when needed
let testnetOperatorId;
let testnetOperatorKey;

// Configuration - can be overridden via environment
const MAX_TX_FEE = new Hbar(Number(process.env.MAX_TX_FEE) || 80);
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 10;
const CONCURRENT_TXS = Number(process.env.CONCURRENT_TXS) || 3;

const SUPPLY_KEY = process.env.SUPPLY_KEY ? PrivateKey.fromStringED25519(process.env.SUPPLY_KEY) : PrivateKey.generate();

/**
 * Create a custom royalty fee for the migrated token
 * @param {AccountId} collectorId - Fee collector account
 * @param {Object} originalFees - Original token fees from mainnet
 * @returns {CustomRoyaltyFee|null}
 */
function createRoyaltyFee(collectorId, originalFees) {
	if (!originalFees) return null;

	let fee = null;

	if (originalFees.royalty_fees && originalFees.royalty_fees.length > 0) {
		fee = new CustomRoyaltyFee()
			.setNumerator(1)
			.setDenominator(100)
			.setFeeCollectorAccountId(collectorId);
	}

	if (originalFees.fixed_fees && originalFees.fixed_fees.length > 0) {
		if (!fee) {
			fee = new CustomRoyaltyFee().setFeeCollectorAccountId(collectorId);
		}
		fee.setFallbackFee(new CustomFixedFee().setHbarAmount(new Hbar(1, HbarUnit.Hbar)));
	}

	return fee;
}

/**
 * Get token details from mirror node
 * @param {string} env - Environment (main, test, preview, local)
 * @param {string} tokenId - Token ID
 * @returns {Object|null} Token details
 */
async function getTokenDetails(env, tokenId) {
	const baseUrl = getBaseURL(env);
	const url = `${baseUrl}/api/v1/tokens/${tokenId}`;

	try {
		const response = await retryWithBackoff(
			() => axios.get(url, { timeout: 30000 }),
			{
				maxRetries: 3,
				retryOn: isRetryableError,
				onRetry: (err, attempt) => console.log(`Retry ${attempt} for token details: ${err.message}`),
			},
		);

		return {
			symbol: response.data.symbol,
			name: response.data.name,
			max_supply: response.data.max_supply,
			total_supply: response.data.total_supply,
			type: response.data.type,
			custom_fees: response.data.custom_fees,
			memo: response.data.memo,
		};
	}
	catch (err) {
		console.error(`Failed to fetch token details: ${err.message}`);
		return null;
	}
}

/**
 * Fetch all NFT data for a token from mirror node
 * @param {string} env - Environment
 * @param {string} token - Token ID
 * @param {OutputHandler} output - Output handler for progress
 * @returns {Object|null} Token data with NFTs
 */
async function fetchTokenData(env, token, output = null) {
	try {
		const tokenDetails = await getTokenDetails(env, token);
		if (!tokenDetails || tokenDetails.type !== 'NON_FUNGIBLE_UNIQUE') {
			return null;
		}

		const baseUrl = getBaseURL(env);
		const nfts = [];
		let route = `/api/v1/tokens/${token}/nfts?limit=100`;
		do {
			const url = `${baseUrl}${route}`;
			const response = await retryWithBackoff(
				() => axios.get(url, { timeout: 30000 }),
				{
					maxRetries: 3,
					retryOn: isRetryableError,
				},
			);

			const jsonResponse = response.data;
			for (const nft of jsonResponse.nfts) {
				nfts.push({
					serial_number: Number(nft.serial_number),
					metadata: Buffer.from(nft.metadata, 'base64').toString('utf-8'),
					deleted: nft.deleted,
				});
			}

			if (output) {
				output.progress(nfts.length, Number(tokenDetails.total_supply) || nfts.length, 'Fetching NFTs');
			}

			route = jsonResponse.links.next;
		} while (route != null);

		if (output) output.clearProgress();

		return { tokenDetails, nfts };
	}
	catch (err) {
		console.error(err);
		return null;
	}
}

/**
 * Print help message
 */
function printHelp() {
	console.log(`
Usage: node migrateToken.js <tokenList> [options]

Arguments:
  tokenList                     Comma-separated list of token IDs to migrate

Options:
  --network <network>           Target network: testnet, previewnet, local (default: testnet)
  --cache                       Create cache files instead of migrating
  --name <name>                 Base name for cache files (default: token name)
  --royalty-mode <mode>         How to handle royalties: operator, skip, custom (default: operator)
  --profile <profile>           Use tokens from a profile in core-tokens.json
  --manifest <file>             Use a manifest file for batch migration
  --json                        Output results as JSON
  --yes, -y                     Skip confirmation prompts (for CI/CD)
  --quiet, -q                   Minimal output
  --verbose, -v                 Verbose output with debug info
  --resume                      Resume incomplete migration
  --list-profiles               List available profiles from core-tokens.json
  -h, --help                    Show this help message

Royalty Modes:
  operator    Replace all royalty collectors with migration operator (default)
  skip        Remove all royalties from migrated token
  custom      Prompt for new royalty collector accounts (not yet implemented)

Examples:
  # Migrate single token
  node migrateToken.js 0.0.12345

  # Cache token data for offline migration
  node migrateToken.js 0.0.12345 --cache --name mycollection

  # Migrate using profile from core-tokens.json
  node migrateToken.js --profile ci --network testnet

  # CI/CD friendly migration with JSON output
  node migrateToken.js 0.0.12345 --json --yes --network testnet

  # Resume interrupted migration
  node migrateToken.js 0.0.12345 --resume
`);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
	const args = {
		network: 'testnet',
		cacheMode: false,
		baseName: null,
		tokenList: [],
		royaltyMode: 'operator',
		profile: null,
		manifest: null,
		json: false,
		yes: false,
		quiet: false,
		verbose: false,
		resume: false,
		listProfiles: false,
		help: false,
	};

	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];

		if (arg === '--network' && i + 1 < process.argv.length) {
			args.network = process.argv[++i];
		}
		else if (arg === '--cache') {
			args.cacheMode = true;
		}
		else if (arg === '--name' && i + 1 < process.argv.length) {
			args.baseName = process.argv[++i];
		}
		else if (arg === '--royalty-mode' && i + 1 < process.argv.length) {
			args.royaltyMode = process.argv[++i];
		}
		else if (arg === '--profile' && i + 1 < process.argv.length) {
			args.profile = process.argv[++i];
		}
		else if (arg === '--manifest' && i + 1 < process.argv.length) {
			args.manifest = process.argv[++i];
		}
		else if (arg === '--json') {
			args.json = true;
		}
		else if (arg === '--yes' || arg === '-y') {
			args.yes = true;
		}
		else if (arg === '--quiet' || arg === '-q') {
			args.quiet = true;
		}
		else if (arg === '--verbose' || arg === '-v') {
			args.verbose = true;
		}
		else if (arg === '--resume') {
			args.resume = true;
		}
		else if (arg === '--list-profiles') {
			args.listProfiles = true;
		}
		else if (arg === '-h' || arg === '--help') {
			args.help = true;
		}
		else if (!arg.startsWith('-')) {
			// Treat as token list
			args.tokenList = arg.split(',').filter(t => t.trim());
		}
	}

	return args;
}

/**
 * Main migration function
 */
async function main() {
	const args = parseArgs();
	const output = new OutputHandler({
		json: args.json,
		quiet: args.quiet,
		verbose: args.verbose,
	});

	// Handle help
	if (args.help) {
		printHelp();
		process.exit(EXIT_CODES.SUCCESS);
	}

	// Handle list profiles
	if (args.listProfiles) {
		const config = loadCoreTokens();
		if (!config) {
			output.error('CONFIG_ERROR', 'No core-tokens.json found');
			process.exit(output.finalize(EXIT_CODES.CONFIG_ERROR));
		}
		const profiles = listProfiles(config);
		if (args.json) {
			console.log(JSON.stringify({ profiles }, null, 2));
		}
		else {
			console.log('Available profiles:');
			for (const p of profiles) {
				console.log(`  ${p.name}: ${p.description} (${p.tokenCount} tokens)`);
			}
		}
		process.exit(EXIT_CODES.SUCCESS);
	}

	// Get token list from profile if specified
	let tokenList = args.tokenList;
	if (args.profile) {
		const config = loadCoreTokens();
		if (!config) {
			output.error('CONFIG_ERROR', 'No core-tokens.json found');
			process.exit(output.finalize(EXIT_CODES.CONFIG_ERROR));
		}
		const profileTokens = getTokensForProfile(config, args.profile);
		if (profileTokens.length === 0) {
			output.error('CONFIG_ERROR', `Profile '${args.profile}' not found or has no enabled tokens`);
			process.exit(output.finalize(EXIT_CODES.CONFIG_ERROR));
		}
		tokenList = profileTokens.map(t => t.id);
		output.log(`Using profile '${args.profile}' with ${tokenList.length} token(s)`);
	}

	// Validate we have tokens
	if (tokenList.length === 0 && !args.cacheMode) {
		output.error('VALIDATION_ERROR', 'No tokens specified. Use token IDs or --profile <name>');
		printHelp();
		process.exit(output.finalize(EXIT_CODES.VALIDATION_ERROR));
	}

	// Check environment variables only if not in cache mode
	if (!args.cacheMode) {
		if (!process.env.ACCOUNT_ID || !process.env.PRIVATE_KEY) {
			output.error('CONFIG_ERROR', 'Environment variables ACCOUNT_ID and PRIVATE_KEY are required');
			output.log('Please ensure your .env file contains:');
			output.log('  ACCOUNT_ID=your_account_id');
			output.log('  PRIVATE_KEY=your_private_key');
			output.log('');
			output.log('For cache-only mode, use: --cache');
			process.exit(output.finalize(EXIT_CODES.CONFIG_ERROR));
		}

		testnetOperatorId = AccountId.fromString(process.env.ACCOUNT_ID);
		testnetOperatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
	}

	// Validate network
	const validNetworks = ['testnet', 'previewnet', 'local'];
	if (!validNetworks.includes(args.network)) {
		output.error('VALIDATION_ERROR', `Invalid network: ${args.network}. Use: ${validNetworks.join(', ')}`);
		process.exit(output.finalize(EXIT_CODES.VALIDATION_ERROR));
	}

	// Validate royalty mode
	const validRoyaltyModes = ['operator', 'skip', 'custom'];
	if (!validRoyaltyModes.includes(args.royaltyMode)) {
		output.error('VALIDATION_ERROR', `Invalid royalty mode: ${args.royaltyMode}. Use: ${validRoyaltyModes.join(', ')}`);
		process.exit(output.finalize(EXIT_CODES.VALIDATION_ERROR));
	}

	// Create Hedera client
	let client;
	if (args.network === 'testnet') {
		client = Client.forTestnet();
	}
	else if (args.network === 'previewnet') {
		client = Client.forPreviewnet();
	}
	else if (args.network === 'local') {
		client = Client.forLocalNode();
	}

	if (!args.cacheMode) {
		client.setOperator(testnetOperatorId, testnetOperatorKey);
	}

	// Save supply key if auto-generated
	if (!process.env.SUPPLY_KEY && !args.cacheMode) {
		output.log('No supply key provided. Generating a new one and saving it to file');
		saveKeyToFile(tokenList);
	}

	// Process each token
	for (const token of tokenList) {
		await processToken(token, args, client, output);
	}

	output.log('Migration complete');
	process.exit(output.finalize(EXIT_CODES.SUCCESS));
}

/**
 * Process a single token (cache or migrate)
 */
async function processToken(token, args, client, output) {
	let data;

	// Cache mode - just fetch and save
	if (args.cacheMode) {
		output.log(`Fetching data for token ${token}...`);
		data = await fetchTokenData('main', token, output);

		if (!data) {
			output.error('FETCH_ERROR', `Token ${token} not found or not NFT`);
			return;
		}

		// Enhanced cache format with versioning
		const cacheData = {
			schema_version: '1.0.0',
			source: {
				network: 'mainnet',
				token_id: token,
				fetched_at: new Date().toISOString(),
			},
			integrity: {
				nft_count: data.nfts.length,
				total_supply: data.tokenDetails.total_supply,
			},
			tokenDetails: data.tokenDetails,
			nfts: data.nfts,
		};

		const fileName = args.baseName
			? `${args.baseName}-${token}.json`
			: `${data.tokenDetails.name.replace(/[^a-zA-Z0-9]/g, '_')}-${token}.json`;

		fs.writeFileSync(fileName, JSON.stringify(cacheData, null, 2));
		output.log(`Cached data for ${token} to ${fileName}`);
		output.addMigration({
			sourceToken: token,
			action: 'cached',
			cacheFile: fileName,
			nftCount: data.nfts.length,
		});
		return;
	}

	// Migration mode - check for cached data first
	const possibleCacheFiles = [
		args.baseName ? `${args.baseName}-${token}.json` : null,
		`${token}.json`,
	].filter(Boolean);

	let cacheFile = null;
	for (const file of possibleCacheFiles) {
		if (fs.existsSync(file)) {
			cacheFile = file;
			break;
		}
	}

	if (cacheFile) {
		data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
		// Handle both old and new cache formats
		if (data.schema_version) {
			output.log(`Loaded cached data (v${data.schema_version}) for ${token} from ${cacheFile}`);
		}
		else {
			output.log(`Loaded cached data for ${token} from ${cacheFile}`);
		}
	}
	else {
		output.log(`Fetching live data for token ${token}...`);
		data = await fetchTokenData('main', token, output);
		if (!data) {
			output.error('FETCH_ERROR', `Token ${token} not found or not NFT`);
			return;
		}
	}

	const tokenDetails = data.tokenDetails;

	// Initialize migration state for resumability
	const state = new MigrationState(token, args.network);
	state.init();

	let newToken;

	// Check if we're resuming
	if (args.resume && state.canResume()) {
		newToken = state.getTargetToken();
		output.log(`Resuming migration to existing token ${newToken}`);
	}
	else {
		// Create new token
		output.log(`Migrating token ${token} named ${tokenDetails.name} with symbol ${tokenDetails.symbol}`);

		const tokenCreateTx = new TokenCreateTransaction()
			.setTokenType(TokenType.NonFungibleUnique)
			.setTokenName(tokenDetails.name)
			.setTokenSymbol(tokenDetails.symbol)
			.setTokenMemo(tokenDetails.memo || '')
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

		// Handle royalties
		if (tokenDetails.custom_fees) {
			output.warn('Token has custom fees/royalties - original collectors won\'t work on testnet');

			if (args.royaltyMode === 'operator') {
				output.log('Royalty mode: Replace all royalty collectors with migration operator');
				const fee = createRoyaltyFee(testnetOperatorId, tokenDetails.custom_fees);
				if (fee) tokenCreateTx.setCustomFees([fee]);
			}
			else if (args.royaltyMode === 'skip') {
				output.log('Royalty mode: Skipping all royalties (token will have no fees)');
			}
			else if (args.royaltyMode === 'custom') {
				output.warn('Custom royalty mode not yet implemented, falling back to operator');
				const fee = createRoyaltyFee(testnetOperatorId, tokenDetails.custom_fees);
				if (fee) tokenCreateTx.setCustomFees([fee]);
			}
		}

		try {
			const executionResponse = await tokenCreateTx.execute(client);
			const createTokenRx = await executionResponse.getReceipt(client);
			newToken = createTokenRx.tokenId;
			state.setTargetToken(newToken);
			output.log(`Token ${token} created with ID ${newToken.toString()}`);
		}
		catch (err) {
			output.error('TX_FAILED', `Token creation failed: ${err.message}`);
			state.fail(err.message);
			return;
		}
	}

	// Prepare NFT data
	const nfts = data.nfts;
	state.setTotalNfts(nfts.length);

	const serials = nfts.map(n => n.serial_number);
	const metadata = nfts.map(n => n.metadata);
	const deleteIds = nfts.map(n => n.deleted);

	output.log(`Found ${serials.length} NFTs to migrate`);

	// Reverse order for proper serial assignment
	serials.reverse();
	metadata.reverse();
	deleteIds.reverse();

	// Mint NFTs with concurrent pipeline
	const startBatch = args.resume ? state.getNextBatchIndex() : 0;
	const totalBatches = Math.ceil(serials.length / BATCH_SIZE);

	output.log(`Minting ${serials.length} NFTs in ${totalBatches} batches (starting from batch ${startBatch})`);

	const pipeline = new TransactionPipeline({
		maxInFlight: CONCURRENT_TXS,
		onProgress: (completed) => {
			output.progress(completed + startBatch, totalBatches, 'Minting batches');
		},
	});

	for (let batchIndex = startBatch; batchIndex < totalBatches; batchIndex++) {
		const i = batchIndex * BATCH_SIZE;

		// Skip already completed batches
		if (state.isBatchCompleted(batchIndex)) {
			continue;
		}

		await pipeline.submit(`batch-${batchIndex}`, async () => {
			const mintTx = new TokenMintTransaction()
				.setTokenId(newToken)
				.setMaxTransactionFee(MAX_TX_FEE);

			const batchSerials = [];
			for (let j = i; j < i + BATCH_SIZE && j < serials.length; j++) {
				mintTx.addMetadata(Buffer.from(metadata[j]));
				batchSerials.push(serials[j]);
			}

			const signedTx = await mintTx.freezeWith(client).sign(SUPPLY_KEY);
			const mintResponse = await signedTx.execute(client);
			const mintReceipt = await mintResponse.getReceipt(client);

			state.completeMintBatch(batchIndex, batchSerials);

			return mintReceipt;
		});
	}

	await pipeline.flush();
	output.clearProgress();

	const mintSummary = pipeline.getSummary();
	if (mintSummary.errors.length > 0) {
		output.warn(`${mintSummary.errors.length} batch(es) failed during minting`);
		for (const err of mintSummary.errors) {
			state.recordError(err.error, { batch: err.id });
		}
	}

	output.log(`Minted ${mintSummary.completed} batches successfully`);

	// Burn deleted NFTs (collect all and do at end)
	const toDelete = serials.filter((serial, index) => deleteIds[index]);

	if (toDelete.length > 0) {
		output.log(`Burning ${toDelete.length} deleted NFTs...`);

		for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
			const batch = toDelete.slice(i, i + BATCH_SIZE);

			try {
				const deleteTx = new TokenBurnTransaction()
					.setTokenId(newToken)
					.setSerials(batch)
					.setMaxTransactionFee(MAX_TX_FEE);

				const deleteTxSigned = await deleteTx.freezeWith(client).sign(SUPPLY_KEY);
				const deleteResponse = await deleteTxSigned.execute(client);
				await deleteResponse.getReceipt(client);

				state.recordBurns(batch);
				output.debug(`Burned serials: ${batch.join(', ')}`);
			}
			catch (err) {
				output.warn(`Failed to burn serials ${batch.join(', ')}: ${err.message}`);
				state.recordError(err, { action: 'burn', serials: batch });
			}
		}
	}

	// Mark migration complete
	state.complete();

	output.addMigration({
		sourceToken: token,
		targetToken: newToken.toString(),
		network: args.network,
		tokenName: tokenDetails.name,
		nftsMinted: serials.length,
		nftsBurned: toDelete.length,
		status: 'completed',
	});

	output.log(`${tokenDetails.name}: Mainnet Token ${token} migrated to ${args.network} ${newToken.toString()}`);
}

/**
 * Save generated supply key to file
 */
function saveKeyToFile(tokens) {
	const startTime = new Date();
	const timestamp = startTime.toISOString().split('.')[0].replaceAll(':', '-');
	const filename = `./migration-keys-${timestamp}.txt`;

	const outputString = `Mainnet Tokens: ${tokens.join(', ')}\nSupply Key: ${SUPPLY_KEY.toString()}\n`;

	fs.writeFileSync(filename, outputString, { flag: 'w' });
	console.log('Token details file created:', filename);
}

// Run main function
main().catch((err) => {
	console.error('Fatal error:', err.message);
	if (process.env.DEBUG) {
		console.error(err.stack);
	}
	process.exit(EXIT_CODES.GENERAL_ERROR);
});
