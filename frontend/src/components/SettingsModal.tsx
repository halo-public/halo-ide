import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { AiSettings, CredentialsSettings, ProviderOption } from '../api/types'
import { saveSettings, type EditorSettings } from '../settingsPrefs'

const LOCAL_OLLAMA = 'http://127.0.0.1:11434'
const CLOUD_OLLAMA = 'https://ollama.com'

interface Props {
  open: boolean
  settings: EditorSettings
  onChange: (settings: EditorSettings) => void
  onClose: () => void
}

export function SettingsModal({ open, settings, onChange, onClose }: Props) {
  const [draft, setDraft] = useState(settings)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [aiSettings, setAiSettings] = useState<AiSettings>({ providers: [] })
  const [credentials, setCredentials] = useState<CredentialsSettings>({ gitHubPat: '' })
  const [openAiKey, setOpenAiKey] = useState('')
  const [ollamaKey, setOllamaKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const savedGitHubPat = useRef('')
  const savedOpenAiKey = useRef('')
  const savedOllamaKey = useRef('')

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    Promise.all([api.listAiProviders(), api.getAiSettings(), api.getCredentials()])
      .then(([nextProviders, nextSettings, nextCredentials]) => {
        const pat = nextCredentials.gitHubPat ?? ''
        const openai = nextSettings.providers.find((p) => p.provider === 'openai')?.apiKey ?? ''
        const ollama = nextSettings.providers.find((p) => p.provider === 'ollama')?.apiKey ?? ''
        setProviders(nextProviders)
        setAiSettings(nextSettings)
        setCredentials({ gitHubPat: pat })
        setOpenAiKey(openai)
        setOllamaKey(ollama)
        savedGitHubPat.current = pat
        savedOpenAiKey.current = openai
        savedOllamaKey.current = ollama
        setError(null)
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
    field: 'apiKey' | 'baseUrl',
    value: string,
    extras?: Partial<{ apiKey: string; baseUrl: string }>,
  ) => {
    const existing = aiSettings.providers.find((p) => p.provider === provider)
    const next: AiSettings = {
      providers: [
        ...aiSettings.providers.filter((p) => p.provider !== provider),
        {
          provider,
          apiKey: existing?.apiKey ?? '',
          baseUrl: existing?.baseUrl ?? '',
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
    (provider) => provider.id !== 'openai' && provider.id !== 'ollama',
  )
  const ollamaSettings = aiSettings.providers.find((p) => p.provider === 'ollama')

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

        <div className="settings-section">
          <h4>Credentials</h4>
          {error && <div className="error-text">{error}</div>}
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
          <label className="settings-row settings-row-stack">
            <span>Ollama Cloud API key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="From ollama.com/settings/keys"
              value={ollamaKey}
              onChange={(e) => setOllamaKey(e.target.value)}
              onBlur={(e) => saveOllamaKey(e.target.value)}
            />
          </label>
          <label className="settings-row settings-row-stack">
            <span>Ollama base URL</span>
            <input
              type="text"
              spellCheck={false}
              placeholder={`${LOCAL_OLLAMA} or ${CLOUD_OLLAMA}`}
              value={ollamaSettings?.baseUrl ?? (ollamaKey ? CLOUD_OLLAMA : LOCAL_OLLAMA)}
              onChange={(e) => updateProviderSetting('ollama', 'baseUrl', e.target.value)}
            />
          </label>
        </div>

        <div className="settings-section">
          <h4>Other AI Providers</h4>
          {otherProviders.map((provider) => {
            const current = aiSettings.providers.find((p) => p.provider === provider.id)
            return (
              <div key={provider.id} className="settings-provider">
                <div className="settings-provider-title">
                  <span>{provider.name}</span>
                  {provider.requiresApiKey && <span className="settings-provider-hint">API key</span>}
                </div>
                {provider.requiresApiKey && (
                  <label className="settings-row settings-row-stack">
                    <span>API key</span>
                    <input
                      type="password"
                      value={current?.apiKey ?? ''}
                      onChange={(e) => updateProviderSetting(provider.id, 'apiKey', e.target.value)}
                    />
                  </label>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
