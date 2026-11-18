import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="text-center py-5"><Spinner animation="border" role="status" /></div>;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc }} />;
}
