import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fencedCodeFromPreChildren, isDiagramLanguage } from '../markdownFences'
import type { MarkdownDocument } from '../plugins/types'
import { MermaidDiagram } from './MermaidDiagram'

interface Props {
  document: MarkdownDocument | null
  onClose: () => void
}

export function MarkdownPreview({ document: doc, onClose }: Props) {
  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, onClose])

  if (!doc) return null

  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div
        className="overlay-panel markdown-preview-panel"
        role="dialog"
        aria-label={doc.title || 'Markdown preview'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-header markdown-preview-header">
          <h3>{doc.title || 'Markdown'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="markdown-preview-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre({ children }) {
                const fence = fencedCodeFromPreChildren(children)
                if (fence && isDiagramLanguage(fence.language)) {
                  return <MermaidDiagram source={fence.source} />
                }
                return <pre>{children}</pre>
              },
            }}
          >
            {doc.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
