cat > src/services/ai/AIReasoningEngine.js <<'EOF'
const https = require('https');
const OpenAI = require('openai');
const logger = require('../../utils/logger');
const { AiAnalysis, BotConfig } = require('../../models');

function getAiProvider(config = {}) {
  return String(process.env.AI_PROVIDER || config.aiProvider || 'gemini').toLowerCase();
}

function getAiModel(config = {}) {
  const provider = getAiProvider(config);

  if (provider === 'gemini') {
    return process.env.GEMINI_MODEL || config.geminiModel || config.openaiModel || 'gemini-3.5-flash';
  }

  return process.env.OPENAI_MODEL || config.openaiModel || 'gpt-4o-mini';
}

function createOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function stripCodeFences(text) {
  return String(text || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonCandidate(text) {
  const cleaned = stripCodeFences(text);
  if (!cleaned) return '';

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');

  if (objectStart >= 0 && objectEnd > objectStart) {
    return cleaned.slice(objectStart, objectEnd + 1).trim();
  }

  return cleaned;
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty AI response');
  }

  const candidate = extractJsonCandidate(raw);

  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    const repaired = candidate
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');

    try {
      return JSON.parse(repaired);
    } catch (_) {
      throw firstError;
    }
  }
}

const MARKET_ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    marketSummary: { type: 'STRING' },
    technicalExplanation: { type: 'STRING' },
    fundamentalExplanation: { type: 'STRING' },
    newsImpactExplanation: { type: 'STRING' },
    tradeThesis: { type: 'STRING' },
    reasonToEnter: { type: 'STRING' },
    reasonToAvoid: { type: 'STRING' },
    confidencePercentage: { type: 'NUMBER' },
    riskWarning: { type: 'STRING' },
    finalRecommendation: { type: 'STRING', enum: ['BUY', 'SELL', 'WAIT', 'NO_TRADE'] },
    sentiment: { type: 'STRING', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
    keyLevels: { type: 'ARRAY', items: { type: 'STRING' } },
    riskFactors: { type: 'ARRAY', items: { type: 'STRING' } },
    opportunityFactors: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: [
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
    'sentiment',
    'keyLevels',
    'riskFactors',
    'opportunityFactors'
  ]
};

const TRADE_EXPLANATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    explanation: { type: 'STRING' },
    riskAssessment: { type: 'STRING' },
    probabilityAnalysis: { type: 'STRING' },
    recommendation: { type: 'STRING', enum: ['APPROVE', 'REJECT', 'REVIEW'] },
    concerns: { type: 'ARRAY', items: { type: 'STRING' } },
    positives: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['explanation', 'riskAssessment', 'probabilityAnalysis', 'recommendation', 'concerns', 'positives']
};

