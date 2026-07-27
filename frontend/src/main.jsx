import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Remove the boot splash once React has mounted.
function removeSplash() {
  const splash = document.getElementById('boot-splash');
  if (splash) splash.remove();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Defer splash removal to first paint so the spinner is visible while JS parses.
requestAnimationFrame(() => setTimeout(removeSplash, 80));
