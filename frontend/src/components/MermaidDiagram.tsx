import { useEffect, useState } from 'react'
import { onThemeChange, type AppTheme } from '../themes'

let diagramSeq = 0

function currentThemeKind(): AppTheme['kind'] {
  return document.documentElement.dataset.themeKind === 'light' ? 'light' : 'dark'
}

function mermaidThemeVariables() {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string) => css.getPropertyValue(name).trim()
  return {
    background: token('--bg-elevated') || '#1b2029',
    primaryColor: token('--accent-muted') || '#58a6ff29',
    primaryTextColor: token('--text') || '#e8eaed',
    primaryBorderColor: token('--accent') || '#58a6ff',
    lineColor: token('--text-muted') || '#9aa3b2',
    secondaryColor: token('--bg-inset') || '#0000002e',
    tertiaryColor: token('--bg-root') || '#0f1115',
    fontFamily: token('--font-ui') || 'Sora, sans-serif',
  }
}

async function renderMermaid(source: string, kind: AppTheme['kind']): Promise<string> {
  const mermaid = (await import('mermaid')).default
  const themeVariables = mermaidThemeVariables()
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: kind === 'light' ? 'default' : 'dark',
    themeVariables,
    fontFamily: themeVariables.fontFamily,
  })
  const id = `halo-md-diagram-${++diagramSeq}`
  const { svg } = await mermaid.render(id, source)
  return svg
}

interface Props {
  source: string
}

export function MermaidDiagram({ source }: Props) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [themeKind, setThemeKind] = useState<AppTheme['kind']>(currentThemeKind)

  useEffect(() => onThemeChange((theme) => setThemeKind(theme.kind)), [])

  useEffect(() => {
    const trimmed = source.trim()
    if (!trimmed) {
      setSvg(null)
      setError(null)
      return
    }
    let cancelled = false
    setSvg(null)
    setError(null)
    void renderMermaid(trimmed, themeKind)
      .then((next) => {
        if (!cancelled) setSvg(next)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [source, themeKind])

  if (error) {
    return (
      <div className="markdown-diagram markdown-diagram-failed" role="alert">
        <div className="markdown-diagram-error">Could not render diagram: {error}</div>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    )
  }

  if (!svg) {
    return <div className="markdown-diagram markdown-diagram-pending">Rendering diagram…</div>
  }

  return (
    <div className="markdown-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
