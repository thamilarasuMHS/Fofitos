import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { NutritionParameter } from '@/types/database';

type PageSize = 20 | 50 | 100;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function scoreClass(s: number): string {
  if (s >= 80) return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  if (s >= 50) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
}

function dotColor(s: number | undefined): string {
  if (s == null) return 'bg-gray-200';
  if (s >= 80) return 'bg-emerald-400';
  if (s >= 50) return 'bg-amber-400';
  return 'bg-rose-400';
}

export function Recipes() {
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(20);

  /* ── Approved recipe versions ─────────────────────────────────────────── */
  const { data, isLoading } = useQuery({
    queryKey: ['approved_recipes', page, pageSize],
    queryFn: async () => {
      const { data: rows, error, count } = await supabase
        .from('recipe_versions')
        .select(
          `id, recipe_id, version_number, approved_at, approved_by,
           recipes ( name, category_id, categories ( name ) )`,
          { count: 'exact' }
        )
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      return { rows: rows ?? [], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });

  const rows       = data?.rows ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  /* ── Active nutrition parameters (for dot labels) ─────────────────────── */
  const { data: parameters } = useQuery({
    queryKey: ['nutrition_parameters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nutrition_parameters').select('*').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data as NutritionParameter[];
    },
  });

  /* ── Score snapshots for current page ─────────────────────────────────── */
  const versionIds = rows.map((r) => r.id);
  const { data: snapshots } = useQuery({
    queryKey: ['recipe_list_snapshots', versionIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('score_snapshots')
        .select('recipe_version_id, overall_score, parameter_scores')
        .in('recipe_version_id', versionIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // keep only the latest snapshot per version
      const map: Record<string, { overall_score: number; parameter_scores: Record<string, number> }> = {};
      for (const s of data ?? []) {
        if (!map[s.recipe_version_id]) map[s.recipe_version_id] = s;
      }
      return map;
    },
    enabled: versionIds.length > 0,
  });

  /* ── Loading state ─────────────────────────────────────────────────────── */
  if (isLoading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
        <p className="text-sm text-gray-500 mt-0.5">{total} approved recipe{total !== 1 ? 's' : ''}</p>
      </div>

      {rows.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No approved recipes yet</p>
          <p className="text-gray-400 text-sm mt-1">Approved recipes will appear here.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className="th text-left">Recipe</th>
                  <th className="th">Category</th>
                  <th className="th">Version</th>
                  <th className="th">Approved On</th>
                  <th className="th">Nutrition Levels</th>
                  <th className="th">Score</th>
                  <th className="th w-20" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const recipe     = Array.isArray(v.recipes) ? v.recipes[0] : v.recipes;
                  const category   = Array.isArray(recipe?.categories) ? recipe.categories[0] : recipe?.categories;
                  const categoryId = recipe?.category_id ?? '';
                  const snapshot   = snapshots?.[v.id];
                  const overall    = snapshot?.overall_score ?? null;
                  const paramScores = snapshot?.parameter_scores ?? {};

                  return (
                    <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Recipe name */}
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                            <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                          </span>
                          <span className="font-medium text-gray-900">{recipe?.name ?? '—'}</span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="td">
                        <span className="text-sm text-gray-600">{category?.name ?? '—'}</span>
                      </td>

                      {/* Version */}
                      <td className="td text-center">
                        <span className="badge bg-violet-50 text-violet-700">v{v.version_number}</span>
                      </td>

                      {/* Approved On */}
                      <td className="td text-sm text-gray-600 text-center">{fmtDate(v.approved_at)}</td>

                      {/* Nutrition Levels — one dot per active parameter */}
                      <td className="td">
                        {overall == null ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5 justify-center">
                            {(parameters ?? []).map((p) => {
                              const s = paramScores[p.id];
                              return (
                                <span
                                  key={p.id}
                                  title={`${p.name}: ${s != null ? Math.round(s) + '/100' : '—'}`}
                                  className={`w-3 h-3 rounded-full ${dotColor(s)} cursor-default`}
                                />
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* Overall Score */}
                      <td className="td text-center">
                        {overall == null ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <span className={`inline-flex items-center justify-center text-xs font-semibold px-2 py-0.5 rounded-full ${scoreClass(overall)}`}>
                            {Math.round(overall)}/100
                          </span>
                        )}
                      </td>

                      {/* View link */}
                      <td className="td text-right">
                        <Link
                          to={`/categories/${categoryId}/recipes/${v.recipe_id}`}
                          className="btn-secondary py-1 px-3 text-xs"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 px-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Show</span>
              {([20, 50, 100] as PageSize[]).map((n) => (
                <button key={n} type="button"
                  onClick={() => { setPageSize(n); setPage(0); }}
                  className={`px-3 py-1 rounded-lg text-sm border transition-all ${
                    pageSize === n
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>{n}</button>
              ))}
              <span className="text-sm text-gray-500">per page</span>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-500">
                  {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
                </p>
                <button type="button"
                  className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}>← Previous</button>
                <span className="text-sm text-gray-500 px-1">Page {page + 1} of {totalPages}</span>
                <button type="button"
                  className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
