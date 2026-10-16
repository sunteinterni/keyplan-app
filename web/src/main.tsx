import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/schibsted-grotesk/400.css';
import '@fontsource/schibsted-grotesk/500.css';
import '@fontsource/schibsted-grotesk/700.css';
import '@fontsource/schibsted-grotesk/800.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/mali/400.css';
import '@fontsource/mali/500.css';
import '@fontsource/mali/600.css';
import './styles.css';
import { LOGO_ON, MARK, brandCssVars } from '../../shared/brand';
import { App } from './App';

for (const [k, v] of Object.entries(brandCssVars())) document.documentElement.style.setProperty(k, v);

// favicon = the symbol alone (guideline: symbol only where space is tight), drawn from the one logo path
const fav = LOGO_ON.light;
const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK.viewBox} ${MARK.viewBox}" fill="none" stroke-linecap="round" stroke-width="${MARK.strokeWidth + 2}"><path d="${MARK.ring}" stroke="${fav.ring}"/><path d="${MARK.cross}" stroke="${fav.cross}"/></svg>`;
const link = Object.assign(document.createElement('link'), { rel: 'icon', type: 'image/svg+xml', href: `data:image/svg+xml,${encodeURIComponent(favSvg)}` });
document.head.appendChild(link);

createRoot(document.getElementById('root')!).render(<App />);
