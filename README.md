# @lazysuperheroes/hedera-nft-utils

Hedera NFT migration and utility toolkit for UAT and test environments.

## Features

- **NFT Migration**: Migrate NFT collections from mainnet to testnet/previewnet
- **HBAR Management**: Sweep HBAR from multiple accounts to consolidate funds
- **Private Key Auto-Detection**: Automatically detect Ed25519 vs ECDSA key types
- **CI/CD Ready**: JSON output, non-interactive mode, and proper exit codes
- **Resumable Migrations**: Continue interrupted migrations from where they left off
- **Profile-Based Configuration**: Pre-configured token profiles for quick migrations
- **Concurrent Processing**: Parallel minting for faster migrations

## Installation

### NPM Package

```bash
npm install @lazysuperheroes/hedera-nft-utils
```

### From Source

```bash
git clone https://github.com/lazysuperheroes/hedera-nft-utils.git
cd hedera-nft-utils
npm install
```

## Quick Start

### Environment Setup

Create a `.env` file:

```env
# Required for all operations
ACCOUNT_ID=0.0.12345
PRIVATE_KEY=302e020100300506032b657004220420...

# Optional: Custom supply key (auto-generated if not provided)
SUPPLY_KEY=302e020100300506032b657004220420...

# For HBAR scoop tool
SCOOP_ACCOUNTS=0.0.11111,0.0.22222,0.0.33333
SCOOP_KEYS=302e020100...,0xabc123...,ed:302e020100...
```

### CLI Usage

#### NFT Migration

```bash
# Basic migration
npx hedera-migrate 0.0.12345

# Cache token data first (recommended for large collections)
npx hedera-migrate 0.0.12345 --cache --name my-collection

# Migrate with options
npx hedera-migrate 0.0.12345 --network testnet --royalty-mode skip --yes --json

# Use a profile (predefined token sets)
npx hedera-migrate --profile ci --yes

# Resume an interrupted migration
npx hedera-migrate 0.0.12345 --resume

# List available profiles
npx hedera-migrate --list-profiles
```

#### HBAR Scoop

```bash
# Transfer 50% from all scoop accounts to target
npx hedera-scoop -to 0.0.99999 -percent 50

# Dry run to preview
npx hedera-scoop -to 0.0.99999 -percent 50 -dry-run

# Non-interactive with JSON output
npx hedera-scoop -to 0.0.99999 -percent 50 -yes -json
```

### Library Usage

```javascript
const {
  // Key utilities
  parsePrivateKey,
  parsePrivateKeys,
  detectKeyType,

  // Hedera operations
  createToken,
  mintNFT,
  burnNFTs,
  sweepHbar,

  // Mirror node queries
  fetchTokenInfo,
  fetchAllNFTsForToken,
  checkMirrorHbarBalance,

  // Async helpers
  retryWithBackoff,
  TransactionPipeline,

  // Migration state
  MigrationState,
} = require('@lazysuperheroes/hedera-nft-utils');

// Auto-detect key type
const { key, type } = parsePrivateKey('302e020100300506032b657004220420...');
console.log(`Detected: ${type}`); // "Ed25519 (auto-detected from DER prefix)"

// Parse multiple keys
const keys = parsePrivateKeys('key1,key2,e:0xecdsaKey', { verbose: true });

// Fetch token info from mainnet
const tokenInfo = await fetchTokenInfo('main', '0.0.12345');

// Retry with exponential backoff
const result = await retryWithBackoff(
  async () => await riskyOperation(),
  { maxRetries: 3, baseDelayMs: 1000 }
);
```

## CLI Reference

### hedera-migrate

Migrate NFT tokens from mainnet to test networks.

```
Usage: hedera-migrate <tokenId> [options]

Arguments:
  tokenId              Mainnet token ID (e.g., 0.0.12345)

Options:
  --network <network>  Target network: testnet, previewnet, local (default: testnet)
  --cache              Create cache files instead of migrating
  --name <name>        Base name for cache files
  --royalty-mode <m>   How to handle royalties: operator, skip (default: operator)
  --profile <name>     Use a predefined token profile (ci, minimal, lsh, full)
  --list-profiles      List available profiles and exit
  --resume             Resume an interrupted migration
  --yes, -y            Skip confirmation prompts (for CI/CD)
  --json               Output results as JSON
  -h, --help           Show help message
```

### hedera-scoop

Sweep HBAR from multiple accounts.

```
Usage: hedera-scoop -to <account> -percent <number> [options]

Options:
  -to <account>        Target account to receive HBAR (required)
  -percent <number>    Percentage of balance to transfer, 1-100 (required)
  -dry-run             Preview transfers without executing
  -min-threshold <n>   Minimum HBAR amount to transfer (default: 1)
  -yes, -y             Skip confirmation prompts
  -json                Output results as JSON
  -h, --help           Show help message
```

## Private Key Formats

The toolkit automatically detects key types, but you can also use explicit prefixes:

