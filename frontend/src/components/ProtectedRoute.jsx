import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <LoadingSpinner className="py-5" />;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc }} />;
}
