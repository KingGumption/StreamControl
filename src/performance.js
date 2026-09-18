const { monitorEventLoopDelay } = require('node:perf_hooks');
const samples = new Map();
const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();
const reset = setInterval(() => loop.reset(), 60000);
reset.unref();
function observe(name, milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
  const values = samples.get(name) || [];
  values.push(milliseconds);
  if (values.length > 256) values.shift();
  samples.set(name, values);
}
function snapshot() {
  return {
    windowSamples: 256,
    stages: Object.fromEntries([...samples].map(([name, values]) => {
      const sorted = [...values].sort((a,b) => a-b);
      return [name, { count: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*.95)-1)] }];
    })),
    eventLoop: { windowSeconds: 60, meanMs: Number.isFinite(loop.mean) ? loop.mean / 1e6 : 0, p95Ms: loop.percentile(95) / 1e6, maxMs: loop.max / 1e6 },
  };
}
module.exports = { observe, snapshot };
