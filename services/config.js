// services/config.js
// Centralized config access backed by chrome.storage.local.
// API keys are NEVER hardcoded or committed.

export const DEFAULT_CONFIG = {
  apiKey: '',
  model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner',
  keywordCount: 30,
  timeoutMs: 60000,
};

export async function getConfig() {
  const stored = await chrome.storage.local.get([
    'apiKey',
    'model',
    'keywordCount',
    'timeoutMs',
  ]);
  return {
    apiKey: stored.apiKey ?? DEFAULT_CONFIG.apiKey,
    model: stored.model ?? DEFAULT_CONFIG.model,
    keywordCount: stored.keywordCount ?? DEFAULT_CONFIG.keywordCount,
    timeoutMs: stored.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
  };
}

export async function saveConfig(partial) {
  await chrome.storage.local.set(partial);
}
