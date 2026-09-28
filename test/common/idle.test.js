import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWhenIdle } from '../../src/common/idle.js';
import { IDLE_FALLBACK_DELAY_MS } from '../../src/common/constants.js';

test('requestIdleCallback を持つ view なら timeout 付きで呼ぶ', () => {
	const calls = [];
	const view = {
		requestIdleCallback(cb, options) {
			calls.push(options);
			cb();
		},
	};
	let ran = false;
	runWhenIdle(() => { ran = true; }, { timeoutMs: 1234, view });
	assert.equal(ran, true);
	assert.deepEqual(calls, [{ timeout: 1234 }]);
});

test('requestIdleCallback を持たない view なら setTimeout で回す', () => {
	const view = {};
	const calls = [];
	const originalSetTimeout = globalThis.setTimeout;
	globalThis.setTimeout = (fn, ms) => { calls.push({ fn, ms }); return 0; };
	try {
		let ran = false;
		runWhenIdle(() => { ran = true; }, { timeoutMs: 1234, view });
		assert.equal(calls.length, 1);
		assert.equal(calls[0].ms, IDLE_FALLBACK_DELAY_MS);
		calls[0].fn();
		assert.equal(ran, true);
	} finally {
		globalThis.setTimeout = originalSetTimeout;
	}
});
