// services/config.js
// Centralized config access backed by chrome.storage.local.
// API keys are NEVER hardcoded or committed.

export const DEFAULT_CONFIG = {
  apiKey: '',
  provider: 'siliconflow',
  baseUrl: '',
  model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner',
  keywordCount: 30,
  timeoutMs: 60000,
  autoCheckAI: false,
  autoSaveAfterApply: false,
};

export async function getConfig() {
  const stored = await chrome.storage.local.get([
    'apiKey',
    'provider',
    'baseUrl',
    'model',
    'keywordCount',
    'timeoutMs',
    'autoCheckAI',
    'autoSaveAfterApply',
  ]);
  return {
    apiKey: stored.apiKey ?? DEFAULT_CONFIG.apiKey,
    provider: stored.provider ?? DEFAULT_CONFIG.provider,
    baseUrl: stored.baseUrl ?? DEFAULT_CONFIG.baseUrl,
    model: stored.model ?? DEFAULT_CONFIG.model,
    keywordCount: stored.keywordCount ?? DEFAULT_CONFIG.keywordCount,
    timeoutMs: stored.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
    autoCheckAI: stored.autoCheckAI ?? DEFAULT_CONFIG.autoCheckAI,
    autoSaveAfterApply: stored.autoSaveAfterApply ?? DEFAULT_CONFIG.autoSaveAfterApply,
  };
}

export async function saveConfig(partial) {
  await chrome.storage.local.set(partial);
}
