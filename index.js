/**
 * @lazysuperheroes/hedera-nft-utils
 *
 * Hedera NFT migration and utility toolkit
 * Utilities for migrating NFTs from mainnet to testnet and managing HBAR across accounts
 */

// Key utilities
const { parsePrivateKey, parsePrivateKeys, detectKeyType } = require('./lib/keyUtils');

// Async helpers (retry, concurrency, rate limiting)
const { retryWithBackoff, RateLimiter, TransactionPipeline } = require('./lib/asyncHelpers');

// Migration state management
const { MigrationState } = require('./lib/migrationState');

// Output handling
const { OutputHandler, EXIT_CODES } = require('./lib/outputHandler');

// Core tokens configuration
const { loadCoreTokensConfig, getTokensForProfile, listProfiles } = require('./lib/coreTokens');

// Hedera helpers
const {
	createToken,
	mintNFT,
	burnNFTs,
	sweepHbar,
	associateToken,
	freezeAccount,
	unfreezeAccount,
	grantKyc,
	revokeKyc,
	pauseToken,
	unpauseToken,
	wipeNFTs,
	deleteToken,
	updateToken,
} = require('./utils/hederaHelpers');

// Mirror node helpers
const {
	checkMirrorBalance,
	checkMirrorHbarBalance,
	fetchTokenInfo,
	fetchNFTsForToken,
	fetchAllNFTsForToken,
	fetchNFTsOwned,
	fetchAllNFTsOwned,
	fetchNftMetadataFromMirror,
	getBaseURL,
} = require('./utils/hederaMirrorHelpers');

// Node helpers
const { getArgFlag, getArg, sleep } = require('./utils/nodeHelpers');

module.exports = {
	// Key utilities
	parsePrivateKey,
	parsePrivateKeys,
	detectKeyType,

	// Async helpers
	retryWithBackoff,
	RateLimiter,
	TransactionPipeline,

	// Migration
	MigrationState,

	// Output
	OutputHandler,
	EXIT_CODES,

	// Core tokens
	loadCoreTokensConfig,
	getTokensForProfile,
	listProfiles,

	// Hedera operations
	createToken,
	mintNFT,
	burnNFTs,
	sweepHbar,
	associateToken,
	freezeAccount,
	unfreezeAccount,
	grantKyc,
	revokeKyc,
	pauseToken,
	unpauseToken,
	wipeNFTs,
	deleteToken,
	updateToken,

	// Mirror node queries
	checkMirrorBalance,
	checkMirrorHbarBalance,
	fetchTokenInfo,
	fetchNFTsForToken,
	fetchAllNFTsForToken,
	fetchNFTsOwned,
	fetchAllNFTsOwned,
	fetchNftMetadataFromMirror,
	getBaseURL,

	// CLI helpers
	getArgFlag,
	getArg,
	sleep,
};
