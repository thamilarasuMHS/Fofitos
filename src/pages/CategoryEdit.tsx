import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { NutritionParameter, ComponentLibrary, CategoryGoal, CategoryComponent } from '@/types/database';
import { normalizeDisplayedRatio, isRatioRangeValid } from '@/utils/ratioUtils';
import { computeTotals, scoreParameter, overallScore } from '@/lib/scoring';
import { useAuth } from '@/hooks/useAuth';

export function CategoryEdit() {
  const { categoryId }  = useParams<{ categoryId: string }>();
  const navigate        = useNavigate();
  const queryClient     = useQueryClient();
  const { profile }     = useAuth();

  const [name, setName]                     = useState('');
  const [selectedParams, setSelectedParams] = useState<Record<string, { min: string; max: string; minLeft: string; maxLeft: string }>>({});
  const [selectedComps, setSelectedComps]   = useState<Set<string>>(new Set());
  const [submitted, setSubmitted]           = useState(false);
  const [initialized, setInitialized]       = useState(false);

  /* Maps parameter display name → NutritionTotals key (mirrors RecipeDetail.tsx) */
  const nameToKey: Record<string, string> = {
    'Calories': 'calories', 'Protein': 'protein_g', 'Carbs': 'carbs_g',
    'Fat': 'fat_g', 'Fibre': 'fibre_g', 'Omega-3': 'omega3_g',
    'Omega-6': 'omega6_g', 'Sodium': 'sodium_mg', 'Added Sugar': 'added_sugar_g',
  };

  /* ── Fetch existing data ───────────────────────────────── */
  const { data: category } = useQuery({
    queryKey: ['category', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('id', categoryId!).single();
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase.from('nutrition_parameters').select('*').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return data as NutritionParameter[];
    },
  });

  const { data: componentLibrary } = useQuery({
    queryKey: ['component_library'],
    queryFn: async () => {
      const { data, error } = await supabase.from('component_library').select('*').order('sort_order');
      if (error) throw error;
      return data as ComponentLibrary[];
    },
  });

  /* ── Pre-fill form once all data arrives ───────────────── */
  useEffect(() => {
    if (initialized || !category || !goals || !components || !componentLibrary) return;

    // Name
    setName(category.name ?? '');

    // Nutrition goals — keyed by parameter_id.
    // Stored value = normalizedRatio = first/second (A/B).
    //
    // Pre-fill uses ratioDisplayOrder to restore correct Min/Max labels:
    //   When goal_min < 1 AND goal_max ≥ 1 (e.g. Protein:Carb: 0.4 and 1),
    //   the scalar sort during save inverted the labels — swap back so the
    //   Min input shows the user's original Min entry (e.g. "1:1") and the
    //   Max input shows the user's original Max entry (e.g. "1:2.5").
    //
    // ratioToInputs conversion:
    //   stored ≥ 1  →  left=stored, right=1      (e.g. 4  → "4 : 1")
    //   stored < 1  →  left=1, right=1/stored     (e.g. 0.4 → "1 : 2.5")
    // Round-trip on re-save is exact:
    //   stored ≥ 1: normalizeDisplayedRatio(stored, 1) = stored/1 = stored ✓
    //   stored < 1: normalizeDisplayedRatio(1, 1/stored) = 1/(1/stored) = stored ✓
    function ratioToInputs(stored: number | null): { left: string; right: string } {
      if (stored == null) return { left: '1', right: '' };
      if (stored >= 1) return { left: String(stored), right: '1' };
      const inv = parseFloat((1 / stored).toFixed(6));
      return { left: '1', right: String(inv) };
    }
    const paramMap: Record<string, { min: string; max: string; minLeft: string; maxLeft: string }> = {};
    for (const g of goals) {
      // Determine which stored value is the semantic Min and which is the semantic Max
      const isInverted = g.goal_min != null && g.goal_max != null && g.goal_min < 1 && g.goal_max >= 1;
      const semanticMin = isInverted ? g.goal_max : g.goal_min;
      const semanticMax = isInverted ? g.goal_min : g.goal_max;
      const minInputs = ratioToInputs(semanticMin);
      const maxInputs = ratioToInputs(semanticMax);
      paramMap[g.parameter_id] = {
        minLeft: minInputs.left,
        min:     minInputs.right,
        maxLeft: maxInputs.left,
        max:     maxInputs.right,
      };
    }
    setSelectedParams(paramMap);

    // Components — match saved component names back to library IDs
    const compNames = new Set(components.map((c) => c.name.toLowerCase()));
    const selectedIds = new Set(
      componentLibrary
        .filter((lib) => compNames.has(lib.name.toLowerCase()))
        .map((lib) => lib.id)
    );
    setSelectedComps(selectedIds);

    setInitialized(true);
  }, [category, goals, components, componentLibrary, initialized]);

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
    if (checked) setSelectedParams((s) => ({ ...s, [id]: s[id] ?? { min: '', max: '', minLeft: '1', maxLeft: '1' } }));
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

  // Range check: both components must be non-decreasing (minLeft ≤ maxLeft AND minRight ≤ maxRight).
  // This handles left-increases (Carb:Fibre 1:1→4:1), right-increases (Protein:Carb 1:1→1:2.5), and rejects reversals.
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

  /* ── Component Headers — select-all logic ─────────────── */
  const allCompIds  = componentLibrary?.map((c) => c.id) ?? [];
  const allCompSel  = allCompIds.length > 0 && allCompIds.every((id) => selectedComps.has(id));
  const someCompSel = selectedComps.size > 0 && !allCompSel;
  const compSelectRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (compSelectRef.current) compSelectRef.current.indeterminate = someCompSel;
  }, [someCompSel]);

  function handleSelectAllComps() {
    if (allCompSel) setSelectedComps(new Set());
    else setSelectedComps(new Set(allCompIds));
  }
  function toggleComp(id: string, checked: boolean) {
    setSelectedComps((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  /* ── Recalculate score snapshots for all recipes after goal change ───────── */
  async function recalcScoresForCategory(catId: string): Promise<number> {
    // 1. Fetch freshly saved goals
    const { data: newGoals } = await supabase
      .from('category_goals').select('*').eq('category_id', catId);

    // 2. Fetch all nutrition parameters
    const { data: params } = await supabase
      .from('nutrition_parameters').select('*');

    if (!newGoals?.length || !params?.length) return 0;

    // 3. Fetch all non-deleted recipes in this category
    const { data: recipes } = await supabase
      .from('recipes').select('id').eq('category_id', catId).is('deleted_at', null);

    if (!recipes?.length) return 0;

    let count = 0;
    for (const recipe of recipes) {
      // 4. Get latest version for this recipe
      const { data: versions } = await supabase
        .from('recipe_versions').select('id')
        .eq('recipe_id', recipe.id)
        .order('version_number', { ascending: false })
        .limit(1);

      const version = versions?.[0];
      if (!version) continue;

      // 5. Get its ingredients
      const { data: ingredients } = await supabase
        .from('recipe_ingredients')
        .select('quantity_g, calories, protein_g, carbs_g, fat_g, fibre_g, omega3_g, omega6_g, sodium_mg, added_sugar_g')
        .eq('recipe_version_id', version.id);

      if (!ingredients?.length) continue;

      // 6. Compute totals
      const totals = computeTotals(ingredients) as unknown as Record<string, number>;

      // 7. Score each goal (same logic as RecipeDetail.tsx)
      const paramScores: Record<string, number> = {};
      const goalSnap: Record<string, { min: number; max: number }> = {};

      for (const g of newGoals) {
        const param = (params as NutritionParameter[]).find((p) => p.id === g.parameter_id);
        if (!param) continue;

        let actual = 0;
        if (param.param_type === 'absolute') {
          actual = totals[nameToKey[param.name] ?? ''] ?? 0;
        } else {
          // Ratio: numerator / denominator (stored as A/B scalar)
          const numParam = params.find((p) => p.id === param.numerator_param_id);
          const denParam = params.find((p) => p.id === param.denominator_param_id);
          const n = numParam ? (totals[nameToKey[numParam.name] ?? ''] ?? 0) : 0;
          const d = denParam ? (totals[nameToKey[denParam.name] ?? ''] ?? 0) : 0;
          actual = d > 0 ? n / d : 0;
        }

        paramScores[param.id] = scoreParameter(actual, g.goal_min, g.goal_max, param.direction);
        goalSnap[param.name] = { min: g.goal_min, max: g.goal_max };
      }

      // 8. Insert snapshot tagged 'goal_update'
      await supabase.from('score_snapshots').insert({
        recipe_version_id: version.id,
        overall_score: overallScore(Object.values(paramScores)),
        parameter_scores: paramScores,
        goal_snapshot: goalSnap,
        triggered_by: 'goal_update',
        actor_id: profile?.id ?? null,
      });

      count++;
    }
    return count;
  }

  /* ── Save (update) ─────────────────────────────────────── */
  const updateCategory = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error('No category ID');

      // 1. Update category name
      const { error: catErr } = await supabase
        .from('categories')
        .update({ name: name.trim() })
        .eq('id', categoryId);
      if (catErr) throw catErr;

      // 2. Replace nutrition goals.
      //    Ratio storage: normalizedRatio = A / B (first ÷ second).
      //    We sort the two computed values so goal_min ≤ goal_max always,
      //    satisfying the DB constraint regardless of which side increases
      //    (e.g. Protein:Carb 1:1→1:2.5 gives raw [1, 0.4]; stored as [0.4, 1]).
      const { error: delGoalErr } = await supabase.from('category_goals').delete().eq('category_id', categoryId);
      if (delGoalErr) throw delGoalErr;
      const goalInserts = Object.entries(selectedParams).map(([paramId, g]) => {
        const param = parameters?.find((p) => p.id === paramId);
        const isRatio = param?.param_type === 'ratio';
        if (isRatio) {
          const rawMin = normalizeDisplayedRatio(Number(g.minLeft), Number(g.min)) ?? 0;
          const rawMax = normalizeDisplayedRatio(Number(g.maxLeft), Number(g.max)) ?? 0;
          return {
            category_id: categoryId, parameter_id: paramId,
            goal_min: Math.min(rawMin, rawMax),
            goal_max: Math.max(rawMin, rawMax),
          };
        }
        return { category_id: categoryId, parameter_id: paramId, goal_min: Number(g.min), goal_max: Number(g.max) };
      });
      if (goalInserts.length) {
        const { error: goalErr } = await supabase.from('category_goals').insert(goalInserts);
        if (goalErr) throw goalErr;
      }

      // 3. Replace components (preserve library sort order)
      const { error: delCompErr } = await supabase.from('category_components').delete().eq('category_id', categoryId);
      if (delCompErr) throw delCompErr;
      const compInserts = (componentLibrary ?? [])
        .filter((c) => selectedComps.has(c.id))
        .map((c, i) => ({ category_id: categoryId, name: c.name, sort_order: i }));
      if (compInserts.length) {
        const { error: compErr } = await supabase.from('category_components').insert(compInserts);
        if (compErr) throw compErr;
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['category', categoryId] });
      queryClient.invalidateQueries({ queryKey: ['category_goals', categoryId] });
      queryClient.invalidateQueries({ queryKey: ['category_components', categoryId] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });

      // Recalculate score snapshots for all recipes in this category
      const toastId = toast.loading('Recalculating recipe scores…');
      try {
        const count = await recalcScoresForCategory(categoryId!);
        toast.dismiss(toastId);
        if (count > 0) {
          toast.success(`Category updated — scores recalculated for ${count} recipe${count > 1 ? 's' : ''}.`);
        } else {
          toast.success('Category updated successfully.');
        }
      } catch {
        toast.dismiss(toastId);
        toast.success('Category updated successfully.');
      }

      navigate(`/categories/${categoryId}`);
    },
    onError: (err: Error) => {
      toast.error('Failed to update category', { description: err.message });
    },
  });

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/categories/${categoryId}`}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7"/>
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Category</h1>
          <p className="text-sm text-gray-500 mt-0.5">Update nutrition goals and components</p>
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
              updateCategory.mutate();
            }}
            disabled={updateCategory.isPending}
          >
            {updateCategory.isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving…
              </span>
            ) : 'Save Changes'}
          </button>
          <Link to={`/categories/${categoryId}`} className="btn-secondary px-8">Cancel</Link>
        </div>

      </div>
    </div>
  );
}
