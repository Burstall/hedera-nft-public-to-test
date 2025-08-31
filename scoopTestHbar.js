const {
	Client,
	AccountId,
	PrivateKey,
	Hbar,
	HbarUnit,
} = require('@hashgraph/sdk');
require('dotenv').config();
const { getArgFlag, getArg } = require('./utils/nodeHelpers');
const readlineSync = require('readline-sync');
const { checkMirrorHbarBalance } = require('./utils/hederaMirrorHelpers');
const { sweepHbar } = require('./utils/hederaHelpers');

let operatorId;
let operatorKey;

try {
	operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
	operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
}
catch {
	console.log('❌ Configuration Error:');
	console.log('   Please ensure your .env file contains:');
	console.log('   - ACCOUNT_ID=your_account_id');
	console.log('   - PRIVATE_KEY=your_private_key');
	console.log('');
	console.log('   Example:');
	console.log('   ACCOUNT_ID=0.0.12345');
	console.log('   PRIVATE_KEY=302e020100300506032b657004220420...');
	process.exit(1);
}

async function scoopTestHbar() {
	// check args for an account to send to and a percentage of the total to send
	const toAccount = getArg('to');
	const percent = Number(getArg('percent'));
	const dryRun = getArgFlag('dry-run') || getArgFlag('dryrun');
	const minThreshold = getArg('min-threshold') ? Number(getArg('min-threshold')) : 1;

	if (getArgFlag('h') || getArgFlag('help')) {
		console.log('Usage: node scoopTestHbar.js -to 0.0.1234 -percent 50 [options]');
		console.log('Options:');
		console.log('  -dry-run        : Preview transfers without executing them');
		console.log('  -min-threshold N: Minimum HBAR amount to transfer (default: 1)');
		process.exit(0);
	}

	// Validate required arguments
	if (!toAccount) {
		console.log('❌ Missing required argument:');
		console.log('   Please specify the target account with -to <account_id>');
		console.log('');
		console.log('   Example:');
		console.log('   node scoopTestHbar.js -to 0.0.12345 -percent 50');
		process.exit(1);
	}

	if (!percent || isNaN(percent) || percent <= 0 || percent > 100) {
		console.log('❌ Invalid percentage argument:');
		console.log('   Please specify a valid percentage (1-100) with -percent <number>');
		console.log('');
		console.log('   Example:');
		console.log('   node scoopTestHbar.js -to 0.0.12345 -percent 50');
		process.exit(1);
	}

	let to;
	try {
		to = AccountId.fromString(toAccount);
	}
	catch {
		console.log('❌ Invalid account ID format:');
		console.log(`   "${toAccount}" is not a valid Hedera account ID`);
		console.log('');
		console.log('   Account IDs should be in format: 0.0.xxxxx');
		console.log('   Example: 0.0.12345');
		process.exit(1);
	}

	const percentage = parseInt(percent);

	// Validate scoop configuration
	if (!process.env.SCOOP_ACCOUNTS) {
		console.log('❌ Missing SCOOP_ACCOUNTS configuration:');
		console.log('   Please add SCOOP_ACCOUNTS to your .env file');
		console.log('');
		console.log('   Example:');
		console.log('   SCOOP_ACCOUNTS=0.0.12345,0.0.67890,0.0.99999');
		process.exit(1);
	}

	if (!process.env.SCOOP_KEYS) {
		console.log('❌ Missing SCOOP_KEYS configuration:');
		console.log('   Please add SCOOP_KEYS to your .env file');
		console.log('');
		console.log('   Example:');
		console.log('   SCOOP_KEYS=302e020100300506032b657004220420...,e:0xabc123...');
		process.exit(1);
	}

	// pull the SCOOP_ACCOUNTS from the .env file
	let scoopAccounts;
	try {
		scoopAccounts = process.env.SCOOP_ACCOUNTS.split(',').map((account) => {
			return AccountId.fromString(account.trim());
		});
	}
	catch {
		console.log('❌ Invalid SCOOP_ACCOUNTS format:');
		console.log('   Account IDs should be comma-separated and in format: 0.0.xxxxx');
		console.log('');
		console.log('   Example:');
		console.log('   SCOOP_ACCOUNTS=0.0.12345,0.0.67890,0.0.99999');
		process.exit(1);
	}

	// get the keys from the .env file
	const keys = [];
	const keyStrings = process.env.SCOOP_KEYS.split(',');

	if (scoopAccounts.length !== keyStrings.length) {
		console.log('❌ Configuration mismatch:');
		console.log(`   SCOOP_ACCOUNTS has ${scoopAccounts.length} accounts`);
		console.log(`   SCOOP_KEYS has ${keyStrings.length} keys`);
		console.log('   These numbers must match!');
		process.exit(1);
	}

	try {
		keyStrings.forEach((key) => {
			const trimmedKey = key.trim();
			if (trimmedKey.startsWith('e:')) {
				keys.push(PrivateKey.fromStringECDSA(trimmedKey.substring(2)));
			}
			else {
				keys.push(PrivateKey.fromStringED25519(trimmedKey));
			}
		});
	}
	catch {
		console.log('❌ Invalid SCOOP_KEYS format:');
		console.log('   Keys should be comma-separated private keys');
		console.log('   ECDSA keys should be prefixed with "e:"');
		console.log('');
		console.log('   Example:');
		console.log('   SCOOP_KEYS=302e020100300506032b657004220420...,e:0xabc123...');
		process.exit(1);
	}

	const balances = [];
	const sendAmounts = [];
	const filteredAccounts = [];
	const filteredKeys = [];
	const filteredBalances = [];

	const client = Client.forTestnet();
	client.setOperator(operatorId, operatorKey);

	// get the balances of the accounts
	for (let i = 0; i < scoopAccounts.length; i++) {
		const balance = await checkMirrorHbarBalance('test', scoopAccounts[i]);
		balances.push(Number(balance));
		const calculatedAmount = Math.floor(Number(balance) * (percentage / 100));
		sendAmounts.push(calculatedAmount);

		// Apply minimum threshold filter
		const amountInHbar = calculatedAmount / 100000000;
		if (amountInHbar >= minThreshold) {
			filteredAccounts.push(scoopAccounts[i]);
			filteredKeys.push(keys[i]);
			filteredBalances.push(Number(balance));
		}
	}

	// display the balances we are pulling
	console.log('**TESTNET**');
	console.log('Scoop Accounts:', scoopAccounts.map((account) => account.toString()).join(', '));
	console.log('Balances:', balances.map((balance) => new Hbar(balance, HbarUnit.Tinybar).toString()).join(', '));
	console.log('Percent to send:', percentage, '%');
	console.log('Minimum threshold:', minThreshold, 'HBAR');

	if (filteredAccounts.length === 0) {
		console.log('No accounts meet the minimum threshold requirement.');
		console.log('Exiting...');
		process.exit(0);
	}

	console.log('\n**FILTERED ACCOUNTS (above threshold)**');
	console.log('Accounts to transfer from:', filteredAccounts.map((account) => account.toString()).join(', '));
	console.log('Balances:', filteredBalances.map((balance) => new Hbar(balance, HbarUnit.Tinybar).toString()).join(', '));
	console.log('Amounts to send:', filteredBalances.map((balance) => {
		const amount = Math.floor(Number(balance) * (percentage / 100));
		return new Hbar(amount, HbarUnit.Tinybar).toString();
	}).join(', '));

	const totalToSend = filteredBalances.reduce((sum, balance) => {
		return sum + Math.floor(Number(balance) * (percentage / 100));
	}, 0);
	console.log('Total to send:', new Hbar(totalToSend, HbarUnit.Tinybar).toString());

	if (dryRun) {
		console.log('\n**DRY RUN MODE** - No transactions will be executed');
		console.log('This is a preview of what would be transferred.');
		process.exit(0);
	}

	// confirm the send
	const confirm = readlineSync.keyInYNStrict('Send the above amounts?');
	if (!confirm) {
		console.log('Exiting');
		process.exit(0);
	}

	// send the amounts
	for (let i = 0; i < filteredAccounts.length; i++) {
		const amount = new Hbar(Math.floor(Number(filteredBalances[i]) * (percentage / 100)), HbarUnit.Tinybar);
		const result = await sweepHbar(client, filteredAccounts[i], filteredKeys[i], to, amount);
		console.log('Sent', amount.toString(), 'from', filteredAccounts[i].toString(), 'to', to.toString(), 'with result', result);
	}

}

scoopTestHbar()
	.then(() => {
		console.log('Done');
		process.exit(0);
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});