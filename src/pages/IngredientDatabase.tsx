import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { IngredientDatabase as IngredientDB, SauceLibrary as Sauce, Profile, RawCookedEnum } from '@/types/database';

const SAUCE_PAGE_SIZE = 10;

/* ─── Shared nutrition field definitions ───────────────────────────────────── */
type NutrKey =
  | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g'
  | 'omega3_g' | 'omega6_g' | 'sodium_mg' | 'added_sugar_g';

const NUTR_FIELDS: { key: NutrKey; label: string; unit: string }[] = [
  { key: 'calories',      label: 'Calories',    unit: 'kcal' },
  { key: 'protein_g',     label: 'Protein',     unit: 'g'    },
  { key: 'carbs_g',       label: 'Carbs',       unit: 'g'    },
  { key: 'fat_g',         label: 'Fat',         unit: 'g'    },
  { key: 'fibre_g',       label: 'Fibre',       unit: 'g'    },
  { key: 'omega3_g',      label: 'Omega-3',     unit: 'g'    },
  { key: 'omega6_g',      label: 'Omega-6',     unit: 'g'    },
  { key: 'sodium_mg',     label: 'Sodium',      unit: 'mg'   },
  { key: 'added_sugar_g', label: 'Added Sugar', unit: 'g'    },
];

const EMPTY_NUTR: Record<NutrKey, string> = {
  calories: '', protein_g: '', carbs_g: '', fat_g: '',
  fibre_g: '', omega3_g: '', omega6_g: '', sodium_mg: '', added_sugar_g: '',
};

/* ─── Ingredient DB per-100g field list ────────────────────────────────────── */
const DB_NUTR_FIELDS = [
  'calories_per_100g', 'protein_g_per_100g', 'carbs_g_per_100g', 'fat_g_per_100g',
  'fibre_g_per_100g', 'omega3_g_per_100g', 'omega6_g_per_100g', 'sodium_mg_per_100g',
  'added_sugar_g_per_100g',
] as const;
type DbNutrField = typeof DB_NUTR_FIELDS[number];

