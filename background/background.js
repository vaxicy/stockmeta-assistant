// background/background.js  (MV3 service worker, ES module)
import { getConfig } from '../services/config.js';
import { generateMetadata, getEndpoint, ADOBE_CATEGORIES, ADOBE_FILE_TYPES } from '../services/aiProvider.js';

// In-memory config cache. The SW re-reads storage only when the cache is
// empty or invalidated, so a config change made in the options page is picked
// up immediately via chrome.storage.onChanged (instead of relying on a fresh
// read that could momentarily return defaults during a cold start).
let configCache = null;

async function getConfigCached() {
  if (configCache) return configCache;
  try {
    configCache = await getConfig();
  } catch (err) {
    console.warn('[StockMeta] getConfig failed, falling back to defaults:', err && err.message);
    if (!configCache) configCache = await getConfig();
  }
  return configCache;
}

// Any change from the options page invalidates the cache so the next read is
// fresh. This is what makes "re-save" (or any settings change) take effect
// without reloading the extension.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (['provider', 'providerConfigs', 'keywordCount', 'timeoutMs'].some((k) => k in changes)) {
    configCache = null;
  }
});

// Prewarm cache on service worker startup.
getConfigCached();

// Self-correct a possible transient empty storage read during cold start:
// invalidate and re-read shortly after startup, once storage is guaranteed ready.
setTimeout(() => {
  configCache = null;
  getConfigCached();
}, 800);

