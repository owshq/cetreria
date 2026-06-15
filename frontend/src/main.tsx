import { createRoot } from 'react-dom/client';
import App from './App';
import { applyColorScheme } from './lib/colorScheme';
import { applyAppFavicon } from './lib/appFavicon';
import { applyAppLogoSize } from './lib/appLogo';
import { ensureDefaultAppAccentColor, migrateAppAccentColor } from './lib/appTheme';
import { applyDefaultWorkspaceTypography } from './lib/workspaceTypography';
import { migrateLegacyStorage } from './lib/storageKeys';
import './styles/global.css';
import './styles/scrollbars.global.css';

migrateLegacyStorage();
migrateAppAccentColor();
ensureDefaultAppAccentColor();
applyColorScheme();
applyAppFavicon();
applyAppLogoSize();
applyDefaultWorkspaceTypography();

createRoot(document.getElementById('root')!).render(<App />);
