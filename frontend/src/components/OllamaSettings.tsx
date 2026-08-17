import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { api } from '../api/client'
import type { CopilotModel } from '../api/types'
import {
  CLOUD_OLLAMA,
  formatPullProgress,
  isLocalOllamaUrl,
  loadOllamaUrlMru,
  LOCAL_OLLAMA,
  modelIsInstalled,
  normalizeOllamaUrl,
  ollamaUrlPresets,
  OLLAMA_RECOMMENDATIONS,
  rememberOllamaUrl,
  type OllamaRecommendKind,
} from '../ollamaModels'

interface Props {
  apiKey: string
  baseUrl: string
  selectedModel: string
  onApiKeyChange: (value: string) => void
  onApiKeyCommit: (value: string) => void
  onBaseUrlChange: (value: string) => void
  onModelChange: (value: string) => void
  onModelCommit: (value: string) => void
}

export function OllamaSettings({
  apiKey,
  baseUrl,
  selectedModel,
  onApiKeyChange,
  onApiKeyCommit,
  onBaseUrlChange,
  onModelChange,
  onModelCommit,
}: Props) {
  const [models, setModels] = useState<CopilotModel[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [testOk, setTestOk] = useState<boolean | null>(null)
  const [urlMru, setUrlMru] = useState<string[]>(() => loadOllamaUrlMru())
  const [urlMenuOpen, setUrlMenuOpen] = useState(false)
  const urlMenuRef = useRef<HTMLDivElement>(null)
  const local = isLocalOllamaUrl(baseUrl || (apiKey ? CLOUD_OLLAMA : LOCAL_OLLAMA))
  const urlPresets = useMemo(() => ollamaUrlPresets(urlMru), [urlMru])
  const installedIds = useMemo(() => models.map((m) => m.id), [models])
  const model = selectedModel.trim()

  const refresh = async () => {
    setLoading(true)
    setListError(null)
    try {
      const list = await api.listModels('ollama')
      setModels(list)
      if (!selectedModel.trim() && list[0]) onModelCommit(list[0].id)
    } catch (e) {
      setModels([])
      setListError(e instanceof Error ? e.message : 'Could not list Ollama models.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // Reload when connection settings change; parent commits URL/key before this re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey])

  useEffect(() => {
    if (!urlMenuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (!urlMenuRef.current?.contains(event.target as Node)) setUrlMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    return () => window.removeEventListener('mousedown', onPointer)
  }, [urlMenuOpen])

  const applyBaseUrl = (url: string) => {
    const next = normalizeOllamaUrl(url)
    if (!next) return
    onBaseUrlChange(next)
    setUrlMru(rememberOllamaUrl(next))
    setUrlMenuOpen(false)
  }

  const pull = async () => {
    if (!model || pulling) return
    setPulling(true)
    setTestOk(null)
    setStatus('Pulling…')
    try {
      await api.pullOllama(model, (evt) => {
        if (evt.error) throw new Error(evt.error)
        setStatus(formatPullProgress(evt.status, evt.completed, evt.total))
      })
      setStatus(`Installed ${model}.`)
      await refresh()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Pull failed.')
    } finally {
      setPulling(false)
    }
  }

  const test = async () => {
    if (!model || testing) return
    setTesting(true)
    setTestOk(null)
    setStatus('Testing…')
    try {
      const result = await api.testOllama(model)
      setTestOk(result.ok)
      const preview = result.reply ? ` Reply: “${result.reply.slice(0, 80)}”` : ''
      setStatus(`${result.message ?? (result.ok ? 'Model responded.' : 'Test failed.')} (${result.elapsedMs} ms)${preview}`)
    } catch (e) {
      setTestOk(false)
      setStatus(e instanceof Error ? e.message : 'Test failed.')
    } finally {
      setTesting(false)
    }
  }

  const renderRecs = (kind: OllamaRecommendKind, heading: string) => (
    <div className="ollama-recs">
      <h4>{heading}</h4>
      {OLLAMA_RECOMMENDATIONS.filter((item) => item.kind === kind).map((item) => {
        const installed = modelIsInstalled(item.id, installedIds)
        return (
          <button
            key={`${kind}:${item.id}`}
            type="button"
            className={selectedModel === item.id ? 'ollama-rec active' : 'ollama-rec'}
            onClick={() => onModelCommit(item.id)}
          >
            <span className="ollama-rec-top">
              <span className="ollama-rec-title">{item.title}</span>
              <span className="ollama-rec-meta">{installed ? 'installed' : item.id}</span>
            </span>
            <span className="ollama-rec-blurb">{item.blurb}</span>
            <span className="ollama-rec-ram">{item.ram}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div id="settings-panel-ollama" role="tabpanel" aria-labelledby="settings-tab-ollama">
      <label className="settings-row settings-row-stack">
        <span>Base URL</span>
        <div className="settings-row-with-action">
          <input
            type="text"
            spellCheck={false}
            placeholder={`${LOCAL_OLLAMA} or ${CLOUD_OLLAMA}`}
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            onBlur={(e) => applyBaseUrl(e.target.value)}
          />
          <div className="mru-dropdown ollama-url-mru" ref={urlMenuRef}>
            <div className="mru-trigger">
              <button
                type="button"
                className="primary-btn mru-main settings-detect-btn"
                title={`Use Ollama Cloud (${CLOUD_OLLAMA})`}
                onClick={() => applyBaseUrl(CLOUD_OLLAMA)}
              >
                Cloud
              </button>
              <button
                type="button"
                className="primary-btn mru-chevron settings-detect-btn"
                aria-label="Recent Ollama endpoints"
                aria-expanded={urlMenuOpen}
                onClick={() => setUrlMenuOpen((open) => !open)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {urlMenuOpen && (
              <div className="mru-menu" role="menu">
                {urlPresets.map((item) => (
                  <button
                    key={`${item.kind}:${item.url}`}
                    type="button"
                    className={`mru-item ${normalizeOllamaUrl(baseUrl).toLowerCase() === item.url.toLowerCase() ? 'active' : ''}`}
                    role="menuitem"
                    onClick={() => applyBaseUrl(item.url)}
                  >
                    <span className="mru-name">{item.label}</span>
                    {item.kind !== 'recent' && <span className="mru-path">{item.url}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </label>
      <div className="settings-hint">
        Local Ollama defaults to {LOCAL_OLLAMA}. Use {CLOUD_OLLAMA} with an API key for hosted models.
      </div>
      <label className="settings-row settings-row-stack">
        <span>API key</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={local ? 'Optional for local Ollama' : 'From ollama.com/settings/keys'}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          onBlur={(e) => onApiKeyCommit(e.target.value)}
        />
      </label>
      <label className="settings-row settings-row-stack">
        <span>Model</span>
        <div className="settings-row-with-action">
          <input
            list="ollama-installed-models"
            spellCheck={false}
            placeholder="qwen3:8b"
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            onBlur={(e) => onModelCommit(e.target.value)}
          />
          <datalist id="ollama-installed-models">
            {models.map((item) => (
              <option key={item.id} value={item.id} />
            ))}
          </datalist>
        </div>
      </label>
      <div className="settings-actions">
        <button type="button" className="primary-btn" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh list'}
        </button>
        <button type="button" className="primary-btn" disabled={!model || pulling || !local} onClick={() => void pull()}>
          {pulling ? 'Pulling…' : 'Pull / install'}
        </button>
        <button type="button" className="primary-btn" disabled={!model || testing} onClick={() => void test()}>
          {testing ? 'Testing…' : 'Test model'}
        </button>
      </div>
      {!local && (
        <div className="settings-hint">Pull is for a local Ollama server. Cloud models are hosted — type the name and Test.</div>
      )}
      {listError && <div className="error-text">{listError}</div>}
      {status && <div className={testOk === false ? 'error-text' : 'settings-hint'}>{status}</div>}
      {models.length > 0 && (
        <div className="settings-hint">
          Installed: {models.map((item) => item.id).join(', ')}
        </div>
      )}
      {renderRecs('thinking', 'Recommended for thinking')}
      {renderRecs('tools', 'Recommended for tools / coding')}
    </div>
  )
}
