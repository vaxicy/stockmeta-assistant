// background/background.js  (MV3 service worker, ES module)
import { getConfig } from '../services/config.js';
import { generateMetadata } from '../services/aiProvider.js';

function buildPrompt(keywordCount) {
  const n = Math.max(1, Math.min(50, Number(keywordCount) || 30));
  return [
    'You are helping a contributor upload an asset to Adobe Stock.',
    'Look at the provided image and describe ONLY what is visibly present.',
    'Generate:',
    `1. One concise English Adobe Stock title (max 70 characters, no brand names, no fictional places, no Chinese or non-English characters).`,
    `2. Exactly ${n} English keywords (comma-separated concepts, lowercase, no brands, no fictional locations, no Chinese or non-English characters).`,
    'Rules:',
    '- Describe only visible content. Do not invent brands, places, or events.',
    '- All output must be in English. Do not include Chinese or any non-English words.',
    '- Do NOT output Markdown. Return ONLY a JSON object.',
    '- JSON format: {"title":"...","keywords":["...","..."]}',
  ].join('\n');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'GENERATE_METADATA') {
    (async () => {
      try {
        const cfg = await getConfig();
        if (!cfg.apiKey) {
          sendResponse({ ok: false, error: 'MISSING_API_KEY' });
          return;
        }
        console.log('[StockMeta] generateMetadata model:', cfg.model);
        const result = await generateMetadata({
          apiKey: cfg.apiKey,
          provider: cfg.provider,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          imageBase64: message.imageBase64,
          prompt: buildPrompt(cfg.keywordCount),
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
        const cfg = await getConfig();
        if (!cfg.apiKey) {
          sendResponse({ ok: false, error: 'MISSING_API_KEY' });
          return;
        }
        const tiny =
          'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==';
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
