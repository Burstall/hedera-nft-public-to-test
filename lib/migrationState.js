const fs = require('fs');
const path = require('path');

const STATE_DIR = process.env.MIGRATION_STATE_DIR || './migration-state';

/**
 * Migration state manager for resumable migrations
 */
class MigrationState {
	constructor(sourceToken, targetNetwork) {
		this.sourceToken = sourceToken;
		this.targetNetwork = targetNetwork;
		this.stateFile = path.join(STATE_DIR, `${sourceToken.replace(/\./g, '_')}-${targetNetwork}.json`);
		this.state = null;
	}

	/**
	 * Initialize or load existing state
	 */
	init() {
		// Ensure state directory exists
		if (!fs.existsSync(STATE_DIR)) {
			fs.mkdirSync(STATE_DIR, { recursive: true });
		}

		if (fs.existsSync(this.stateFile)) {
			try {
				this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
				return this.state;
			}
			catch (err) {
				console.error(`Warning: Could not load state file: ${err.message}`);
			}
		}

		// Initialize new state
		this.state = {
			sourceToken: this.sourceToken,
			targetToken: null,
			targetNetwork: this.targetNetwork,
			status: 'initialized',
			startedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			totalNfts: 0,
			mintedBatches: [],
			burnedSerials: [],
			lastCompletedBatch: -1,
			errors: [],
		};
		this.save();
		return this.state;
	}

	/**
	 * Check if we can resume from existing state
	 */
	canResume() {
		return this.state &&
			this.state.targetToken &&
			this.state.status !== 'completed' &&
			this.state.status !== 'failed';
	}

	/**
	 * Get the target token ID if resuming
	 */
	getTargetToken() {
		return this.state?.targetToken || null;
	}

	/**
	 * Set the target token after creation
	 */
	setTargetToken(tokenId) {
		this.state.targetToken = tokenId.toString();
		this.state.status = 'in_progress';
		this.save();
	}

	/**
	 * Set total NFT count
	 */
	setTotalNfts(count) {
		this.state.totalNfts = count;
		this.save();
	}

	/**
	 * Record a completed mint batch
	 */
	completeMintBatch(batchIndex, serials) {
		this.state.mintedBatches.push({
			index: batchIndex,
			serials,
			completedAt: new Date().toISOString(),
		});
		this.state.lastCompletedBatch = batchIndex;
		this.state.updatedAt = new Date().toISOString();
		this.save();
	}

	/**
	 * Get the next batch index to process
	 */
	getNextBatchIndex() {
		return this.state.lastCompletedBatch + 1;
	}

	/**
	 * Check if a batch was already completed
	 */
	isBatchCompleted(batchIndex) {
		return this.state.mintedBatches.some(b => b.index === batchIndex);
	}

	/**
	 * Record burned serials
	 */
	recordBurns(serials) {
		this.state.burnedSerials.push(...serials);
		this.state.updatedAt = new Date().toISOString();
		this.save();
	}

	/**
	 * Record an error
	 */
	recordError(error, context = {}) {
		this.state.errors.push({
			message: error.message || error,
			context,
			timestamp: new Date().toISOString(),
		});
		this.save();
	}

	/**
	 * Mark migration as completed
	 */
	complete() {
		this.state.status = 'completed';
		this.state.completedAt = new Date().toISOString();
		this.state.updatedAt = new Date().toISOString();
		this.save();
	}

	/**
	 * Mark migration as failed
	 */
	fail(reason) {
		this.state.status = 'failed';
		this.state.failedAt = new Date().toISOString();
		this.state.failureReason = reason;
		this.state.updatedAt = new Date().toISOString();
		this.save();
	}

	/**
	 * Get progress summary
	 */
	getProgress() {
		const mintedCount = this.state.mintedBatches.reduce(
			(sum, b) => sum + b.serials.length, 0,
		);
		return {
			status: this.state.status,
			totalNfts: this.state.totalNfts,
			mintedCount,
			burnedCount: this.state.burnedSerials.length,
			percentComplete: this.state.totalNfts > 0
				? Math.round((mintedCount / this.state.totalNfts) * 100)
				: 0,
			batchesCompleted: this.state.mintedBatches.length,
			errors: this.state.errors.length,
		};
	}

	/**
	 * Save state to file
	 */
	save() {
		try {
			fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
		}
		catch (err) {
			console.error(`Warning: Could not save state: ${err.message}`);
		}
	}

	/**
	 * Delete state file (after successful migration or cleanup)
	 */
	cleanup() {
		try {
			if (fs.existsSync(this.stateFile)) {
				fs.unlinkSync(this.stateFile);
			}
		}
		catch (err) {
			console.error(`Warning: Could not cleanup state file: ${err.message}`);
		}
	}

	/**
	 * Get raw state object
	 */
	toJSON() {
		return this.state;
	}
}

/**
 * List all pending migrations
 */
function listPendingMigrations() {
	if (!fs.existsSync(STATE_DIR)) {
		return [];
	}

	const files = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.json'));
	const pending = [];

	for (const file of files) {
		try {
			const state = JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf8'));
			if (state.status !== 'completed') {
				pending.push({
					file,
					sourceToken: state.sourceToken,
					targetToken: state.targetToken,
					targetNetwork: state.targetNetwork,
					status: state.status,
					progress: state.totalNfts > 0
						? Math.round((state.mintedBatches.length * 10 / state.totalNfts) * 100)
						: 0,
				});
			}
		}
		catch {
			// Skip invalid files
		}
	}

	return pending;
}

module.exports = {
	MigrationState,
	listPendingMigrations,
	STATE_DIR,
};
