import { createBrowserRouter, redirect } from 'react-router';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Documents from './pages/Documents';
import DocumentDetail from './pages/DocumentDetail';
import Reports from './pages/Reports';
import ReportClientRedirect from './pages/ReportClientRedirect';
import Settings from './pages/Settings';
import Help from './pages/Help';

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: Login,
  },
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, loader: () => redirect('/home') },
      { path: 'home', Component: Dashboard },
      { path: 'activity', loader: ({ request }) => redirect(`/activities${new URL(request.url).search}`) },
      { path: 'activities/new', Component: Calendar },
      {
        path: 'activities/all',
        loader: () => redirect('/activities?userId=all'),
      },
      { path: 'activities/:id', Component: Calendar },
      {
        path: 'activities',
        Component: Calendar,
        loader: ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('view') !== 'schedules') return null;
          url.searchParams.delete('view');
          if (!url.searchParams.has('userId')) url.searchParams.set('userId', 'all');
          return redirect(`/activities?${url.searchParams.toString()}`);
        },
      },
      { path: 'clients', Component: Clients },
      { path: 'clients/:id', Component: ClientDetail },
      { path: 'docs', Component: Documents },
      { path: 'docs/:id', Component: DocumentDetail },
      { path: 'reports/client/:clientId', Component: ReportClientRedirect },
      { path: 'reports/:reportId', Component: Reports },
      { path: 'reports', Component: Reports },
      { path: 'settings', Component: Settings },
      { path: 'help', Component: Help },
    ],
  },
]);
