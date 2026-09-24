// services/aiProvider.js
// Generic OpenAI-compatible chat-completions caller.
// Supports SiliconFlow, OpenAI, Gemini (via its OpenAI-compatibility layer),
// or any custom OpenAI-compatible endpoint.

const DEFAULT_ENDPOINTS = {
  siliconflow: 'https://api.siliconflow.cn/v1',
  openai: 'https://api.openai.com/v1',
  // Gemini's OpenAI-compatibility layer. Uses standard Bearer auth and the
  // same /chat/completions path, so the generic caller works unmodified.
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

// Reject keywords containing CJK, Hiragana/Katakana, Hangul, Arabic, etc.
const NON_ENGLISH_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0600-\u06ff\u0750-\u077f]/;

function isEnglishKeyword(k) {
  return k && typeof k === 'string' && !NON_ENGLISH_RE.test(k);
}

// Drop duplicates case-insensitively so a repeated keyword never occupies a
// slot that a distinct concept could have used (models sometimes pad lists).
function dedupeKeywords(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const k = String(raw).trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

// Adobe Stock content-tagger category list (must match the live dropdown exactly).
export const ADOBE_CATEGORIES = [
  'Animals',
  'Buildings and Architecture',
  'Business',
  'Drinks',
  'The Environment',
  'States of Mind',
  'Food',
  'Graphic Resources',
  'Hobbies and Leisure',
  'Industry',
  'Landscapes',
  'Lifestyle',
  'People',
  'Plants and Flowers',
  'Culture and Religion',
  'Science',
  'Social Issues',
  'Sports',
  'Technology',
  'Transport',
  'Travel',
];

export const ADOBE_FILE_TYPES = ['Photos', 'Illustrations'];

function normalizeToAdobeCategory(value) {
  if (!value) return 'Graphic Resources';
  const v = String(value).trim();
  const lower = v.toLowerCase();
  const exact = ADOBE_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  // Tolerate small variations (e.g. "Graphics" -> "Graphic Resources").
  for (const c of ADOBE_CATEGORIES) {
    const cl = c.toLowerCase();
    if (cl.includes(lower) || lower.includes(cl)) return c;
  }
  // Fallback: generic enough for any asset so the category field is never empty.
  return 'Graphic Resources';
}

// Map a model-supplied file type string onto the only two values Adobe Stock
// accepts. Anything ambiguous (empty, unrecognized, "image", etc.) collapses to
// "Photos" since Adobe does not auto-detect this field and Photos is the safe default.
function normalizeToAdobeFileType(value) {
  if (!value) return 'Photos';
  const lower = String(value).trim().toLowerCase();
  if (lower.includes('illustr')) return 'Illustrations';
  if (lower === 'photo' || lower === 'photos' || lower === 'image' || lower === 'images' || lower.includes('photo')) {
    return 'Photos';
  }
  return 'Photos';
}

// Normalize a user-supplied base URL: drop trailing slash and any accidentally
// pasted endpoint suffix (e.g. /chat/completions, /v1/chat/completions) so the
// base always ends at the version prefix. Keeps the real request path clean.
function normalizeBaseUrl(input) {
  let b = (input || '').trim().replace(/\/+$/, '');
  b = b.replace(/\/(chat|images|embeddings|audio)\/completions$/i, '');
  b = b.replace(/\/v1\/messages$/i, '');
  return b;
}

export function getEndpoint(provider, baseUrl) {
  const key = String(provider || 'siliconflow').toLowerCase();
  if (key === 'custom' && baseUrl) {
    return normalizeBaseUrl(baseUrl);
  }
  return DEFAULT_ENDPOINTS[key] || DEFAULT_ENDPOINTS.siliconflow;
}

export function getDefaultModel(provider) {
  const key = String(provider || 'siliconflow').toLowerCase();
  if (key === 'openai') return 'gpt-4o-mini';
  if (key === 'gemini') return 'gemini-2.5-flash';
  return 'Qwen/Qwen3-Omni-30B-A3B-Captioner';
}

// Adobe's own minimum, and the bar a result has to clear to count as
// "keywords recognized" instead of "re-recognize this one".
export const MIN_KEYWORDS = 5;

// ---------------------------------------------------------------- parsing

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// "1. Cat" / "- cat" / '"cat"' / "cat," → "cat". Only list markers and
// wrapping punctuation are stripped, so "3d printing" survives untouched.
function cleanKeyword(value) {
  return String(value)
    .replace(/^\s*\d{1,2}\s*[.)、:]\s*/, '')
    .replace(/^[\s"'`*\-–•]+/, '')
    .replace(/[\s"'`*,;.]+$/, '')
    .trim();
}

// Keywords arrive in many shapes. Normalizing all of them is what stops the
// model's answer from silently collapsing into "0 keywords":
//   ["a","b"] · "a, b, c" · "a\nb" · [{keyword:"a"}] · {name:"a"}
function toStringList(value) {
  const flat = [];
  const walk = (item) => {
    if (item == null) return;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      flat.push(String(item));
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (typeof item === 'object') {
      const v = item.keyword ?? item.name ?? item.term ?? item.value ?? item.text ?? item.label;
      if (v != null) walk(v);
    }
  };
  walk(value);
  const out = [];
  for (const chunk of flat) {
    // Split only strings that clearly hold a list, so a single keyword is kept.
    if (/[,，;；|\n]/.test(chunk)) chunk.split(/[,，;；|\n]+/).forEach((s) => out.push(s));
    else out.push(chunk);
  }
  return out.map(cleanKeyword).filter(Boolean);
}

// Accept alternative field names: models occasionally rename keys, and dropping
// the payload because of that is exactly the "not recognized" complaint.
function pickValue(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const n of names) {
    if (obj[n] != null && obj[n] !== '') return obj[n];
  }
  // Case-insensitive second pass ("Keywords" / "KEYWORDS" / "Title").
  const keys = Object.keys(obj);
  for (const n of names) {
    const hit = keys.find((k) => k.toLowerCase() === String(n).toLowerCase());
    if (hit && obj[hit] != null && obj[hit] !== '') return obj[hit];
  }
  return undefined;
}

// Last resort only: derive keywords from the title so a generated asset is
// never handed over with an empty keyword field.
export function deriveKeywordsFromTitle(title) {
  const words = String(title || '')
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 2 && !/\d/.test(w));
  return dedupeKeywords(words);
}

// Transient problems are worth another model call; a bad key or model is not.
function isRetryableError(code) {
  const c = String(code || '');
  if (!c) return true;
  return !(
    c === 'MISSING_API_KEY' ||
    c === 'MISSING_IMAGE' ||
    c === 'INVALID_API_KEY' ||
    c === 'MODEL_NOT_FOUND'
  );
}

// First balanced {...} block, string/escape aware — tolerates the prose a model
// sometimes wraps around its JSON ("Here is the metadata: {...} .").
function firstBalancedObject(text) {
  const start = String(text).indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function isJsonText(text) {
  try {
    JSON.parse(text);
    return true;
  } catch (_) {
    return false;
  }
}

function extractJsonBlock(content) {
  let text = String(content == null ? '' : content).replace(/^\uFEFF/, '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const candidates = [];
  if (text.startsWith('{') || text.startsWith('[')) candidates.push(text);
  const balanced = firstBalancedObject(text);
  if (balanced) candidates.push(balanced);
  for (const candidate of candidates) {
    if (isJsonText(candidate)) return candidate;
    // Tolerate a stray trailing comma before a closing bracket.
    const repaired = candidate.replace(/,\s*([}\]])/g, '$1');
    if (isJsonText(repaired)) return repaired;
  }
  return text;
}

/** @param {object} opts */
async function requestMetadata({
  apiKey,
  provider,
  baseUrl,
  model,
  imageBase64,
  prompt,
  timeoutMs = 60000,
  // Some gateways reject response_format, so only the first attempt uses it and
  // a rejection cannot burn every remaining attempt.
  useJsonMode = true,
}) {
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
      body: JSON.stringify(
        useJsonMode
          ? { model, messages, stream: false, response_format: { type: 'json_object' } }
          : { model, messages, stream: false }
      ),
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
  // Only title + keywords decide whether anything was recognized. The category
  // always has a fallback, so testing it here (as this used to) never fired and
  // an empty answer was accepted as "done" with 0 keywords.
  if (!result.title && !result.keywords.length) {
    console.error('[StockMeta] Model answered without title or keywords:', JSON.stringify(result));
    throw new Error('EMPTY_RESPONSE');
  }
  return result;
}

/**
 * Parse the model's JSON output, tolerating Markdown fences, surrounding prose,
 * string-instead-of-array keywords, renamed keys and a bare keyword array.
 */
export function parseModelJson(content) {
  const text = extractJsonBlock(content);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error('JSON_PARSE_FAILED');
  }
  // Keywords-only answers sometimes come back as a bare array.
  if (Array.isArray(parsed)) {
    return {
      title: '',
      keywords: dedupeKeywords(toStringList(parsed).filter(isEnglishKeyword)),
      category: normalizeToAdobeCategory(undefined),
      fileType: normalizeToAdobeFileType(undefined),
      rawKeywordCount: toStringList(parsed).length,
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON_PARSE_FAILED');
  }
  const rawTitle = pickValue(parsed, ['title', 'Title', '标题']);
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  const rawKeywords = pickValue(parsed, [
    'keywords',
    'Keywords',
    'keyword',
    'tags',
    'terms',
    '关键词',
  ]);
  const all = toStringList(rawKeywords);
  // Non-English keywords are dropped so Adobe Stock can index the asset — but
  // the raw count is kept, because "the model answered in Chinese" and "the
  // model answered nothing" need different handling by the caller.
  const keywords = dedupeKeywords(all.filter(isEnglishKeyword));
  return {
    title,
    keywords,
    category: normalizeToAdobeCategory(pickValue(parsed, ['category', 'Category', '类别'])),
    fileType: normalizeToAdobeFileType(
      pickValue(parsed, ['fileType', 'filetype', 'FileType', 'type', '素材类型'])
    ),
    rawKeywordCount: all.length,
  };
}

// Extra instructions for a repeat call: the first answer was unusable, so make
// the format requirements impossible to miss.
function retrySuffix(needKeywords) {
  const lines = [
    '',
    'IMPORTANT — this is a retry, the previous answer was unusable:',
    '- Reply with the JSON object ONLY. No explanation, no Markdown, no code fence.',
  ];
  if (needKeywords) {
    lines.push('- "keywords" MUST be a JSON array with at least 15 entries (never a string, never empty).');
    lines.push('- Every keyword MUST be plain ASCII English: letters a-z, digits and hyphens only.');
    lines.push('- Lowercase, 1-4 words each, no leading numbers or bullets, no trailing punctuation.');
  }
  lines.push('- Describe only what is clearly visible in the image.');
  return lines.join('\n');
}

function resultScore(r) {
  return (r.title ? 1000 : 0) + Math.min(100, r.keywords.length);
}

/**
 * Ask the model for metadata and RE-RECOGNIZE when the answer is unusable.
 *
 * A single API call used to be the whole story: a timeout, a Markdown-wrapped
 * answer, a renamed key or a "keywords": "a, b, c" string silently produced an
 * empty keyword list — the panel then showed "0 个关键词" and the batch wrote an
 * asset without keywords. Now the call is repeated (up to `attempts`) whenever
 * the result is missing/insufficient, with a stricter prompt, and the caller is
 * told how many attempts it took.
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.provider   siliconflow | openai | gemini | custom
 * @param {string} opts.baseUrl    required when provider === 'custom'
 * @param {string} opts.model
 * @param {string} opts.imageBase64  data URL, e.g. "data:image/jpeg;base64,...."
 * @param {string} opts.prompt
 * @param {number} opts.timeoutMs
 * @param {number} [opts.attempts=3]      max calls (1 disables re-recognition)
 * @param {number} [opts.minKeywords=5]   keywords needed to count as recognized
 * @param {{title?:boolean, keywords?:boolean}} [opts.need]  what this mode needs
 * @returns {Promise<{title:string, keywords:string[], category:string, fileType:string, attempts:number, partial?:boolean, keywordsPatched?:boolean}>}
 */
export async function generateMetadata({
  apiKey,
  provider,
  baseUrl,
  model,
  imageBase64,
  prompt,
  timeoutMs = 60000,
  attempts = 3,
  minKeywords = MIN_KEYWORDS,
  need = { title: true, keywords: true },
} = {}) {
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }
  if (!imageBase64) {
    throw new Error('MISSING_IMAGE');
  }
  const total = Math.max(1, Math.min(5, Number(attempts) || 1));
  const needTitle = need.title !== false;
  const needKeywords = need.keywords !== false;

  let best = null;
  let lastError = null;

  for (let attempt = 1; attempt <= total; attempt++) {
    try {
      const result = await requestMetadata({
        apiKey,
        provider,
        baseUrl,
        model,
        imageBase64,
        prompt: attempt === 1 ? prompt : prompt + retrySuffix(needKeywords),
        timeoutMs,
        useJsonMode: attempt === 1,
      });
      if (!best || resultScore(result) > resultScore(best)) best = result;

      const missing = [];
      if (needTitle && !result.title) missing.push('title');
      if (needKeywords && result.keywords.length < minKeywords) {
        missing.push('keywords ' + result.keywords.length + '/' + minKeywords);
      }
      if (!missing.length) {
        if (attempt > 1) {
          console.log('[StockMeta] metadata recognized on attempt ' + attempt + '/' + total);
        }
        return { ...result, attempts: attempt };
      }
      lastError = new Error(needTitle && !result.title ? 'EMPTY_RESPONSE' : 'NOT_ENOUGH_KEYWORDS');
      console.warn(
        '[StockMeta] attempt ' + attempt + '/' + total + ' unusable (' + missing.join(', ') + ') — re-recognizing'
      );
    } catch (err) {
      lastError = err;
      const code = (err && err.message) || 'UNKNOWN';
      console.warn('[StockMeta] attempt ' + attempt + '/' + total + ' failed:', code);
      if (!isRetryableError(code)) throw err;
    }
    if (attempt < total) await sleep(400 * attempt);
  }

  // Every call failed or stayed incomplete: keep the best partial answer, and if
  // it still lacks keywords derive them from the title so the asset is at least
  // submittable (flagged, so the UI can say so instead of showing a bare 0).
  if (best && needKeywords && best.keywords.length < minKeywords && best.title) {
    const merged = dedupeKeywords([...best.keywords, ...deriveKeywordsFromTitle(best.title)]);
    if (merged.length > best.keywords.length) {
      console.warn('[StockMeta] keywords patched from the title (' + merged.length + ') after ' + total + ' calls');
      best = { ...best, keywords: merged, keywordsPatched: true };
    }
  }
  if (best && (!needTitle || best.title) && (!needKeywords || best.keywords.length)) {
    return { ...best, attempts: total, partial: true };
  }
  throw lastError || new Error('EMPTY_RESPONSE');
}

