export type ThemeId = 'midnight' | 'day' | 'nord' | 'dracula' | 'forest' | 'contrast'

export type ThemeKind = 'dark' | 'light'

export type ThemeTokens = {
  bgRoot: string
  bgActivity: string
  bgSidebar: string
  bgEditor: string
  bgPanel: string
  bgElevated: string
  bgHover: string
  bgActive: string
  bgTitlebar: string
  bgInset: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textDim: string
  accent: string
  accentStrong: string
  accentMuted: string
  accentBorder: string
  success: string
  danger: string
  warning: string
  chatUser: string
  shadow: string
  glowPrimary: string
  glowSecondary: string
  scrollbar: string
  overlay: string
  successGlow: string
  dangerMuted: string
  selection: string
}

export type AppTheme = {
  id: ThemeId
  name: string
  kind: ThemeKind
  tokens: ThemeTokens
}

const TOKEN_TO_CSS: Record<keyof ThemeTokens, string> = {
  bgRoot: '--bg-root',
  bgActivity: '--bg-activity',
  bgSidebar: '--bg-sidebar',
  bgEditor: '--bg-editor',
  bgPanel: '--bg-panel',
  bgElevated: '--bg-elevated',
  bgHover: '--bg-hover',
  bgActive: '--bg-active',
  bgTitlebar: '--bg-titlebar',
  bgInset: '--bg-inset',
  border: '--border',
  borderStrong: '--border-strong',
  text: '--text',
  textMuted: '--text-muted',
  textDim: '--text-dim',
  accent: '--accent',
  accentStrong: '--accent-strong',
  accentMuted: '--accent-muted',
  accentBorder: '--accent-border',
  success: '--success',
  danger: '--danger',
  warning: '--warning',
  chatUser: '--chat-user',
  shadow: '--shadow',
  glowPrimary: '--glow-primary',
  glowSecondary: '--glow-secondary',
  scrollbar: '--scrollbar',
  overlay: '--overlay',
  successGlow: '--success-glow',
  dangerMuted: '--danger-muted',
  selection: '--selection',
}

export const DEFAULT_THEME_ID: ThemeId = 'midnight'

