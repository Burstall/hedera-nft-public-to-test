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
	 * Report progress (for long operations)
	 */
	progress(current, total, message = '') {
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
			const percent = Math.round((current / total) * 100);
			const elapsed = (Date.now() - this.startTime) / 1000;
			const rate = current / elapsed;
			const remaining = (total - current) / rate;
			const eta = remaining > 0 ? this.formatTime(remaining) : 'complete';

			process.stdout.write(`\r${message} ${current}/${total} (${percent}%) - ETA: ${eta}   `);
		}
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
