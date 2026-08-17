import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { Columns2, Diff, ListTree, Puzzle, Save, X } from 'lucide-react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { EditorCursor, FileContent, OutlineSymbol, ProblemItem } from '../api/types'
import { extractOutline } from '../editorUtils'
import { usePluginHost } from '../plugins/PluginHostContext'
import { applyPluginLanguages } from '../plugins/languages'
import type { EditorSettings } from '../settingsPrefs'
import { monacoThemeId, registerMonacoThemes } from '../themes'
import { ContextMenu, type ContextMenuEntry } from './ContextMenu'

function splitPath(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean)
}

export interface OpenTab {
  path: string
  content: string
  originalContent: string
  language: string
  dirty: boolean
}

export type EditorGroupId = 'primary' | 'secondary'

type TabMenuState = {
  x: number
  y: number
  path: string
  language: string
} | null

type AttachedEditor = {
  group: EditorGroupId
  editor: MonacoEditor.IStandaloneCodeEditor
  disposables: { dispose(): void }[]
}

interface Props {
  tabs: OpenTab[]
  activePath?: string
  activeGroup: EditorGroupId
  secondaryPath?: string
  splitEnabled: boolean
  showDiff: boolean
  showOutline: boolean
  settings: EditorSettings
  onSelect: (path: string, group?: EditorGroupId) => void
  onClose: (path: string) => void
  onChange: (path: string, content: string) => void
  onSaved: (file: FileContent) => void
  onCursorChange: (cursor: EditorCursor | null) => void
  onProblems: (problems: ProblemItem[]) => void
  onToggleSplit: () => void
  onToggleDiff: () => void
  onToggleOutline: () => void
  onRevealRequest?: { path: string; line: number; column?: number } | null
  onRevealHandled?: () => void
  onBreadcrumbFolder?: (folderPath: string) => void
  formatRequest?: number
  showToolbar?: boolean
}

