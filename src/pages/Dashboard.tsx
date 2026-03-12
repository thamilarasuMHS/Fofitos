import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/* ── Stat card ─────────────────────────────────────────── */
function StatCard({
  to, value, label, icon, color,
}: {
  to: string;
  value: number | undefined;
  label: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Link to={to} className="card p-5 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </Link>
  );
}

/* ── Status badge ─────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_approval: 'badge-pending',
    approved:  'badge-approved',
    draft:     'badge-draft',
    submitted: 'badge-submitted',
    rejected:  'badge-rejected',
    active:    'badge-active',
  };
  return (
    <span className={`badge ${map[status] ?? 'badge-draft'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ── Section wrapper ──────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </section>
  );
}

/* ── Icons ────────────────────────────────────────────── */
const icons = {
  categories: (
    <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 012-2h3l2 2h9a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
    </svg>
  ),
  recipes: (
    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
    </svg>
  ),
  sauces: (
    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M9 3h6M8 7h8l-1 10H9L8 7z"/><path d="M6 7a6 6 0 0012 0"/>
    </svg>
  ),
  ingredients: (
    <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <ellipse cx="12" cy="6" rx="8" ry="3"/>
      <path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6"/>
      <path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6"/>
    </svg>
  ),
  pending: (
    <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    </svg>
  ),
};

