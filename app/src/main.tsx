import { StrictMode } from 'react'

// A shared verse link (/v/JHN.3.16) that an older offline copy of the team app caught: send it on to the Bible reader
const sharedVerse = /^\/v\/([^/?#]+)/.exec(location.pathname)
if (sharedVerse) location.replace(`/nau-brah-ndu-ngoi/?v=${sharedVerse[1]}`)
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
