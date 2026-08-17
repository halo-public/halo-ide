import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './monacoSetup'
import App from './App.tsx'
import { loadSettings } from './settingsPrefs'
import { applyTheme } from './themes'

applyTheme(loadSettings().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
