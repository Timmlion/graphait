import { useState, useEffect } from 'react'
import { skillsApi, type SkillRead } from '../api/skills'
import Icon from '../components/Icon'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillRead[]>([])
  const [selected, setSelected] = useState<SkillRead | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    skillsApi.list().then(s => { setSkills(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const selectSkill = (skill: SkillRead) => {
    setSelected(skill)
    setDraft(skill.content)
    setShowNew(false)
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await skillsApi.update(selected.id, { content: draft })
      setSkills(prev => prev.map(s => s.id === updated.id ? updated : s))
      setSelected(updated)
    } finally {
      setSaving(false)
    }
  }

  const createSkill = async () => {
    const id = slugify(newName)
    if (!id) return
    const skill = await skillsApi.create({ id, name: newName, content: '' })
    setSkills(prev => [...prev, skill])
    selectSkill(skill)
    setShowNew(false)
    setNewName('')
  }

  const deleteSkill = async (id: string) => {
    await skillsApi.delete(id)
    setSkills(prev => prev.filter(s => s.id !== id))
    if (selected?.id === id) { setSelected(null); setDraft('') }
  }

  if (loading) return <div className="settings"><div style={{color:'var(--ink-3)'}}>Loading…</div></div>

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Sidebar */}
      <div style={{ width: 240, borderRight: '1px solid var(--line-1)', padding: '16px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="eyebrow">Skills</span>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setShowNew(true)} title="New skill">
            <Icon name="plus" size={13}/>
          </button>
        </div>
        {showNew && (
          <div style={{ padding: '0 16px 12px' }}>
            <input className="input" placeholder="Skill name…" value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createSkill() }}
              autoFocus/>
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <button className="btn btn--primary btn--sm" onClick={createSkill}>Create</button>
              <button className="btn btn--sm" onClick={() => { setShowNew(false); setNewName('') }}>Cancel</button>
            </div>
          </div>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {skills.map(s => (
            <li key={s.id}
              className={`alist__row${selected?.id === s.id ? ' alist__row--active' : ''}`}
              style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex',
                       justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => selectSkill(s)}>
              <span style={{ fontSize: 'var(--fs-sm)' }}>{s.name}</span>
              <button className="btn btn--ghost btn--icon btn--sm"
                onClick={e => { e.stopPropagation(); deleteSkill(s.id) }}
                title="Delete">
                <Icon name="trash" size={11}/>
              </button>
            </li>
          ))}
          {skills.length === 0 && (
            <li style={{ padding: '8px 16px', color: 'var(--ink-3)', fontSize: 'var(--fs-sm)' }}>
              No skills yet
            </li>
          )}
        </ul>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24 }}>
        {selected ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0 }}>{selected.name}</h2>
                <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-xs)' }}>{selected.id}.md</span>
              </div>
              <button className="btn btn--primary btn--sm" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <textarea
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)',
                       background: 'var(--bg-inset)', border: '1px solid var(--line-2)',
                       borderRadius: 4, padding: 16, resize: 'none', color: 'var(--ink-1)' }}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="# Skill Title&#10;&#10;Describe how the agent should approach work…"
              spellCheck={false}
            />
          </>
        ) : (
          <div style={{ color: 'var(--ink-3)', marginTop: 40, textAlign: 'center' }}>
            Select a skill to edit, or create a new one.
          </div>
        )}
      </div>
    </div>
  )
}
