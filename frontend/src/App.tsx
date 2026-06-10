import { RouterProvider } from 'react-router';
import { ActivityTypesProvider } from '@/context/ActivityTypesContext';
import { NotificationRealtimeProvider } from '@/context/NotificationRealtimeProvider';
import { ThemeProvider } from '@/context/ThemeContext';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { router } from './routes';

export default function App() {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <ActivityTypesProvider>
          <NotificationRealtimeProvider>
            <RouterProvider router={router} />
          </NotificationRealtimeProvider>
        </ActivityTypesProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
