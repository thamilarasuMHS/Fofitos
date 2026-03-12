import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Category, Profile } from '@/types/database';

const PAGE_SIZE = 10;
type StatusFilter = 'all' | 'approved' | 'pending_approval' | 'draft' | 'rejected';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    draft:            'bg-gray-100 text-gray-500',
    pending_approval: 'bg-amber-50 text-amber-700',
    approved:         'bg-green-50 text-green-700',
    rejected:         'bg-red-50 text-red-700',
  };
  const labels: Record<string, string> = {
    draft:            'Draft',
    pending_approval: 'Pending',
    approved:         'Approved',
    rejected:         'Rejected',
  };
  return (
    <span className={`badge text-[11px] ${cls[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status.replace(/_/g, ' ')}
    </span>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export function Categories() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage]                     = useState(0);
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>('all');
  const [search, setSearch]                 = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  /* Debounce search — 300 ms */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  /* Reset to page 0 whenever search or filter changes */
  useEffect(() => { setPage(0); }, [debouncedSearch, statusFilter]);

  /* ── Delete mutation ───────────────────────────────────────────────────── */
  const deleteCategory = useMutation({
    mutationFn: async (categoryId: string) => {
      // Step 1 — collect recipe IDs for this category
      const { data: recipes, error: e1 } = await supabase
        .from('recipes').select('id').eq('category_id', categoryId);
      if (e1) throw e1;
      const recipeIds = (recipes ?? []).map((r: { id: string }) => r.id);

      if (recipeIds.length > 0) {
        // Step 2 — collect version IDs (recipe_ingredients and score_snapshots
        //          reference recipe_versions, NOT recipes directly)
        const { data: versions, error: e2 } = await supabase
          .from('recipe_versions').select('id').in('recipe_id', recipeIds);
        if (e2) throw e2;
        const versionIds = (versions ?? []).map((v: { id: string }) => v.id);

        if (versionIds.length > 0) {
          // Step 3a — clear self-referential parent_version_id to avoid FK loop
          const { error: e3a } = await supabase
            .from('recipe_versions').update({ parent_version_id: null }).in('id', versionIds);
          if (e3a) throw e3a;

          // Step 3b — delete leaf tables (FK → recipe_versions)
          const { error: e3b } = await supabase
            .from('recipe_ingredients').delete().in('recipe_version_id', versionIds);
          if (e3b) throw e3b;

          const { error: e3c } = await supabase
            .from('score_snapshots').delete().in('recipe_version_id', versionIds);
          if (e3c) throw e3c;
        }

        // Step 4 — delete deletion_requests (FK → recipes)
        const { error: e4 } = await supabase
          .from('deletion_requests').delete().in('recipe_id', recipeIds);
        if (e4) throw e4;

        // Step 5 — now delete versions (FK → recipes)
        const { error: e5 } = await supabase
          .from('recipe_versions').delete().in('recipe_id', recipeIds);
        if (e5) throw e5;

        // Step 6 — now delete recipes (FK → categories)
        const { error: e6 } = await supabase
          .from('recipes').delete().in('id', recipeIds);
        if (e6) throw e6;
      }

      // Step 7 — delete category child tables
      const { error: e7 } = await supabase
        .from('category_goals').delete().eq('category_id', categoryId);
      if (e7) throw e7;

      const { error: e8 } = await supabase
        .from('category_components').delete().eq('category_id', categoryId);
      if (e8) throw e8;

      // Step 8 — finally delete the category itself
      const { error } = await supabase.from('categories').delete().eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category deleted successfully.');
    },
    onError: (err: Error) => {
      toast.error('Failed to delete category', { description: err.message });
    },
  });

  /* ── Paginated + filtered + searched data query ───────────────────────── */
  const { data, isLoading } = useQuery({
    queryKey: ['categories', page, statusFilter, debouncedSearch, profile?.id, profile?.role],
    queryFn: async () => {
      let q = supabase
        .from('categories')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (profile?.role === 'manager') {
        q = q.or(`created_by.eq.${profile.id},status.eq.approved`);
      } else if (profile?.role !== 'admin') {
        q = q.eq('status', 'approved');
      }

      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter);
      }

      if (debouncedSearch) {
        q = q.ilike('name', `%${debouncedSearch}%`);
      }

      const { data: rows, error, count } = await q;
      if (error) throw error;
      return { rows: (rows ?? []) as Category[], total: count ?? 0 };
    },
    enabled: !!profile,
    placeholderData: (prev) => prev,
  });

  /* ── Status counts (respects search filter for accurate tab badges) ────── */
  const { data: statusRows } = useQuery({
    queryKey: ['categories_statuses', debouncedSearch, profile?.id, profile?.role],
    queryFn: async () => {
      let q = supabase.from('categories').select('status');
      if (profile?.role === 'manager') {
        q = q.or(`created_by.eq.${profile.id},status.eq.approved`);
      } else if (profile?.role !== 'admin') {
        q = q.eq('status', 'approved');
      }
      if (debouncedSearch) {
        q = q.ilike('name', `%${debouncedSearch}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { status: string }[];
    },
    enabled: !!profile,
  });

  /* ── Profiles (for creator names) ─────────────────────────────────────── */
  /* Use get_all_profiles() RPC (SECURITY DEFINER) so managers/dieticians   */
  /* can also resolve admin profile names — the direct table query is        */
  /* blocked by RLS for non-admin roles.                                     */
  const { data: profiles } = useQuery({
    queryKey: ['profiles_list'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_profiles');
      if (error) throw error;
      return data as Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[];
    },
  });

  function creatorName(userId: string): string {
    const p = profiles?.find((p) => p.id === userId);
    return p ? (p.full_name || p.email || '—') : '—';
  }
  function creatorRole(userId: string): string {
    return profiles?.find((p) => p.id === userId)?.role ?? '';
  }

  /* ── Derived values ───────────────────────────────────────────────────── */
  const counts = {
    all:              statusRows?.length ?? 0,
    approved:         statusRows?.filter((r) => r.status === 'approved').length ?? 0,
    pending_approval: statusRows?.filter((r) => r.status === 'pending_approval').length ?? 0,
    draft:            statusRows?.filter((r) => r.status === 'draft').length ?? 0,
    rejected:         statusRows?.filter((r) => r.status === 'rejected').length ?? 0,
  };

  const rows       = data?.rows ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canCreate  = profile?.role === 'admin' || profile?.role === 'manager';

  const TABS: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all',              label: 'All',     count: counts.all              },
    { id: 'approved',         label: 'Approved',count: counts.approved         },
    { id: 'pending_approval', label: 'Pending', count: counts.pending_approval },
    { id: 'draft',            label: 'Draft',   count: counts.draft            },
    { id: 'rejected',         label: 'Rejected',count: counts.rejected         },
  ];

  function handleFilterChange(f: StatusFilter) {
    setStatusFilter(f);
    setPage(0);
  }

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading categories…
        </div>
      </div>
    );
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} {total === 1 ? 'category' : 'categories'}
            {debouncedSearch && <span className="text-violet-600"> matching "{debouncedSearch}"</span>}
          </p>
        </div>
        {canCreate && (
          <Link to="/categories/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4" />
            </svg>
            New Category
          </Link>
        )}
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search categories…"
            className="input pl-9 pr-8 w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              onClick={() => setSearch('')}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs — horizontally scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-1 border-b border-gray-200 mb-5 min-w-max md:min-w-0">
          {TABS.filter((t) => t.id === 'all' || t.count > 0).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleFilterChange(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                statusFilter === t.id
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                statusFilter === t.id ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {rows.length === 0 && !isLoading ? (
        <div className="card px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M3 7a2 2 0 012-2h3l2 2h9a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </div>
          {debouncedSearch ? (
            <>
              <p className="text-gray-500 font-medium">No results for "{debouncedSearch}"</p>
              <p className="text-gray-400 text-sm mt-1">Try a different search term.</p>
              <button type="button" className="btn-secondary mt-5 inline-flex" onClick={() => setSearch('')}>
                Clear search
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500 font-medium">No categories found</p>
              <p className="text-gray-400 text-sm mt-1">
                {statusFilter === 'all'
                  ? 'Create your first category to get started.'
                  : `No ${statusFilter.replace('_', ' ')} categories.`}
              </p>
              {canCreate && statusFilter === 'all' && (
                <Link to="/categories/new" className="btn-primary mt-5 inline-flex">
                  Create first category
                </Link>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="table-wrap overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Status</th>
                  <th className="th">Created By</th>
                  <th className="th">Approved By</th>
                  <th className="th">Created On</th>
                  <th className="th">Submitted On</th>
                  <th className="th">Approved On</th>
                  <th className="th w-12"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-violet-50/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/categories/${c.id}`)}
                  >
                    {/* Name with status stripe */}
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-1.5 h-6 rounded-full flex-shrink-0 ${
                          c.status === 'approved'         ? 'bg-green-400' :
                          c.status === 'pending_approval' ? 'bg-amber-400' :
                          c.status === 'rejected'         ? 'bg-red-400'   : 'bg-gray-200'
                        }`} />
                        <span className="font-medium text-gray-900">{c.name}</span>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="td">
                      <StatusBadge status={c.status} />
                    </td>

                    {/* Created By */}
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-700 shrink-0">
                          {(creatorName(c.created_by)[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm text-gray-700">{creatorName(c.created_by)}</span>
                          {creatorRole(c.created_by) && (
                            <span className="text-xs text-gray-400 capitalize ml-1">({creatorRole(c.created_by)})</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Approved By */}
                    <td className="td">
                      {(() => {
                        if (!c.approved_by) return <span className="text-sm text-gray-300">—</span>;
                        const name = creatorName(c.approved_by);
                        const role = creatorRole(c.approved_by);
                        if (name === '—') return <span className="text-sm text-gray-300">—</span>;
                        return (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700 shrink-0">
                              {name[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm text-gray-700">{name}</span>
                              {role && (
                                <span className="text-xs text-gray-400 capitalize ml-1">({role})</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="td text-gray-600 text-sm">{fmtDate(c.created_at)}</td>
                    <td className="td text-gray-600 text-sm">{fmtDate(c.submitted_at)}</td>
                    <td className="td text-gray-600 text-sm">{fmtDate(c.approved_at)}</td>

                    {/* Actions */}
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-2">
                        {profile?.role === 'admin' && (
                          <button
                            type="button"
                            className="btn-danger py-1 px-3 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast('Delete this category?', {
                                description: 'This will also delete all its recipes. This cannot be undone.',
                                action: { label: 'Delete', onClick: () => deleteCategory.mutate(c.id) },
                                cancel: { label: 'Cancel', onClick: () => {} },
                              });
                            }}
                          >
                            Delete
                          </button>
                        )}
                        <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — always visible when there are rows */}
          <div className="flex items-center justify-between mt-4 px-1">
            <p className="text-sm text-gray-500">
              {total === 0
                ? 'No results'
                : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
            </p>
            <div className="flex items-center gap-1">
              {/* First page */}
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                disabled={page === 0}
                onClick={() => setPage(0)}
                title="First page"
              >
                «
              </button>
              {/* Previous */}
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                title="Previous page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Page number buttons */}
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter((i) => Math.abs(i - page) <= 2)
                .map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      i === page
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}

              {/* Next */}
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                title="Next page"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {/* Last page */}
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
                title="Last page"
              >
                »
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
