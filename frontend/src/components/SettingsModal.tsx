import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { api } from '../api/client'
import type { AiSettings, CredentialsSettings, ProviderOption } from '../api/types'
import { saveSettings, type EditorSettings } from '../settingsPrefs'
import { THEMES } from '../themes'
import { OllamaSettings } from './OllamaSettings'
import { CLOUD_OLLAMA, LOCAL_OLLAMA } from '../ollamaModels'

const LOCAL_WIRE = 'http://127.0.0.1:41793/v1'

type SettingsTabId = 'editor' | 'ai' | 'ollama' | 'git' | 'about'

const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'ai', label: 'AI' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'git', label: 'Git' },
  { id: 'about', label: 'About' },
]

interface Props {
  open: boolean
  settings: EditorSettings
  onChange: (settings: EditorSettings) => void
  onClose: () => void
  appVersion: string
  updateState: MiniCursorUpdateState | null
  onCheckForUpdates: () => void
  onInstallUpdate: () => void
}

function updateStatusText(state: MiniCursorUpdateState | null): string {
  if (!state || state.status === 'disabled' || state.status === 'idle') {
    return 'Updates are checked automatically in installed builds.'
  }
  if (state.status === 'checking') return 'Checking for updates…'
  if (state.status === 'available') return `Version ${state.version} is available. Downloading…`
  if (state.status === 'downloading') {
    const pct = Math.round(state.percent ?? 0)
    return `Downloading version ${state.version ?? ''} (${pct}%)`.trim()
  }
  if (state.status === 'downloaded') return `Version ${state.version} is ready to install.`
  if (state.status === 'not-available') return 'You are on the latest version.'
  if (state.status === 'error') return state.error || 'Could not check for updates.'
  return ''
}

