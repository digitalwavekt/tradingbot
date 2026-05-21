const OpenAI = require('openai');
const logger = require('../../utils/logger');
const { AiAnalysis, BotConfig } = require('../../models');

class AIReasoningEngine {
  constructor() {
    this.client = null;
    this.config = null;
  }

  async initialize() {
    this.config = await BotConfig.findOne().sort({ updatedAt: -1 });

    if (!this.config || !this.config.aiEnabled) {
      logger.warn('AI Engine disabled or not configured');
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      logger.error('OPENAI_API_KEY not set');
      return;
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    logger.info('AI Reasoning Engine initialized');
  }

  async generateMarketSummary(pair, technicalData, fundamentalData, newsData) {
    try {
      if (!this.client || !this.config?.aiEnabled) {
        return this.generateFallbackSummary(pair, technicalData, fundamentalData, newsData);
      }

      const prompt = this.buildAnalysisPrompt(pair, technicalData, fundamentalData, newsData);

      const startTime = Date.now();
      const response = await this.client.chat.completions.create({
        model: this.config.openaiModel || 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are an expert Indian equity market trading analyst. Your role is ADVISORY ONLY. You NEVER execute trades. 
            You provide detailed market analysis with strict risk warnings. 
            You must always acknowledge that trading carries risk and never guarantee profits.
            Format your response as a structured JSON object.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.aiTemperature || 0.1,
        max_tokens: this.config.aiMaxTokens || 2000,
        response_format: { type: 'json_object' }
      });

      const latencyMs = Date.now() - startTime;
      const rawResponse = response.choices[0].message.content;

      let parsedResult;
      try {
        parsedResult = JSON.parse(rawResponse);
      } catch (e) {
        logger.error(`AI response JSON parse error: ${e.message}`);
        return this.generateFallbackSummary(pair, technicalData, fundamentalData, newsData);
      }

      // Validate and sanitize AI response
      const validated = this.validateAIResponse(parsedResult);

      // Save analysis
      await AiAnalysis.create({
        analysisId: require('uuid').v4(),
        type: 'FULL_ANALYSIS',
        pair,
        prompt: prompt.substring(0, 500),
        rawResponse: rawResponse.substring(0, 2000),
        parsedResult: validated.result,
        tokensUsed: response.usage?.total_tokens || 0,
        costUsd: ((response.usage?.total_tokens || 0) / 1000) * 0.03,
        latencyMs,
        model: this.config.openaiModel,
        validated: validated.valid,
        validationErrors: validated.errors
      });

      return validated.result;

    } catch (error) {
      logger.error(`AI analysis error for ${pair}: ${error.message}`);
      return this.generateFallbackSummary(pair, technicalData, fundamentalData, newsData);
    }
  }

  buildAnalysisPrompt(pair, technical, fundamental, news) {
    const tf = technical.timeframes;
    const latestTF = tf['1h'] || tf['15m'] || Object.values(tf)[0];

    return `Analyze ${pair} for potential trading opportunity. 

TECHNICAL ANALYSIS:
- Trend (1H): ${latestTF?.trend || 'N/A'}
- RSI: ${latestTF?.rsi || 'N/A'}
- MACD: ${JSON.stringify(latestTF?.macd || {})}
- ATR: ${latestTF?.atr || 'N/A'}
- Structure: ${latestTF?.structure?.structure || 'N/A'}
- Support: ${latestTF?.supportResistance?.supports?.slice(0, 3).join(', ') || 'N/A'}
- Resistance: ${latestTF?.supportResistance?.resistances?.slice(0, 3).join(', ') || 'N/A'}
- Timeframe Alignment: ${technical.alignment?.alignment || 'N/A'}

FUNDAMENTAL ANALYSIS:
- Base Currency (${pair.split('/')[0]}): ${JSON.stringify(fundamental.baseCurrency || {})}
- Quote Currency (${pair.split('/')[1]}): ${JSON.stringify(fundamental.quoteCurrency || {})}
- Relative Strength: ${fundamental.relativeStrength?.interpretation || 'N/A'}
- Sentiment: ${fundamental.sentiment?.overall || 'N/A'}

NEWS ANALYSIS:
- Upcoming Events: ${news.upcomingEvents?.length || 0}
- Recent High Impact: ${news.recentEvents?.filter(e => e.impact === 'HIGH').length || 0}
- News Safe: ${news.newsSafe || false}

Provide a JSON response with:
{
  "marketSummary": "Brief market overview",
  "technicalExplanation": "Technical analysis explanation",
  "fundamentalExplanation": "Fundamental analysis explanation", 
  "newsImpactExplanation": "News impact assessment",
  "tradeThesis": "Main trading thesis if any",
  "reasonToEnter": "Reasons to enter trade",
  "reasonToAvoid": "Reasons to avoid trade",
  "confidencePercentage": 0-100,
  "riskWarning": "Specific risk warnings",
  "finalRecommendation": "BUY/SELL/WAIT/NO_TRADE",
  "sentiment": "BULLISH/BEARISH/NEUTRAL",
  "keyLevels": [support1, resistance1, support2],
  "riskFactors": ["risk1", "risk2"],
  "opportunityFactors": ["opp1", "opp2"]
}`;
  }

  validateAIResponse(result) {
    const required = [
      'marketSummary', 'technicalExplanation', 'fundamentalExplanation',
      'newsImpactExplanation', 'tradeThesis', 'reasonToEnter',
      'reasonToAvoid', 'confidencePercentage', 'riskWarning',
      'finalRecommendation', 'sentiment'
    ];

    const errors = [];
    for (const field of required) {
      if (!result[field]) {
        errors.push(`Missing field: ${field}`);
      }
    }

    // Validate confidence
    if (result.confidencePercentage !== undefined) {
      result.confidencePercentage = Math.max(0, Math.min(100, result.confidencePercentage));
    }

    // Validate recommendation
    const validRecs = ['BUY', 'SELL', 'WAIT', 'NO_TRADE'];
    if (!validRecs.includes(result.finalRecommendation)) {
      result.finalRecommendation = 'NO_TRADE';
      errors.push('Invalid recommendation, defaulted to NO_TRADE');
    }

    // Ensure risk warning exists
    if (!result.riskWarning || result.riskWarning.length < 10) {
      result.riskWarning = 'Trading carries significant risk. Past performance does not guarantee future results. Only trade with capital you can afford to lose.';
    }

    return {
      valid: errors.length === 0,
      errors,
      result
    };
  }

  generateFallbackSummary(pair, technical, fundamental, news) {
    const alignment = technical.alignment || {};
    const rec = alignment.alignment || 'NEUTRAL';

    let recommendation = 'NO_TRADE';
    let confidence = 50;

    if (rec === 'STRONG_BULLISH') { recommendation = 'BUY'; confidence = 70; }
    else if (rec === 'BULLISH') { recommendation = 'BUY'; confidence = 60; }
    else if (rec === 'STRONG_BEARISH') { recommendation = 'SELL'; confidence = 70; }
    else if (rec === 'BEARISH') { recommendation = 'SELL'; confidence = 60; }

    // Reduce confidence if news is unsafe
    if (!news.newsSafe) {
      confidence = Math.max(30, confidence - 20);
      recommendation = 'NO_TRADE';
    }

    return {
      marketSummary: `Technical analysis shows ${rec.replace('_', ' ').toLowerCase()} bias on ${pair}.`,
      technicalExplanation: `Multi-timeframe alignment: ${alignment.alignment || 'neutral'}.`,
      fundamentalExplanation: `Fundamental outlook: ${fundamental.relativeStrength?.interpretation || 'neutral'}.`,
      newsImpactExplanation: news.newsSafe ? 'No immediate news concerns.' : 'High-impact news detected - caution advised.',
      tradeThesis: confidence > 55 ? `Potential ${recommendation.toLowerCase()} opportunity based on technical alignment.` : 'No clear trade thesis.',
      reasonToEnter: confidence > 55 ? `Aligned timeframes suggest ${recommendation.toLowerCase()} direction.` : 'Insufficient alignment for entry.',
      reasonToAvoid: confidence <= 55 ? 'Low confidence or conflicting signals.' : 'Always risk only what you can afford to lose.',
      confidencePercentage: confidence,
      riskWarning: 'This is algorithmic analysis, not financial advice. Markets can move against any position. Use strict risk management.',
      finalRecommendation: recommendation,
      sentiment: rec.includes('BULLISH') ? 'BULLISH' : rec.includes('BEARISH') ? 'BEARISH' : 'NEUTRAL',
      keyLevels: [],
      riskFactors: ['Market volatility', 'Unexpected news', 'Technical failure'],
      opportunityFactors: confidence > 55 ? ['Technical alignment'] : []
    };
  }

  async generateTradeExplanation(signal) {
    try {
      if (!this.client || !this.config?.aiEnabled) {
        return this.generateFallbackTradeExplanation(signal);
      }

      const prompt = `Explain this trade signal in detail for risk assessment:

Pair: ${signal.pair}
Direction: ${signal.direction}
Entry: ${signal.entryPrice}
Stop Loss: ${signal.stopLoss}
Take Profit: ${signal.takeProfit}
Risk-Reward: ${signal.riskReward}
Risk %: ${signal.riskPercent}
Position Size: ${signal.positionSize}
Confidence: ${signal.confidence}%

Technical: ${JSON.stringify(signal.technicalAnalysis || {})}
News: ${JSON.stringify(signal.newsAnalysis || {})}

Provide JSON with:
{
  "explanation": "Detailed trade explanation",
  "riskAssessment": "Risk assessment",
  "probabilityAnalysis": "Probability of success/failure",
  "recommendation": "APPROVE/REJECT/REVIEW",
  "concerns": ["concern1", "concern2"],
  "positives": ["positive1", "positive2"]
}`;

      const response = await this.client.chat.completions.create({
        model: this.config.openaiModel || 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a risk analyst. Be conservative. Highlight risks. Never approve unsafe trades.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content);

    } catch (error) {
      logger.error(`AI trade explanation error: ${error.message}`);
      return this.generateFallbackTradeExplanation(signal);
    }
  }

  generateFallbackTradeExplanation(signal) {
    const concerns = [];
    const positives = [];

    if (signal.riskReward < 2) concerns.push('Risk-reward ratio below 1:2');
    if (signal.confidence < 70) concerns.push('Confidence below 70%');
    if (!signal.newsAnalysis?.newsSafe) concerns.push('News environment unsafe');

    if (signal.riskReward >= 2) positives.push('Good risk-reward ratio');
    if (signal.confidence >= 70) positives.push('High confidence score');
    if (signal.technicalAnalysis?.alignment?.aligned) positives.push('Timeframe alignment confirmed');

    return {
      explanation: `Trade on ${signal.pair} with ${signal.riskReward}:1 risk-reward.`,
      riskAssessment: concerns.length > 0 ? 'Elevated risk detected.' : 'Risk parameters acceptable.',
      probabilityAnalysis: `Estimated ${signal.confidence}% probability based on technical factors.`,
      recommendation: concerns.length > 2 ? 'REJECT' : concerns.length > 0 ? 'REVIEW' : 'APPROVE',
      concerns,
      positives
    };
  }
}

module.exports = new AIReasoningEngine();