export const THEMES: AppTheme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    kind: 'dark',
    tokens: {
      bgRoot: '#0f1115',
      bgActivity: '#0b0d11',
      bgSidebar: '#12151b',
      bgEditor: '#161a22',
      bgPanel: '#12151b',
      bgElevated: '#1b2029',
      bgHover: 'rgba(255, 255, 255, 0.05)',
      bgActive: 'rgba(88, 166, 255, 0.12)',
      bgTitlebar: '#0b0d11',
      bgInset: 'rgba(0, 0, 0, 0.18)',
      border: '#252a34',
      borderStrong: '#323947',
      text: '#e8eaed',
      textMuted: '#9aa3b2',
      textDim: '#6b7382',
      accent: '#58a6ff',
      accentStrong: '#3d8bfd',
      accentMuted: 'rgba(88, 166, 255, 0.16)',
      accentBorder: 'rgba(88, 166, 255, 0.35)',
      success: '#3fb950',
      danger: '#f85149',
      warning: '#d29922',
      chatUser: '#1f2a3a',
      shadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
      glowPrimary: 'rgba(88, 166, 255, 0.08)',
      glowSecondary: 'rgba(63, 185, 80, 0.05)',
      scrollbar: '#2f3642',
      overlay: 'rgba(0, 0, 0, 0.45)',
      successGlow: 'rgba(63, 185, 80, 0.6)',
      dangerMuted: 'rgba(248, 81, 73, 0.12)',
      selection: '#58a6ff40',
    },
  },
  {
    id: 'day',
    name: 'Day',
    kind: 'light',
    tokens: {
      bgRoot: '#f4f6f8',
      bgActivity: '#e8ecf1',
      bgSidebar: '#eef1f5',
      bgEditor: '#ffffff',
      bgPanel: '#eef1f5',
      bgElevated: '#ffffff',
      bgHover: 'rgba(31, 35, 40, 0.06)',
      bgActive: 'rgba(9, 105, 218, 0.12)',
      bgTitlebar: '#e8ecf1',
      bgInset: 'rgba(31, 35, 40, 0.04)',
      border: '#d0d7de',
      borderStrong: '#afb8c1',
      text: '#1f2328',
      textMuted: '#59636e',
      textDim: '#8c959f',
      accent: '#0969da',
      accentStrong: '#0550ae',
      accentMuted: 'rgba(9, 105, 218, 0.12)',
      accentBorder: 'rgba(9, 105, 218, 0.35)',
      success: '#1a7f37',
      danger: '#cf222e',
      warning: '#9a6700',
      chatUser: '#ddf4ff',
      shadow: '0 8px 30px rgba(31, 35, 40, 0.12)',
      glowPrimary: 'rgba(9, 105, 218, 0.07)',
      glowSecondary: 'rgba(26, 127, 55, 0.05)',
      scrollbar: '#afb8c1',
      overlay: 'rgba(31, 35, 40, 0.4)',
      successGlow: 'rgba(26, 127, 55, 0.35)',
      dangerMuted: 'rgba(207, 34, 46, 0.12)',
      selection: '#0969da33',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    kind: 'dark',
    tokens: {
      bgRoot: '#2e3440',
      bgActivity: '#242933',
      bgSidebar: '#3b4252',
      bgEditor: '#2e3440',
      bgPanel: '#3b4252',
      bgElevated: '#434c5e',
      bgHover: 'rgba(236, 239, 244, 0.06)',
      bgActive: 'rgba(136, 192, 208, 0.16)',
      bgTitlebar: '#242933',
      bgInset: 'rgba(24, 26, 33, 0.35)',
      border: '#4c566a',
      borderStrong: '#5b677d',
      text: '#eceff4',
      textMuted: '#d8dee9',
      textDim: '#9aa5b8',
      accent: '#88c0d0',
      accentStrong: '#81a1c1',
      accentMuted: 'rgba(136, 192, 208, 0.18)',
      accentBorder: 'rgba(136, 192, 208, 0.4)',
      success: '#a3be8c',
      danger: '#bf616a',
      warning: '#ebcb8b',
      chatUser: '#434c5e',
      shadow: '0 8px 30px rgba(24, 26, 33, 0.45)',
      glowPrimary: 'rgba(136, 192, 208, 0.1)',
      glowSecondary: 'rgba(163, 190, 140, 0.06)',
      scrollbar: '#4c566a',
      overlay: 'rgba(24, 26, 33, 0.5)',
      successGlow: 'rgba(163, 190, 140, 0.55)',
      dangerMuted: 'rgba(191, 97, 106, 0.16)',
      selection: '#88c0d040',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    kind: 'dark',
    tokens: {
      bgRoot: '#21222c',
      bgActivity: '#191a21',
      bgSidebar: '#21222c',
      bgEditor: '#282a36',
      bgPanel: '#21222c',
      bgElevated: '#343746',
      bgHover: 'rgba(248, 248, 242, 0.06)',
      bgActive: 'rgba(189, 147, 249, 0.16)',
      bgTitlebar: '#191a21',
      bgInset: 'rgba(0, 0, 0, 0.22)',
      border: '#44475a',
      borderStrong: '#6272a4',
      text: '#f8f8f2',
      textMuted: '#bdc2d4',
      textDim: '#6272a4',
      accent: '#bd93f9',
      accentStrong: '#ff79c6',
      accentMuted: 'rgba(189, 147, 249, 0.18)',
      accentBorder: 'rgba(189, 147, 249, 0.4)',
      success: '#50fa7b',
      danger: '#ff5555',
      warning: '#ffb86c',
      chatUser: '#44475a',
      shadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
      glowPrimary: 'rgba(189, 147, 249, 0.1)',
      glowSecondary: 'rgba(255, 121, 198, 0.06)',
      scrollbar: '#44475a',
      overlay: 'rgba(0, 0, 0, 0.5)',
      successGlow: 'rgba(80, 250, 123, 0.5)',
      dangerMuted: 'rgba(255, 85, 85, 0.16)',
      selection: '#bd93f940',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    kind: 'dark',
    tokens: {
      bgRoot: '#0f1410',
      bgActivity: '#0b0f0c',
      bgSidebar: '#121814',
      bgEditor: '#161c18',
      bgPanel: '#121814',
      bgElevated: '#1c2420',
      bgHover: 'rgba(230, 237, 232, 0.05)',
      bgActive: 'rgba(63, 185, 80, 0.14)',
      bgTitlebar: '#0b0f0c',
      bgInset: 'rgba(0, 0, 0, 0.22)',
      border: '#243028',
      borderStrong: '#31463a',
      text: '#e6ede8',
      textMuted: '#9aada0',
      textDim: '#6d7d72',
      accent: '#3fb950',
      accentStrong: '#2ea043',
      accentMuted: 'rgba(63, 185, 80, 0.16)',
      accentBorder: 'rgba(63, 185, 80, 0.38)',
      success: '#56d364',
      danger: '#f85149',
      warning: '#d29922',
      chatUser: '#1a2a20',
      shadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
      glowPrimary: 'rgba(63, 185, 80, 0.1)',
      glowSecondary: 'rgba(210, 153, 34, 0.05)',
      scrollbar: '#31463a',
      overlay: 'rgba(0, 0, 0, 0.5)',
      successGlow: 'rgba(86, 211, 100, 0.55)',
      dangerMuted: 'rgba(248, 81, 73, 0.14)',
      selection: '#3fb95040',
    },
  },
  {
    id: 'contrast',
    name: 'High Contrast',
    kind: 'dark',
    tokens: {
      bgRoot: '#000000',
      bgActivity: '#000000',
      bgSidebar: '#0a0a0a',
      bgEditor: '#000000',
      bgPanel: '#0a0a0a',
      bgElevated: '#161616',
      bgHover: 'rgba(255, 255, 255, 0.12)',
      bgActive: 'rgba(61, 158, 255, 0.28)',
      bgTitlebar: '#000000',
      bgInset: '#111111',
      border: '#6e6e6e',
      borderStrong: '#ffffff',
      text: '#ffffff',
      textMuted: '#c8c8c8',
      textDim: '#9a9a9a',
      accent: '#3d9eff',
      accentStrong: '#79b8ff',
      accentMuted: 'rgba(61, 158, 255, 0.22)',
      accentBorder: '#3d9eff',
      success: '#4dff88',
      danger: '#ff4d4d',
      warning: '#ffcc00',
      chatUser: '#102033',
      shadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
      glowPrimary: 'rgba(61, 158, 255, 0.12)',
      glowSecondary: 'rgba(77, 255, 136, 0.06)',
      scrollbar: '#6e6e6e',
      overlay: 'rgba(0, 0, 0, 0.7)',
      successGlow: 'rgba(77, 255, 136, 0.55)',
      dangerMuted: 'rgba(255, 77, 77, 0.2)',
      selection: '#3d9eff66',
    },
  },
]

const THEME_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]))

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_BY_ID.has(value as ThemeId)
}