export function SettingsModal({
  open,
  settings,
  onChange,
  onClose,
  appVersion,
  updateState,
  onCheckForUpdates,
  onInstallUpdate,
}: Props) {
  const [draft, setDraft] = useState(settings)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [aiSettings, setAiSettings] = useState<AiSettings>({ providers: [] })
  const [credentials, setCredentials] = useState<CredentialsSettings>({ gitHubPat: '' })
  const [openAiKey, setOpenAiKey] = useState('')
  const [ollamaKey, setOllamaKey] = useState('')
  const [ollamaModel, setOllamaModel] = useState('')
  const [wireBaseUrl, setWireBaseUrl] = useState('')
  const [wireStatus, setWireStatus] = useState<string | null>(null)
  const [detectingWire, setDetectingWire] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [tabId, setTabId] = useState<SettingsTabId>('editor')
  const savedGitHubPat = useRef('')
  const savedOpenAiKey = useRef('')
  const savedOllamaKey = useRef('')

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    Promise.all([api.listAiProviders(), api.getAiSettings(), api.getCredentials()])
      .then(async ([nextProviders, nextSettings, nextCredentials]) => {
        const pat = nextCredentials.gitHubPat ?? ''
        const openai = nextSettings.providers.find((p) => p.provider === 'openai')?.apiKey ?? ''
        const ollama = nextSettings.providers.find((p) => p.provider === 'ollama')
        const ollamaKeyValue = ollama?.apiKey ?? ''
        const wire = nextSettings.providers.find((p) => p.provider === 'wire')?.baseUrl ?? ''
        setProviders(nextProviders)
        setAiSettings(nextSettings)
        setCredentials({ gitHubPat: pat })
        setOpenAiKey(openai)
        setOllamaKey(ollamaKeyValue)
        setOllamaModel(ollama?.model ?? '')
        setWireBaseUrl(wire)
        savedGitHubPat.current = pat
        savedOpenAiKey.current = openai
        savedOllamaKey.current = ollamaKeyValue
        setError(null)
        if (!wire.trim()) {
          api.detectAuraWire().then(async (detected) => {
            if (detected.baseUrl) setWireBaseUrl(detected.baseUrl)
            setWireStatus(detected.message ?? null)
            setAiSettings(await api.getAiSettings())
          }).catch((err: Error) => setWireStatus(err.message || 'Could not detect Aura Wire.'))
        } else {
          setWireStatus(null)
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [open])

  if (!open) return null

  const apply = (next: EditorSettings) => {
    setDraft(next)
    onChange(next)
    saveSettings(next)
  }

  const updateProviderSetting = (
    provider: string,
    field: 'apiKey' | 'baseUrl' | 'model',
    value: string,
    extras?: Partial<{ apiKey: string; baseUrl: string; model: string }>,
  ) => {
    const existing = aiSettings.providers.find((p) => p.provider === provider)
    const next: AiSettings = {
      providers: [
        ...aiSettings.providers.filter((p) => p.provider !== provider),
        {
          provider,
          apiKey: existing?.apiKey ?? '',
          baseUrl: existing?.baseUrl ?? '',
          model: existing?.model ?? '',
          [field]: value,
          ...extras,
        },
      ],
    }
    setAiSettings(next)
    if (provider === 'openai' && (field === 'apiKey' || extras?.apiKey !== undefined)) {
      const key = extras?.apiKey ?? value
      setOpenAiKey(key)
      savedOpenAiKey.current = key
    }
    if (provider === 'ollama' && (field === 'apiKey' || extras?.apiKey !== undefined)) {
      const key = extras?.apiKey ?? (field === 'apiKey' ? value : existing?.apiKey ?? '')
      setOllamaKey(key)
      savedOllamaKey.current = key
    }
    if (provider === 'ollama' && (field === 'model' || extras?.model !== undefined)) {
      setOllamaModel(extras?.model ?? (field === 'model' ? value : existing?.model ?? ''))
    }
    void api.saveAiSettings(next).then(setAiSettings).catch((e: Error) => setError(e.message))
  }

  const saveOpenAiKey = (value: string) => {
    setOpenAiKey(value)
    if (value === savedOpenAiKey.current) return
    updateProviderSetting('openai', 'apiKey', value)
  }

  const saveOllamaKey = (value: string) => {
    setOllamaKey(value)
    if (value === savedOllamaKey.current) return
    const existing = aiSettings.providers.find((p) => p.provider === 'ollama')
    const currentBase = (existing?.baseUrl ?? LOCAL_OLLAMA).trim().replace(/\/$/, '')
    const extras =
      value.trim() && (!currentBase || currentBase === LOCAL_OLLAMA)
        ? { baseUrl: CLOUD_OLLAMA }
        : undefined
    updateProviderSetting('ollama', 'apiKey', value, extras)
  }

  const saveOllamaModel = (value: string) => {
    setOllamaModel(value)
    const current = aiSettings.providers.find((p) => p.provider === 'ollama')?.model ?? ''
    if (value === current) return
    updateProviderSetting('ollama', 'model', value)
  }

  const saveWireBaseUrl = (value: string) => {
    const trimmed = value.trim()
    setWireBaseUrl(trimmed)
    const current = aiSettings.providers.find((p) => p.provider === 'wire')?.baseUrl ?? ''
    if (trimmed === current) return
    updateProviderSetting('wire', 'baseUrl', trimmed)
  }

  const detectWire = async () => {
    setDetectingWire(true)
    setWireStatus(null)
    await api.detectAuraWire().then(async (detected) => {
      if (detected.baseUrl) setWireBaseUrl(detected.baseUrl)
      setWireStatus(detected.message ?? null)
      setAiSettings(await api.getAiSettings())
    }).catch((err: Error) => setWireStatus(err.message || 'Could not detect Aura Wire.'))
    setDetectingWire(false)
  }

  const saveGitHubPat = (value: string) => {
    setCredentials({ gitHubPat: value })
    if (value === savedGitHubPat.current) return
    setSavingCredentials(true)
    void api
      .saveCredentials({ gitHubPat: value })
      .then((next) => {
        const pat = next.gitHubPat ?? ''
        setCredentials({ gitHubPat: pat })
        savedGitHubPat.current = pat
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSavingCredentials(false))
  }

  const otherProviders = providers.filter(
    (provider) => provider.id !== 'openai' && provider.id !== 'ollama' && provider.id !== 'wire',
  )
  const ollamaSettings = aiSettings.providers.find((p) => p.provider === 'ollama')

  const onTabsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = SETTINGS_TABS.findIndex((tab) => tab.id === tabId)
    if (index < 0) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const next = SETTINGS_TABS[(index + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length]
      setTabId(next.id)
      document.getElementById(`settings-tab-${next.id}`)?.focus()
    }
  }

  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings sections"
          onKeyDown={onTabsKeyDown}
        >
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              type="button"
              role="tab"
              className={tabId === tab.id ? 'settings-tab active' : 'settings-tab'}
              aria-selected={tabId === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={tabId === tab.id ? 0 : -1}
              onClick={() => setTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="settings-body">
          {error && <div className="error-text">{error}</div>}

          {tabId === 'editor' && (
            <div
              id="settings-panel-editor"
              role="tabpanel"
              aria-labelledby="settings-tab-editor"
            >
              <div className="settings-row settings-row-stack">
                <span>Theme</span>
                <div className="theme-picker" role="listbox" aria-label="Color theme">
                  {THEMES.map((theme) => {
                    const selected = draft.theme === theme.id
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={selected ? 'theme-swatch active' : 'theme-swatch'}
                        onClick={() => apply({ ...draft, theme: theme.id })}
                      >
                        <span
                          className="theme-swatch-preview"
                          style={{
                            background: theme.tokens.bgEditor,
                            borderColor: theme.tokens.borderStrong,
                          }}
                        >
                          <span style={{ background: theme.tokens.accent }} />
                          <span style={{ background: theme.tokens.bgSidebar }} />
                        </span>
                        <span className="theme-swatch-meta">
                          <span className="theme-swatch-name">{theme.name}</span>
                          <span className="theme-swatch-kind">{theme.kind}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <label className="settings-row">
                <span>Font size</span>
                <input
                  type="number"
                  min={10}
                  max={24}
                  value={draft.fontSize}
                  onChange={(e) => apply({ ...draft, fontSize: Number(e.target.value) || 13 })}
                />
              </label>
              <label className="settings-row">
                <span>Tab size</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={draft.tabSize}
                  onChange={(e) => apply({ ...draft, tabSize: Number(e.target.value) || 2 })}
                />
              </label>
              <label className="settings-row checkbox">
                <input
                  type="checkbox"
                  checked={draft.wordWrap}
                  onChange={(e) => apply({ ...draft, wordWrap: e.target.checked })}
                />
                <span>Word wrap</span>
              </label>
              <label className="settings-row checkbox">
                <input
                  type="checkbox"
                  checked={draft.minimap}
                  onChange={(e) => apply({ ...draft, minimap: e.target.checked })}
                />
                <span>Minimap</span>
              </label>
              <label className="settings-row checkbox">
                <input
                  type="checkbox"
                  checked={draft.respectGitignore}
                  onChange={(e) => apply({ ...draft, respectGitignore: e.target.checked })}
                />
                <span>Respect .gitignore</span>
              </label>
            </div>
          )}

          {tabId === 'ai' && (
            <div id="settings-panel-ai" role="tabpanel" aria-labelledby="settings-tab-ai">
              <label className="settings-row settings-row-stack">
                <span>OpenAI API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-…"
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  onBlur={(e) => saveOpenAiKey(e.target.value)}
                />
              </label>
              <div className="settings-row settings-row-stack">
                <span>Aura Wire API</span>
                <div className="settings-row-with-action">
                  <input
                    type="text"
                    spellCheck={false}
                    placeholder={LOCAL_WIRE}
                    value={wireBaseUrl}
                    onChange={(e) => setWireBaseUrl(e.target.value)}
                    onBlur={(e) => saveWireBaseUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="primary-btn settings-detect-btn"
                    disabled={detectingWire}
                    onClick={() => void detectWire()}
                  >
                    {detectingWire ? 'Detecting…' : 'Detect'}
                  </button>
                </div>
              </div>
              {wireStatus && <div className="settings-hint">{wireStatus}</div>}

              {otherProviders.length > 0 && (
                <div className="settings-section">
                  <h4>Other providers</h4>
                  {otherProviders.map((provider) => {
                    const current = aiSettings.providers.find((p) => p.provider === provider.id)
                    return (
                      <div key={provider.id} className="settings-provider">
                        <div className="settings-provider-title">
                          <span>{provider.name}</span>
                          {provider.requiresApiKey && (
                            <span className="settings-provider-hint">API key</span>
                          )}
                        </div>
                        {provider.requiresApiKey && (
                          <label className="settings-row settings-row-stack">
                            <span>API key</span>
                            <input
                              type="password"
                              value={current?.apiKey ?? ''}
                              onChange={(e) =>
                                updateProviderSetting(provider.id, 'apiKey', e.target.value)
                              }
                            />
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {tabId === 'ollama' && (
            <OllamaSettings
              apiKey={ollamaKey}
              baseUrl={ollamaSettings?.baseUrl ?? (ollamaKey ? CLOUD_OLLAMA : LOCAL_OLLAMA)}
              selectedModel={ollamaModel}
              onApiKeyChange={setOllamaKey}
              onApiKeyCommit={saveOllamaKey}
              onBaseUrlChange={(value) => updateProviderSetting('ollama', 'baseUrl', value)}
              onModelChange={setOllamaModel}
              onModelCommit={saveOllamaModel}
            />
          )}

          {tabId === 'git' && (
            <div id="settings-panel-git" role="tabpanel" aria-labelledby="settings-tab-git">
              <label className="settings-row settings-row-stack">
                <span>GitHub PAT</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ghp_… (git remotes + Copilot)"
                  value={credentials.gitHubPat ?? ''}
                  disabled={savingCredentials}
                  onChange={(e) => setCredentials({ gitHubPat: e.target.value })}
                  onBlur={(e) => saveGitHubPat(e.target.value)}
                />
              </label>
            </div>
          )}

          {tabId === 'about' && (
            <div
              id="settings-panel-about"
              role="tabpanel"
              aria-labelledby="settings-tab-about"
            >
              <div className="settings-row">
                <span>Halo IDE</span>
                <span className="settings-about-version">v{appVersion}</span>
              </div>
              <p className="settings-update-status">{updateStatusText(updateState)}</p>
              <div className="settings-actions">
                <button
                  className="primary-btn"
                  disabled={
                    !window.miniCursor?.checkForUpdates ||
                    updateState?.status === 'checking' ||
                    updateState?.status === 'downloading'
                  }
                  onClick={() => onCheckForUpdates()}
                >
                  Check for updates
                </button>
                {updateState?.status === 'downloaded' && (
                  <button className="primary-btn" onClick={() => onInstallUpdate()}>
                    Restart to update
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
