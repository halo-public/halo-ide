import { Search } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import type { SearchMatch } from '../api/types'

interface Props {
  respectGitignore: boolean
  onOpenAt: (path: string, line: number, column: number) => void
  onReplaced?: (paths: string[]) => void
}

export function SearchPanel({ respectGitignore, onOpenAt, onReplaced }: Props) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [regex, setRegex] = useState(false)
  const [matchCase, setMatchCase] = useState(false)
  const [include, setInclude] = useState('')
  const [exclude, setExclude] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<SearchMatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const options = () => ({
    q: query,
    gitignore: respectGitignore,
    regex,
    matchCase,
    include: include.trim() || undefined,
    exclude: exclude.trim() || undefined,
  })

  const run = async () => {
    if (!query.trim()) {
      setResults([])
      setStatus(null)
      return
    }
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      setResults(await api.search(options()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  const replace = async () => {
    if (!query.trim()) return
    const count = results.length || 'all'
    if (!window.confirm(`Replace ${count} match(es) of “${query}” across the workspace?`)) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.replaceInFiles({ ...options(), replacement })
      setStatus(`Replaced ${result.replacementCount} in ${result.fileCount} file(s)`)
      onReplaced?.(result.paths)
      setResults(await api.search(options()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replace failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="search-panel">
      <div className="search-box">
        <Search size={14} />
        <input
          value={query}
          placeholder="Search in files…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run()
          }}
        />
        <button className="primary-btn" disabled={busy} onClick={() => void run()}>
          {busy ? '…' : 'Find'}
        </button>
      </div>
      <div className="search-box">
        <input
          value={replacement}
          placeholder="Replace with…"
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void replace()
          }}
        />
        <button className="primary-btn" disabled={busy || !query.trim()} onClick={() => void replace()}>
          Replace
        </button>
      </div>
      <div className="search-options">
        <label>
          <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} /> Regex
        </label>
        <label>
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
        </label>
      </div>
      <div className="search-box">
        <input
          value={include}
          placeholder="Include globs (*.cs, src/**)"
          onChange={(e) => setInclude(e.target.value)}
        />
      </div>
      <div className="search-box">
        <input
          value={exclude}
          placeholder="Exclude globs"
          onChange={(e) => setExclude(e.target.value)}
        />
      </div>
      {error && <div className="error-text" style={{ padding: 8 }}>{error}</div>}
      {status && <div className="muted" style={{ padding: '4px 8px', fontSize: 12 }}>{status}</div>}
      <div className="search-results">
        {results.length === 0 && !busy && (
          <div className="muted" style={{ padding: 8, fontSize: 12 }}>
            {query ? 'No results' : 'Enter a query and press Enter'}
          </div>
        )}
        {results.map((r, i) => (
          <button
            key={`${r.path}:${r.line}:${r.column}:${i}`}
            className="search-result"
            onClick={() => onOpenAt(r.path, r.line, r.column + 1)}
          >
            <div className="search-result-path">
              {r.path}
              <span className="search-result-loc">
                :{r.line}:{r.column + 1}
              </span>
            </div>
            <div className="search-result-preview">{r.preview}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
