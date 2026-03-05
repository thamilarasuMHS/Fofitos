import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Category, Profile } from '@/types/database';

const PAGE_SIZE = 10;
type StatusFilter = 'all' | 'approved' | 'pending_approval' | 'draft' | 'rejected';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function SaveBadge({ status }: { status: string }) {
  const isDraft = status === 'draft';
  return (
    <span className={`badge text-[11px] ${isDraft ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>
      {isDraft ? 'Draft' : 'Submitted'}
    </span>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'draft') return null;
  const cls: Record<string, string> = {
    pending_approval: 'bg-amber-50 text-amber-700',
    approved:         'bg-green-50 text-green-700',
    rejected:         'bg-red-50 text-red-700',
  };
  const labels: Record<string, string> = {
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

  const [page, setPage]               = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  /* ── Paginated data query ─────────────────────────────────────────────── */
  const { data, isLoading } = useQuery({
    queryKey: ['categories', page, statusFilter, profile?.id, profile?.role],
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

      const { data: rows, error, count } = await q;
      if (error) throw error;
      return { rows: (rows ?? []) as Category[], total: count ?? 0 };
    },
    enabled: !!profile,
    placeholderData: (prev) => prev,
  });

  /* ── Status counts query (for tab badges) ─────────────────────────────── */
  const { data: statusRows } = useQuery({
    queryKey: ['categories_statuses', profile?.id, profile?.role],
    queryFn: async () => {
      let q = supabase.from('categories').select('status');
      if (profile?.role === 'manager') {
        q = q.or(`created_by.eq.${profile.id},status.eq.approved`);
      } else if (profile?.role !== 'admin') {
        q = q.eq('status', 'approved');
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { status: string }[];
    },
    enabled: !!profile,
  });

  /* ── Profiles (for creator names) ─────────────────────────────────────── */
  const { data: profiles } = useQuery({
    queryKey: ['profiles_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, full_name, email, role');
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
  const totalPages = Math.ceil(total / PAGE_SIZE);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {counts.all} {counts.all === 1 ? 'category' : 'categories'}
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

                    {/* Status badges */}
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <SaveBadge status={c.status} />
                        <ApprovalBadge status={c.status} />
                      </div>
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
                      {c.approved_by ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700 shrink-0">
                            {(creatorName(c.approved_by)[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm text-gray-700">{creatorName(c.approved_by)}</span>
                            {creatorRole(c.approved_by) && (
                              <span className="text-xs text-gray-400 capitalize ml-1">({creatorRole(c.approved_by)})</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>

                    <td className="td text-gray-600 text-sm">{fmtDate(c.created_at)}</td>
                    <td className="td text-gray-600 text-sm">{fmtDate(c.submitted_at)}</td>
                    <td className="td text-gray-600 text-sm">{fmtDate(c.approved_at)}</td>

                    {/* Arrow */}
                    <td className="td text-right">
                      <svg className="w-4 h-4 text-gray-300 inline" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Previous
                </button>
                <span className="text-sm text-gray-500 px-1">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
