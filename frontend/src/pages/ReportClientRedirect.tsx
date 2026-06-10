import { Navigate, useParams } from 'react-router';

export default function ReportClientRedirect() {
  const { clientId } = useParams<{ clientId: string }>();
  if (!clientId) return <Navigate to="/reports" replace />;
  return <Navigate to={`/clients/${clientId}`} replace state={{ returnTo: '/reports' }} />;
}
