# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hedera development utilities for NFT migration and HBAR management. Migrates NFT collections from mainnet to testnet/previewnet/local networks and collects HBAR from multiple faucet accounts. Designed for UAT and dev environment setup with CI/CD integration support.

## Commands

```bash
# Install dependencies
npm install

# Lint
npm run lint

# NFT Migration - cache mode (fetch from mainnet, save locally)
node migrateToken.js <tokenId> --cache --name <name>

# NFT Migration - migrate to testnet (uses cached data if available)
node migrateToken.js <tokenId> --network testnet

# NFT Migration - multiple tokens
node migrateToken.js "0.0.123,0.0.456" --network previewnet

# NFT Migration - skip royalties (recommended for testing)
node migrateToken.js <tokenId> --royalty-mode skip

# NFT Migration - using profile from core-tokens.json
node migrateToken.js --profile ci --network testnet

# NFT Migration - CI/CD mode with JSON output
node migrateToken.js <tokenId> --json --yes --network testnet

# NFT Migration - resume interrupted migration
node migrateToken.js <tokenId> --resume

# List available profiles
node migrateToken.js --list-profiles

# HBAR Scoop - collect HBAR from multiple accounts
node scoopTestHbar.js -to 0.0.12345 -percent 50

# HBAR Scoop - dry run
node scoopTestHbar.js -to 0.0.12345 -percent 50 -dry-run

# HBAR Scoop - CI/CD mode (no prompts)
node scoopTestHbar.js -to 0.0.12345 -percent 50 -yes -json
```

## Architecture

### Main Scripts

- **migrateToken.js**: Fetches NFT collection data from mainnet mirror node, creates equivalent token on target network, mints all NFTs with metadata, burns deleted serials. Supports cache mode for offline migration, resumable migrations, concurrent minting, and JSON output.

- **scoopTestHbar.js**: Transfers percentage of HBAR balance from multiple "scoop" accounts to a target account. Workaround for testnet faucet daily limits. Supports non-interactive mode for CI/CD.

### Lib Layer (`lib/`)

- **migrationState.js**: State tracking for resumable migrations. Stores progress in `migration-state/` directory.
- **outputHandler.js**: Unified output handling for human-readable and JSON output modes. Includes exit code constants.
- **coreTokens.js**: Core tokens configuration management. Loads `config/core-tokens.json` and provides profile-based token lists.
- **asyncHelpers.js**: Async utilities including retry with exponential backoff, concurrency limiting, and transaction pipeline for parallel Hedera transactions.

### Utils Layer (`utils/`)

- **hederaHelpers.js**: Hedera SDK wrappers for accounts, tokens, NFTs, allowances, and transfers
- **hederaMirrorHelpers.js**: Mirror node API queries (balances, allowances, token details, events). Provides `getBaseURL(env)` for environment-specific mirror URLs.
- **nodeHelpers.js**: CLI argument parsing (`getArg`, `getArgFlag`) and async utilities

### Config (`config/`)

- **core-tokens.json**: Define core tokens to migrate with profiles (ci, minimal, full). Edit this file to add your mainnet token IDs.

## Key Patterns

- Mirror node URLs are environment-specific: `getBaseURL(env)` returns correct URL for `test`/`main`/`preview`/`local`
- Private keys support two formats: Ed25519 (raw) or ECDSA (prefixed with `e:`)
- NFT operations batch in groups of 10 (Hedera SDK limit)
- Concurrent minting: 3 transactions in flight by default (configurable via `CONCURRENT_TXS` env var)
- Max transaction fee: 80 HBAR by default (configurable via `MAX_TX_FEE` env var)
- Migration state stored in `migration-state/` directory for resumability

## Environment Variables

```env
# Required for migration
ACCOUNT_ID=0.0.xxxxx
PRIVATE_KEY=302e020100300506032b657004220420...

# Optional - auto-generated if not provided
SUPPLY_KEY=302e020100300506032b657004220420...

# For HBAR scoop (comma-separated, matching order)
SCOOP_ACCOUNTS=0.0.123,0.0.456
SCOOP_KEYS=ed25519key,e:ecdsakey

# Performance tuning (optional)
MAX_TX_FEE=80           # Max transaction fee in HBAR
BATCH_SIZE=10           # NFTs per mint transaction (max 10)
CONCURRENT_TXS=3        # Concurrent transactions in flight
```

## CI/CD Integration

Both scripts support non-interactive mode for automation:

```bash
# Migration with JSON output, no prompts
node migrateToken.js 0.0.12345 --json --yes --network testnet

# Scoop with JSON output, no prompts
node scoopTestHbar.js -to 0.0.12345 -percent 50 -json -yes
```

Exit codes:
- `0`: Success
- `1`: General error
- `2`: Configuration error
- `3`: Validation error
- `4`: Network error
- `5`: Transaction failed
- `6`: Partial success

## Royalty Handling

When migrating tokens with royalties, original mainnet collectors won't work on testnet. Use `--royalty-mode`:
- `operator` (default): Redirects royalties to migration operator
- `skip`: Removes all royalties
- `custom`: Not implemented

## Resumable Migrations

If a migration fails partway through:
1. State is automatically saved to `migration-state/`
2. Re-run with `--resume` flag to continue from where it left off
3. The target token ID is preserved to avoid creating duplicates

## Code Style

Uses ESLint with tabs for indentation, single quotes, Stroustrup brace style. Run `npm run lint` to check. See `eslint.config.mjs` for full rules.