export function getTheme(id?: string | null): AppTheme {
  return (id && THEME_BY_ID.get(id as ThemeId)) || THEME_BY_ID.get(DEFAULT_THEME_ID)!
}

export function monacoThemeId(id: ThemeId | string): string {
  return `mini-cursor-${getTheme(id).id}`
}

type ThemeListener = (theme: AppTheme) => void
const listeners = new Set<ThemeListener>()

export function onThemeChange(listener: ThemeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function applyTheme(id?: string | null): AppTheme {
  const theme = getTheme(id)
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.dataset.themeKind = theme.kind
  root.style.colorScheme = theme.kind
  for (const key of Object.keys(TOKEN_TO_CSS) as (keyof ThemeTokens)[]) {
    root.style.setProperty(TOKEN_TO_CSS[key], theme.tokens[key])
  }
  for (const listener of listeners) listener(theme)
  return theme
}

export function terminalTheme(theme: AppTheme): {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
} {
  return {
    background: theme.tokens.bgPanel,
    foreground: theme.tokens.text,
    cursor: theme.tokens.accent,
    cursorAccent: theme.tokens.bgPanel,
    selectionBackground: theme.tokens.selection,
  }
}

type MonacoThemeHost = {
  editor: {
    defineTheme: (
      name: string,
      data: {
        base: 'vs' | 'vs-dark' | 'hc-black'
        inherit: boolean
        rules: { token: string; foreground?: string; fontStyle?: string }[]
        colors: Record<string, string>
      },
    ) => void
  }
}

export function registerMonacoThemes(monaco: MonacoThemeHost): void {
  for (const theme of THEMES) {
    const { tokens } = theme
    monaco.editor.defineTheme(monacoThemeId(theme.id), {
      base: theme.kind === 'light' ? 'vs' : theme.id === 'contrast' ? 'hc-black' : 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': tokens.bgEditor,
        'editor.foreground': tokens.text,
        'editor.lineHighlightBackground': tokens.bgElevated,
        'editorCursor.foreground': tokens.accent,
        'editor.selectionBackground': tokens.selection,
        'editor.inactiveSelectionBackground': tokens.bgActive,
        'editorLineNumber.foreground': tokens.textDim,
        'editorLineNumber.activeForeground': tokens.textMuted,
        'editorGutter.background': tokens.bgEditor,
        'editorWidget.background': tokens.bgElevated,
        'editorWidget.border': tokens.borderStrong,
        'editorWidget.foreground': tokens.text,
        'editorSuggestWidget.background': tokens.bgElevated,
        'editorSuggestWidget.border': tokens.borderStrong,
        'minimap.background': tokens.bgEditor,
        'scrollbarSlider.background': tokens.scrollbar,
        focusBorder: tokens.accent,
        'sideBar.background': tokens.bgSidebar,
        'input.background': tokens.bgRoot,
        'input.foreground': tokens.text,
        'input.border': tokens.border,
      },
    })
  }
}
