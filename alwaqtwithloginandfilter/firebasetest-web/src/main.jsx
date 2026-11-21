import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'

// Detect native mobile platform for edge-to-edge safe area handling
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native');
  document.documentElement.classList.add(`platform-${Capacitor.getPlatform()}`);
}

if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
  document.documentElement.classList.add('is-standalone');
}

// Global fetch interceptor to catch rate limits (HTTP 429)
let lastRateLimitAlertTime = 0;
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  try {
    const response = await originalFetch.apply(window, args);
    if (response.status === 429) {
      const now = Date.now();
      if (now - lastRateLimitAlertTime > 5000) { // 5-second cooldown
        lastRateLimitAlertTime = now;
        alert("Too many requests. Please wait for some time before trying again.");
      }
    }
    return response;
  } catch (error) {
    throw error;
  }
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
