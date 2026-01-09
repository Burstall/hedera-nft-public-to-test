const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'config', 'core-tokens.json');

/**
 * Load core tokens configuration
 * @param {string} configPath - Path to config file (optional)
 * @returns {Object} Core tokens configuration
 */
function loadCoreTokens(configPath = DEFAULT_CONFIG_PATH) {
	if (!fs.existsSync(configPath)) {
		return null;
	}

	try {
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		return config;
	}
	catch (err) {
		console.error(`Error loading core tokens config: ${err.message}`);
		return null;
	}
}

/**
 * Get tokens for a specific profile
 * @param {Object} config - Core tokens configuration
 * @param {string} profileName - Profile name (minimal, ci, full, etc.)
 * @returns {Array} Array of token objects
 */
function getTokensForProfile(config, profileName) {
	if (!config || !config.profiles || !config.profiles[profileName]) {
		return [];
	}

	const profile = config.profiles[profileName];
	const tokenIds = profile.tokens || [];

	return tokenIds
		.map(id => config.tokens.find(t => t.id === id))
		.filter(t => t && t.enabled !== false);
}

/**
 * Get all enabled tokens
 * @param {Object} config - Core tokens configuration
 * @returns {Array} Array of enabled token objects
 */
function getAllEnabledTokens(config) {
	if (!config || !config.tokens) {
		return [];
	}

	return config.tokens
		.filter(t => t.enabled !== false)
		.sort((a, b) => (a.priority || 999) - (b.priority || 999));
}

/**
 * Get token configuration with defaults applied
 * @param {Object} config - Core tokens configuration
 * @param {string} tokenId - Token ID
 * @returns {Object} Token config with defaults merged
 */
function getTokenConfig(config, tokenId) {
	if (!config) return null;

	const token = config.tokens.find(t => t.id === tokenId);
	if (!token) return null;

	return {
		...config.default_config,
		...token,
		...(token.config_override || {}),
	};
}

/**
 * List available profiles
 * @param {Object} config - Core tokens configuration
 * @returns {Array} Array of profile info objects
 */
function listProfiles(config) {
	if (!config || !config.profiles) {
		return [];
	}

	return Object.entries(config.profiles).map(([name, profile]) => ({
		name,
		description: profile.description,
		tokenCount: profile.tokens?.length || 0,
	}));
}

/**
 * Add a token to the core tokens list
 * @param {string} configPath - Path to config file
 * @param {string} tokenId - Token ID to add
 * @param {string} name - Token name
 * @param {Object} options - Additional options
 */
function addToken(configPath, tokenId, name, options = {}) {
	const config = loadCoreTokens(configPath) || {
		manifest_version: '1.0.0',
		description: 'Core NFT tokens',
		default_config: { royalty_mode: 'skip', target_network: 'testnet' },
		tokens: [],
		profiles: {},
	};

	// Check if token already exists
	if (config.tokens.some(t => t.id === tokenId)) {
		throw new Error(`Token ${tokenId} already exists in config`);
	}

	const newToken = {
		id: tokenId,
		name,
		priority: config.tokens.length + 1,
		enabled: true,
		...options,
	};

	config.tokens.push(newToken);
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

	return newToken;
}

/**
 * Remove a token from the core tokens list
 * @param {string} configPath - Path to config file
 * @param {string} tokenId - Token ID to remove
 */
function removeToken(configPath, tokenId) {
	const config = loadCoreTokens(configPath);
	if (!config) {
		throw new Error('Config file not found');
	}

	const index = config.tokens.findIndex(t => t.id === tokenId);
	if (index === -1) {
		throw new Error(`Token ${tokenId} not found in config`);
	}

	config.tokens.splice(index, 1);

	// Also remove from profiles
	for (const profile of Object.values(config.profiles)) {
		if (profile.tokens) {
			profile.tokens = profile.tokens.filter(id => id !== tokenId);
		}
	}

	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = {
	loadCoreTokens,
	getTokensForProfile,
	getAllEnabledTokens,
	getTokenConfig,
	listProfiles,
	addToken,
	removeToken,
	DEFAULT_CONFIG_PATH,
};
