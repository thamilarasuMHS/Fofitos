import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { NutritionParameter, ComponentLibrary } from '@/types/database';
import { normalizeDisplayedRatio, isRatioRangeValid } from '@/utils/ratioUtils';

export function CategoryNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [name, setName]                     = useState('');
  const [selectedParams, setSelectedParams] = useState<Record<string, { min: string; max: string; minLeft: string; maxLeft: string }>>({});
  const [selectedComps, setSelectedComps]   = useState<Set<string>>(new Set());
  const [submitted, setSubmitted]           = useState(false);

  /* ── Data ─────────────────────────────────────────────── */
  const { data: parameters } = useQuery({
    queryKey: ['nutrition_parameters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nutrition_parameters').select('*').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data as NutritionParameter[];
    },
  });

  const { data: componentLibrary } = useQuery({
    queryKey: ['component_library'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('component_library').select('*').order('sort_order');
      if (error) throw error;
      return data as ComponentLibrary[];
    },
  });

  /* ── Nutrition Goals — select-all logic ───────────────── */
  const allParamIds    = parameters?.map((p) => p.id) ?? [];
  const checkedCount   = allParamIds.filter((id) => selectedParams[id] != null).length;
  const allParamSel    = allParamIds.length > 0 && checkedCount === allParamIds.length;
  const someParamSel   = checkedCount > 0 && !allParamSel;
  const paramSelectRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (paramSelectRef.current) paramSelectRef.current.indeterminate = someParamSel;
  }, [someParamSel]);

  function handleSelectAllParams() {
    if (allParamSel) {
      setSelectedParams({});
    } else {
      const all: Record<string, { min: string; max: string; minLeft: string; maxLeft: string }> = {};
      for (const id of allParamIds) all[id] = selectedParams[id] ?? { min: '', max: '', minLeft: '1', maxLeft: '1' };
      setSelectedParams(all);
    }
  }
  function toggleParam(id: string, checked: boolean) {
    if (checked) setSelectedParams((s) => ({ ...s, [id]: { min: '', max: '', minLeft: '1', maxLeft: '1' } }));
    else setSelectedParams((s) => { const n = { ...s }; delete n[id]; return n; });
  }

  /* ── Validation ────────────────────────────────────────── */
  const paramErrors = Object.entries(selectedParams).reduce<Record<string, { min: boolean; max: boolean }>>(
    (acc, [id, v]) => {
      acc[id] = { min: v.min === '', max: v.max === '' };
      return acc;
    }, {}
  );
  const hasParamErrors = Object.values(paramErrors).some((e) => e.min || e.max);

  // Range check: normalizedMin must be ≤ normalizedMax.
  // Business rule: for ratio A:B, normalizedRatio = B/A (second ÷ first).
  const rangeErrors = Object.entries(selectedParams).reduce<Record<string, boolean>>(
    (acc, [id, v]) => {
      if (v.min === '' || v.max === '') return acc;
      const param = parameters?.find((p) => p.id === id);
      const isRatio = param?.param_type === 'ratio';
      if (isRatio) {
        const valid = isRatioRangeValid(
          Number(v.minLeft), Number(v.min),
          Number(v.maxLeft), Number(v.max),
        );
        if (!valid) acc[id] = true;
      } else {
        if (Number(v.min) > Number(v.max)) acc[id] = true;
      }
      return acc;
    }, {}
  );
  const hasRangeErrors = Object.keys(rangeErrors).length > 0;
  const isFormValid    = name.trim().length > 0 && !hasParamErrors && !hasRangeErrors;

  /* ── Auto-select "Others" component when library loads ─── */
  useEffect(() => {
    if (!componentLibrary) return;
    const othersItem = componentLibrary.find((c) => c.name.toLowerCase() === 'others');
    if (othersItem) {
      setSelectedComps((prev) => {
        if (prev.has(othersItem.id)) return prev;   // already selected
        const next = new Set(prev);
        next.add(othersItem.id);
        return next;
      });
    }
  }, [componentLibrary]);

  /* ── Component Headers — select-all logic ─────────────── */
  const allCompIds  = componentLibrary?.map((c) => c.id) ?? [];
  const allCompSel  = allCompIds.length > 0 && allCompIds.every((id) => selectedComps.has(id));
  const someCompSel = selectedComps.size > 0 && !allCompSel;
  const compSelectRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (compSelectRef.current) compSelectRef.current.indeterminate = someCompSel;
  }, [someCompSel]);

  function handleSelectAllComps() {
    if (allCompSel) {
      setSelectedComps(new Set());
    } else {
      setSelectedComps(new Set(allCompIds));
    }
  }
  function toggleComp(id: string, checked: boolean) {
    setSelectedComps((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  /* ── Save ─────────────────────────────────────────────── */
  const createCategory = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Not authenticated');
      const { data: cat, error: catErr } = await supabase
        .from('categories')
        .insert({ name: name.trim(), created_by: profile.id, status: 'draft' })
        .select('id').single();
      if (catErr || !cat) throw catErr || new Error('No category');

      /* Insert selected components (in library sort order) */
      const compInserts = (componentLibrary ?? [])
        .filter((c) => selectedComps.has(c.id))
        .map((c, i) => ({ category_id: cat.id, name: c.name, sort_order: i }));
      if (compInserts.length) {
        const { error: compErr } = await supabase.from('category_components').insert(compInserts);
        if (compErr) throw compErr;
      }

      /* Insert selected nutrition goals.
         Ratio storage: normalizedRatio = A / B (first ÷ second).
         We sort the two computed values so goal_min ≤ goal_max always,
         satisfying the DB constraint regardless of which side increases
         (e.g. Protein:Carb 1:1→1:2.5 gives raw [1, 0.4]; stored as [0.4, 1]). */
      const goalInserts = Object.entries(selectedParams).map(([paramId, g]) => {
        const param = parameters?.find((p) => p.id === paramId);
        const isRatio = param?.param_type === 'ratio';
        if (isRatio) {
          const rawMin = normalizeDisplayedRatio(Number(g.minLeft), Number(g.min)) ?? 0;
          const rawMax = normalizeDisplayedRatio(Number(g.maxLeft), Number(g.max)) ?? 0;
          return {
            category_id: cat.id, parameter_id: paramId,
            goal_min: Math.min(rawMin, rawMax),
            goal_max: Math.max(rawMin, rawMax),
          };
        }
        return { category_id: cat.id, parameter_id: paramId, goal_min: Number(g.min), goal_max: Number(g.max) };
      });
      if (goalInserts.length) {
        const { error: goalErr } = await supabase.from('category_goals').insert(goalInserts);
        if (goalErr) throw goalErr;
      }

      return cat.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category created! Now add your first recipe.', {
        description: 'You\'ve been taken to the recipe builder.',
      });
      // Navigate to the category detail page and auto-open the New Recipe form
      navigate(`/categories/${id}`, { state: { openNewRecipe: true } });
    },
    onError: (err: Error) => {
      toast.error('Failed to create category', { description: err.message });
    },
  });

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/categories"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7"/>
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Category</h1>
          <p className="text-sm text-gray-500 mt-0.5">Set up a recipe category with nutrition goals</p>
        </div>
      </div>

      <div className="space-y-6">

        {/* ── Category name ────────────────────────────────── */}
        <div className="card max-w-sm">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">Category Details</h2>
          </div>
          <div className="card-body">
            <label className="label">Category name <span className="text-red-500">*</span></label>
            <input
              className={`input ${submitted && !name.trim() ? '!border-red-400 focus:!ring-red-300 bg-red-50' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Burger, Salad"
            />
            {submitted && !name.trim() && (
              <p className="text-[11px] text-red-500 mt-1 font-medium">Category name is required.</p>
            )}
          </div>
        </div>

        {/* ── Two-column: Nutrition Goals + Component Headers ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT — Nutrition Goals */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="font-semibold text-gray-900">Nutrition Goals</h2>
                <p className="text-xs text-gray-400 mt-0.5">Select parameters and set ranges</p>
              </div>
              {(parameters?.length ?? 0) > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    ref={paramSelectRef}
                    type="checkbox"
                    className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                    checked={allParamSel}
                    onChange={handleSelectAllParams}
                  />
                  <span className="text-sm font-medium text-violet-700">
                    {allParamSel ? 'Deselect all' : 'Select all'}
                  </span>
                </label>
              )}
            </div>

            {submitted && (hasParamErrors || hasRangeErrors) && (
              <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium space-y-1">
                {hasParamErrors && <p>Please fill in Min and Max values for all selected parameters.</p>}
                {hasRangeErrors && <p>Min value cannot be greater than Max value for highlighted parameters.</p>}
              </div>
            )}

            <div className="card-body space-y-2">
              {parameters?.map((p) => {
                const isChecked = selectedParams[p.id] != null;
                const higher    = p.direction === 'higher_is_better';
                return (
                  <div key={p.id} className={`rounded-xl px-3 py-2.5 transition-colors ${submitted && rangeErrors[p.id] ? 'bg-red-50' : isChecked ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
                    {/* Line 1: checkbox + name + direction */}
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded accent-violet-600 cursor-pointer flex-shrink-0"
                        checked={isChecked}
                        onChange={(e) => toggleParam(p.id, e.target.checked)}
                      />
                      <span className="text-sm text-gray-800 font-medium">{p.name}</span>
                      <span className={`text-xs font-medium whitespace-nowrap ${higher ? 'text-emerald-600' : 'text-rose-500'}`}>
                        ({higher ? 'Higher is better' : 'Lower is better'})
                      </span>
                    </label>
                    {/* Line 2: min/max inputs (only when checked) */}
                    {isChecked && (
                      <div className="flex items-center gap-3 mt-2 ml-6 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 w-6">Min</span>
                          {p.unit === 'ratio' ? (
                            <>
                              <input
                                type="number"
                                placeholder="1"
                                className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                                value={selectedParams[p.id].minLeft}
                                onChange={(e) => setSelectedParams((s) => ({ ...s, [p.id]: { ...s[p.id], minLeft: e.target.value } }))}
                              />
                              <span className="text-xs text-violet-600 font-bold font-mono">:</span>
                              <input
                                type="number"
                                placeholder="0"
                                className={`w-14 border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent ${submitted && paramErrors[p.id]?.min ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                                value={selectedParams[p.id].min}
                                onChange={(e) => setSelectedParams((s) => ({ ...s, [p.id]: { ...s[p.id], min: e.target.value } }))}
                              />
                            </>
                          ) : (
                            <input
                              type="number"
                              placeholder="0"
                              className={`w-20 border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent ${submitted && paramErrors[p.id]?.min ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                              value={selectedParams[p.id].min}
                              onChange={(e) => setSelectedParams((s) => ({ ...s, [p.id]: { ...s[p.id], min: e.target.value } }))}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 w-7">Max</span>
                          {p.unit === 'ratio' ? (
                            <>
                              <input
                                type="number"
                                placeholder="1"
                                className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                                value={selectedParams[p.id].maxLeft}
                                onChange={(e) => setSelectedParams((s) => ({ ...s, [p.id]: { ...s[p.id], maxLeft: e.target.value } }))}
                              />
                              <span className="text-xs text-violet-600 font-bold font-mono">:</span>
                              <input
                                type="number"
                                placeholder="0"
                                className={`w-14 border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent ${submitted && paramErrors[p.id]?.max ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                                value={selectedParams[p.id].max}
                                onChange={(e) => setSelectedParams((s) => ({ ...s, [p.id]: { ...s[p.id], max: e.target.value } }))}
                              />
                            </>
                          ) : (
                            <input
                              type="number"
                              placeholder="100"
                              className={`w-20 border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent ${submitted && paramErrors[p.id]?.max ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                              value={selectedParams[p.id].max}
                              onChange={(e) => setSelectedParams((s) => ({ ...s, [p.id]: { ...s[p.id], max: e.target.value } }))}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {isChecked && submitted && rangeErrors[p.id] && (
                      <p className="text-[11px] text-red-500 font-medium pl-6 mt-0.5">
                        ⚠ Min value cannot be greater than Max value
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT — Component Headers */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="font-semibold text-gray-900">Component Headers</h2>
                <p className="text-xs text-gray-400 mt-0.5">Select components for this category</p>
              </div>
              {(componentLibrary?.length ?? 0) > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    ref={compSelectRef}
                    type="checkbox"
                    className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                    checked={allCompSel}
                    onChange={handleSelectAllComps}
                  />
                  <span className="text-sm font-medium text-violet-700">
                    {allCompSel ? 'Deselect all' : 'Select all'}
                  </span>
                </label>
              )}
            </div>

            <div className="card-body space-y-2">
              {(componentLibrary?.length ?? 0) === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  <p>No components defined yet.</p>
                  <Link to="/settings/components" className="text-violet-600 hover:underline text-xs mt-1 inline-block">
                    Add components in Settings →
                  </Link>
                </div>
              ) : (
                componentLibrary?.map((c) => {
                  const isChecked = selectedComps.has(c.id);
                  return (
                    <div key={c.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${isChecked ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
                      <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded accent-violet-600 cursor-pointer flex-shrink-0"
                          checked={isChecked}
                          onChange={(e) => toggleComp(c.id, e.target.checked)}
                        />
                        <span className="text-sm text-gray-800 font-medium">{c.name}</span>
                      </label>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* ── Actions ───────────────────────────────────── */}
        <div className="flex gap-3 pb-8">
          <button
            type="button"
            className="btn-primary px-8"
            onClick={() => {
              setSubmitted(true);
              if (!isFormValid) return;
              createCategory.mutate();
            }}
            disabled={createCategory.isPending}
          >
            {createCategory.isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Creating…
              </span>
            ) : 'Create Category'}
          </button>
          <Link to="/categories" className="btn-secondary px-8">Cancel</Link>
        </div>

      </div>
    </div>
  );
}
