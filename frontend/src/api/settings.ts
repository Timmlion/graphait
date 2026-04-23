const STORAGE_KEY = 'graphait_settings'

export interface AppSettings {
  openrouter_api_key: string
  default_model: string
}

const DEFAULTS: AppSettings = {
  openrouter_api_key: '',
  default_model: 'anthropic/claude-sonnet-4-5',
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export const OPENROUTER_MODELS = [
  { id: 'anthropic/claude-sonnet-4-5',         label: 'Claude Sonnet 4.5',        provider: 'Anthropic' },
  { id: 'anthropic/claude-opus-4',              label: 'Claude Opus 4',            provider: 'Anthropic' },
  { id: 'anthropic/claude-haiku-4-5',           label: 'Claude Haiku 4.5',         provider: 'Anthropic' },
  { id: 'openai/gpt-4.1',                       label: 'GPT-4.1',                  provider: 'OpenAI' },
  { id: 'openai/gpt-4o',                        label: 'GPT-4o',                   provider: 'OpenAI' },
  { id: 'openai/o4-mini',                       label: 'o4-mini',                  provider: 'OpenAI' },
  { id: 'google/gemini-2.5-pro',                label: 'Gemini 2.5 Pro',           provider: 'Google' },
  { id: 'google/gemini-2.5-flash',              label: 'Gemini 2.5 Flash',         provider: 'Google' },
  { id: 'meta-llama/llama-4-maverick',          label: 'Llama 4 Maverick',         provider: 'Meta' },
  { id: 'deepseek/deepseek-r1',                 label: 'DeepSeek R1',              provider: 'DeepSeek' },
  { id: 'mistralai/mistral-large',              label: 'Mistral Large',            provider: 'Mistral' },
  { id: 'x-ai/grok-3',                         label: 'Grok 3',                   provider: 'xAI' },
  { id: '__custom__',                            label: 'Custom model ID…',         provider: '' },
] as const
