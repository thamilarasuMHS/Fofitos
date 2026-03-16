import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type PageSize = 20 | 50 | 100;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Recipes() {
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(20);

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
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="th text-left">Recipe</th>
                  <th className="th">Category</th>
                  <th className="th">Version</th>
                  <th className="th">Approved On</th>
                  <th className="th w-20" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const recipe   = Array.isArray(v.recipes) ? v.recipes[0] : v.recipes;
                  const category = Array.isArray(recipe?.categories) ? recipe.categories[0] : recipe?.categories;
                  const categoryId = recipe?.category_id ?? '';
                  return (
                    <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
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
                      <td className="td">
                        <span className="text-sm text-gray-600">{category?.name ?? '—'}</span>
                      </td>
                      <td className="td text-center">
                        <span className="badge bg-violet-50 text-violet-700">v{v.version_number}</span>
                      </td>
                      <td className="td text-sm text-gray-600 text-center">{fmtDate(v.approved_at)}</td>
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
