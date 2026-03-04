import { Navigate, useLocation } from 'react-router-dom';
import type { AppRole } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';

interface RequireRoleProps {
  allowed: AppRole[];
  children: React.ReactNode;
}

export function RequireRole({ allowed, children }: RequireRoleProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile?.status === 'pending_approval') {
    return <Navigate to="/pending-approval" replace />;
  }

  if (profile?.status === 'deactivated' || profile?.status === 'rejected') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-2">
        <p className="text-red-600 font-medium">
          {profile?.status === 'rejected' ? 'Access request was rejected.' : 'Account deactivated.'}
        </p>
        <p className="text-gray-600 text-sm">Contact your administrator.</p>
      </div>
    );
  }

  if (!profile || !allowed.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
