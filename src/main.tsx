import { createRoot } from 'react-dom/client';
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';
import App from './App';
import './styles.css';

// Inside a Mnemosyne OS window, before the first paint: the window paints the
// ground and the page stays transparent (`html.in-host` in the CSS).
if (window.parent !== window) document.documentElement.classList.add('in-host');

// Inherit the shell's theme and design tokens. Outside the shell nothing is
// broadcast and the fallbacks in styles.css apply.
onHostConfig();

createRoot(document.getElementById('root')!).render(<App />);
