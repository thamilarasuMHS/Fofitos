import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type {
  Category, CategoryGoal, CategoryComponent,
  Recipe, RecipeVersion, NutritionParameter, Profile,
} from '@/types/database';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function SaveBadge({ status }: { status: string }) {
  const isDraft = status === 'draft';
  return (
    <span className={`badge ${isDraft ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>
      {isDraft ? 'Draft' : 'Submitted'}
    </span>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'draft') return null;
  const map: Record<string, string> = {
    pending_approval: 'bg-amber-50 text-amber-700',
    approved:         'bg-green-50 text-green-700',
    rejected:         'bg-red-50   text-red-700',
  };
  const labels: Record<string, string> = {
    pending_approval: 'Pending Approval',
    approved:         'Approved',
    rejected:         'Rejected',
  };
  return <span className={`badge ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>{labels[status] ?? status}</span>;
}

function RecipeStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:              'bg-gray-100 text-gray-500',
    submitted:          'bg-blue-50  text-blue-700',
    approved:           'bg-green-50 text-green-700',
    changes_requested:  'bg-amber-50 text-amber-700',
  };
  const labels: Record<string, string> = {
    draft: 'Draft', submitted: 'Submitted',
    approved: 'Approved', changes_requested: 'Changes Requested',
  };
  return <span className={`badge text-[10px] ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>{labels[status] ?? status}</span>;
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export function CategoryDetail() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate       = useNavigate();
  const queryClient    = useQueryClient();
  const { profile }    = useAuth();

  const [showNewRecipe,  setShowNewRecipe]  = useState(false);
  const [newRecipeName,  setNewRecipeName]  = useState('');
  const [recipeNameErr,  setRecipeNameErr]  = useState(false);

  /* ── Queries ────────────────────────────────────────────────────────────── */
  const { data: category, isLoading: catLoading } = useQuery({
    queryKey: ['category', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('id', categoryId!).single();
      if (error) throw error;
      return data as Category;
    },
    enabled: !!categoryId,
  });

  const { data: goals } = useQuery({
    queryKey: ['category_goals', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase.from('category_goals').select('*').eq('category_id', categoryId!);
      if (error) throw error;
      return data as CategoryGoal[];
    },
    enabled: !!categoryId,
  });

  const { data: components } = useQuery({
    queryKey: ['category_components', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('category_components').select('*').eq('category_id', categoryId!).order('sort_order');
      if (error) throw error;
      return data as CategoryComponent[];
    },
    enabled: !!categoryId,
  });

  const { data: parameters } = useQuery({
    queryKey: ['nutrition_parameters'],
    queryFn: async () => {
      const { data, error } = await supabase.from('nutrition_parameters').select('*').order('sort_order');
      if (error) throw error;
      return data as NutritionParameter[];
    },
  });

  const { data: recipes } = useQuery({
    queryKey: ['recipes', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes').select('*').eq('category_id', categoryId!).is('deleted_at', null).order('name');
      if (error) throw error;
      return data as Recipe[];
    },
    enabled: !!categoryId,
  });

  /* Latest version per recipe */
  const recipeIds = recipes?.map((r) => r.id) ?? [];
  const { data: recipeVersions } = useQuery({
    queryKey: ['recipe_versions_bulk', recipeIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_versions').select('recipe_id, status, version_number')
        .in('recipe_id', recipeIds)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return data as Pick<RecipeVersion, 'recipe_id' | 'status' | 'version_number'>[];
    },
    enabled: recipeIds.length > 0,
  });

  function latestVersion(recipeId: string) {
    return recipeVersions?.find((v) => v.recipe_id === recipeId);
  }

  /* Profiles (creator + approver) */
  const { data: profiles } = useQuery({
    queryKey: ['profiles_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, role');
      if (error) throw error;
      return data as Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[];
    },
  });

  function resolveUser(id: string | null | undefined) {
    if (!id) return null;
    const p = profiles?.find((p) => p.id === id);
    return p ? (p.full_name || p.email || id) : id.slice(0, 8) + '…';
  }

  /* ── Mutations ──────────────────────────────────────────────────────────── */
  const submitCategory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('categories')
        .update({ status: 'pending_approval', submitted_at: new Date().toISOString() })
        .eq('id', categoryId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category', categoryId] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const approveCategory = useMutation({
    mutationFn: async (approve: boolean) => {
      const { error } = await supabase.from('categories')
        .update({ status: approve ? 'approved' : 'rejected', approved_by: profile?.id, approved_at: new Date().toISOString() })
        .eq('id', categoryId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category', categoryId] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const createRecipe = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !categoryId) throw new Error('Missing context');
      const { data: recipeRow, error: recipeErr } = await supabase
        .from('recipes').insert({ category_id: categoryId, name: newRecipeName.trim(), created_by: profile.id })
        .select('id').single();
      if (recipeErr || !recipeRow) throw recipeErr;
      const { error: versionErr } = await supabase.from('recipe_versions').insert({
        recipe_id: recipeRow.id, version_number: 1, status: 'draft', created_by: profile.id,
      });
      if (versionErr) throw versionErr;
      return recipeRow.id;
    },
    onSuccess: (recipeId) => {
      queryClient.invalidateQueries({ queryKey: ['recipes', categoryId] });
      setShowNewRecipe(false);
      setNewRecipeName('');
      navigate(`/categories/${categoryId}/recipes/${recipeId}`);
    },
  });

  /* ── Guards ─────────────────────────────────────────────────────────────── */
  if (catLoading || !category) {
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

  const canEdit      = profile?.role === 'admin' || (profile?.role === 'manager' && category.created_by === profile?.id);
  const canApprove   = profile?.role === 'admin' && category.status === 'pending_approval';
  const canAddRecipe = category.status !== 'rejected' &&
    (profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'dietician');
  const showRecipes  = category.status !== 'rejected';

  const statusColor =
    category.status === 'approved'         ? 'bg-green-400' :
    category.status === 'pending_approval' ? 'bg-amber-400' :
    category.status === 'rejected'         ? 'bg-red-400'   : 'bg-gray-200';

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Link to="/categories" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-violet-600 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Categories
      </Link>

      {/* ── Header card ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className={`h-1.5 w-full ${statusColor}`} />
        <div className="px-6 py-5">
          {/* Name + badges */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path d="M3 7a2 2 0 012-2h3l2 2h9a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{category.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <SaveBadge     status={category.status} />
                  <ApprovalBadge status={category.status} />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 shrink-0">
              {canEdit && category.status === 'draft' && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => submitCategory.mutate()}
                  disabled={submitCategory.isPending}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {submitCategory.isPending ? 'Submitting…' : 'Submit for Approval'}
                </button>
              )}
              {canEdit && (
                <Link to={`/categories/${categoryId}/edit`} className="btn-secondary">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  Edit
                </Link>
              )}
              {canApprove && (
                <>
                  <button
                    type="button"
                    className="btn-primary !bg-green-600 hover:!bg-green-700"
                    onClick={() => approveCategory.mutate(true)}
                    disabled={approveCategory.isPending}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => approveCategory.mutate(false)}
                    disabled={approveCategory.isPending}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/>
                    </svg>
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Meta info strip */}
          <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Created By</p>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-700 shrink-0">
                  {(resolveUser(category.created_by)?.[0] ?? '?').toUpperCase()}
                </div>
                <span className="text-xs text-gray-700 font-medium">{resolveUser(category.created_by)}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Created On</p>
              <p className="text-xs text-gray-700">{fmtDate(category.created_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Submitted On</p>
              <p className="text-xs text-gray-700">{fmtDate(category.submitted_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                {category.status === 'rejected' ? 'Rejected On' : 'Approved On'}
              </p>
              <p className="text-xs text-gray-700">{fmtDate(category.approved_at)}</p>
              {category.approved_by && (
                <p className="text-[10px] text-gray-400 mt-0.5">by {resolveUser(category.approved_by)}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Goals + Components row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Goals card — takes 2/3 */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="font-semibold text-gray-900">Nutrition Goals</h2>
              <p className="text-xs text-gray-400 mt-0.5">{goals?.length ?? 0} parameter{goals?.length !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
          {(!goals || goals.length === 0) ? (
            <div className="p-8 text-center text-gray-400 text-sm">No goals defined yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th text-left">Parameter</th>
                    <th className="th">Direction</th>
                    <th className="th">Min</th>
                    <th className="th">Max</th>
                    <th className="th">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g) => {
                    const param = parameters?.find((p) => p.id === g.parameter_id);
                    return (
                      <tr key={g.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="td font-medium text-gray-900">{param?.name ?? '—'}</td>
                        <td className="td text-center">
                          {param && (
                            <span className={`badge text-[11px] ${
                              param.direction === 'higher_is_better'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50  text-amber-700'
                            }`}>
                              {param.direction === 'higher_is_better' ? '↑ Higher' : '↓ Lower'}
                            </span>
                          )}
                        </td>
                        <td className="td text-center text-gray-700 font-medium">{g.goal_min}</td>
                        <td className="td text-center text-gray-700 font-medium">{g.goal_max}</td>
                        <td className="td text-center">
                          <span className="badge bg-gray-50 text-gray-500 text-[10px]">
                            {param?.unit ?? '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Components card — takes 1/3 */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="font-semibold text-gray-900">Components</h2>
              <p className="text-xs text-gray-400 mt-0.5">{components?.length ?? 0} component{components?.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="card-body">
            {(!components || components.length === 0) ? (
              <p className="text-sm text-gray-400 text-center py-4">No components defined.</p>
            ) : (
              <div className="space-y-2">
                {components.map((comp, idx) => (
                  <div key={comp.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                      {idx + 1}
                    </div>
                    <span className="text-sm font-medium text-gray-800">{comp.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Recipes section ───────────────────────────────────────────────── */}
      {showRecipes && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <div>
              <h2 className="font-semibold text-gray-900">Recipes</h2>
              <p className="text-xs text-gray-400 mt-0.5">{recipes?.length ?? 0} recipe{recipes?.length !== 1 ? 's' : ''}</p>
            </div>
            {canAddRecipe && !showNewRecipe && (
              <button type="button" className="btn-primary" onClick={() => { setShowNewRecipe(true); setNewRecipeName(''); setRecipeNameErr(false); }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M12 4v16m8-8H4"/>
                </svg>
                New Recipe
              </button>
            )}
          </div>

          {/* New recipe inline form */}
          {canAddRecipe && showNewRecipe && (
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/40">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">New Recipe</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                  <label className="label">Recipe name <span className="text-red-500">*</span></label>
                  <input
                    className={recipeNameErr ? 'input !border-red-400 focus:!ring-red-300' : 'input'}
                    value={newRecipeName}
                    onChange={(e) => { setNewRecipeName(e.target.value); setRecipeNameErr(false); }}
                    placeholder="e.g. BBQ Chicken Burger"
                    onKeyDown={(e) => { if (e.key === 'Enter') { if (!newRecipeName.trim()) { setRecipeNameErr(true); return; } createRecipe.mutate(); }}}
                  />
                  {recipeNameErr && <p className="text-xs text-red-500 mt-0.5">Recipe name is required</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={createRecipe.isPending}
                    onClick={() => {
                      if (!newRecipeName.trim()) { setRecipeNameErr(true); return; }
                      createRecipe.mutate();
                    }}
                  >
                    {createRecipe.isPending ? 'Creating…' : 'Create Recipe'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setShowNewRecipe(false); setRecipeNameErr(false); }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recipe list */}
          {(!recipes || recipes.length === 0) ? (
            <div className="p-10 text-center">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-gray-400 text-sm">No recipes yet. Create the first one!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
              {recipes.map((r) => {
                const ver = latestVersion(r.id);
                return (
                  <Link
                    key={r.id}
                    to={`/categories/${categoryId}/recipes/${r.id}`}
                    className="group flex flex-col gap-2 p-4 border border-gray-100 rounded-2xl bg-white hover:border-violet-200 hover:shadow-sm transition-all"
                  >
                    {/* Recipe icon + name */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-violet-50 group-hover:bg-violet-100 transition-colors flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <p className="font-semibold text-gray-900 group-hover:text-violet-700 transition-colors text-sm leading-tight truncate">
                          {r.name}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-violet-400 transition-colors shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>

                    {/* Version + status */}
                    <div className="flex items-center gap-2">
                      {ver && (
                        <>
                          <span className="text-[10px] text-gray-400">v{ver.version_number}</span>
                          <RecipeStatusBadge status={ver.status} />
                        </>
                      )}
                    </div>

                    {/* Created date */}
                    <p className="text-[10px] text-gray-400 mt-auto">
                      Created {fmtDate(r.created_at)}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
