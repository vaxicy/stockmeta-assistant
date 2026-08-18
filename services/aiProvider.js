// services/aiProvider.js
// Generic OpenAI-compatible chat-completions caller.
// Supports SiliconFlow, OpenAI, or any custom OpenAI-compatible endpoint.

const DEFAULT_ENDPOINTS = {
  siliconflow: 'https://api.siliconflow.cn/v1',
  openai: 'https://api.openai.com/v1',
};

// Reject keywords containing CJK, Hiragana/Katakana, Hangul, Arabic, etc.
const NON_ENGLISH_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0600-\u06ff\u0750-\u077f]/;

function isEnglishKeyword(k) {
  return k && typeof k === 'string' && !NON_ENGLISH_RE.test(k);
}

export function getEndpoint(provider, baseUrl) {
  const key = String(provider || 'siliconflow').toLowerCase();
  if (key === 'custom' && baseUrl) {
    return String(baseUrl).replace(/\/$/, '');
  }
  return DEFAULT_ENDPOINTS[key] || DEFAULT_ENDPOINTS.siliconflow;
}

export function getDefaultModel(provider) {
  const key = String(provider || 'siliconflow').toLowerCase();
  if (key === 'openai') return 'gpt-4o-mini';
  return 'Qwen/Qwen3-Omni-30B-A3B-Captioner';
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.provider   siliconflow | openai | custom
 * @param {string} opts.baseUrl    required when provider === 'custom'
 * @param {string} opts.model
 * @param {string} opts.imageBase64  data URL, e.g. "data:image/jpeg;base64,...."
 * @param {string} opts.prompt
 * @param {number} opts.timeoutMs
 * @returns {Promise<{title:string, keywords:string[]}>}
 */
export async function generateMetadata({ apiKey, provider, baseUrl, model, imageBase64, prompt, timeoutMs = 60000 }) {
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }
  if (!imageBase64) {
    throw new Error('MISSING_IMAGE');
  }

  const endpoint = getEndpoint(provider, baseUrl) + '/chat/completions';

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageBase64 } },
      ],
    },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    throw new Error('NETWORK_ERROR');
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    throw new Error('INVALID_API_KEY');
  }
  if (res.status === 404) {
    throw new Error('MODEL_NOT_FOUND');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const t = await res.text();
      detail = t.slice(0, 500);
      console.error('[StockMeta] Non-OK response body:', detail);
    } catch (_) {}
    throw new Error('HTTP_' + res.status + (detail ? ': ' + detail : ''));
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    // Surface the raw body for easier diagnosis of malformed responses.
    let raw = '';
    try {
      raw = await res.text();
    } catch (_) {}
    console.error('[StockMeta] Failed to parse JSON response. Raw:', raw.slice(0, 500));
    throw new Error('BAD_RESPONSE');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    console.error('[StockMeta] Empty choices/content. Full data:', JSON.stringify(data).slice(0, 500));
    throw new Error('EMPTY_CONTENT');
  }

  console.log('[StockMeta] Raw model response length:', content.length);
  const result = parseModelJson(content);
  if (!result.title && !result.keywords.length) {
    throw new Error('EMPTY_RESPONSE');
  }
  return result;
}

/**
 * Parse the model's JSON output, tolerating Markdown code fences.
 */
export function parseModelJson(content) {
  let text = String(content).trim();
  // Strip ```json ... ``` fences if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }
  // Fallback: extract first {...} block.
  if (!text.startsWith('{')) {
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) text = brace[0];
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error('JSON_PARSE_FAILED');
  }
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  let keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  // Filter out non-English keywords (Chinese, etc.) so Adobe Stock can parse them.
  keywords = keywords.filter(isEnglishKeyword);
  // Fallback: derive extra English keywords from the title if the model returned too few.
  if (keywords.length < 5 && title) {
    const titleWords = title
      .split(/[^a-zA-Z0-9]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 2 && !/\d/.test(w));
    keywords = [...new Set([...keywords, ...titleWords])];
  }
  return { title, keywords };
}