function makeGeminiRequest({
  model,
  apiKey,
  systemPrompt,
  userPrompt,
  temperature,
  maxOutputTokens,
  responseSchema
}) {
  return new Promise((resolve, reject) => {
    const generationConfig = {
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json'
    };

    if (responseSchema) {
      generationConfig.responseSchema = responseSchema;
    }

    const payload = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig
    });

    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Gemini API ${res.statusCode}: ${data.slice(0, 1500)}`));
          }

          try {
            return resolve(JSON.parse(data));
          } catch (error) {
            return reject(new Error(`Gemini response parse failed: ${error.message}. Raw: ${data.slice(0, 1500)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function extractGeminiText(response) {
  return (response?.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

class AIReasoningEngine {
  constructor() {
    this.client = null;
    this.config = null;
    this.aiProvider = 'gemini';
    this.aiModel = 'gemini-3.5-flash';
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
      if (this.aiProvider === 'gemini') {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
        }

        this.client = { provider: 'gemini' };
      } else {
        this.client = createOpenAIClient();
      }

      logger.info('AI Reasoning Engine initialized', {
        provider: this.aiProvider,
        model: this.aiModel
      });
    } catch (error) {
      logger.error(`AI Engine initialization failed: ${error.message}`);
      this.client = null;
    }
  }

  async generateJsonWithAI({ systemPrompt, userPrompt, maxTokens, responseSchema }) {
    const temperature = Number(this.config?.aiTemperature ?? 0.1);
    const maxOutputTokens = Number(maxTokens || this.config?.aiMaxTokens || 2000);

    if (this.aiProvider === 'gemini') {
      const response = await makeGeminiRequest({
        model: this.aiModel,
        apiKey: process.env.GEMINI_API_KEY,
        systemPrompt,
        userPrompt,
        temperature,
        maxOutputTokens,
        responseSchema
      });

      const rawText = extractGeminiText(response);

      if (!rawText) {
        throw new Error(`Empty Gemini text response. Raw API response: ${JSON.stringify(response).slice(0, 1500)}`);
      }

      return {
        rawText,
        parsed: safeJsonParse(rawText),
        tokensUsed: response?.usageMetadata?.totalTokenCount || 0
      };
    }

    const response = await this.client.chat.completions.create({
      model: this.aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_tokens: maxOutputTokens,
      response_format: { type: 'json_object' }
    });

    const rawText = response.choices?.[0]?.message?.content || '';

    return {
      rawText,
      parsed: safeJsonParse(rawText),
      tokensUsed: response.usage?.total_tokens || 0
    };
  }

  async generateMarketSummary(pair, technicalData, fundamentalData, newsData) {
    try {
      if (!this.client || !this.config?.aiEnabled) {
        return this.generateFallbackSummary(pair, technicalData, fundamentalData, newsData);
      }

      const prompt = this.buildAnalysisPrompt(pair, technicalData, fundamentalData, newsData);

      const systemPrompt = `You are an expert Indian equity market trading analyst.

IMPORTANT RULES:
- You are ADVISORY ONLY.
- You NEVER execute trades.
- You NEVER guarantee profit.
- You must be conservative.
- You must always include risk warnings.
- Return ONLY one valid JSON object.
- Do not return markdown.
- Do not return a code block.
- Do not include any explanation outside JSON.
- finalRecommendation must be one of: BUY, SELL, WAIT, NO_TRADE.
- sentiment must be one of: BULLISH, BEARISH, NEUTRAL.`;

      const startTime = Date.now();

      let aiResult;
      try {
        aiResult = await this.generateJsonWithAI({
          systemPrompt,
          userPrompt: prompt,
          maxTokens: this.config.aiMaxTokens || 3000,
          responseSchema: MARKET_ANALYSIS_SCHEMA
        });
      } catch (error) {
        logger.error(`AI response JSON parse error: ${error.message}`);
        return this.generateFallbackSummary(pair, technicalData, fundamentalData, newsData);
      }

      const latencyMs = Date.now() - startTime;
      const validated = this.validateAIResponse(aiResult.parsed);

      await AiAnalysis.create({
        analysisId: require('uuid').v4(),
        type: 'FULL_ANALYSIS',
        pair,
        prompt: prompt.substring(0, 500),
        rawResponse: String(aiResult.rawText || '').substring(0, 2000),
        parsedResult: validated.result,
        tokensUsed: aiResult.tokensUsed || 0,
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
    const latestTF = tf['1h'] || tf['15m'] || tf['5m'] || tf['1m'] || Object.values(tf)[0] || {};

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

Return a JSON object that matches the provided schema exactly.`;
  }

  validateAIResponse(result = {}) {
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

    result.finalRecommendation = String(result.finalRecommendation || 'NO_TRADE').toUpperCase();
    result.sentiment = String(result.sentiment || 'NEUTRAL').toUpperCase();

    if (!['BUY', 'SELL', 'WAIT', 'NO_TRADE'].includes(result.finalRecommendation)) {
      result.finalRecommendation = 'NO_TRADE';
      errors.push('Invalid recommendation, defaulted to NO_TRADE');
    }

    if (!['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.sentiment)) {
      result.sentiment = 'NEUTRAL';
      errors.push('Invalid sentiment, defaulted to NEUTRAL');
    }

    if (!Array.isArray(result.keyLevels)) result.keyLevels = [];
    if (!Array.isArray(result.riskFactors)) result.riskFactors = [];
    if (!Array.isArray(result.opportunityFactors)) result.opportunityFactors = [];

    if (!result.riskWarning || String(result.riskWarning).length < 10) {
      result.riskWarning =
        'Trading carries significant risk. Past performance does not guarantee future results. Only trade with capital you can afford to lose.';
    }

    return { valid: errors.length === 0, errors, result };
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
      newsImpactExplanation: news?.newsSafe ? 'No immediate news concerns.' : 'High-impact news detected - caution advised.',
      tradeThesis: confidence > 55 ? `Potential ${recommendation.toLowerCase()} opportunity based on technical alignment.` : 'No clear trade thesis.',
      reasonToEnter: confidence > 55 ? `Aligned timeframes suggest ${recommendation.toLowerCase()} direction.` : 'Insufficient alignment for entry.',
      reasonToAvoid: confidence <= 55 ? 'Low confidence or conflicting signals.' : 'Always risk only what you can afford to lose.',
      confidencePercentage: confidence,
      riskWarning: 'This is algorithmic analysis, not financial advice. Markets can move against any position. Use strict risk management.',
      finalRecommendation: recommendation,
      sentiment: String(rec).includes('BULLISH') ? 'BULLISH' : String(rec).includes('BEARISH') ? 'BEARISH' : 'NEUTRAL',
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

Return a JSON object that matches the provided schema exactly.`;

      const systemPrompt =
        'You are a conservative trading risk analyst. Highlight risks. Never approve unsafe trades. Return only one valid JSON object. No markdown. No code block.';

      const aiResult = await this.generateJsonWithAI({
        systemPrompt,
        userPrompt: prompt,
        maxTokens: 1500,
        responseSchema: TRADE_EXPLANATION_SCHEMA
      });

      return this.validateTradeExplanation(aiResult.parsed);
    } catch (error) {
      logger.error(`AI trade explanation error: ${error.message}`);
      return this.generateFallbackTradeExplanation(signal);
    }
  }

  validateTradeExplanation(result = {}) {
    const recommendation = String(result.recommendation || 'REVIEW').toUpperCase();

    return {
      explanation: result.explanation || 'Trade explanation unavailable.',
      riskAssessment: result.riskAssessment || 'Risk assessment unavailable.',
      probabilityAnalysis: result.probabilityAnalysis || 'Probability analysis unavailable.',
      recommendation: ['APPROVE', 'REJECT', 'REVIEW'].includes(recommendation) ? recommendation : 'REVIEW',
      concerns: Array.isArray(result.concerns) ? result.concerns : [],
      positives: Array.isArray(result.positives) ? result.positives : []
    };
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
EOF