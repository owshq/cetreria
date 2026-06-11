import { RouterProvider } from 'react-router';
import { ActivityTypesProvider } from '@/context/ActivityTypesContext';
import { NotificationRealtimeProvider } from '@/context/NotificationRealtimeProvider';
import { ThemeProvider } from '@/context/ThemeContext';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import WorkspaceTypographySync from '@/components/WorkspaceTypographySync';
import { router } from './routes';

export default function App() {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <WorkspaceTypographySync />
        <ActivityTypesProvider>
          <NotificationRealtimeProvider>
            <RouterProvider router={router} />
          </NotificationRealtimeProvider>
        </ActivityTypesProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