/* ── Dashboard component ──────────────────────────────── */
export function Dashboard() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: recipes } = useQuery({
    queryKey: ['recipes_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('recipes').select('id, name, category_id').is('deleted_at', null);
      if (error) throw error;
      return data as { id: string; name: string; category_id: string }[];
    },
  });

  const { data: sauces } = useQuery({
    queryKey: ['sauce_library_count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('sauce_library').select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: ingredientsCount } = useQuery({
    queryKey: ['ingredient_database_count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('ingredient_database').select('*', { count: 'exact', head: true }).is('deleted_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: pendingCategories } = useQuery({
    queryKey: ['categories_pending'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name, submitted_at').eq('status', 'pending_approval');
      if (error) throw error;
      return data as { id: string; name: string; submitted_at: string }[];
    },
    enabled: profile?.role === 'admin',
  });

  const { data: pendingUsers } = useQuery({
    queryKey: ['profiles_pending'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, email, full_name, created_at').eq('status', 'pending_approval');
      if (error) throw error;
      return data;
    },
    enabled: profile?.role === 'admin',
  });

  const { data: pendingDeletions } = useQuery({
    queryKey: ['deletion_requests_pending'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deletion_requests').select('id, recipe_id, requested_by, created_at, recipes(name, category_id)').eq('status', 'pending');
      if (error) throw error;
      return (data ?? []).map((d: { id: string; recipe_id: string; requested_by: string; created_at: string; recipes: { name: string; category_id: string } | { name: string; category_id: string }[] | null }) => ({
        ...d,
        recipes: Array.isArray(d.recipes) ? d.recipes[0] ?? null : d.recipes,
      }));
    },
    enabled: profile?.role === 'admin',
  });

  const resolveDeletion = useMutation({
    mutationFn: async ({ requestId, recipeId, approve }: { requestId: string; recipeId: string; approve: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('deletion_requests').update({
        status: approve ? 'approved' : 'rejected',
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', requestId);
      if (approve) {
        await supabase.from('recipes').update({ deleted_at: new Date().toISOString() }).eq('id', recipeId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deletion_requests_pending'] });
      queryClient.invalidateQueries({ queryKey: ['recipes_list'] });
    },
  });

  const { data: submittedVersions } = useQuery({
    queryKey: ['recipe_versions_submitted'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_versions')
        .select('id, recipe_id, version_number, submitted_at, recipes(category_id)')
        .eq('status', 'submitted');
      if (error) throw error;
      return (data ?? []).map((v: { id: string; recipe_id: string; version_number: number; submitted_at: string; recipes: { category_id: string } | { category_id: string }[] | null }) => ({
        ...v,
        category_id: Array.isArray(v.recipes) ? v.recipes[0]?.category_id : v.recipes?.category_id,
      }));
    },
    enabled: profile?.role === 'admin' || profile?.role === 'manager',
  });

  const { data: myDrafts } = useQuery({
    queryKey: ['my_drafts', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('recipe_versions')
        .select('id, recipe_id, version_number, updated_at, recipes(category_id)')
        .eq('created_by', profile.id)
        .eq('status', 'draft');
      if (error) throw error;
      return (data ?? []).map((v: { id: string; recipe_id: string; version_number: number; updated_at: string; recipes: { category_id: string } | { category_id: string }[] | null }) => ({
        ...v,
        category_id: Array.isArray(v.recipes) ? v.recipes[0]?.category_id : v.recipes?.category_id,
      }));
    },
    enabled: profile?.role === 'dietician' || profile?.role === 'manager',
  });

  const { data: approvedRecipes } = useQuery({
    queryKey: ['recipe_versions_approved'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_versions')
        .select('id, recipe_id, version_number, approved_at, recipes(category_id)')
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((v: { id: string; recipe_id: string; version_number: number; approved_at: string; recipes: { category_id: string } | { category_id: string }[] | null }) => ({
        ...v,
        category_id: Array.isArray(v.recipes) ? v.recipes[0]?.category_id : v.recipes?.category_id,
      }));
    },
    enabled: profile?.role === 'chef',
  });

  const pendingApprovalCount =
    (pendingCategories?.length ?? 0) +
    (pendingUsers?.length ?? 0) +
    (pendingDeletions?.length ?? 0);

  if (!profile) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile.full_name ?? profile.email ?? '').split(' ')[0];

  return (
    <div>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard to="/categories" value={categories?.length} label="Categories"
          icon={icons.categories} color="bg-violet-50" />
        <StatCard to="/categories" value={recipes?.length} label="Recipes"
          icon={icons.recipes} color="bg-blue-50" />

        {(profile.role === 'admin' || profile.role === 'manager' || profile.role === 'dietician') && (
          <>
            <StatCard to="/ingredient-database" value={sauces} label="Sub Component"
              icon={icons.sauces} color="bg-amber-50" />
            <StatCard to="/ingredient-database" value={ingredientsCount} label="Ingredients"
              icon={icons.ingredients} color="bg-emerald-50" />
          </>
        )}

        {profile.role === 'admin' && (
          <StatCard to="/users" value={pendingApprovalCount} label="Pending approvals"
            icon={icons.pending} color="bg-rose-50" />
        )}
      </div>

      {/* ── Admin: Approval queue ──────────────────────── */}
      {profile.role === 'admin' && (
        (pendingCategories?.length ?? 0) > 0 ||
        (pendingUsers?.length ?? 0) > 0 ||
        (pendingDeletions?.length ?? 0) > 0
      ) && (
        <Section title="Approval queue">
          <div className="card overflow-hidden">
            <ul className="divide-y divide-gray-50">
              {pendingCategories?.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <Link to={`/categories/${c.id}`} className="text-sm font-medium text-violet-700 hover:text-violet-900">
                      Category: {c.name}
                    </Link>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(c.submitted_at).toLocaleDateString()}</span>
                </li>
              ))}
              {pendingUsers?.map((u: { id: string; email: string; full_name: string | null }) => (
                <li key={u.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <Link to="/users" className="text-sm font-medium text-violet-700 hover:text-violet-900">
                      User request: {u.full_name || u.email}
                    </Link>
                  </div>
                  <StatusBadge status="pending_approval" />
                </li>
              ))}
              {pendingDeletions?.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-700">
                      Delete request: {(d.recipes as { name?: string } | null)?.name ?? d.recipe_id}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-success"
                      onClick={() => resolveDeletion.mutate({ requestId: d.id, recipeId: d.recipe_id, approve: true })}>
                      Approve
                    </button>
                    <button type="button" className="btn-danger"
                      onClick={() => resolveDeletion.mutate({ requestId: d.id, recipeId: d.recipe_id, approve: false })}>
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* ── Manager / Admin: Pending recipe approvals ──── */}
      {(profile.role === 'manager' || profile.role === 'admin') && (submittedVersions?.length ?? 0) > 0 && (
        <Section title="Pending recipe approvals">
          <div className="card overflow-hidden">
            <ul className="divide-y divide-gray-50">
              {submittedVersions?.slice(0, 10).map((v) => (
                <li key={v.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <Link
                    to={v.category_id ? `/categories/${v.category_id}/recipes/${v.recipe_id}` : '#'}
                    className="text-sm font-medium text-violet-700 hover:text-violet-900"
                  >
                    Recipe v{v.version_number}
                  </Link>
                  <span className="text-xs text-gray-400">{new Date(v.submitted_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* ── Dietician / Manager: My drafts ─────────────── */}
      {(profile.role === 'dietician' || profile.role === 'manager') && (myDrafts?.length ?? 0) > 0 && (
        <Section title="My drafts">
          <div className="card overflow-hidden">
            <ul className="divide-y divide-gray-50">
              {myDrafts?.map((v) => (
                <li key={v.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <Link
                    to={v.category_id ? `/categories/${v.category_id}/recipes/${v.recipe_id}` : '#'}
                    className="text-sm font-medium text-violet-700 hover:text-violet-900"
                  >
                    Recipe v{v.version_number}
                  </Link>
                  <span className="text-xs text-gray-400">{new Date(v.updated_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* ── Chef: Finalized recipes ─────────────────────── */}
      {profile.role === 'chef' && (
        <Section title="Latest finalized recipes">
          {approvedRecipes?.length === 0 ? (
            <div className="card px-6 py-10 text-center">
              <p className="text-gray-400 text-sm">No finalized recipes yet.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <ul className="divide-y divide-gray-50">
                {approvedRecipes?.map((v) => (
                  <li key={v.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <Link
                      to={v.category_id ? `/categories/${v.category_id}/recipes/${v.recipe_id}` : '#'}
                      className="text-sm font-medium text-violet-700 hover:text-violet-900"
                    >
                      Recipe v{v.version_number}
                    </Link>
                    <span className="text-xs text-gray-400">{new Date(v.approved_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
