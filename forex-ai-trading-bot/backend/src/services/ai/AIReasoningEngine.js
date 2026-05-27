const OpenAI = require('openai');
const logger = require('../../utils/logger');
const { AiAnalysis, BotConfig } = require('../../models');

function getAiProvider(config = {}) {
  return String(
    process.env.AI_PROVIDER ||
    config.aiProvider ||
    'gemini'
  ).toLowerCase();
}

function getAiModel(config = {}) {
  const provider = getAiProvider(config);

  if (provider === 'gemini') {
    return (
      config.geminiModel ||
      process.env.GEMINI_MODEL ||
      'gemini-2.0-flash'
    );
  }

  return (
    config.openaiModel ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini'
  );
}

function createAiClient(provider) {
  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
    }

    return new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL:
        process.env.GEMINI_BASE_URL ||
        'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty AI response');
  }

  let cleaned = raw.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```json/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  return JSON.parse(cleaned);
}

class AIReasoningEngine {
  constructor() {
    this.client = null;
    this.config = null;
    this.aiProvider = 'gemini';
    this.aiModel = 'gemini-2.0-flash';
  }

  async initialize() {
    this.config = await BotConfig.findOne().sort({ updatedAt: -1 });

    if (!this.config || !this.config.aiEnabled) {
      logger.warn('AI Engine disabled or not configured');
      return;
    }

    this.aiProvider = getAiProvider(this.config);
    this.aiModel = getAiModel(this.config);

    try {
      this.client = createAiClient(this.aiProvider);

      logger.info('AI Reasoning Engine initialized', {
        provider: this.aiProvider,
        model: this.aiModel
      });
    } catch (error) {
      logger.error(`AI Engine initialization failed: ${error.message}`);
      this.client = null;
    }
  }

  async generateMarketSummary(pair, technicalData, fundamentalData, newsData) {
    try {
      if (!this.client || !this.config?.aiEnabled) {
        return this.generateFallbackSummary(pair, technicalData, fundamentalData, newsData);
      }

      const prompt = this.buildAnalysisPrompt(pair, technicalData, fundamentalData, newsData);

      const startTime = Date.now();

      const response = await this.client.chat.completions.create({
        model: this.aiModel,
        messages: [
          {
            role: 'system',
            content: `You are an expert Indian equity market trading analyst.

