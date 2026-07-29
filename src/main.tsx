import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Comic HUD typography: Bangers for display lettering, Nunito for UI copy.
// Latin subsets only — the app ships no non-latin copy.
import '@fontsource/bangers/latin-400.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-800.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
