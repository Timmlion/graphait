import { useState, useEffect } from 'react'
import { docsApi, type FileEntry, type FileContent } from '../api/docs'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/Icon'

function FileTree({ entries, selected, onSelect }: {
  entries: FileEntry[]
  selected: string | null
  onSelect: (path: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Build tree — only show top-level entries and entries whose parent dir is not collapsed
  const toggle = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }

  const isVisible = (entry: FileEntry): boolean => {
    const parts = entry.path.split('/')
    // Check none of the ancestor dirs are collapsed
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('/')
      if (collapsed.has(ancestor)) return false
    }
    return true
  }

  const depth = (path: string) => path.split('/').length - 1

  return (
    <div className="docs__tree">
      {entries.filter(isVisible).map(e => (
        <div
          key={e.path}
          className={`docs__entry${e.path === selected ? ' docs__entry--active' : ''}`}
          style={{ paddingLeft: 12 + depth(e.path) * 16 }}
          onClick={() => e.is_dir ? toggle(e.path) : onSelect(e.path)}
        >
          {e.is_dir ? (
            <Icon name={collapsed.has(e.path) ? 'chevRight' : 'chevDown'} size={11} />
          ) : (
            <Icon name="docs" size={11} />
          )}
          <span className={e.is_dir ? 'docs__dirname' : 'docs__filename'}>{e.name}</span>
          {!e.is_dir && e.size != null && (
            <span className="docs__size mono">{e.size < 1024 ? `${e.size}b` : `${Math.round(e.size/1024)}kb`}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function DocsPage() {
  const { user } = useAuth()
  const [entries, setEntries]   = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<FileContent | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)

  useEffect(() => {
    docsApi.list()
      .then(setEntries)
      .catch(e => setError(e.message ?? 'Failed to load files'))
      .finally(() => setLoading(false))
  }, [])

  const openFile = async (path: string) => {
    setSelected(path)
    setContentLoading(true)
    try {
      const c = await docsApi.content(path)
      setFileContent(c)
    } catch {
      setFileContent(null)
    } finally {
      setContentLoading(false)
    }
  }

  return (
    <div className="docs">
      <header className="topbar">
        <div className="topbar__title">Docs</div>
        <span className="topbar__crumb mono">{(user as any)?.org_slug || 'workspace'}.graphait / docs</span>
      </header>

      <div className="docs__layout">
        <aside className="docs__sidebar">
          {loading ? (
            <div style={{padding:16,color:'var(--ink-3)',fontSize:'var(--fs-sm)'}}>Loading…</div>
          ) : error ? (
            <div style={{padding:16,color:'var(--ink-3)',fontSize:'var(--fs-sm)'}}>
              <p style={{marginBottom:8}}>Cannot load files.</p>
              <p style={{color:'var(--ink-4)'}}>Set a project directory in <a href="/settings" style={{color:'var(--accent)'}}>Settings</a>.</p>
            </div>
          ) : entries.length === 0 ? (
            <div style={{padding:16,color:'var(--ink-3)',fontSize:'var(--fs-sm)'}}>No files found.</div>
          ) : (
            <FileTree entries={entries} selected={selected} onSelect={openFile} />
          )}
        </aside>

        <main className="docs__content">
          {!selected && (
            <div className="docs__empty">
              <Icon name="docs" size={28} />
              <span>Select a file to view</span>
            </div>
          )}
          {selected && contentLoading && (
            <div className="docs__empty">Loading…</div>
          )}
          {selected && !contentLoading && fileContent && (
            <div className="docs__viewer">
              <div className="docs__viewer-head">
                <span className="mono docs__viewer-path">{fileContent.path}</span>
              </div>
              <pre className="docs__viewer-body">{fileContent.content}</pre>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
