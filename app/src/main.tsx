import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startInstallTracking } from "./reader/install";
import { startVisitLogging } from './lib/visits'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Records where the app is opened from, for signed-in users only (see lib/visits.ts)
startVisitLogging()

// Counts this device once when this app is installed (shown on the Notes page)
startInstallTracking("church-tools")
