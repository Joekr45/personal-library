import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Lets the app be added to the home screen and open like a normal app.
// (Browsers only allow this on secure https:// addresses or localhost.)
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Remember the browser's "install this app" offer so Settings can show an Install button.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__installPrompt = event;
});
