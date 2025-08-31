# Hedera Development Utilities

A collection of Node.js scripts for Hedera development and testing, including NFT migration tools and HBA| Option | Description | Defaul### 5. Migrate with Custom Royalty Handling
```bash
# Skip royalties entirely
node migrateToken.js 0.0.12345 --royalty-mode skip

# Use custom royalty collectors (requires implementation)
node migrateToken.js 0.0.12345 --royalty-mode custom
```

## Royalty Handling

**⚠️ IMPORTANT**: When migrating tokens with royalties from mainnet to testnet, the original royalty collector accounts cannot receive payments on testnet. You have three options:

### Royalty Modes

1. **`operator`** (Default)
   - Replaces all royalty collectors with the migration operator account
   - **⚠️ WARNING**: This changes the intended royalty distribution
   - Original creators/artists will not receive royalties

2. **`skip`**
   - Removes all royalties from the migrated token
   - Token will have no custom fees
   - Clean migration but loses royalty functionality

3. **`custom`** (Not yet implemented)
   - Prompts for new royalty collector accounts
   - Preserves royalty structure with user-specified accounts
   - Requires additional development

### Recommendations

- **For testing**: Use `--royalty-mode skip` to avoid royalty complications
- **For production-like testing**: Use `--royalty-mode operator` but be aware of the royalty redistribution
- **For accurate testing**: Implement the `custom` mode to specify testnet equivalents of mainnet royalty collectors

## Cache Files|--------|-------------|---------|
| `--network <network>` | Target network: `testnet`, `previewnet`, `local` | `testnet` |
| `--cache` | Create cache files instead of migrating | `false` |
| `--name <name>` | Base name for cache files | Token name |
| `--royalty-mode <mode>` | How to handle royalties: `operator`, `skip`, `custom` | `operator` |
| `-h, --help` | Show help message | - |gement utilities.

## Features

### NFT Migration Tool (`migrateToken.js`)
- **Multi-Network Support**: Migrate to testnet, previewnet, or local Hedera nodes
- **Cache Mode**: Separate dat#### HBAR Scoop Tool Issues:
1. **"❌ Configuration Error"**
   - Missing or invalid `.env` file
   - Ensure `ACCOUNT_ID` and `PRIVATE_KEY` are set correctly

2. **"❌ Missing required argument: -to"**
   - Use `-to <account_id>` parameter
   - Example: `node scoopTestHbar.js -to 0.0.12345 -percent 50`

3. **"❌ Invalid percentage argument"**
   - Use `-percent <number>` with value between 1-100
   - Example: `node scoopTestHbar.js -to 0.0.12345 -percent 50`

4. **"❌ Invalid account ID format"**
   - Account IDs must be in format `0.0.xxxxx`
   - Example: `0.0.12345`

5. **"❌ Missing SCOOP_ACCOUNTS configuration"**
   - Add `SCOOP_ACCOUNTS=0.0.xxx,0.0.yyy` to `.env`
   - Ensure accounts have HBAR balances

6. **"❌ Missing SCOOP_KEYS configuration"**
   - Add `SCOOP_KEYS=key1,key2,key3` to `.env`
   - For ECDSA keys, prefix with `e:` (e.g., `e:0xabc123`)

7. **"❌ Configuration mismatch"**
   - Number of accounts and keys must match
   - Check comma-separated values in `.env`

8. **"❌ Invalid SCOOP_KEYS format"**
   - Keys should be valid private keys
   - ECDSA keys: `e:0x...`
   - Ed25519 keys: `302e020100300506032b657004220420...`

9. **"❌ Unknown royalty mode"**
   - Use valid royalty modes: `operator`, `skip`, `custom`
   - Example: `node migrateToken.js 0.0.12345 --royalty-mode skip`

10. **Token has royalties that won't work on testnet**
    - Use `--royalty-mode skip` to remove royalties
    - Or use `--royalty-mode operator` to redirect to migration account
    - Original royalty collectors from mainnet cannot receive on testnetgration for efficiency
- **Batch Processing**: Handles large NFT collections with pagination
- **Complete Replication**: Preserves token properties, custom fees, and all NFT metadata
- **Error Handling**: Robust error handling with detailed logging

### HBAR Scoop Tool (`scoopTestHbar.js`)
- **Faucet Optimization**: Collect HBAR from multiple accounts to bypass daily limits
- **Batch Transfers**: Transfer percentages from multiple accounts simultaneously
- **Balance Management**: Build HBAR buffers for testing and development
- **Multi-Key Support**: Handle different key types (ECDSA and Ed25519)

## Prerequisites

- Node.js >= 14.0.0
- NPM or Yarn
- Hedera accounts with sufficient HBAR for transactions
- Environment variables configured

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Burstall/hedera-nft-public-to-test.git
cd hedera-nft-public-to-test
```

2. Install dependencies:
```bash
npm install
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

