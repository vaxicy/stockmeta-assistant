// services/config.js
// Centralized config access backed by chrome.storage.local.
// API keys are NEVER hardcoded or committed.

// Per-provider slot defaults. Each provider keeps its own baseUrl + apiKey + model,
// so switching providers never overwrites another provider's endpoint settings.
export const DEFAULT_PROVIDER_CONFIGS = {
  siliconflow: { baseUrl: '', apiKey: '', model: 'Qwen/Qwen3-Omni-30B-A3B-Captioner' },
  openai: { baseUrl: '', apiKey: '', model: 'gpt-4o-mini' },
  gemini: { baseUrl: '', apiKey: '', model: 'gemini-2.5-flash' },
  custom: { baseUrl: '', apiKey: '', model: '' },
  // A local server (Ollama / LM Studio) needs no real API key, so the slot
  // ships with the endpoint and a placeholder key prefilled: picking this
  // provider works immediately, without any "missing API key" detour.
  local: { baseUrl: 'http://localhost:11434/v1', apiKey: 'local', model: '' },
};

const PROVIDER_KEYS = ['siliconflow', 'openai', 'gemini', 'custom', 'local'];

// Anything pointing at the loopback interface is a local model server: it does
// not authenticate, so an empty key must not block the request (the dummy value
// keeps the Authorization header well-formed), and such endpoints get the
// /no_think hint (see aiProvider.js).
const LOOPBACK_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i;

export function isLocalEndpoint(provider, baseUrl) {
  return provider === 'local' || LOOPBACK_RE.test(String(baseUrl || ''));
}

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
  // 'fixed' asks the model for exactly keywordCount keywords.
  // 'range' asks for anywhere between keywordCountMin and keywordCountMax,
  // which avoids extra API calls when the model under-delivers.
  keywordCountMode: 'fixed',
  keywordCountMin: 20,
  keywordCountMax: 30,
  timeoutMs: 60000,
  autoCheckAI: false,
  autoSaveAfterApply: false,
  autoSelectCategory: true,
  defaultCategory: 'auto',
  defaultFileType: 'auto',
  // When true, a successful "Generate Title & Keywords" run immediately applies
  // everything (title + keywords + settings-driven category/file type) for the
  // user, skipping the extra "Apply All" click.
  autoApplyAfterGenerate: false,
  // Batch mode: shows a "Batch process" button in the panel that walks every
  // grid tile flagged with a red dot (missing title / keywords) and does
  // select -> generate -> apply -> save for each one, from a single click.
  batchProcess: false,
  // Pause between two assets during a batch run, to stay well inside provider
  // rate limits.
  batchIntervalMs: 2000,
  // Panel: 'expanded' or 'collapsed' — the state the injected panel starts in
  // each time it loads on a page. Purely visual; never persisted per page.
  panelDefaultState: 'expanded',
  // Adds a separate "Delete red-dot assets" button to the panel. Some assets keep
  // a red dot even though their metadata is complete (Adobe gets stuck on them)
  // and can no longer be submitted. OFF by default: deleting cannot be undone.
  batchDeleteRedDots: false,
};

// Adobe's own hard floor: a result never counts as usable below this.
const ADOBE_MIN_KEYWORDS = 5;

// The keyword count the USER asked for — the floor a result has to reach before
// the batch treats it as "enough" and stops asking. Range mode uses the range
// minimum (the prompt tells the model "never fewer than lo"); fixed mode uses the
// exact target count. Never below Adobe's 5, never above the 50 the UI allows.
export function targetKeywordMinimum(cfg) {
  const c = cfg || {};
  const clamp = (v, fallback) => {
    const n = parseInt(v, 10);
    const base = Number.isFinite(n) && n > 0 ? n : fallback;
    return Math.max(1, Math.min(50, base));
  };
  const wanted =
    c.keywordCountMode === 'range' ? clamp(c.keywordCountMin, 20) : clamp(c.keywordCount, 30);
  return Math.max(ADOBE_MIN_KEYWORDS, wanted);
}

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
    'keywordCountMode',
    'keywordCountMin',
    'keywordCountMax',
    'timeoutMs',
    'autoCheckAI',
    'autoSaveAfterApply',
    'autoSelectCategory',
    'defaultCategory',
    'defaultFileType',
    'autoApplyAfterGenerate',
    'batchProcess',
    'batchIntervalMs',
    'panelDefaultState',
    'batchDeleteRedDots',
  ]);
  // A stored provider that no longer exists (the removed "local" option is the
  // real case) must not break the whole config: fall back to the default one.
  const requested = stored.provider ?? DEFAULT_CONFIG.provider;
  const provider = PROVIDER_KEYS.includes(requested) ? requested : DEFAULT_CONFIG.provider;
  const providerConfigs = await getProviderConfigs(stored);
  // Apply legacy migration on top of the slot for the active provider.
  const legacy = migrateLegacy(stored);
  if (legacy) {
    providerConfigs[provider] = { ...providerConfigs[provider], ...legacy[provider] };
  }
  const slot = providerConfigs[provider] || DEFAULT_PROVIDER_CONFIGS[provider];
  // Local servers authenticate nothing, so never let an empty key block them.
  if (!slot.apiKey && isLocalEndpoint(provider, slot.baseUrl)) {
    slot.apiKey = 'local';
  }
  return {
    provider,
    providerConfigs,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
    model: slot.model,
    keywordCount: stored.keywordCount ?? DEFAULT_CONFIG.keywordCount,
    keywordCountMode: stored.keywordCountMode ?? DEFAULT_CONFIG.keywordCountMode,
    keywordCountMin: stored.keywordCountMin ?? DEFAULT_CONFIG.keywordCountMin,
    keywordCountMax: stored.keywordCountMax ?? DEFAULT_CONFIG.keywordCountMax,
    timeoutMs: stored.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
    autoCheckAI: stored.autoCheckAI ?? DEFAULT_CONFIG.autoCheckAI,
    autoSaveAfterApply: stored.autoSaveAfterApply ?? DEFAULT_CONFIG.autoSaveAfterApply,
    autoSelectCategory: stored.autoSelectCategory ?? DEFAULT_CONFIG.autoSelectCategory,
    defaultCategory: stored.defaultCategory ?? DEFAULT_CONFIG.defaultCategory,
    defaultFileType: stored.defaultFileType ?? DEFAULT_CONFIG.defaultFileType,
    autoApplyAfterGenerate:
      stored.autoApplyAfterGenerate ?? DEFAULT_CONFIG.autoApplyAfterGenerate,
    batchProcess: stored.batchProcess ?? DEFAULT_CONFIG.batchProcess,
    batchIntervalMs: stored.batchIntervalMs ?? DEFAULT_CONFIG.batchIntervalMs,
    panelDefaultState: stored.panelDefaultState ?? DEFAULT_CONFIG.panelDefaultState,
    batchDeleteRedDots: stored.batchDeleteRedDots ?? DEFAULT_CONFIG.batchDeleteRedDots,
  };
}

// Save only the fields that changed. Provider slots are merged so a partial update
// of one provider never clobbers the others.
export async function saveConfig(partial) {
  const update = {};
  for (const k of ['provider', 'keywordCount', 'keywordCountMode', 'keywordCountMin', 'keywordCountMax', 'timeoutMs', 'autoCheckAI', 'autoSaveAfterApply', 'autoSelectCategory', 'defaultCategory', 'defaultFileType', 'autoApplyAfterGenerate', 'batchProcess', 'batchIntervalMs', 'panelDefaultState', 'batchDeleteRedDots']) {
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
