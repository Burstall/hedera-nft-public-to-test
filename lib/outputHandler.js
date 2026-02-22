/**
 * Output handler for CLI tools
 * Supports both human-readable and JSON output modes
 */
class OutputHandler {
	constructor(options = {}) {
		this.jsonMode = options.json || false;
		this.quiet = options.quiet || false;
		this.verbose = options.verbose || false;
		this.startTime = Date.now();
		this.results = {
			migrations: [],
			errors: [],
			warnings: [],
			log: [],
		};
	}

	/**
	 * Log a message (human-readable mode only)
	 */
	log(message, data = null) {
		if (this.jsonMode) {
			if (data) {
				this.results.log.push({ message, ...data, timestamp: new Date().toISOString() });
			}
		}
		else if (!this.quiet) {
			console.log(message);
		}
	}

	/**
	 * Log verbose message (only in verbose mode)
	 */
	debug(message, data = null) {
		if (this.verbose && !this.jsonMode) {
			console.log(`[DEBUG] ${message}`);
			if (data) console.log(data);
		}
	}

	/**
	 * Log a warning
	 */
	warn(message, details = {}) {
		this.results.warnings.push({ message, ...details, timestamp: new Date().toISOString() });
		if (!this.jsonMode && !this.quiet) {
			console.warn(`Warning: ${message}`);
		}
	}

	/**
	 * Record an error
	 */
	error(code, message, details = {}) {
		this.results.errors.push({ code, message, ...details, timestamp: new Date().toISOString() });
		if (!this.jsonMode) {
			console.error(`Error [${code}]: ${message}`);
		}
	}

	/**
	 * Record a successful migration
	 */
	addMigration(data) {
		this.results.migrations.push({
			...data,
			timestamp: new Date().toISOString(),
		});
	}

	/**
	 * Report progress (for long operations).
	 * @param {number} current    - Completed steps so far (1-based)
	 * @param {number} total      - Total steps
	 * @param {string} message    - Label prefix
	 * @param {number} [batchMs]  - Wall-clock ms the last step took (for rolling ETA)
	 */
	progress(current, total, message = '', batchMs = null) {
		if (this.jsonMode) {
			// Emit newline-delimited JSON for streaming parsers
			if (process.env.STREAM_PROGRESS === 'true') {
				console.log(JSON.stringify({
					type: 'progress',
					current,
					total,
					percent: Math.round((current / total) * 100),
					message,
				}));
			}
		}
		else if (!this.quiet) {
			// Initialise progress tracking on first call
			if (!this.progressStartTime) {
				this.progressStartTime = Date.now();
				this.progressSamples = [];
			}

			// Add latest batch duration to rolling window (keep last 5 samples)
			if (batchMs != null && batchMs > 0) {
				this.progressSamples.push(batchMs);
				if (this.progressSamples.length > 5) {
					this.progressSamples.shift();
				}
			}

			const percent = Math.round((current / total) * 100);
			const elapsedMs = Date.now() - this.progressStartTime;
			const elapsedStr = this.formatTime(elapsedMs / 1000);

			let etaStr = '...';
			const remaining = total - current;
			if (remaining <= 0) {
				etaStr = 'done';
			}
			else if (this.progressSamples.length > 0) {
				// Rolling average ms-per-step over recent samples
				const avgMs = this.progressSamples.reduce((a, b) => a + b, 0) / this.progressSamples.length;
				etaStr = this.formatTime((remaining * avgMs) / 1000);
			}
			else if (current > 0) {
				// Fallback: overall average from start
				etaStr = this.formatTime(((elapsedMs / current) * remaining) / 1000);
			}

			process.stdout.write(`\r${message} ${current}/${total} (${percent}%) elapsed: ${elapsedStr} ETA: ${etaStr}   `);
		}
	}

	/**
	 * Reset progress tracking (call before starting a new progress sequence)
	 */
	resetProgress() {
		this.progressStartTime = null;
		this.progressSamples = [];
	}

	/**
	 * Clear progress line
	 */
	clearProgress() {
		if (!this.jsonMode && !this.quiet) {
			process.stdout.write('\r' + ' '.repeat(80) + '\r');
		}
	}

	/**
	 * Format seconds as human-readable time
	 */
	formatTime(seconds) {
		if (seconds < 60) return `${Math.round(seconds)}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return `${h}h ${m}m`;
	}

	/**
	 * Finalize and output results
	 */
	finalize(exitCode = 0) {
		const duration = Date.now() - this.startTime;

		if (this.jsonMode) {
			const output = {
				success: exitCode === 0,
				exitCode,
				duration,
				timestamp: new Date().toISOString(),
				summary: {
					migrationsCompleted: this.results.migrations.length,
					errorsCount: this.results.errors.length,
					warningsCount: this.results.warnings.length,
				},
				migrations: this.results.migrations,
				errors: this.results.errors.length > 0 ? this.results.errors : undefined,
				warnings: this.results.warnings.length > 0 ? this.results.warnings : undefined,
			};
			console.log(JSON.stringify(output, null, 2));
		}
		else if (!this.quiet) {
			if (this.results.errors.length > 0) {
				console.log(`\nCompleted with ${this.results.errors.length} error(s)`);
			}
		}

		return exitCode;
	}
}

/**
 * Exit codes for CLI tools
 */
const EXIT_CODES = {
	SUCCESS: 0,
	GENERAL_ERROR: 1,
	CONFIG_ERROR: 2,
	VALIDATION_ERROR: 3,
	NETWORK_ERROR: 4,
	TX_FAILED: 5,
	PARTIAL_SUCCESS: 6,
	INTERRUPTED: 130,
};

module.exports = {
	OutputHandler,
	EXIT_CODES,
};