| Format | Example | Detection |
|--------|---------|-----------|
| Ed25519 DER | `302e020100300506032b657004220420...` | Auto-detected |
| ECDSA hex | `0xabc123...` or `abc123...` (64 chars) | Auto-detected |
| Explicit Ed25519 | `ed:302e020100...` | Prefix |
| Explicit ECDSA | `e:0xabc123...` | Prefix |

## Profiles

Pre-configured token sets for common migration scenarios:

| Profile | Description | Tokens |
|---------|-------------|--------|
| `minimal` | Single token for quick tests | Golden Horse |
| `ci` | CI/CD pipeline testing | LSH G1 |
| `lsh` | All Lazy Super Heroes collections | 5 tokens |
| `full` | Complete UAT environment | 8 tokens |

View profiles: `npx hedera-migrate --list-profiles`

## Royalty Handling

When migrating tokens with royalties from mainnet to testnet:

- **`operator`** (default): Redirects royalties to the migration operator account
- **`skip`**: Removes all royalties from the migrated token

> **Note**: Original mainnet royalty collectors cannot receive payments on testnet.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General/unknown error |
| 2 | Configuration error |
| 3 | Network error |
| 4 | Token error |
| 5 | Validation error |
| 6 | Migration error |

## API Reference

### Key Utilities

#### `parsePrivateKey(keyString)`
Parse a single private key with automatic type detection.

```javascript
const { key, type } = parsePrivateKey('302e020100...');
// key: PrivateKey instance
// type: 'Ed25519 (auto-detected from DER prefix)'
```

#### `parsePrivateKeys(keysString, options)`
Parse comma-separated private keys.

```javascript
const keys = parsePrivateKeys('key1,key2,key3', { verbose: true });
// Returns: PrivateKey[]
```

#### `detectKeyType(keyString)`
Detect key type without parsing.

```javascript
const type = detectKeyType('0xabc123...');
// Returns: 'ECDSA'
```

### Async Helpers

#### `retryWithBackoff(fn, options)`
Execute function with exponential backoff retry.

```javascript
const result = await retryWithBackoff(
  async () => await apiCall(),
  {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    onRetry: (error, attempt) => console.log(`Retry ${attempt}`)
  }
);
```

#### `TransactionPipeline`
Manage concurrent Hedera transactions.

```javascript
const pipeline = new TransactionPipeline(client, {
  maxConcurrent: 3,
  onProgress: (completed, total) => console.log(`${completed}/${total}`)
});

await pipeline.execute(transactions);
```

### Migration State

#### `MigrationState`
Track migration progress for resumability.

```javascript
const state = new MigrationState('0.0.12345', 'testnet');
state.setTokenCreated('0.0.99999');
state.addMintedSerials([1, 2, 3]);
state.save();

// Later...
if (state.exists()) {
  const loaded = MigrationState.load('0.0.12345', 'testnet');
}
```

### Hedera Operations

#### `createToken(client, tokenDetails, treasuryKey, supplyKey)`
Create a new token on Hedera.

#### `mintNFT(client, tokenId, metadata, supplyKey)`
Mint NFTs to an existing token.

#### `burnNFTs(client, tokenId, serials, supplyKey)`
Burn NFTs from a token.

#### `sweepHbar(client, fromAccount, fromKey, toAccount, amount)`
Transfer HBAR between accounts.

### Mirror Node Queries

#### `fetchTokenInfo(network, tokenId)`
Fetch token details from mirror node.

#### `fetchAllNFTsForToken(network, tokenId, options)`
Fetch all NFTs for a token with pagination.

#### `checkMirrorHbarBalance(network, accountId)`
Check HBAR balance via mirror node.

## Configuration

### Core Tokens Manifest

Configure frequently-migrated tokens in `config/core-tokens.json`:

```json
{
  "tokens": [
    {
      "id": "0.0.12345",
      "name": "My Collection",
      "priority": 1,
      "enabled": true,
      "cache_name": "my-collection"
    }
  ],
  "profiles": {
    "quick": {
      "description": "Fast test",
      "tokens": ["0.0.12345"]
    }
  }
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ACCOUNT_ID` | Operator account ID | Yes |
| `PRIVATE_KEY` | Operator private key | Yes |
| `SUPPLY_KEY` | Token supply key | No |
| `SCOOP_ACCOUNTS` | Comma-separated account IDs | For scoop |
| `SCOOP_KEYS` | Comma-separated private keys | For scoop |

## Transaction Fees

Estimated costs on testnet:

- Token creation: ~20-50 HBAR
- NFT minting: ~1-5 HBAR per batch (10 NFTs)
- NFT burning: ~1-5 HBAR per batch
- HBAR transfer: ~0.001 HBAR

## Security

- Never commit `.env` files to version control
- Use dedicated accounts for testing
- Test migrations on small collections first
- The toolkit handles keys in memory only

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` to check code style
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- [GitHub Issues](https://github.com/lazysuperheroes/hedera-nft-utils/issues)
- [Hedera Documentation](https://docs.hedera.com/)
- [Hedera Discord](https://discord.gg/hedera)
