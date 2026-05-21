const STATES = Object.freeze({
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  STALE: 'STALE',
  RECONNECTING: 'RECONNECTING',
  CLOSED: 'CLOSED'
});

function calculateBackoff(attempt, options = {}) {
  const baseMs = options.baseMs || 1000;
  const maxMs = options.maxMs || 30000;
  const jitterRatio = options.jitterRatio ?? 0.25;
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = exponential * jitterRatio * Math.random();
  return Math.floor(exponential + jitter);
}

module.exports = {
  STATES,
  calculateBackoff
};
