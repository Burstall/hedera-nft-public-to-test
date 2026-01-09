/**
 * Async utilities for rate limiting and retry logic
 */

/**
 * Sleep for specified milliseconds
 */
async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {*} Result of the function
 */
async function retryWithBackoff(fn, options = {}) {
	const {
		maxRetries = 3,
		baseDelay = 1000,
		maxDelay = 30000,
		onRetry = null,
		retryOn = null,
	} = options;

	let lastError;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		}
		catch (error) {
			lastError = error;

			// Check if we should retry this error
			if (retryOn && !retryOn(error)) {
				throw error;
			}

			if (attempt < maxRetries) {
				const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

				if (onRetry) {
					onRetry(error, attempt + 1, delay);
				}

				await sleep(delay);
			}
		}
	}

	throw lastError;
}

/**
 * Check if an error is retryable (network/rate limit issues)
 */
function isRetryableError(error) {
	const message = error.message || '';
	const status = error.status?.toString() || '';

	return (
		status === 'BUSY' ||
		message.includes('rate limit') ||
		message.includes('ETIMEDOUT') ||
		message.includes('ECONNRESET') ||
		message.includes('ENOTFOUND') ||
		message.includes('socket hang up') ||
		message.includes('network')
	);
}

/**
 * Execute promises with concurrency limit
 * @param {number} limit - Max concurrent promises
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to apply to each item
 * @returns {Array} Results in order
 */
async function withConcurrency(limit, items, fn) {
	const results = new Array(items.length);
	const executing = new Set();

	for (let i = 0; i < items.length; i++) {
		const promise = (async () => {
			try {
				results[i] = await fn(items[i], i);
			}
			catch (error) {
				results[i] = { error };
			}
		})();

		executing.add(promise);
		promise.finally(() => executing.delete(promise));

		if (executing.size >= limit) {
			await Promise.race(executing);
		}
	}

	await Promise.all(executing);
	return results;
}

/**
 * Pipeline executor for Hedera transactions
 * Submits transactions while waiting for receipts of previous ones
 */
class TransactionPipeline {
	constructor(options = {}) {
		this.maxInFlight = options.maxInFlight || 3;
		this.onProgress = options.onProgress || null;
		this.inFlight = new Map();
		this.completed = [];
		this.errors = [];
	}

	/**
	 * Submit a transaction and track its receipt
	 * @param {string} id - Unique identifier for this transaction
	 * @param {Function} submitFn - Async function that submits and returns receipt promise
	 */
	async submit(id, submitFn) {
		// Wait if at max capacity
		while (this.inFlight.size >= this.maxInFlight) {
			await this.waitForOne();
		}

		try {
			const receiptPromise = submitFn();
			this.inFlight.set(id, receiptPromise);
		}
		catch (error) {
			this.errors.push({ id, error });
		}
	}

	/**
	 * Wait for one in-flight transaction to complete
	 */
	async waitForOne() {
		if (this.inFlight.size === 0) return;

		const entries = [...this.inFlight.entries()];
		const [id, promise] = entries[0];

		try {
			const result = await promise;
			this.completed.push({ id, result });

			if (this.onProgress) {
				this.onProgress(this.completed.length, this.errors.length);
			}
		}
		catch (error) {
			this.errors.push({ id, error });
		}
		finally {
			this.inFlight.delete(id);
		}
	}

	/**
	 * Wait for all in-flight transactions to complete
	 */
	async flush() {
		while (this.inFlight.size > 0) {
			await this.waitForOne();
		}
	}

	/**
	 * Get results summary
	 */
	getSummary() {
		return {
			completed: this.completed.length,
			errors: this.errors.length,
			results: this.completed,
			failures: this.errors,
		};
	}
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
	constructor(options = {}) {
		this.requestsPerSecond = options.requestsPerSecond || 50;
		this.minInterval = 1000 / this.requestsPerSecond;
		this.lastRequest = 0;
	}

	async throttle() {
		const now = Date.now();
		const elapsed = now - this.lastRequest;

		if (elapsed < this.minInterval) {
			await sleep(this.minInterval - elapsed);
		}

		this.lastRequest = Date.now();
	}

	async execute(fn) {
		await this.throttle();
		return fn();
	}
}

module.exports = {
	sleep,
	retryWithBackoff,
	isRetryableError,
	withConcurrency,
	TransactionPipeline,
	RateLimiter,
};
