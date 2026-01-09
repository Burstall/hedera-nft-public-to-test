const { PrivateKey } = require('@hashgraph/sdk');

/**
 * Parse a private key string with automatic type detection
 * Supports Ed25519 and ECDSA keys in various formats
 *
 * @param {string} keyString - The private key string (can be prefixed with 'e:' for explicit ECDSA)
 * @returns {{ key: PrivateKey, type: string }} The parsed key and detected type
 * @throws {Error} If the key cannot be parsed as either type
 */
function parsePrivateKey(keyString) {
	const trimmed = keyString.trim();

	// Check for explicit ECDSA prefix (backwards compatible)
	if (trimmed.toLowerCase().startsWith('e:')) {
		const keyPart = trimmed.substring(2);
		try {
			const key = PrivateKey.fromStringECDSA(keyPart);
			return { key, type: 'ECDSA (explicit)' };
		}
		catch (err) {
			throw new Error(`Explicit ECDSA key failed to parse: ${err.message}`);
		}
	}

	// Check for explicit Ed25519 prefix (new feature)
	if (trimmed.toLowerCase().startsWith('ed:') || trimmed.toLowerCase().startsWith('ed25519:')) {
		const keyPart = trimmed.includes(':') ? trimmed.substring(trimmed.indexOf(':') + 1) : trimmed;
		try {
			const key = PrivateKey.fromStringED25519(keyPart);
			return { key, type: 'Ed25519 (explicit)' };
		}
		catch (err) {
			throw new Error(`Explicit Ed25519 key failed to parse: ${err.message}`);
		}
	}

	// Auto-detection: Try to determine key type from format
	const errors = [];

	// Heuristic 1: Keys starting with 0x are typically ECDSA
	if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
		try {
			const key = PrivateKey.fromStringECDSA(trimmed);
			return { key, type: 'ECDSA (auto-detected from 0x prefix)' };
		}
		catch (err) {
			errors.push(`ECDSA (0x prefix): ${err.message}`);
		}
	}

	// Heuristic 2: DER-encoded Ed25519 keys start with specific bytes
	// Ed25519 private key DER prefix: 302e020100300506032b6570
	if (trimmed.toLowerCase().startsWith('302e020100300506032b6570') ||
		trimmed.toLowerCase().startsWith('302e020100300506032b657004')) {
		try {
			const key = PrivateKey.fromStringED25519(trimmed);
			return { key, type: 'Ed25519 (auto-detected from DER prefix)' };
		}
		catch (err) {
			errors.push(`Ed25519 (DER prefix): ${err.message}`);
		}
	}

	// Heuristic 3: DER-encoded ECDSA keys start with different bytes
	// ECDSA secp256k1 private key DER prefix: 30...0201010420 or 3030...
	if (trimmed.toLowerCase().startsWith('30') &&
		(trimmed.toLowerCase().includes('0201010420') || trimmed.length === 64 || trimmed.length === 66)) {
		// Could be ECDSA DER format
		try {
			const key = PrivateKey.fromStringECDSA(trimmed);
			return { key, type: 'ECDSA (auto-detected from format)' };
		}
		catch (err) {
			errors.push(`ECDSA (DER format): ${err.message}`);
		}
	}

	// Heuristic 4: Raw 64-character hex is likely ECDSA (32 bytes = 64 hex chars)
	if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
		try {
			const key = PrivateKey.fromStringECDSA(trimmed);
			return { key, type: 'ECDSA (auto-detected from 64-char hex)' };
		}
		catch (err) {
			errors.push(`ECDSA (64-char hex): ${err.message}`);
		}
	}

	// Fallback: Try Ed25519 first (more common in Hedera), then ECDSA
	try {
		const key = PrivateKey.fromStringED25519(trimmed);
		return { key, type: 'Ed25519 (fallback)' };
	}
	catch (err) {
		errors.push(`Ed25519 (fallback): ${err.message}`);
	}

	try {
		const key = PrivateKey.fromStringECDSA(trimmed);
		return { key, type: 'ECDSA (fallback)' };
	}
	catch (err) {
		errors.push(`ECDSA (fallback): ${err.message}`);
	}

	// If we get here, neither worked
	throw new Error(
		'Could not parse private key. Tried multiple formats:\n' +
		errors.map(e => `  - ${e}`).join('\n') +
		'\n\nTip: You can prefix with \'e:\' for ECDSA or \'ed:\' for Ed25519 to skip auto-detection.',
	);
}

/**
 * Parse multiple private keys from a comma-separated string
 *
 * @param {string} keysString - Comma-separated private keys
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Log detected key types
 * @returns {PrivateKey[]} Array of parsed private keys
 */
function parsePrivateKeys(keysString, options = {}) {
	const { verbose = false } = options;
	const keyStrings = keysString.split(',');
	const keys = [];

	for (let i = 0; i < keyStrings.length; i++) {
		const keyString = keyStrings[i].trim();
		if (!keyString) continue;

		try {
			const { key, type } = parsePrivateKey(keyString);
			keys.push(key);

			if (verbose) {
				console.log(`  Key ${i + 1}: ${type}`);
			}
		}
		catch (err) {
			throw new Error(`Failed to parse key ${i + 1}: ${err.message}`);
		}
	}

	return keys;
}

/**
 * Detect the likely type of a private key without parsing it
 *
 * @param {string} keyString - The private key string
 * @returns {string} 'ECDSA', 'Ed25519', or 'unknown'
 */
function detectKeyType(keyString) {
	const trimmed = keyString.trim().toLowerCase();

	// Explicit prefixes
	if (trimmed.startsWith('e:')) return 'ECDSA';
	if (trimmed.startsWith('ed:') || trimmed.startsWith('ed25519:')) return 'Ed25519';

	// 0x prefix typically indicates ECDSA
	if (trimmed.startsWith('0x')) return 'ECDSA';

	// DER-encoded Ed25519
	if (trimmed.startsWith('302e020100300506032b6570')) return 'Ed25519';

	// Raw 64-char hex is typically ECDSA
	if (/^[0-9a-f]{64}$/.test(trimmed)) return 'ECDSA';

	// Longer DER format starting with 302e is typically Ed25519
	if (trimmed.startsWith('302e')) return 'Ed25519';

	return 'unknown';
}

module.exports = {
	parsePrivateKey,
	parsePrivateKeys,
	detectKeyType,
};