IMPORTANT RULES:
- You are ADVISORY ONLY.
- You NEVER execute trades.
- You NEVER guarantee profit.
- You must be conservative.
- You must always include risk warnings.
- You must return ONLY a valid JSON object.
- Do not wrap the JSON in markdown.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.aiTemperature ?? 0.1,
        max_tokens: this.config.aiMaxTokens || 2000,
        response_format: { type: 'json_object' }
      });

      const latencyMs = Date.now() - startTime;
      const rawResponse = response.choices?.[0]?.message?.content || '';

      let parsedResult;
      try {
        parsedResult = safeJsonParse(rawResponse);
      } catch (error) {
        logger.error(`AI response JSON parse error: ${error.message}`);
        return this.generateFallbackSummary(pair, technicalData, fundamentalData, newsData);
      }

      const validated = this.validateAIResponse(parsedResult);

      await AiAnalysis.create({
        analysisId: require('uuid').v4(),
        type: 'FULL_ANALYSIS',
        pair,
        prompt: prompt.substring(0, 500),
        rawResponse: rawResponse.substring(0, 2000),
        parsedResult: validated.result,
        tokensUsed: response.usage?.total_tokens || 0,
        costUsd: 0,
        latencyMs,
        model: this.aiModel,
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
    const tf = technical?.timeframes || {};
    const latestTF = tf['1h'] || tf['15m'] || Object.values(tf)[0] || {};

    return `Analyze ${pair} for potential Indian market trading opportunity.

TECHNICAL ANALYSIS:
- Trend: ${latestTF?.trend || 'N/A'}
- RSI: ${latestTF?.rsi || 'N/A'}
- MACD: ${JSON.stringify(latestTF?.macd || {})}
- ATR: ${latestTF?.atr || 'N/A'}
- Structure: ${latestTF?.structure?.structure || 'N/A'}
- Support: ${latestTF?.supportResistance?.supports?.slice(0, 3).join(', ') || 'N/A'}
- Resistance: ${latestTF?.supportResistance?.resistances?.slice(0, 3).join(', ') || 'N/A'}
- Timeframe Alignment: ${technical?.alignment?.alignment || 'N/A'}

FUNDAMENTAL ANALYSIS:
- Base: ${JSON.stringify(fundamental?.baseCurrency || {})}
- Quote: ${JSON.stringify(fundamental?.quoteCurrency || {})}
- Relative Strength: ${fundamental?.relativeStrength?.interpretation || 'N/A'}
- Sentiment: ${fundamental?.sentiment?.overall || 'N/A'}

NEWS ANALYSIS:
- Upcoming Events: ${news?.upcomingEvents?.length || 0}
- Recent High Impact: ${news?.recentEvents?.filter(e => e.impact === 'HIGH').length || 0}
- News Safe: ${news?.newsSafe || false}

Return only valid JSON with this exact structure:
{
  "marketSummary": "Brief market overview",
  "technicalExplanation": "Technical analysis explanation",
  "fundamentalExplanation": "Fundamental analysis explanation",
  "newsImpactExplanation": "News impact assessment",
  "tradeThesis": "Main trading thesis if any",
  "reasonToEnter": "Reasons to enter trade",
  "reasonToAvoid": "Reasons to avoid trade",
  "confidencePercentage": 0,
  "riskWarning": "Specific risk warnings",
  "finalRecommendation": "BUY/SELL/WAIT/NO_TRADE",
  "sentiment": "BULLISH/BEARISH/NEUTRAL",
  "keyLevels": [],
  "riskFactors": [],
  "opportunityFactors": []
}`;
  }

  validateAIResponse(result) {
    const required = [
      'marketSummary',
      'technicalExplanation',
      'fundamentalExplanation',
      'newsImpactExplanation',
      'tradeThesis',
      'reasonToEnter',
      'reasonToAvoid',
      'confidencePercentage',
      'riskWarning',
      'finalRecommendation',
      'sentiment'
    ];

    const errors = [];

    for (const field of required) {
      if (result[field] === undefined || result[field] === null || result[field] === '') {
        errors.push(`Missing field: ${field}`);
      }
    }

    result.confidencePercentage = Number(result.confidencePercentage || 0);
    result.confidencePercentage = Math.max(0, Math.min(100, result.confidencePercentage));

    const validRecs = ['BUY', 'SELL', 'WAIT', 'NO_TRADE'];
    if (!validRecs.includes(result.finalRecommendation)) {
      result.finalRecommendation = 'NO_TRADE';
      errors.push('Invalid recommendation, defaulted to NO_TRADE');
    }

    const validSentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
    if (!validSentiments.includes(result.sentiment)) {
      result.sentiment = 'NEUTRAL';
      errors.push('Invalid sentiment, defaulted to NEUTRAL');
    }

    if (!Array.isArray(result.keyLevels)) result.keyLevels = [];
    if (!Array.isArray(result.riskFactors)) result.riskFactors = [];
    if (!Array.isArray(result.opportunityFactors)) result.opportunityFactors = [];

    if (!result.riskWarning || result.riskWarning.length < 10) {
      result.riskWarning =
        'Trading carries significant risk. Past performance does not guarantee future results. Only trade with capital you can afford to lose.';
    }

    return {
      valid: errors.length === 0,
      errors,
      result
    };
  }

  generateFallbackSummary(pair, technical, fundamental, news) {
    const alignment = technical?.alignment || {};
    const rec = alignment.alignment || 'NEUTRAL';

    let recommendation = 'NO_TRADE';
    let confidence = 50;

    if (rec === 'STRONG_BULLISH') {
      recommendation = 'BUY';
      confidence = 70;
    } else if (rec === 'BULLISH') {
      recommendation = 'BUY';
      confidence = 60;
    } else if (rec === 'STRONG_BEARISH') {
      recommendation = 'SELL';
      confidence = 70;
    } else if (rec === 'BEARISH') {
      recommendation = 'SELL';
      confidence = 60;
    }

    if (!news?.newsSafe) {
      confidence = Math.max(30, confidence - 20);
      recommendation = 'NO_TRADE';
    }

    return {
      marketSummary: `Technical analysis shows ${String(rec).replace('_', ' ').toLowerCase()} bias on ${pair}.`,
      technicalExplanation: `Multi-timeframe alignment: ${alignment.alignment || 'neutral'}.`,
      fundamentalExplanation: `Fundamental outlook: ${fundamental?.relativeStrength?.interpretation || 'neutral'}.`,
      newsImpactExplanation: news?.newsSafe
        ? 'No immediate news concerns.'
        : 'High-impact news detected - caution advised.',
      tradeThesis:
        confidence > 55
          ? `Potential ${recommendation.toLowerCase()} opportunity based on technical alignment.`
          : 'No clear trade thesis.',
      reasonToEnter:
        confidence > 55
          ? `Aligned timeframes suggest ${recommendation.toLowerCase()} direction.`
          : 'Insufficient alignment for entry.',
      reasonToAvoid:
        confidence <= 55
          ? 'Low confidence or conflicting signals.'
          : 'Always risk only what you can afford to lose.',
      confidencePercentage: confidence,
      riskWarning:
        'This is algorithmic analysis, not financial advice. Markets can move against any position. Use strict risk management.',
      finalRecommendation: recommendation,
      sentiment: String(rec).includes('BULLISH')
        ? 'BULLISH'
        : String(rec).includes('BEARISH')
          ? 'BEARISH'
          : 'NEUTRAL',
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

      const prompt = `Explain this trade signal in detail for risk assessment.

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

Return only valid JSON:
{
  "explanation": "Detailed trade explanation",
  "riskAssessment": "Risk assessment",
  "probabilityAnalysis": "Probability of success/failure",
  "recommendation": "APPROVE/REJECT/REVIEW",
  "concerns": [],
  "positives": []
}`;

      const response = await this.client.chat.completions.create({
        model: this.aiModel,
        messages: [
          {
            role: 'system',
            content:
              'You are a conservative trading risk analyst. Highlight risks. Never approve unsafe trades. Return only JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });

      return safeJsonParse(response.choices?.[0]?.message?.content || '{}');
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