function buildPrompt(keywordCount, mode = 'all', defaultCategory = 'auto', countMode = 'fixed', countMin = 0, countMax = 0) {
  const n = Math.max(1, Math.min(50, Number(keywordCount) || 30));
  // Range mode accepts anything between min and max instead of forcing an exact
  // count, which VLMs frequently under-deliver. That keeps a single API call
  // rather than topping up with extra requests.
  let keywordLine;
  if (countMode === 'range') {
    const lo = Math.max(1, Math.min(50, Number(countMin) || n));
    const hi = Math.max(lo, Math.min(50, Number(countMax) || n));
    keywordLine = `Between ${lo} and ${hi} English keywords — aim for ${hi} when the image shows many distinct visible concepts, and never fewer than ${lo}`;
  } else {
    keywordLine = `Exactly ${n} English keywords`;
  }
  const parts = [
    'You are helping a contributor upload an asset to Adobe Stock.',
    'Look at the provided image and describe ONLY what is visibly present.',
  ];
  if (mode === 'title') {
    parts.push('Generate ONLY:');
    parts.push(
      '1. One concise English Adobe Stock title (max 70 characters, no brand names, no fictional places, no Chinese or non-English characters).'
    );
  } else if (mode === 'keywords') {
    parts.push('Generate ONLY:');
    parts.push(
      `1. ${keywordLine} (comma-separated concepts, lowercase, no brands, no fictional locations, no Chinese or non-English characters).`
    );
  } else {
    parts.push('Generate:');
    parts.push(
      '1. One concise English Adobe Stock title (max 70 characters, no brand names, no fictional places, no Chinese or non-English characters).'
    );
    parts.push(
      `2. ${keywordLine} (comma-separated concepts, lowercase, no brands, no fictional locations, no Chinese or non-English characters).`
    );
    // When the user fixed a default category in settings, skip the category
    // instruction entirely — the client applies that fixed value instead,
    // which also saves tokens on the model call.
    if (defaultCategory && defaultCategory !== 'auto') {
      parts.push(
        `3. The category is fixed to "${defaultCategory}" by the user — do NOT output a "category" field.`
      );
    } else {
      parts.push(
        `3. Pick the single best Adobe Stock category for this image from this exact list: ${ADOBE_CATEGORIES.join(', ')}. If the image does not clearly fit any specific category, or you are unsure, default to "Graphic Resources".`
      );
    }
  }
  parts.push('Rules:');
  parts.push('- Describe only visible content. Do not invent brands, places, or events.');
  parts.push('- All output must be in English. Do not include Chinese or any non-English words.');
  parts.push('- The category must be one of the listed categories, verbatim.');
  parts.push('- Do NOT output Markdown. Return ONLY a JSON object.');
  if (mode === 'title') {
    parts.push('- JSON format: {"title":"..."}');
  } else if (mode === 'keywords') {
    parts.push('- JSON format: {"keywords":["...","..."]}');
  } else {
    parts.push('- JSON format: {"title":"...","keywords":["...","..."],"category":"..."}');
  }
  return parts.join('\n');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (
    message.type === 'GENERATE_METADATA' ||
    message.type === 'GENERATE_TITLE' ||
    message.type === 'GENERATE_KEYWORDS'
  ) {
    (async () => {
      try {
        const cfg = await getConfigCached();
        if (!cfg.apiKey) {
          sendResponse({ ok: false, error: 'MISSING_API_KEY' });
          return;
        }
        const mode =
          message.type === 'GENERATE_TITLE'
            ? 'title'
            : message.type === 'GENERATE_KEYWORDS'
            ? 'keywords'
            : 'all';
        console.log('[StockMeta] generateMetadata model:', cfg.model, 'mode:', mode);
        const categoryOverride = (await chrome.storage.local.get('defaultCategory')).defaultCategory || 'auto';
        const result = await generateMetadata({
          apiKey: cfg.apiKey,
          provider: cfg.provider,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          imageBase64: message.imageBase64,
          prompt: buildPrompt(cfg.keywordCount, mode, categoryOverride, cfg.keywordCountMode, cfg.keywordCountMin, cfg.keywordCountMax),
          timeoutMs: cfg.timeoutMs,
        });
        // In range mode the model can overshoot the maximum; trim so Adobe
        // never receives more keywords than the user allowed.
        if (cfg.keywordCountMode === 'range' && Array.isArray(result.keywords)) {
          const hi = Math.max(1, Math.min(50, Number(cfg.keywordCountMax) || 30));
          if (result.keywords.length > hi) result.keywords = result.keywords.slice(0, hi);
        }
        sendResponse({ ok: true, title: result.title, keywords: result.keywords, category: result.category });
      } catch (err) {
        console.error('[StockMeta] generateMetadata error:', err && err.message);
        sendResponse({ ok: false, error: err && err.message ? err.message : 'UNKNOWN' });
      }
    })();
    return true;
  }

  if (message.type === 'OPEN_OPTIONS') {
    try {
      chrome.runtime.openOptionsPage();
    } catch (err) {
      console.error('[StockMeta] openOptionsPage failed:', err);
    }
    return;
  }

  if (message.type === 'TEST_CONNECTION') {
    (async () => {
      try {
        const cfg = await getConfigCached();
        // Honor a one-shot override from the caller (options page) so the test
        // can use the live DOM inputs even if storage/cache is briefly stale.
        // We never mutate configCache here — this only affects this single call.
        const ov = message.override || {};
        const apiKey = (ov.apiKey != null ? String(ov.apiKey) : '').trim() || cfg.apiKey;
        const provider = ov.provider || cfg.provider;
        const baseUrl = ov.baseUrl || cfg.baseUrl;
        const model = ov.model || cfg.model;
        if (!apiKey) {
          sendResponse({ ok: false, error: 'MISSING_API_KEY' });
          return;
        }
        const endpoint = getEndpoint(provider, baseUrl) + '/models';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(cfg.timeoutMs || 60000, 15000));
        let res;
        try {
          res = await fetch(endpoint, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
        } catch (err) {
          clearTimeout(timer);
          if (err && err.name === 'AbortError') {
            sendResponse({ ok: false, error: 'TIMEOUT' });
            return;
          }
          sendResponse({ ok: false, error: 'NETWORK_ERROR' });
          return;
        }
        clearTimeout(timer);
        if (res.status === 401 || res.status === 403) {
          sendResponse({ ok: false, error: 'INVALID_API_KEY' });
          return;
        }
        if (res.status === 404) {
          sendResponse({ ok: false, error: 'MODEL_NOT_FOUND' });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, error: 'HTTP_' + res.status });
          return;
        }
        let models = [];
        try {
          const data = await res.json();
          const list = data.models || data.data || data.list || (Array.isArray(data) ? data : []);
          models = list
            .map((m) => (m && (m.id || m.name || m.model)) || '')
            .filter(Boolean);
        } catch (_) {}
        // Gemini's OpenAI-compatible /models returns IDs prefixed with
        // "models/" (e.g. "models/gemini-2.5-flash"), so strip that on both
        // sides before comparing against the user-selected model. Otherwise
        // the check silently reports "model not in list" for a valid model.
        const stripModelPrefix = (s) => String(s).toLowerCase().replace(/^models\//, '');
        const hasModel =
          !model || models.some((id) => stripModelPrefix(id) === stripModelPrefix(model));
        sendResponse({ ok: true, models, hasModel });
      } catch (err) {
        console.error('[StockMeta] testConnection error:', err && err.message);
        sendResponse({ ok: false, error: err && err.message ? err.message : 'UNKNOWN' });
      }
    })();
    return true;
  }
});
