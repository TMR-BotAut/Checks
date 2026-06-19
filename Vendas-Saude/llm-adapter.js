'use strict';

require('dotenv').config();

const PROVIDER = process.env.LLM_PROVIDER || 'mock';
const MODEL    = process.env.LLM_MODEL    || 'claude-haiku-4-5-20251001';

// ─── Mock responses ───────────────────────────────────────────────────────────
const MOCK_RESPONSES = {
  default: JSON.stringify({
    resposta: 'Resposta simulada (modo mock — configure LLM_PROVIDER no .env)',
    nota: 'Para respostas reais, configure ANTHROPIC_API_KEY ou GOOGLE_API_KEY'
  })
};

async function callLLM(systemPrompt, userPrompt, options = {}) {
  const { maxTokens = 2048 } = options;

  if (PROVIDER === 'mock') {
    await new Promise(r => setTimeout(r, 200));
    return MOCK_RESPONSES.default;
  }

  if (PROVIDER === 'anthropic') {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });
    return msg.content[0].text;
  }

  if (PROVIDER === 'openai') {
    const OpenAI = require('openai');
    const client = new OpenAI.default({ apiKey: process.env.OPENAI_API_KEY });
    const resp = await client.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ]
    });
    return resp.choices[0].message.content;
  }

  if (PROVIDER === 'gemini') {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.LLM_MODEL || 'gemini-1.5-flash',
      systemInstruction: systemPrompt
    });
    const result = await model.generateContent(userPrompt);
    return result.response.text();
  }

  throw new Error(`LLM_PROVIDER desconhecido: ${PROVIDER}`);
}

function parseJSON(text, fallback = {}) {
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

module.exports = { callLLM, parseJSON, PROVIDER, MODEL };
