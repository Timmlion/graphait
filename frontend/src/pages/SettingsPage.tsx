import { useState, useEffect } from 'react'
import { loadSettings, saveSettings, OPENROUTER_MODELS, type AppSettings } from '../api/settings'
import Icon from '../components/Icon'

type SaveState = 'idle' | 'saved' | 'error'

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [showKey, setShowKey]   = useState(false)
  const [customModel, setCustomModel] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const isCustom = settings.default_model === '__custom__' ||
    !OPENROUTER_MODELS.some(m => m.id === settings.default_model || m.id === '__custom__') &&
    settings.default_model !== ''

  useEffect(() => {
    const loaded = loadSettings()
    const knownId = OPENROUTER_MODELS.find(m => m.id === loaded.default_model && m.id !== '__custom__')
    if (!knownId && loaded.default_model) {
      setCustomModel(loaded.default_model)
      setSettings({ ...loaded, default_model: '__custom__' })
    } else {
      setSettings(loaded)
    }
  }, [])

  function handleSave() {
    const finalModel = settings.default_model === '__custom__' ? customModel.trim() : settings.default_model
    if (!finalModel) {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 2500)
      return
    }
    saveSettings({ ...settings, default_model: finalModel })
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
  }

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="settings">
      <div className="settings__header">
        <h1 className="settings__title">Settings</h1>
        <p className="settings__sub">Workspace configuration. Stored locally in your browser.</p>
      </div>

      <div className="settings__body">
        {/* ── AI Provider ── */}
        <section className="settings__section">
          <div className="settings__section-head">
            <Icon name="spark" size={14} />
            <span className="settings__section-title">AI Provider</span>
          </div>

          <div className="settings__fields">
            <div className="field">
              <label className="label" htmlFor="or-key">OpenRouter API Key</label>
              <div className="settings__key-wrap">
                <input
                  id="or-key"
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-or-v1-…"
                  value={settings.openrouter_api_key}
                  onChange={e => set('openrouter_api_key', e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  className="btn btn--ghost btn--icon btn--sm settings__eye"
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  <Icon name={showKey ? 'eyeOff' : 'eye'} size={13} />
                </button>
              </div>
              <p className="settings__hint">
                Get your key at <span className="mono" style={{ color: 'var(--accent)' }}>openrouter.ai/keys</span>
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor="or-model">Default Model</label>
              <select
                id="or-model"
                className="select"
                value={settings.default_model}
                onChange={e => set('default_model', e.target.value)}
              >
                {OPENROUTER_MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.provider ? `${m.provider} — ${m.label}` : m.label}
                  </option>
                ))}
              </select>
            </div>

            {(settings.default_model === '__custom__' || isCustom) && (
              <div className="field">
                <label className="label" htmlFor="or-custom">Custom Model ID</label>
                <input
                  id="or-custom"
                  className="input mono"
                  type="text"
                  placeholder="provider/model-name"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  spellCheck={false}
                />
                <p className="settings__hint">
                  Full OpenRouter model ID, e.g. <span className="mono">mistralai/mixtral-8x22b</span>
                </p>
              </div>
            )}

            <div className="settings__row">
              <button className="btn btn--primary" onClick={handleSave}>
                {saveState === 'saved' ? <><Icon name="check" size={13} /> Saved</> :
                 saveState === 'error' ? <><Icon name="alert" size={13} /> Fix model ID</> :
                 'Save settings'}
              </button>
              {settings.openrouter_api_key && saveState === 'idle' && (
                <span className="settings__status">
                  <span className="dot dot--ok" />
                  Key configured
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