#### For NFT Migration (`migrateToken.js`):
```env
ACCOUNT_ID=0.0.12345
PRIVATE_KEY=302e020100300506032b657004220420...
SUPPLY_KEY=302e020100300506032b657004220420...  # Optional
```

#### For HBAR Scoop Tool (`scoopTestHbar.js`):
```env
# Comma-separated list of account IDs to collect HBAR from
SCOOP_ACCOUNTS=0.0.12345,0.0.67890,0.0.99999

# Corresponding private keys (ECDSA keys prefixed with 'e:key')
SCOOP_KEYS=302e020100300506032b657004220420...,e:0xabc123...,302e020100300506032b657004220420...
```

- `ACCOUNT_ID`: Your Hedera account ID (operator account)
- `PRIVATE_KEY`: Private key for the operator account
- `SUPPLY_KEY`: Supply key for token management (auto-generated if not provided)

### Network Requirements

- **Testnet/Previewnet**: Standard Hedera test networks
- **Local Node**: Requires running Hedera Local Node
  - Install from: https://github.com/hiero-ledger/hiero-local-node
  - Start local network: `hedera start`
  - Mirror node URL: `http://127.0.0.1:5551`

## Usage

### Basic Migration

```bash
node migrateToken.js <tokenId> [options]
```

### Cache Mode (Recommended)

First, cache the token data:
```bash
node migrateToken.js 0.0.12345 --cache --name mycollection
```

Then migrate using cached data:
```bash
node migrateToken.js 0.0.12345 --network testnet
```

### Multiple Tokens

```bash
node migrateToken.js "0.0.12345,0.0.67890" --network previewnet
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--network <network>` | Target network: `testnet`, `previewnet`, `local` | `testnet` |
| `--cache` | Create cache files instead of migrating | `false` |
| `--name <name>` | Base name for cache files | Token name |
| `-h` | Show help message | - |

## Examples

### 1. Migrate Single Token to Testnet
```bash
node migrateToken.js 0.0.12345
```

### 2. Cache Token Data
```bash
node migrateToken.js 0.0.12345 --cache --name "My NFT Collection"
```
Creates: `My NFT Collection-0.0.12345.json`

### 3. Migrate to Previewnet
```bash
node migrateToken.js 0.0.12345 --network previewnet
```

### 4. Migrate to Local Node
```bash
node migrateToken.js 0.0.12345 --network local
```

### 5. Batch Migration
```bash
node migrateToken.js "0.0.12345,0.0.67890,0.0.99999" --network testnet
```

## Cache Files

Cache files contain:
- Token details (name, symbol, supply, fees, etc.)
- Complete NFT metadata for all serial numbers
- Deletion status for each NFT

Format:
```json
{
  "tokenDetails": {
    "name": "My NFT",
    "symbol": "MNFT",
    "max_supply": 1000,
    "type": "NON_FUNGIBLE_UNIQUE",
    "custom_fees": {...}
  },
  "nfts": [
    {
      "serial_number": 1,
      "metadata": "base64_encoded_metadata",
      "deleted": false
    }
  ]
}
```

## Transaction Fees

The script sets a maximum transaction fee of 80 HBAR. Ensure your account has sufficient balance:
- Token creation: ~20-50 HBAR
- NFT minting: ~1-5 HBAR per batch
- NFT burning: ~1-5 HBAR per batch

## HBAR Scoop Tool

The `scoopTestHbar.js` script helps manage HBAR distribution across multiple accounts, particularly useful for bypassing the Hedera testnet faucet's daily limit of 1,000 HBAR per account (reduced from 10,000).

### Purpose

With the reduced faucet limits, developers need multiple accounts to collect HBAR efficiently. This tool:
- Collects HBAR from multiple "scoop" accounts
- Transfers a percentage to a main account
- Builds HBAR buffers for testing and development
- Handles different key types (ECDSA and Ed25519)

### Configuration

Add these environment variables to your `.env` file:

```env
# Comma-separated list of account IDs to collect from
SCOOP_ACCOUNTS=0.0.12345,0.0.67890,0.0.99999

# Corresponding private keys (ECDSA keys prefixed with 'e:key')
SCOOP_KEYS=302e020100300506032b657004220420...,e:0xabc123...,302e020100300506032b657004220420...
```

### Usage

```bash
node scoopTestHbar.js -to <target_account> -percent <percentage> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-to <account>` | Target account to receive HBAR | Required |
| `-percent <number>` | Percentage of balance to transfer (1-100) | Required |
| `-dry-run` | Preview transfers without executing | `false` |
| `-min-threshold <number>` | Minimum HBAR amount to transfer | `1` |
| `-h, --help` | Show help message | - |

### Examples

