// background/background.js  (MV3 service worker, ES module)
import { getConfig } from '../services/config.js';
import { generateMetadata } from '../services/aiProvider.js';

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
  if (['apiKey', 'provider', 'baseUrl', 'model', 'keywordCount', 'timeoutMs'].some((k) => k in changes)) {
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
  }
  parts.push('Rules:');
  parts.push('- Describe only visible content. Do not invent brands, places, or events.');
  parts.push('- All output must be in English. Do not include Chinese or any non-English words.');
  parts.push('- Do NOT output Markdown. Return ONLY a JSON object.');
  if (mode === 'title') {
    parts.push('- JSON format: {"title":"..."}');
  } else if (mode === 'keywords') {
    parts.push('- JSON format: {"keywords":["...","..."]}');
  } else {
    parts.push('- JSON format: {"title":"...","keywords":["...","..."]}');
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
        sendResponse({ ok: true, title: result.title, keywords: result.keywords });
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
        if (!cfg.apiKey) {
          sendResponse({ ok: false, error: 'MISSING_API_KEY' });
          return;
        }
        const tiny =
          'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDnKKKK/VT4EKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Z';
        const result = await generateMetadata({
          apiKey: cfg.apiKey,
          provider: cfg.provider,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          imageBase64: tiny,
          prompt: 'Return JSON {"title":"test","keywords":["test"]} describing nothing.',
          timeoutMs: cfg.timeoutMs,
        });
        sendResponse({ ok: true, title: result.title, keywords: result.keywords });
      } catch (err) {
        console.error('[StockMeta] testConnection error:', err && err.message);
        sendResponse({ ok: false, error: err && err.message ? err.message : 'UNKNOWN' });
      }
    })();
    return true;
  }
});
