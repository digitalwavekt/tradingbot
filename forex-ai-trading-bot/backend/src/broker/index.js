const DhanAdapter = require('./dhan/DhanAdapter');
const dhanConfig = require('../config/dhan');

function createBrokerAdapter(name = 'dhan', opts = {}) {
  if (name === 'dhan') {
    return new DhanAdapter(Object.assign({}, dhanConfig, opts));
  }
  throw new Error('Unsupported broker: ' + name);
}

module.exports = { createBrokerAdapter };
