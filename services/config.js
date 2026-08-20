// services/config.js
// Centralized config access backed by chrome.storage.local.
// API keys are NEVER hardcoded or committed.

// Per-provider slot defaults. Each provider keeps its own baseUrl + apiKey + model,
// so switching providers never overwrites another provider's endpoint settings.
export const DEFAULT_PROVIDER_CONFIGS = {
  siliconflow: { baseUrl: '', apiKey: '', model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner' },
  openai: { baseUrl: '', apiKey: '', model: 'gpt-4o-mini' },
  custom: { baseUrl: '', apiKey: '', model: '' },
};

const PROVIDER_KEYS = ['siliconflow', 'openai', 'custom'];

export async function getProviderConfigs(stored) {
  const raw = (stored && stored.providerConfigs) || null;
  const merged = {};
  for (const p of PROVIDER_KEYS) {
    const def = DEFAULT_PROVIDER_CONFIGS[p];
    const slot = (raw && raw[p]) || {};
    merged[p] = {
      baseUrl: slot.baseUrl ?? def.baseUrl,
      apiKey: slot.apiKey ?? def.apiKey,
      model: slot.model ?? def.model,
    };
  }
  return merged;
}

export const DEFAULT_CONFIG = {
  provider: 'siliconflow',
  providerConfigs: DEFAULT_PROVIDER_CONFIGS,
  keywordCount: 30,
  timeoutMs: 60000,
  autoCheckAI: false,
  autoSaveAfterApply: false,
  autoSelectCategory: true,
  defaultCategory: 'auto',
};

// Migrate legacy flat apiKey/baseUrl/model into the current provider's slot.
function migrateLegacy(stored) {
  if (!stored) return null;
  if ('apiKey' in stored || 'baseUrl' in stored || 'model' in stored) {
    const provider = stored.provider || DEFAULT_CONFIG.provider;
    const slot = {
      baseUrl: stored.baseUrl ?? '',
      apiKey: stored.apiKey ?? '',
      model: stored.model ?? '',
    };
    const configs = {};
    for (const p of PROVIDER_KEYS) {
      configs[p] = { ...DEFAULT_PROVIDER_CONFIGS[p] };
    }
    configs[provider] = { ...configs[provider], ...slot };
    return configs;
  }
  return null;
}

export async function getConfig() {
  const stored = await chrome.storage.local.get([
    'provider',
    'providerConfigs',
    'apiKey',
    'baseUrl',
    'model',
    'keywordCount',
    'timeoutMs',
    'autoCheckAI',
    'autoSaveAfterApply',
    'autoSelectCategory',
    'defaultCategory',
  ]);
  const provider = stored.provider ?? DEFAULT_CONFIG.provider;
  const providerConfigs = await getProviderConfigs(stored);
  // Apply legacy migration on top of the slot for the active provider.
  const legacy = migrateLegacy(stored);
  if (legacy) {
    providerConfigs[provider] = { ...providerConfigs[provider], ...legacy[provider] };
  }
  const slot = providerConfigs[provider] || DEFAULT_PROVIDER_CONFIGS[provider];
  return {
    provider,
    providerConfigs,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
    model: slot.model,
    keywordCount: stored.keywordCount ?? DEFAULT_CONFIG.keywordCount,
    timeoutMs: stored.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
    autoCheckAI: stored.autoCheckAI ?? DEFAULT_CONFIG.autoCheckAI,
    autoSaveAfterApply: stored.autoSaveAfterApply ?? DEFAULT_CONFIG.autoSaveAfterApply,
    autoSelectCategory: stored.autoSelectCategory ?? DEFAULT_CONFIG.autoSelectCategory,
    defaultCategory: stored.defaultCategory ?? DEFAULT_CONFIG.defaultCategory,
  };
}

// Save only the fields that changed. Provider slots are merged so a partial update
// of one provider never clobbers the others.
export async function saveConfig(partial) {
  const update = {};
  for (const k of ['provider', 'keywordCount', 'timeoutMs', 'autoCheckAI', 'autoSaveAfterApply', 'autoSelectCategory', 'defaultCategory']) {
    if (k in partial) update[k] = partial[k];
  }
  // If apiKey/baseUrl/model are present without an explicit providerConfigs patch,
  // fold them into the active provider's slot.
  if ('apiKey' in partial || 'baseUrl' in partial || 'model' in partial) {
    const provider = partial.provider || (await getConfig()).provider;
    const current = (await getConfig()).providerConfigs || {};
    const slot = { ...(current[provider] || DEFAULT_PROVIDER_CONFIGS[provider]) };
    if ('apiKey' in partial) slot.apiKey = partial.apiKey;
    if ('baseUrl' in partial) slot.baseUrl = partial.baseUrl;
    if ('model' in partial) slot.model = partial.model;
    const configs = { ...current };
    configs[provider] = slot;
    update.providerConfigs = configs;
  }
  if ('providerConfigs' in partial) {
    update.providerConfigs = partial.providerConfigs;
  }
  await chrome.storage.local.set(update);
}
