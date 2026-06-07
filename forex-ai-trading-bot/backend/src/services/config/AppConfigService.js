const AppConfig = require('../../models/AppConfig');
const BotConfig = require('../../models/BotConfig');
const BrokerAccount = require('../../models/BrokerAccount');
const logger = require('../../utils/logger');

const DEFAULT_CONFIG = [
  { key: 'TRADING_MODE', value: process.env.TRADING_MODE || 'PAPER', description: 'Current trading mode' },
  { key: 'ALLOW_LIVE_TRADING', value: process.env.ALLOW_LIVE_TRADING === 'true', description: 'Admin live-trading unlock flag' },
  { key: 'AI_ENABLED', value: process.env.AI_ENABLED === 'true', description: 'AI analysis enabled flag' },
  { key: 'RULE_BASED_TRADING', value: process.env.RULE_BASED_TRADING !== 'false', description: 'Rule-based trading enabled flag' },
  { key: 'STRATEGY_MODE', value: process.env.STRATEGY_MODE || 'RULE_BASED', description: 'Trading strategy mode' },
  { key: 'DEFAULT_STRATEGY', value: process.env.DEFAULT_STRATEGY || 'MULTI_CONFIRMATION', description: 'Default rule-based strategy' },
  { key: 'ENABLE_KILL_SWITCH', value: process.env.ENABLE_KILL_SWITCH === 'true', description: 'Emergency kill switch state' },
  { key: 'RISK_PER_TRADE', value: Number(process.env.RISK_PER_TRADE || 0.01), description: 'Default risk per trade' },
  { key: 'MAX_RISK_PER_TRADE', value: Number(process.env.MAX_RISK_PER_TRADE || 0.02), description: 'Absolute max risk per trade' },
  { key: 'DAILY_MAX_LOSS', value: Number(process.env.DAILY_MAX_LOSS || 0.03), description: 'Daily max loss limit' },
  { key: 'WEEKLY_MAX_LOSS', value: Number(process.env.WEEKLY_MAX_LOSS || 0.05), description: 'Weekly max loss limit' },
  { key: 'MAX_OPEN_TRADES', value: Number(process.env.MAX_OPEN_TRADES || 5), description: 'Max simultaneous open trades' },
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
      mode: process.env.TRADING_MODE || 'PAPER',
      isLiveTradingEnabled: process.env.ALLOW_LIVE_TRADING === 'true',
      killSwitchTriggered: process.env.ENABLE_KILL_SWITCH === 'true',
      activeBroker: 'PAPER',
      aiEnabled: process.env.AI_ENABLED === 'true',
      ruleBasedTrading: process.env.RULE_BASED_TRADING !== 'false',
      strategyMode: process.env.STRATEGY_MODE || 'RULE_BASED',
      defaultStrategy: process.env.DEFAULT_STRATEGY || 'MULTI_CONFIRMATION',
      riskPerTradePercent: 1,
      maxRiskPerTradePercent: 2,
      dailyMaxLossPercent: 3,
      maxOpenTrades: 5
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
