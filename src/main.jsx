import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

/**
 * NOTE: React StrictMode is intentionally NOT used.
 * In development it double-mounts every component, which double-subscribes
 * Firestore listeners and double-starts timers. Production behaviour is
 * identical either way, so we keep dev and prod as close as possible.
 */
const container = document.getElementById('root');
if (container) container.innerHTML = '';

createRoot(container).render(<App />);
