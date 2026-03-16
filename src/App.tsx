import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Layout } from '@/components/Layout';
import { RequireRole } from '@/components/RequireRole';
import { Login } from '@/pages/Login';
import { PendingApproval } from '@/pages/PendingApproval';
import { Dashboard } from '@/pages/Dashboard';
import { UserManagement } from '@/pages/UserManagement';
import { Settings } from '@/pages/Settings';
import { ComponentsSettings } from '@/pages/ComponentsSettings';
import { Categories } from '@/pages/Categories';
import { CategoryNew } from '@/pages/CategoryNew';
import { CategoryDetail } from '@/pages/CategoryDetail';
import { CategoryEdit } from '@/pages/CategoryEdit';
import { IngredientDatabase } from '@/pages/IngredientDatabase';
import { RecipeDetail } from '@/pages/RecipeDetail';
import { Recipes } from '@/pages/Recipes';

function ProtectedRoutes() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.status === 'pending_approval') {
    return <Navigate to="/pending-approval" replace />;
  }

  if (profile?.status === 'deactivated' || profile?.status === 'rejected') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-2">
        <p className="text-red-600 font-medium">
          {profile?.status === 'rejected' ? 'Access rejected' : 'Account deactivated'}
        </p>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/categories/new" element={<CategoryNew />} />
        <Route path="/categories/:categoryId" element={<CategoryDetail />} />
        <Route path="/categories/:categoryId/edit" element={<CategoryEdit />} />
        <Route path="/categories/:categoryId/recipes/:recipeId" element={<RecipeDetail />} />
<Route path="/ingredient-database" element={<IngredientDatabase />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route
          path="/settings"
          element={<Navigate to="/settings/parameters" replace />}
        />
        <Route
          path="/settings/parameters"
          element={
            <RequireRole allowed={['admin']}>
              <Settings />
            </RequireRole>
          }
        />
        <Route
          path="/settings/components"
          element={
            <RequireRole allowed={['admin']}>
              <ComponentsSettings />
            </RequireRole>
          }
        />
        <Route
          path="/users"
          element={
            <RequireRole allowed={['admin']}>
              <UserManagement />
            </RequireRole>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontFamily: 'Inter, system-ui, sans-serif' },
          duration: 3500,
        }}
        richColors
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </>
  );
}
