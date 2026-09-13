// Silence noisy Typr font parsing debug logs from troika-three-text Web Workers & main thread
const silenceFontDebug = `
  if (typeof console !== 'undefined' && console.debug) {
    const _origDebug = console.debug;
    console.debug = function(...args) {
      if (typeof args[0] === 'string' && (
        args[0].includes('unsupported GPOS table') ||
        args[0].includes('unsupported GSUB table') ||
        args[0].includes('unknown format:') ||
        args[0].includes('returning name table')
      )) {
        return;
      }
      return _origDebug.apply(console, args);
    };
  }
`;

if (typeof URL !== 'undefined' && URL.createObjectURL) {
  const origCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function(obj) {
    if (obj instanceof Blob && (obj.type === 'application/javascript' || obj.type === 'text/javascript')) {
      try {
        const patchedBlob = new Blob([silenceFontDebug, '\n', obj], { type: obj.type });
        return origCreateObjectURL(patchedBlob);
      } catch (e) {
        return origCreateObjectURL(obj);
      }
    }
    return origCreateObjectURL(obj);
  };
}

if (typeof console !== 'undefined' && console.debug) {
  const origDebug = console.debug.bind(console);
  console.debug = function(...args) {
    if (typeof args[0] === 'string' && (
      args[0].includes('unsupported GPOS table') ||
      args[0].includes('unsupported GSUB table') ||
      args[0].includes('unknown format:') ||
      args[0].includes('returning name table')
    )) {
      return;
    }
    return origDebug.apply(console, args);
  };
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

