import { createRoot } from 'react-dom/client';
import App from './App';
import { applyColorScheme } from './lib/colorScheme';
import { applyAppFavicon } from './lib/appFavicon';
import { applyAppLogoSize } from './lib/appLogo';
import { migrateAppAccentColor } from './lib/appTheme';
import { migrateLegacyStorage } from './lib/storageKeys';
import './styles/global.module.css';
import './styles/scrollbars.module.css';

migrateLegacyStorage();
migrateAppAccentColor();
applyColorScheme();
applyAppFavicon();
applyAppLogoSize();

createRoot(document.getElementById('root')!).render(<App />);