```bash
# Transfer 50% of balances from all scoop accounts to main account
node scoopTestHbar.js -to 0.0.12345 -percent 50

# Transfer 25% with minimum 5 HBAR threshold
node scoopTestHbar.js -to 0.0.12345 -percent 25 -min-threshold 5

# Preview transfers without executing (dry run)
node scoopTestHbar.js -to 0.0.12345 -percent 50 -dry-run

# Show help
node scoopTestHbar.js --help
```

### How It Works

1. **Balance Check**: Queries mirror node for current balances of all scoop accounts
2. **Calculation**: Calculates transfer amounts based on specified percentage
3. **Confirmation**: Shows summary and asks for confirmation
4. **Transfer**: Executes HBAR transfers from each account to target account

### Recommendations for Improvement

#### 1. **Automated Scheduling**
```javascript
// Add cron-like functionality for regular collection
const cron = require('node-cron');

// Run every 6 hours
cron.schedule('0 */6 * * *', () => {
    scoopTestHbar();
});
```

#### 2. **Balance Thresholds**
```javascript
// Only transfer if account balance exceeds threshold
const MIN_BALANCE = new Hbar(100); // 100 HBAR minimum
if (balance > MIN_BALANCE) {
    // Transfer logic
}
```

#### 3. **Multi-Network Support**
```javascript
// Support mainnet, testnet, previewnet
const network = getArg('network') || 'testnet';
const client = network === 'mainnet' ? Client.forMainnet() :
               network === 'previewnet' ? Client.forPreviewnet() :
               Client.forTestnet();
```

#### 4. **Transaction Batching**
```javascript
// Group multiple transfers into single transaction
const transferTx = new TransferTransaction();
scoopAccounts.forEach((account, index) => {
    transferTx.addHbarTransfer(account, sendAmounts[index].negated());
});
transferTx.addHbarTransfer(to, totalAmount);
```

#### 5. **Balance History Tracking**
```javascript
// Log transfers for accounting
const fs = require('fs');
const logEntry = {
    timestamp: new Date().toISOString(),
    from: scoopAccounts.map(id => id.toString()),
    to: to.toString(),
    amounts: sendAmounts,
    total: totalAmount
};
fs.appendFileSync('scoop_history.json', JSON.stringify(logEntry) + '\n');
```

#### 6. **Error Recovery**
```javascript
// Retry failed transfers
for (let attempt = 1; attempt <= 3; attempt++) {
    try {
        const result = await sweepHbar(client, account, key, to, amount);
        break; // Success, exit retry loop
    } catch (error) {
        if (attempt === 3) throw error;
        await sleep(1000 * attempt); // Exponential backoff
    }
}
```

#### 7. **Dry Run Mode**
```javascript
// Preview transfers without executing
if (getArgFlag('dry-run')) {
    console.log('DRY RUN - No transactions will be executed');
    // Show calculations but don't transfer
    return;
}
```

## Troubleshooting

### Common Issues

#### NFT Migration Issues:
1. **"Environment variables must be present"**
   - Ensure `.env` file exists with `ACCOUNT_ID` and `PRIVATE_KEY`

2. **"Token not found"**
   - Verify token ID exists on mainnet
   - Check network connectivity

3. **"Insufficient balance"**
   - Add HBAR to your account on the target network

4. **Local node connection issues**
   - Ensure local node is running: `hedera start`
   - Check mirror node URL: `http://127.0.0.1:5551`

#### HBAR Scoop Tool Issues:
1. **"Must specify -to to send to an account"**
   - Use `-to <account_id>` parameter
   - Example: `node scoopTestHbar.js -to 0.0.12345 -percent 50`

2. **"Must specify -percent to send a percentage"**
   - Use `-percent <number>` parameter (1-100)
   - Example: `node scoopTestHbar.js -to 0.0.12345 -percent 25`

3. **"SCOOP_ACCOUNTS environment variable not set"**
   - Add `SCOOP_ACCOUNTS=0.0.xxx,0.0.yyy` to `.env`
   - Ensure accounts have HBAR balances

4. **"SCOOP_KEYS environment variable not set"**
   - Add `SCOOP_KEYS=key1,key2,key3` to `.env`
   - For ECDSA keys, prefix with `e:` (e.g., `e:0xabc123`)

5. **"Account balance too low"**
   - Accounts need minimum balance for transaction fees
   - Consider setting minimum thresholds before transfer

### Logs

The scripts provide detailed console output:
- **NFT Migration**: Token creation status, NFT minting progress, migration summary
- **HBAR Scoop**: Account balances, transfer amounts, transaction confirmations

## Security Notes

- Never commit `.env` files to version control
- Use dedicated accounts for testing
- Keep private keys secure
- Test migrations on small collections first

## API Reference

The script uses:
- Hedera SDK for token operations
- Mainnet mirror node for data fetching
- Axios for HTTP requests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check Hedera documentation: https://docs.hedera.com/
- Join Hedera Discord: https://discord.gg/hedera