export function EditorArea({
  tabs,
  activePath,
  activeGroup,
  secondaryPath,
  splitEnabled,
  showDiff,
  showOutline,
  settings,
  onSelect,
  onClose,
  onChange,
  onSaved,
  onCursorChange,
  onProblems,
  onToggleSplit,
  onToggleDiff,
  onToggleOutline,
  onRevealRequest,
  onRevealHandled,
  onBreadcrumbFolder,
  formatRequest,
  showToolbar = true,
}: Props) {
  const primary = tabs.find((t) => t.path === activePath)
  const secondary = tabs.find((t) => t.path === secondaryPath)
  const focused = activeGroup === 'secondary' && splitEnabled ? secondary : primary
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tabMenu, setTabMenu] = useState<TabMenuState>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const markersRef = useRef<Map<string, ProblemItem[]>>(new Map())
  const attachedRef = useRef<AttachedEditor[]>([])
  const primaryRef = useRef(primary)
  const secondaryRef = useRef(secondary)
  primaryRef.current = primary
  secondaryRef.current = secondary
  const plugins = usePluginHost()
  const pluginsRef = useRef(plugins)
  pluginsRef.current = plugins
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)

  const outline = useMemo(
    () => (focused ? extractOutline(focused.content, focused.language) : []),
    [focused],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save(focused)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused])

  useEffect(() => {
    if (!onRevealRequest || !editorRef.current) return
    if (focused?.path !== onRevealRequest.path) return
    const line = onRevealRequest.line
    const col = onRevealRequest.column ?? 1
    editorRef.current.revealPositionInCenter({ lineNumber: line, column: col })
    editorRef.current.setPosition({ lineNumber: line, column: col })
    editorRef.current.focus()
    onRevealHandled?.()
  }, [onRevealRequest, focused?.path, onRevealHandled])

  useEffect(() => {
    if (!formatRequest) return
    void editorRef.current?.getAction('editor.action.formatDocument')?.run()
  }, [formatRequest])

  const save = async (tab?: OpenTab) => {
    if (!tab || !tab.dirty) return
    setSaving(true)
    setError(null)
    try {
      const saved = await api.writeFile(tab.path, tab.content)
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const publishProblems = () => {
    const all = [...markersRef.current.values()].flat()
    onProblems(all)
  }

  const bindPluginActions = (attached: AttachedEditor) => {
    for (const d of attached.disposables) d.dispose()
    attached.disposables = []
    const host = pluginsRef.current
    const tab = attached.group === 'secondary' ? secondaryRef.current : primaryRef.current
    if (!tab) return
    host.itemsFor({
      location: 'editor',
      path: tab.path,
      isDirectory: false,
      language: tab.language,
    }).forEach((item, index) => {
      attached.disposables.push(
        attached.editor.addAction({
          id: `minicursor.plugin.${item.pluginId}.${item.id}`,
          label: item.title,
          contextMenuGroupId: '9_minicursor',
          contextMenuOrder: index,
          run: (editor) => {
            const current =
              attached.group === 'secondary' ? secondaryRef.current : primaryRef.current
            if (!current) return
            const sel = editor.getSelection()
            const model = editor.getModel()
            host.runItem(item, {
              location: 'editor',
              path: current.path,
              isDirectory: false,
              language: current.language,
              selection: sel && model ? model.getValueInRange(sel) : '',
              line: editor.getPosition()?.lineNumber,
              column: editor.getPosition()?.column,
            })
          },
        }),
      )
    })
  }

  const attachEditor = (group: EditorGroupId, editor: MonacoEditor.IStandaloneCodeEditor) => {
    const existing = attachedRef.current.find((a) => a.group === group)
    if (existing) {
      for (const d of existing.disposables) d.dispose()
      attachedRef.current = attachedRef.current.filter((a) => a !== existing)
    }
    const attached: AttachedEditor = { group, editor, disposables: [] }
    attachedRef.current.push(attached)
    bindPluginActions(attached)
    editor.onDidDispose(() => {
§d263250
      attachedRef.current = attachedRef.current.filter((a) => a !== attached)
    })
  }

  useEffect(() => {
    for (const attached of attachedRef.current) bindPluginActions(attached)
  }, [plugins.items, primary?.path, primary?.language, secondary?.path, secondary?.language])

  useEffect(() => {
    if (!monacoRef.current) return
    applyPluginLanguages(monacoRef.current, plugins.languages)
  }, [plugins.languages])

  useEffect(() => {
    monacoRef.current?.editor.setTheme(monacoThemeId(settings.theme))
  }, [settings.theme])

  const handleMount =
    (path: string, group: EditorGroupId): OnMount =>
    (ed, monaco) => {
      monacoRef.current = monaco
      registerMonacoThemes(monaco)
      monaco.editor.setTheme(monacoThemeId(settings.theme))
      applyPluginLanguages(monaco, pluginsRef.current.languages)
      editorRef.current = ed
      attachEditor(group, ed)
      ed.onDidChangeCursorPosition((e) => {
        onCursorChange({ line: e.position.lineNumber, column: e.position.column })
      })
      const syncMarkers = () => {
        const model = ed.getModel()
        if (!model) return
        const value = model.getValue()
        if (!path.endsWith('.json')) {
          monaco.editor.setModelMarkers(model, 'minicursor', [])
          markersRef.current.delete(path)
          publishProblems()
          return
        }
        try {
          JSON.parse(value || 'null')
          monaco.editor.setModelMarkers(model, 'minicursor', [])
          markersRef.current.delete(path)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid JSON'
          const lineMatch = /position\s+(\d+)/i.exec(message)
          let line = 1
          let column = 1
          if (lineMatch) {
            const pos = Number(lineMatch[1])
            const before = value.slice(0, pos)
            line = before.split('\n').length
            column = before.length - before.lastIndexOf('\n')
          }
          monaco.editor.setModelMarkers(model, 'minicursor', [
            {
              severity: monaco.MarkerSeverity.Error,
              message,
              startLineNumber: line,
              startColumn: column,
              endLineNumber: line,
              endColumn: column + 1,
            },
          ])
          markersRef.current.set(path, [
            { id: `${path}:json`, path, line, column, severity: 'error', message },
          ])
        }
        publishProblems()
      }
      ed.onDidChangeModelContent(() => {
        const model = ed.getModel()
        if (!model) return
        onChange(path, model.getValue())
        syncMarkers()
      })
      syncMarkers()
      onCursorChange({
        line: ed.getPosition()?.lineNumber ?? 1,
        column: ed.getPosition()?.column ?? 1,
      })
    }

  const monacoOptions = (readOnly = false): MonacoEditor.IStandaloneEditorConstructionOptions => ({
    fontSize: settings.fontSize,
    fontFamily: "IBM Plex Mono, ui-monospace, monospace",
    wordWrap: settings.wordWrap ? 'on' : 'off',
    tabSize: settings.tabSize,
    minimap: { enabled: settings.minimap },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    bracketPairColorization: { enabled: true },
    guides: { indentation: true, bracketPairs: true },
    multiCursorModifier: 'alt',
    readOnly,
    padding: { top: 8 },
  })

  const renderPane = (tab: OpenTab | undefined, group: EditorGroupId) => {
    if (!tab) {
      return (
        <div className="empty-state">
          <h2>Halo IDE</h2>
          <p>Open a file from the explorer, the File menu, or press Ctrl+P.</p>
        </div>
      )
    }

    const crumbs = splitPath(tab.path)
    return (
      <div
        className={`editor-pane ${activeGroup === group ? 'focused' : ''}`}
        onMouseDown={() => onSelect(tab.path, group)}
      >
        <div
          className="breadcrumbs"
          onContextMenu={(e) => {
            e.preventDefault()
            setTabMenu({ x: e.clientX, y: e.clientY, path: tab.path, language: tab.language })
          }}
        >
          {crumbs.map((part, i) => {
            const folder = crumbs.slice(0, i + 1).join('/')
            const isLast = i === crumbs.length - 1
            return (
              <span key={folder} className="crumb">
                {i > 0 && <span className="crumb-sep">/</span>}
                <button
                  type="button"
                  className={isLast ? 'crumb-current' : 'crumb-link'}
                  onClick={() => {
                    if (!isLast) onBreadcrumbFolder?.(crumbs.slice(0, i + 1).join('/'))
                    else onSelect(tab.path, group)
                  }}
                >
                  {part}
                </button>
              </span>
            )
          })}
          {tab.dirty && <span className="crumb-dirty">• unsaved</span>}
        </div>
        {error && group === activeGroup && (
          <div className="error-text" style={{ padding: '6px 14px' }}>
            {error}
          </div>
        )}
        <div className="monaco-host">
          {showDiff && group === activeGroup ? (
            <DiffEditor
              original={tab.originalContent}
              modified={tab.content}
              language={tab.language}
              theme={monacoThemeId(settings.theme)}
              beforeMount={registerMonacoThemes}
              options={{
                ...monacoOptions(false),
                renderSideBySide: true,
                readOnly: false,
              }}
              onMount={(ed) => {
                const modified = ed.getModifiedEditor()
                editorRef.current = modified
                attachEditor(group, modified)
                modified.onDidChangeModelContent(() => {
                  onChange(tab.path, modified.getValue())
                })
                modified.onDidChangeCursorPosition((e) => {
                  onCursorChange({ line: e.position.lineNumber, column: e.position.column })
                })
              }}
            />
          ) : (
            <Editor
              path={tab.path}
              value={tab.content}
              language={tab.language}
              theme={monacoThemeId(settings.theme)}
              beforeMount={registerMonacoThemes}
              options={monacoOptions()}
              onMount={handleMount(tab.path, group)}
            />          )}
        </div>
      </div>
    )
  }

  return (
    <section className="editor-area">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.path}
            className={`tab ${tab.path === activePath || tab.path === secondaryPath ? 'active' : ''} ${tab.path === focused?.path ? 'focused' : ''}`}
            onClick={() => onSelect(tab.path)}
            onContextMenu={(e) => {
              e.preventDefault()
              setTabMenu({ x: e.clientX, y: e.clientY, path: tab.path, language: tab.language })
            }}
            onDoubleClick={() => {
              if (splitEnabled) onSelect(tab.path, activeGroup === 'primary' ? 'secondary' : 'primary')
            }}
            title={tab.path}
          >
            <span className="name">
              {splitPath(tab.path).at(-1)}
              {tab.dirty ? ' •' : ''}
            </span>
            <span
              className="close"
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.path)
              }}
            >
              <X size={12} />
            </span>
          </button>
        ))}
        {showToolbar && (
        <div className="tab-bar-actions">
            <button className="icon-btn" title="Toggle outline" onClick={onToggleOutline}>
              <ListTree size={14} />
            </button>
            <button className="icon-btn" title="Toggle diff" onClick={onToggleDiff}>
              <Diff size={14} />
            </button>
            <button className="icon-btn" title="Split editor" onClick={onToggleSplit}>
              <Columns2 size={14} />
            </button>
            {focused && (
              <button
                className="icon-btn"
                title="Save (Ctrl+S)"
                onClick={() => void save(focused)}
                disabled={!focused.dirty || saving}
              >
                <Save size={14} />
              </button>
            )}
            {focused &&
              plugins
                .titleItemsFor({
                  location: 'editor',
                  path: focused.path,
                  isDirectory: false,
                  language: focused.language,
                })
                .map((item) => (
                  <button
                    key={`${item.pluginId}:${item.id}`}
                    className="icon-btn"
                    title={item.title}
                    onClick={() =>
                      plugins.runItem(item, {
                        location: 'editor',
                        path: focused.path,
                        isDirectory: false,
                        language: focused.language,
                      })
                    }
                  >
                    <Puzzle size={14} />
                  </button>
                ))}
        </div>
        )}
      </div>
      <div className={`editor-body ${splitEnabled ? 'split' : ''} ${showOutline ? 'with-outline' : ''}`}>
        <div className="editor-panes">
          {renderPane(primary, 'primary')}
          {splitEnabled && renderPane(secondary, 'secondary')}
        </div>
        {showOutline && (
          <aside className="outline-panel">
            <div className="outline-header">Outline</div>
            <div className="outline-list">
              {outline.length === 0 ? (
                <div className="muted" style={{ padding: 8, fontSize: 12 }}>
                  No symbols
                </div>
              ) : (
                outline.map((sym: OutlineSymbol) => (
                  <button
                    key={`${sym.name}-${sym.line}`}
                    className="outline-item"
                    onClick={() => {
                      if (!focused) return
                      onSelect(focused.path)
                      // reveal via parent
                      const ed = editorRef.current
                      if (ed) {
                        ed.revealLineInCenter(sym.line)
                        ed.setPosition({ lineNumber: sym.line, column: 1 })
                        ed.focus()
                      }
                    }}
                  >
                    <span className="outline-kind">{sym.kind}</span>
                    <span className="outline-name">{sym.name}</span>
                    <span className="outline-line">{sym.line}</span>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          entries={plugins.itemsFor({
            location: 'editor',
            path: tabMenu.path,
            isDirectory: false,
            language: tabMenu.language,
          }).map((item) => ({
            type: 'item' as const,
            id: `plugin:${item.pluginId}:${item.id}`,
            label: item.title,
            icon: <Puzzle size={14} />,
            onSelect: () =>
              plugins.runItem(item, {
                location: 'editor',
                path: tabMenu.path,
                isDirectory: false,
                language: tabMenu.language,
              }),
          }) satisfies ContextMenuEntry)}
          onClose={() => setTabMenu(null)}
        />
      )}
    </section>
  )
}
