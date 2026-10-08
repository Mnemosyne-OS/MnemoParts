import { createRoot } from 'react-dom/client';
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';
import App from './App';
import './styles.css';

// Inherit the shell's theme and design tokens. Outside the shell nothing is
// broadcast and the fallbacks in styles.css apply.
onHostConfig();

createRoot(document.getElementById('root')!).render(<App />);
