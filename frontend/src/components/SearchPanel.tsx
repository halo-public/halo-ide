import { Search } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import type { SearchMatch } from '../api/types'

interface Props {
  respectGitignore: boolean
  onOpenAt: (path: string, line: number, column: number) => void
}

export function SearchPanel({ respectGitignore, onOpenAt }: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<SearchMatch[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setBusy(true)
    setError(null)
    try {
      setResults(await api.search(query.trim(), respectGitignore))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
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
      {error && <div className="error-text" style={{ padding: 8 }}>{error}</div>}
      <div className="search-results">
        {results.length === 0 && !busy && (
          <div className="muted" style={{ padding: 8, fontSize: 12 }}>
            {query ? 'No results' : 'Enter a query and press Enter'}
          </div>
        )}
        {results.map((r, i) => (
          <button
            key={`${r.path}:${r.line}:${i}`}
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
