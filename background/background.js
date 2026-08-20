// background/background.js  (MV3 service worker, ES module)
import { getConfig } from '../services/config.js';
import { generateMetadata, getEndpoint } from '../services/aiProvider.js';

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

function buildPrompt(keywordCount, mode = 'all') {
  const n = Math.max(1, Math.min(50, Number(keywordCount) || 30));
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
      `1. Exactly ${n} English keywords (comma-separated concepts, lowercase, no brands, no fictional locations, no Chinese or non-English characters).`
    );
  } else {
    parts.push('Generate:');
    parts.push(
      '1. One concise English Adobe Stock title (max 70 characters, no brand names, no fictional places, no Chinese or non-English characters).'
    );
    parts.push(
      `2. Exactly ${n} English keywords (comma-separated concepts, lowercase, no brands, no fictional locations, no Chinese or non-English characters).`
    );
    parts.push(
      '3. Pick the single best Adobe Stock category for this image from this exact list: Animals, Buildings and Architecture, Business, Drinks, The Environment, States of Mind, Food, Graphic Resources, Hobbies and Leisure, Industry, Landscapes, Lifestyle, People, Plants and Flowers, Culture and Religion, Science, Social Issues, Sports, Technology, Transport, Travel.'
    );
    parts.push('4. Pick the file type from this exact list: Photos, Illustrations.');
  }
  parts.push('Rules:');
  parts.push('- Describe only visible content. Do not invent brands, places, or events.');
  parts.push('- All output must be in English. Do not include Chinese or any non-English words.');
  parts.push('- The category must be one of the listed categories, verbatim.');
  parts.push('- The file type must be either "Photos" or "Illustrations", verbatim.');
  parts.push('- Do NOT output Markdown. Return ONLY a JSON object.');
  if (mode === 'title') {
    parts.push('- JSON format: {"title":"..."}');
  } else if (mode === 'keywords') {
    parts.push('- JSON format: {"keywords":["...","..."]}');
  } else {
    parts.push('- JSON format: {"title":"...","keywords":["...","..."],"category":"...","fileType":"..."}');
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
        const result = await generateMetadata({
          apiKey: cfg.apiKey,
          provider: cfg.provider,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          imageBase64: message.imageBase64,
          prompt: buildPrompt(cfg.keywordCount, mode),
          timeoutMs: cfg.timeoutMs,
        });
        sendResponse({ ok: true, title: result.title, keywords: result.keywords, category: result.category, fileType: result.fileType });
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
        const hasModel =
          !model || models.some((id) => id.toLowerCase() === model.toLowerCase());
        sendResponse({ ok: true, models, hasModel });
      } catch (err) {
        console.error('[StockMeta] testConnection error:', err && err.message);
        sendResponse({ ok: false, error: err && err.message ? err.message : 'UNKNOWN' });
      }
    })();
    return true;
  }
});
