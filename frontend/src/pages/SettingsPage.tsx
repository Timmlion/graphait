import { useState, useEffect } from 'react'
import { saveSettings, OPENROUTER_MODELS } from '../api/settings'
import { orgApi, type OrgSettings } from '../api/org'
import Icon from '../components/Icon'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function SettingsPage() {
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null)
  const [apiKey, setApiKey]           = useState('')
  const [model, setModel]             = useState('anthropic/claude-sonnet-4-5')
  const [customModel, setCustomModel] = useState('')
  const [showKey, setShowKey]         = useState(false)
  const [saveState, setSaveState]     = useState<SaveState>('idle')
  const [loading, setLoading]         = useState(true)

  const isCustom = model === '__custom__' ||
    (!OPENROUTER_MODELS.some(m => m.id === model && m.id !== '__custom__') && model !== '')

  useEffect(() => {
    orgApi.getSettings()
      .then(s => {
        setOrgSettings(s)
        const key = s.openrouter_api_key ?? ''
        const mdl = s.default_model ?? 'anthropic/claude-sonnet-4-5'
        setApiKey(key)
        const known = OPENROUTER_MODELS.find(m => m.id === mdl && m.id !== '__custom__')
        if (!known && mdl) {
          setCustomModel(mdl)
          setModel('__custom__')
        } else {
          setModel(mdl)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    const finalModel = model === '__custom__' ? customModel.trim() : model
    if (!finalModel) {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 2500)
      return
    }
    setSaveState('saving')
    try {
      const updated = await orgApi.patchSettings({
        openrouter_api_key: apiKey,
        default_model: finalModel,
      })
      setOrgSettings(updated)
      // Mirror to localStorage so connector config picker has a local fallback
      saveSettings({ openrouter_api_key: apiKey, default_model: finalModel })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    } finally {
      setTimeout(() => setSaveState('idle'), 2500)
    }
  }

  if (loading) {
    return (
      <div className="settings">
        <div style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="settings">
      <div className="settings__header">
        <h1 className="settings__title">Settings</h1>
        <p className="settings__sub">
          Org: <span className="mono" style={{ color: 'var(--ink-2)' }}>{orgSettings?.org_slug}.graphait</span>
          {' · '}API key stored server-side, never exposed in browser storage.
        </p>
      </div>

      <div className="settings__body">
        <section className="settings__section">
          <div className="settings__section-head">
            <Icon name="spark" size={14} />
            <span className="settings__section-title">AI Provider — OpenRouter</span>
          </div>

          <div className="settings__fields">
            <div className="field">
              <label className="label" htmlFor="or-key">API Key</label>
              <div className="settings__key-wrap">
                <input
                  id="or-key"
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-or-v1-…"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  className="btn btn--ghost btn--icon btn--sm settings__eye"
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  title={showKey ? 'Hide' : 'Show'}
                >
                  <Icon name={showKey ? 'eyeOff' : 'eye'} size={13} />
                </button>
              </div>
              <p className="settings__hint">
                Get your key at <span className="mono" style={{ color: 'var(--accent)' }}>openrouter.ai/keys</span>
                {' · '}Used as fallback for all agents that don't have their own key.
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor="or-model">Default Model</label>
              <select
                id="or-model"
                className="select"
                value={model}
                onChange={e => setModel(e.target.value)}
              >
                {OPENROUTER_MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.provider ? `${m.provider} — ${m.label}` : m.label}
                  </option>
                ))}
              </select>
              <p className="settings__hint">Used as fallback for agents that don't have a model set.</p>
            </div>

            {(model === '__custom__' || isCustom) && (
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
              </div>
            )}

            <div className="settings__row">
              <button
                className="btn btn--primary"
                onClick={handleSave}
                disabled={saveState === 'saving'}
              >
                {saveState === 'saving' ? 'Saving…' :
                 saveState === 'saved'  ? <><Icon name="check" size={13}/> Saved</> :
                 saveState === 'error'  ? <><Icon name="alert" size={13}/> Error</> :
                 'Save settings'}
              </button>
              {apiKey && saveState === 'idle' && (
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