const DB_FIELD_LABELS: Record<DbNutrField, string> = {
  calories_per_100g: 'Calories (kcal)', protein_g_per_100g: 'Protein (g)',
  carbs_g_per_100g: 'Carbs (g)', fat_g_per_100g: 'Fat (g)',
  fibre_g_per_100g: 'Fibre (g)', omega3_g_per_100g: 'Omega-3 (g)',
  omega6_g_per_100g: 'Omega-6 (g)', sodium_mg_per_100g: 'Sodium (mg)',
  added_sugar_g_per_100g: 'Added Sugar (g)',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Main page                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function IngredientDatabase() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [activeTab, setActiveTab]           = useState<'ingredients' | 'subcomponents'>('ingredients');
  const [view, setView]                     = useState<'list' | 'add'>('list');
  const [addType, setAddType]               = useState<'ingredient' | 'subcomponent'>('ingredient');
  const [search, setSearch]                 = useState('');
  const [sauceSearch, setSauceSearch]       = useState('');
  const [saucePage, setSaucePage]           = useState(0);
  const [editingIngId, setEditingIngId]     = useState<string | null>(null);
  const [editIngForm, setEditIngForm]       = useState<Partial<Record<DbNutrField, number>>>({});
  const [editingSauceId, setEditingSauceId] = useState<string | null>(null);

  /* ── Queries ──────────────────────────────────────────────────────────── */
  const { data: ingredients, isLoading: ingLoading } = useQuery({
    queryKey: ['ingredient_database', search],
    queryFn: async () => {
      let q = supabase.from('ingredient_database').select('*').is('deleted_at', null).order('name');
      if (search.trim()) q = q.ilike('name', `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as IngredientDB[];
    },
  });

  const { data: saucesData, isLoading: sauceLoading } = useQuery({
    queryKey: ['sauce_library', saucePage, sauceSearch],
    queryFn: async () => {
      let q = supabase
        .from('sauce_library')
        .select('*', { count: 'exact' })
        .order('name')
        .range(saucePage * SAUCE_PAGE_SIZE, (saucePage + 1) * SAUCE_PAGE_SIZE - 1);
      if (sauceSearch.trim()) q = q.ilike('name', `%${sauceSearch.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Sauce[], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });

  const { data: sauceTotalData } = useQuery({
    queryKey: ['sauce_library_total'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('sauce_library').select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const sauces      = saucesData?.rows ?? [];
  const sauceTotal  = saucesData?.total ?? 0;
  const sauceTotalPages = Math.ceil(sauceTotal / SAUCE_PAGE_SIZE);

  const { data: editHistory } = useQuery({
    queryKey: ['ingredient_edit_history', editingIngId],
    queryFn: async () => {
      if (!editingIngId) return [];
      const { data, error } = await supabase
        .from('ingredient_edit_history').select('*').eq('ingredient_id', editingIngId)
        .order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!editingIngId && (profile?.role === 'admin' || profile?.role === 'manager'),
  });

  const creatorIds = [...new Set(sauces.map((s) => s.created_by).filter(Boolean))] as string[];
  const { data: profiles } = useQuery({
    queryKey: ['profiles', creatorIds],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('id', creatorIds);
      if (error) throw error;
      return data as Pick<Profile, 'id' | 'full_name' | 'email'>[];
    },
    enabled: creatorIds.length > 0,
  });

  function creatorName(id: string | null | undefined): string {
    if (!id) return '—';
    const p = profiles?.find((x) => x.id === id);
    return p ? (p.full_name ?? p.email ?? '—') : '—';
  }

  /* ── Ingredient mutations ─────────────────────────────────────────────── */
  const updateIngredient = useMutation({
    mutationFn: async ({ id, updates, editedBy }: { id: string; updates: Record<string, number>; editedBy: string }) => {
      const { data: old, error: fetchErr } = await supabase.from('ingredient_database').select('*').eq('id', id).single();
      if (fetchErr || !old) throw fetchErr;
      const { error } = await supabase.from('ingredient_database').update(updates).eq('id', id);
      if (error) throw error;
      for (const field of DB_NUTR_FIELDS) {
        if (updates[field] != null && old[field] !== updates[field]) {
          await supabase.from('ingredient_edit_history').insert({
            ingredient_id: id, edited_by: editedBy, field_name: field,
            old_value: old[field], new_value: updates[field],
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredient_database'] });
      queryClient.invalidateQueries({ queryKey: ['ingredient_edit_history', editingIngId!] });
      setEditingIngId(null); setEditIngForm({});
    },
  });

  const softDeleteIngredient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ingredient_database').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingredient_database'] }),
  });

  const deleteSauce = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('sauce_ingredients').delete().eq('sauce_id', id);
      const { error } = await supabase.from('sauce_library').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sauce_library'] });
      queryClient.invalidateQueries({ queryKey: ['sauce_library_total'] });
      toast.success('Sub Component deleted successfully.');
    },
    onError: (err: Error) => toast.error('Failed to delete', { description: err.message }),
  });

  /* ── Permissions ──────────────────────────────────────────────────────── */
  const canEdit   = profile?.role === 'admin' || profile?.role === 'manager';
  const canDelete = profile?.role === 'admin';
  const canAdd    = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'dietician';

  /* ── Add inline screen (early return) ────────────────────────────────── */
  if (view === 'add') {
    return (
      <AddItemScreen
        defaultType={addType}
        onBack={() => setView('list')}
        onSuccess={(type) => {
          if (type === 'ingredient') {
            queryClient.invalidateQueries({ queryKey: ['ingredient_database'] });
            setActiveTab('ingredients');
          } else {
            queryClient.invalidateQueries({ queryKey: ['sauce_library'] });
            queryClient.invalidateQueries({ queryKey: ['sauce_library_total'] });
            setActiveTab('subcomponents');
          }
          setView('list');
        }}
      />
    );
  }

  const isLoading = activeTab === 'ingredients' ? ingLoading : sauceLoading;

  if (isLoading) {
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

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ingredient Database</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeTab === 'ingredients'
              ? `${ingredients?.length ?? 0} ingredients`
              : `${sauceTotalData ?? sauceTotal} sub components`}
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setAddType(activeTab === 'subcomponents' ? 'subcomponent' : 'ingredient');
              setView('add');
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4"/>
            </svg>
            Add Ingredient
          </button>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {[
          { id: 'ingredients'   as const, label: 'Ingredients',    count: ingredients?.length ?? 0 },
          { id: 'subcomponents' as const, label: 'Sub Components', count: sauceTotalData ?? sauceTotal },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setActiveTab(t.id); setSearch(''); setSauceSearch(''); setSaucePage(0); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.id
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === t.id ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Ingredients tab                                                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ingredients' && (
        <>
          {/* Search */}
          <div className="mb-4 relative max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text" className="input pl-10"
              placeholder="Search ingredients by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          <div className="table-wrap overflow-x-auto">
            <table className="w-full min-w-[1300px]">
              <thead>
                <tr>
                  <th className="th sticky left-0 bg-gray-50">Name</th>
                  <th className="th">State</th>
                  <th className="th">Calories</th>
                  <th className="th">Protein</th>
                  <th className="th">Carbs</th>
                  <th className="th">Fat</th>
                  <th className="th">Fibre</th>
                  <th className="th">Ω-3</th>
                  <th className="th">Ω-6</th>
                  <th className="th">Sodium</th>
                  <th className="th">Added Sugar</th>
                  {(canEdit || canDelete) && <th className="th">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {(ingredients ?? []).map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="td font-medium text-gray-900 sticky left-0 bg-white">{row.name}</td>
                    <td className="td">
                      <span className={`badge ${row.raw_cooked === 'raw' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {row.raw_cooked}
                      </span>
                    </td>
                    <td className="td text-gray-600">{row.calories_per_100g}</td>
                    <td className="td text-gray-600">{row.protein_g_per_100g}</td>
                    <td className="td text-gray-600">{row.carbs_g_per_100g}</td>
                    <td className="td text-gray-600">{row.fat_g_per_100g}</td>
                    <td className="td text-gray-600">{row.fibre_g_per_100g}</td>
                    <td className="td text-gray-600">{row.omega3_g_per_100g}</td>
                    <td className="td text-gray-600">{row.omega6_g_per_100g}</td>
                    <td className="td text-gray-600">{row.sodium_mg_per_100g}</td>
                    <td className="td text-gray-600">{row.added_sugar_g_per_100g}</td>
                    {(canEdit || canDelete) && (
                      <td className="td">
                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <button type="button" className="btn-secondary py-1 px-3 text-xs"
                              onClick={() => { setEditingIngId(row.id); setEditIngForm({}); }}>
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" className="btn-danger"
                              onClick={() => {
                                toast('Delete this ingredient?', {
                                  description: 'Existing recipes will keep their saved values.',
                                  action: { label: 'Delete', onClick: () => softDeleteIngredient.mutate(row.id) },
                                  cancel: { label: 'Cancel', onClick: () => {} },
                                });
                              }}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Sub Components tab                                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'subcomponents' && (
        <>
          {/* Search */}
          <div className="mb-4 relative max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              className="input pl-10"
              placeholder="Search sub components…"
              value={sauceSearch}
              onChange={(e) => { setSauceSearch(e.target.value); setSaucePage(0); }}
            />
          </div>

          {sauces.length === 0 && !sauceLoading ? (
            <div className="card px-6 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path d="M9 3h6M8 7h8l-1 10H9L8 7z"/><path d="M6 7a6 6 0 0012 0"/>
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No sub components found</p>
              <p className="text-gray-400 text-sm mt-1">
                {sauceSearch ? `No results for "${sauceSearch}".` : 'Click "Add Ingredient" and choose Sub Component to create one.'}
              </p>
            </div>
          ) : (
            <>
              <div className="table-wrap overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr>
                      <th className="th text-left">Name</th>
                      <th className="th">Created By</th>
                      <th className="th">Created On</th>
                      <th className="th">Updated On</th>
                      {(canEdit || canDelete) && <th className="th w-24" />}
                    </tr>
                  </thead>
                  <tbody>
                    {sauces.map((s) => (
                      <tr key={s.id} className="hover:bg-amber-50/30 transition-colors border-b border-gray-50 last:border-0">
                        {/* Name */}
                        <td className="td">
                          <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                                <path d="M9 3h6M8 7h8l-1 10H9L8 7z"/><path d="M6 7a6 6 0 0012 0"/>
                              </svg>
                            </span>
                            <span className="font-medium text-gray-900">{s.name}</span>
                          </div>
                        </td>

                        {/* Created By */}
                        <td className="td">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-700 shrink-0">
                              {(creatorName(s.created_by)[0] ?? '?').toUpperCase()}
                            </div>
                            <span className="text-sm text-gray-700">{creatorName(s.created_by)}</span>
                          </div>
                        </td>

                        <td className="td text-gray-600 text-sm">{fmtDate(s.created_at)}</td>
                        <td className="td text-gray-600 text-sm">{fmtDate(s.updated_at)}</td>

                        {/* Actions */}
                        {(canEdit || canDelete) && (
                          <td className="td text-right">
                            <div className="flex items-center justify-end gap-2">
                              {canEdit && (
                                <button
                                  type="button"
                                  className="btn-secondary py-0.5 px-2 text-xs"
                                  onClick={() => setEditingSauceId(s.id)}
                                >
                                  Edit
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  className="btn-danger py-0.5 px-2 text-xs"
                                  onClick={() => {
                                    toast('Delete this sub component?', {
                                      description: 'This cannot be undone.',
                                      action: { label: 'Delete', onClick: () => deleteSauce.mutate(s.id) },
                                      cancel: { label: 'Cancel', onClick: () => {} },
                                    });
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {sauceTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-1">
                  <p className="text-sm text-gray-500">
                    Showing {saucePage * SAUCE_PAGE_SIZE + 1}–{Math.min((saucePage + 1) * SAUCE_PAGE_SIZE, sauceTotal)} of {sauceTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={saucePage === 0}
                      onClick={() => setSaucePage((p) => p - 1)}
                    >
                      ← Previous
                    </button>
                    <span className="text-sm text-gray-500 px-1">
                      Page {saucePage + 1} of {sauceTotalPages}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={saucePage >= sauceTotalPages - 1}
                      onClick={() => setSaucePage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Ingredient edit modal ──────────────────────────────────────────── */}
      {editingIngId && (() => {
        const row = ingredients?.find((r) => r.id === editingIngId);
        if (!row) return null;
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="font-semibold text-gray-900">Edit Ingredient</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Per 100g values</p>
                </div>
                <button type="button" onClick={() => { setEditingIngId(null); setEditIngForm({}); }}
                  className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              <div className="px-6 py-5">
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <ellipse cx="12" cy="6" rx="8" ry="3"/>
                      <path d="M4 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6"/>
                      <path d="M4 12v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{row.name}</p>
                    <span className={`badge text-[10px] ${row.raw_cooked === 'raw' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {row.raw_cooked}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {DB_NUTR_FIELDS.map((field) => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {DB_FIELD_LABELS[field]}
                      </label>
                      <input type="number" step="any" className="input"
                        defaultValue={row[field]}
                        onChange={(e) => setEditIngForm((f) => ({ ...f, [field]: Number(e.target.value) }))}
                      />
                    </div>
                  ))}
                </div>

                {editHistory && editHistory.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Edit History</h3>
                    <ul className="space-y-1.5">
                      {editHistory.map((h: { field_name: string; old_value: number; new_value: number; created_at: string }) => (
                        <li key={h.created_at + h.field_name}
                          className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                          <span className="font-medium text-gray-700">{h.field_name.replace(/_/g, ' ')}</span>
                          <span>{h.old_value} → <strong className="text-violet-700">{h.new_value}</strong></span>
                          <span className="text-gray-400">{new Date(h.created_at).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button type="button" className="btn-primary"
                  disabled={updateIngredient.isPending}
                  onClick={() => {
                    const updates: Record<string, number> = {};
                    for (const k of DB_NUTR_FIELDS) {
                      if (editIngForm[k] != null) updates[k] = editIngForm[k]!;
                    }
                    if (Object.keys(updates).length && profile?.id) {
                      updateIngredient.mutate({ id: editingIngId, updates, editedBy: profile.id });
                    }
                  }}>
                  {updateIngredient.isPending ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className="btn-secondary"
                  onClick={() => { setEditingIngId(null); setEditIngForm({}); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sauce edit modal ──────────────────────────────────────────────── */}
      {editingSauceId && (
        <SauceEditModal
          sauceId={editingSauceId}
          onClose={() => setEditingSauceId(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['sauce_library'] });
            queryClient.invalidateQueries({ queryKey: ['sauce_library_total'] });
            setEditingSauceId(null);
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Add Item Screen (inline — replaces popup modal)                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
function AddItemScreen({
  defaultType,
  onBack,
  onSuccess,
}: {
  defaultType: 'ingredient' | 'subcomponent';
  onBack: () => void;
  onSuccess: (type: 'ingredient' | 'subcomponent') => void;
}) {
  const { profile } = useAuth();

  const [type, setType]           = useState<'ingredient' | 'subcomponent'>(defaultType);
  const [name, setName]           = useState('');
  const [rawCooked, setRawCooked] = useState<RawCookedEnum | ''>('');
  const [nutr, setNutr]           = useState<Record<NutrKey, string>>({ ...EMPTY_NUTR });
  const [submitted, setSubmitted] = useState(false);
  const [dupError, setDupError]   = useState('');

  function resetFields() {
    setName(''); setRawCooked('');
    setNutr({ ...EMPTY_NUTR }); setSubmitted(false); setDupError('');
  }

  function handleTypeChange(t: 'ingredient' | 'subcomponent') {
    setType(t); resetFields();
  }

  /* ── Validation ─────────────────────────────────────────────────────── */
  const nameErr      = submitted && !name.trim();
  const rawCookedErr = submitted && type === 'ingredient' && !rawCooked;
  const nutrErrors   = NUTR_FIELDS.reduce<Record<NutrKey, boolean>>(
    (acc, { key }) => ({ ...acc, [key]: submitted && nutr[key] === '' }),
    {} as Record<NutrKey, boolean>
  );

  /* ── Mutation ───────────────────────────────────────────────────────── */
  const addMutation = useMutation({
    mutationFn: async () => {
      const trimName = name.trim();

      if (type === 'ingredient') {
        /* Duplicate check */
        const { data: existing } = await supabase
          .from('ingredient_database')
          .select('id').ilike('name', trimName).is('deleted_at', null).maybeSingle();
        if (existing) throw new Error('An ingredient with this name already exists');

        const { error } = await supabase.from('ingredient_database').insert({
          name:                   trimName,
          raw_cooked:             rawCooked as RawCookedEnum,
          calories_per_100g:      Number(nutr.calories),
          protein_g_per_100g:     Number(nutr.protein_g),
          carbs_g_per_100g:       Number(nutr.carbs_g),
          fat_g_per_100g:         Number(nutr.fat_g),
          fibre_g_per_100g:       Number(nutr.fibre_g),
          omega3_g_per_100g:      Number(nutr.omega3_g),
          omega6_g_per_100g:      Number(nutr.omega6_g),
          sodium_mg_per_100g:     Number(nutr.sodium_mg),
          added_sugar_g_per_100g: Number(nutr.added_sugar_g),
          created_by:             profile?.id ?? null,
        });
        if (error) throw error;

      } else {
        /* Duplicate check */
        const { data: existing } = await supabase
          .from('sauce_library')
          .select('id').ilike('name', trimName).maybeSingle();
        if (existing) throw new Error('A sub component with this name already exists');

        const BATCH = 1000; // fixed batch size
        const { data: newSauce, error: sauceErr } = await supabase
          .from('sauce_library')
          .insert({ name: trimName, batch_total_g: BATCH, created_by: profile?.id ?? null })
          .select('id').single();
        if (sauceErr || !newSauce) throw sauceErr;

        const { error: ingErr } = await supabase.from('sauce_ingredients').insert({
          sauce_id:      newSauce.id,
          ingredient_id: null,
          custom_name:   trimName,
          quantity_g:    BATCH,
          calories:      Number(nutr.calories),
          protein_g:     Number(nutr.protein_g),
          carbs_g:       Number(nutr.carbs_g),
          fat_g:         Number(nutr.fat_g),
          fibre_g:       Number(nutr.fibre_g),
          omega3_g:      Number(nutr.omega3_g),
          omega6_g:      Number(nutr.omega6_g),
          sodium_mg:     Number(nutr.sodium_mg),
          added_sugar_g: Number(nutr.added_sugar_g),
          sort_order:    0,
        });
        if (ingErr) throw ingErr;
      }
    },
    onSuccess: () => onSuccess(type),
    onError: (err: Error) => setDupError(err.message),
  });

  function handleSave() {
    setSubmitted(true);
    setDupError('');
    if (!name.trim()) return;
    if (type === 'ingredient' && !rawCooked) return;
    addMutation.mutate();
  }

  const perLabel = 'per 100g';

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Ingredient</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add a new ingredient or sub component to the database</p>
        </div>
      </div>

      <div className="max-w-xl space-y-6">

        {/* ── Type toggle ───────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">Type</h2>
          </div>
          <div className="card-body">
            <div className="flex gap-3">
              {[
                { value: 'ingredient'   as const, label: 'Ingredient'    },
                { value: 'subcomponent' as const, label: 'Sub Component' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeChange(opt.value)}
                  className={`flex-1 py-2.5 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                    type === opt.value
                      ? 'border-violet-600 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Details ───────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">
              {type === 'ingredient' ? 'Ingredient' : 'Sub Component'} Details
            </h2>
          </div>
          <div className="card-body space-y-4">

            {/* Name */}
            <div>
              <label className="label">
                {type === 'ingredient' ? 'Ingredient' : 'Sub Component'} Name{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                className={nameErr ? 'input !border-red-400 focus:!ring-red-300' : 'input'}
                value={name}
                onChange={(e) => { setName(e.target.value); setDupError(''); }}
                placeholder={type === 'ingredient' ? 'e.g. Chicken Breast' : 'e.g. Tikka Sauce'}
              />
              {nameErr  && <p className="text-xs text-red-500 mt-1">Name is required</p>}
              {dupError && <p className="text-xs text-red-500 mt-1">{dupError}</p>}
            </div>

            {/* Ingredient → State */}
            {type === 'ingredient' && (
              <div>
                <label className="label">State <span className="text-red-500">*</span></label>
                <select
                  className={rawCookedErr ? 'select !border-red-400 focus:!ring-red-300' : 'select'}
                  value={rawCooked}
                  onChange={(e) => setRawCooked(e.target.value as RawCookedEnum | '')}
                >
                  <option value="">Select…</option>
                  <option value="raw">Raw</option>
                  <option value="cooked">Cooked</option>
                </select>
                {rawCookedErr && <p className="text-xs text-red-500 mt-1">State is required</p>}
              </div>
            )}

          </div>
        </div>

        {/* ── Nutrition Values ──────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">
              Nutrition Values <span className="text-red-500">*</span>
            </h2>
            <span className="text-xs text-gray-400">{perLabel} — all fields required</span>
          </div>
          <div className="card-body space-y-2.5">
            {NUTR_FIELDS.map(({ key, label, unit }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-800 font-medium">{label}</span>
                  <span className="ml-1.5 text-xs text-gray-400">({perLabel})</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number" step="any" min="0"
                    className={`w-28 border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all placeholder:text-gray-300 ${
                      nutrErrors[key]
                        ? 'border-red-400 focus:ring-red-300'
                        : 'border-gray-200 focus:ring-violet-400'
                    }`}
                    value={nutr[key]}
                    onChange={(e) => setNutr((n) => ({ ...n, [key]: e.target.value }))}
                    placeholder="0"
                  />
                  <span className="text-xs text-gray-400 w-8 text-right">{unit}</span>
                </div>
              </div>
            ))}
            {submitted && NUTR_FIELDS.some(({ key }) => nutr[key] === '') && (
              <p className="text-xs text-red-500 pt-1">All nutrition values are required</p>
            )}
          </div>
        </div>

        {/* ── Action buttons ─────────────────────────────────────────────── */}
        <div className="flex gap-3 pb-8">
          <button
            type="button"
            className="btn-primary px-8"
            onClick={handleSave}
            disabled={addMutation.isPending}
          >
            {addMutation.isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving…
              </span>
            ) : 'Save'}
          </button>
          <button type="button" className="btn-secondary px-8" onClick={onBack}>
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Sauce / Sub-Component Edit Modal                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
function SauceEditModal({ sauceId, onClose, onSuccess }: {
  sauceId: string; onClose: () => void; onSuccess: () => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName]           = useState('');
  const [nutrForm, setNutrForm]   = useState<Record<NutrKey, string>>({ ...EMPTY_NUTR });
  const [submitted, setSubmitted] = useState(false);

  const { data: sauceDetail, isLoading } = useQuery({
    queryKey: ['sauce_edit_detail', sauceId],
    queryFn: async () => {
      const { data: sauce, error: sErr } = await supabase
        .from('sauce_library').select('*').eq('id', sauceId).single();
      if (sErr || !sauce) throw sErr;
      const { data: ings, error: iErr } = await supabase
        .from('sauce_ingredients').select('*').eq('sauce_id', sauceId).order('sort_order').limit(1);
      if (iErr) throw iErr;
      return { sauce, ing: ings?.[0] ?? null };
    },
    staleTime: 0,
    gcTime: 0,   // never keep stale data in cache
  });

  // Always sync form when fresh data arrives — keyed on sauceId so switching
  // sauces always re-initialises even if component stays mounted.
  useEffect(() => {
    if (!sauceDetail) return;
    setName(sauceDetail.sauce.name ?? '');
    const ing = sauceDetail.ing as Record<string, unknown> | null;
    setNutrForm({
      calories:      String(ing?.calories      ?? ''),
      protein_g:     String(ing?.protein_g     ?? ''),
      carbs_g:       String(ing?.carbs_g       ?? ''),
      fat_g:         String(ing?.fat_g         ?? ''),
      fibre_g:       String(ing?.fibre_g       ?? ''),
      omega3_g:      String(ing?.omega3_g      ?? ''),
      omega6_g:      String(ing?.omega6_g      ?? ''),
      sodium_mg:     String(ing?.sodium_mg     ?? ''),
      added_sugar_g: String(ing?.added_sugar_g ?? ''),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sauceId, sauceDetail]);

  const nameErr = submitted && !name.trim();
  const nutrErrors = NUTR_FIELDS.reduce<Record<NutrKey, boolean>>(
    (acc, { key }) => ({
      ...acc,
      // 0 is valid (e.g. Added Sugar = 0 for chilli oil). Only blank/undefined is an error.
      [key]: submitted && nutrForm[key] === '',
    }),
    {} as Record<NutrKey, boolean>
  );
  const isFormValid =
    name.trim() !== '' &&
    NUTR_FIELDS.every(({ key }) => nutrForm[key] !== '');

  function nutrInputCls(hasError: boolean) {
    return `w-28 border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all placeholder:text-gray-300 ${
      hasError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:ring-violet-400'
    }`;
  }

  const saveSauce = useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      const BATCH = 1000; // fixed batch size
      await supabase.from('sauce_library')
        .update({ name: name.trim(), batch_total_g: BATCH }).eq('id', sauceId);
      await supabase.from('sauce_ingredients').delete().eq('sauce_id', sauceId);
      await supabase.from('sauce_ingredients').insert({
        sauce_id:      sauceId,
        ingredient_id: null,
        custom_name:   name.trim(),
        quantity_g:    BATCH,
        calories:      Number(nutrForm.calories),
        protein_g:     Number(nutrForm.protein_g),
        carbs_g:       Number(nutrForm.carbs_g),
        fat_g:         Number(nutrForm.fat_g),
        fibre_g:       Number(nutrForm.fibre_g),
        omega3_g:      Number(nutrForm.omega3_g),
        omega6_g:      Number(nutrForm.omega6_g),
        sodium_mg:     Number(nutrForm.sodium_mg),
        added_sugar_g: Number(nutrForm.added_sugar_g),
        sort_order:    0,
      });
    },
    onSuccess: () => {
      // Evict stale detail so re-opening always fetches fresh values
      queryClient.removeQueries({ queryKey: ['sauce_edit_detail', sauceId] });
      onSuccess();
    },
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3 text-gray-400 text-sm">
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Edit Sub Component</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Name only — batch total removed (fixed at 1000g) */}
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input
              className={nameErr ? 'input !border-red-400 focus:!ring-red-300' : 'input'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tikka Sauce"
            />
            {nameErr && <p className="text-xs text-red-500 mt-1">Required</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">
                Nutrition Values <span className="text-red-500">*</span>
              </p>
              <span className="text-xs text-gray-400">per 100g — all required</span>
            </div>
            <div className="space-y-2.5">
              {NUTR_FIELDS.map(({ key, label, unit }) => (
                <div key={key} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-800 font-medium">{label}</span>
                    <span className="ml-1.5 text-xs text-gray-400">(per 100g)</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number" step="any" min="0"
                      className={nutrInputCls(nutrErrors[key])}
                      value={nutrForm[key]}
                      onChange={(e) => setNutrForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder="0"
                    />
                    <span className="text-xs text-gray-400 w-8 text-right">{unit}</span>
                  </div>
                </div>
              ))}
              {submitted && NUTR_FIELDS.some(({ key }) => nutrForm[key] === '') && (
                <p className="text-xs text-red-500 pt-1">All nutrition values are required (0 is allowed)</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            className="btn-primary"
            onClick={() => { setSubmitted(true); if (!isFormValid) return; saveSauce.mutate(); }}
            disabled={saveSauce.isPending}
          >
            {saveSauce.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
