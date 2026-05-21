const AppConfig = require('../../models/AppConfig');
const BotConfig = require('../../models/BotConfig');
const BrokerAccount = require('../../models/BrokerAccount');
const logger = require('../../utils/logger');

const DEFAULT_CONFIG = [
  { key: 'TRADING_MODE', value: process.env.TRADING_MODE || 'LEARNING', description: 'Current trading mode' },
  { key: 'ALLOW_LIVE_TRADING', value: process.env.ALLOW_LIVE_TRADING === 'true', description: 'Admin live-trading unlock flag' },
  { key: 'ENABLE_KILL_SWITCH', value: process.env.ENABLE_KILL_SWITCH === 'true', description: 'Emergency kill switch state' },
  { key: 'RISK_PER_TRADE', value: Number(process.env.RISK_PER_TRADE || 0.005), description: 'Default risk per trade' },
  { key: 'MAX_RISK_PER_TRADE', value: Number(process.env.MAX_RISK_PER_TRADE || 0.01), description: 'Absolute max risk per trade' },
  { key: 'DAILY_MAX_LOSS', value: Number(process.env.DAILY_MAX_LOSS || 0.02), description: 'Daily max loss limit' },
  { key: 'WEEKLY_MAX_LOSS', value: Number(process.env.WEEKLY_MAX_LOSS || 0.05), description: 'Weekly max loss limit' },
  { key: 'MAX_OPEN_TRADES', value: Number(process.env.MAX_OPEN_TRADES || 3), description: 'Max simultaneous open trades' },
  { key: 'MIN_RISK_REWARD', value: Number(process.env.MIN_RISK_REWARD || 2), description: 'Minimum risk reward ratio' }
];

async function bootstrapDefaults() {
  for (const item of DEFAULT_CONFIG) {
    await AppConfig.updateOne(
      { key: item.key },
      { $setOnInsert: item },
      { upsert: true }
    );
  }

  const botConfig = await BotConfig.findOne();
  if (!botConfig) {
    await BotConfig.create({
      mode: process.env.TRADING_MODE || 'LEARNING',
      isLiveTradingEnabled: process.env.ALLOW_LIVE_TRADING === 'true',
      killSwitchTriggered: process.env.ENABLE_KILL_SWITCH === 'true',
      activeBroker: 'PAPER'
    });
    logger.info('BotConfig defaults created');
  }

  const paperAccount = await BrokerAccount.findOne({ broker: 'PAPER', accountType: 'PAPER' });
  if (!paperAccount) {
    await BrokerAccount.create({
      broker: 'PAPER',
      accountId: 'PAPER-DEFAULT',
      accountType: 'PAPER',
      isConnected: true,
      healthCheckStatus: 'HEALTHY',
      balance: Number(process.env.PAPER_TRADING_BALANCE || 100000),
      equity: Number(process.env.PAPER_TRADING_BALANCE || 100000),
      paperBalance: Number(process.env.PAPER_TRADING_BALANCE || 100000),
      paperEquity: Number(process.env.PAPER_TRADING_BALANCE || 100000),
      isActive: true
    });
    logger.info('Paper BrokerAccount defaults created');
  }

  logger.info('AppConfig defaults verified');
}

module.exports = { bootstrapDefaults, DEFAULT_CONFIG };
