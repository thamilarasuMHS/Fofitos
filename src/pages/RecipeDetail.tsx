import { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { computeTotals, overallScore, scoreParameter, getScoreColor } from '@/lib/scoring';
import { downloadRecipePdf } from '@/lib/pdfExport';
import { logActivity } from '@/lib/activityLog';
import type {
  Recipe,
  RecipeVersion,
  RecipeIngredient,
  Category,
  CategoryGoal,
  CategoryComponent,
  NutritionParameter,
  IngredientDatabase,
  SauceLibrary,
  SauceIngredient,
  RawCookedEnum,
} from '@/types/database';

/* ─── Nutrition field definitions ─────────────────────────────────────────── */
const NUTRIENT_KEYS = [
  'calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g',
  'omega3_g', 'omega6_g', 'sodium_mg', 'added_sugar_g',
] as const;
type NutrKey = typeof NUTRIENT_KEYS[number];

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

/* ─── Main RecipeDetail ───────────────────────────────────────────────────── */
export function RecipeDetail() {
  const { categoryId, recipeId } = useParams<{ categoryId: string; recipeId: string }>();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'ingredients' | 'nutrition' | 'scoring' | 'history' | 'compare'>('ingredients');
  const [versionId, setVersionId] = useState<string | null>(null);

  const { data: recipe } = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('recipes').select('*').eq('id', recipeId!).single();
      if (error) throw error;
      return data as Recipe;
    },
    enabled: !!recipeId,
  });

  const { data: versions } = useQuery({
    queryKey: ['recipe_versions', recipeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_versions').select('*').eq('recipe_id', recipeId!).order('version_number');
      if (error) throw error;
      return data as RecipeVersion[];
    },
    enabled: !!recipeId,
  });

  const currentVersionId = versionId || versions?.[versions.length - 1]?.id || null;
  const currentVersion   = versions?.find((v) => v.id === currentVersionId);

  const { data: ingredients } = useQuery({
    queryKey: ['recipe_ingredients', currentVersionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_ingredients').select('*').eq('recipe_version_id', currentVersionId!).order('sort_order');
      if (error) throw error;
      return data as RecipeIngredient[];
    },
    enabled: !!currentVersionId,
  });

  const { data: category } = useQuery({
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

  const totals = useMemo(() => {
    if (!ingredients) return null;
    return computeTotals(ingredients);
  }, [ingredients]);

  const nameToKey: Record<string, keyof NonNullable<typeof totals>> = {
    'Calories': 'calories', 'Protein': 'protein_g', 'Carbs': 'carbs_g', 'Fat': 'fat_g', 'Fibre': 'fibre_g',
    'Omega-3': 'omega3_g', 'Omega-6': 'omega6_g', 'Sodium': 'sodium_mg', 'Added Sugar': 'added_sugar_g',
  };

  const parameterScores = useMemo(() => {
    if (!totals || !goals || !parameters) return null;
    const scores: Record<string, number> = {};
    for (const g of goals) {
      const param = parameters.find((p) => p.id === g.parameter_id);
      if (!param) continue;
      let actual: number;
      if (param.param_type === 'absolute') {
        actual = totals[nameToKey[param.name] ?? 'protein_g'] ?? 0;
      } else {
        const numParam = parameters.find((p) => p.id === param.numerator_param_id);
        const denParam = parameters.find((p) => p.id === param.denominator_param_id);
        const numKey = numParam ? nameToKey[numParam.name] : null;
        const denKey = denParam ? nameToKey[denParam.name] : null;
        const n = numKey ? totals[numKey] ?? 0 : 0;
        const d = denKey ? totals[denKey] ?? 0 : 0;
        actual = d ? n / d : 0;
      }
      scores[param.id] = scoreParameter(actual, g.goal_min, g.goal_max, param.direction);
    }
    return scores;
  }, [totals, goals, parameters]);

  const overall = useMemo(() => {
    if (!parameterScores) return null;
    return overallScore(Object.values(parameterScores));
  }, [parameterScores]);

  const { data: scoreSnapshots } = useQuery({
    queryKey: ['score_snapshots', currentVersionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('score_snapshots').select('*').eq('recipe_version_id', currentVersionId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as {
        id: string; overall_score: number; parameter_scores: Record<string, number>;
        goal_snapshot: Record<string, { min: number; max: number }>;
        triggered_by: string; actor_id: string | null; created_at: string;
      }[];
    },
    enabled: !!currentVersionId && activeTab === 'history',
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (!currentVersionId) return;
      const { error } = await supabase
        .from('recipe_versions').update({ updated_at: new Date().toISOString() }).eq('id', currentVersionId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipe_versions', recipeId] }),
  });

  const submitRecipe = useMutation({
    mutationFn: async (payload: {
      versionId: string; recipeId: string;
      parameterScores: Record<string, number>;
      goals: CategoryGoal[]; parameters: NutritionParameter[]; actorId: string;
    }) => {
      const { versionId, recipeId: rid, parameterScores: scores, goals: gs, parameters: params, actorId } = payload;
      if (!ingredients || ingredients.length === 0) {
        throw new Error('Add at least one ingredient before submitting.');
      }
      const missing = ingredients.some((i) =>
        NUTRIENT_KEYS.some((k) => {
          const v = (i as unknown as Record<string, unknown>)[k];
          return v == null || Number(v) <= 0;
        })
      );
      if (missing) throw new Error('All nutrition values for every ingredient must be filled in and greater than 0 before submitting.');
      const { error } = await supabase
        .from('recipe_versions')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', versionId);
      if (error) throw error;
      const goalSnapshot: Record<string, { min: number; max: number }> = {};
      for (const g of gs) {
        const param = params.find((p) => p.id === g.parameter_id);
        if (param) goalSnapshot[param.name] = { min: g.goal_min, max: g.goal_max };
      }
      await supabase.from('score_snapshots').insert({
        recipe_version_id: versionId,
        overall_score: overallScore(Object.values(scores)),
        parameter_scores: scores,
        goal_snapshot: goalSnapshot,
        triggered_by: 'recipe_save',
        actor_id: actorId,
      });
      await logActivity('recipe_submitted', 'recipe_version', versionId, { recipe_id: rid });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe_versions', recipeId] });
      queryClient.invalidateQueries({ queryKey: ['recipe_ingredients', currentVersionId] });
      queryClient.invalidateQueries({ queryKey: ['score_snapshots', currentVersionId] });
    },
  });

  const createVersion = useMutation({
    mutationFn: async () => {
      if (!recipeId || !currentVersionId || !profile?.id) return;
      const nextNum = (versions?.length ?? 0) + 1;
      const { data: newVersion, error: verErr } = await supabase
        .from('recipe_versions')
        .insert({ recipe_id: recipeId, version_number: nextNum, parent_version_id: currentVersionId, status: 'draft', created_by: profile.id })
        .select('id').single();
      if (verErr || !newVersion) throw verErr;
      const { data: ingRows } = await supabase.from('recipe_ingredients').select('*').eq('recipe_version_id', currentVersionId);
      if (ingRows?.length) {
        const copies = ingRows.map(({ id: _id, created_at: _c, updated_at: _u, recipe_version_id: _vid, ...rest }) => ({
          ...rest, recipe_version_id: newVersion.id,
        }));
        await supabase.from('recipe_ingredients').insert(copies);
      }
      await supabase.from('recipe_versions').update({ locked: true }).eq('id', currentVersionId);
      return newVersion.id;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['recipe_versions', recipeId] });
      setVersionId(newId);
    },
  });

  const canEdit = currentVersion?.status === 'draft' && !currentVersion?.locked &&
    (profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'dietician');
  const canDownloadPdf   = profile?.role === 'admin' || profile?.role === 'manager';
  const canApproveRecipe = (profile?.role === 'admin' || profile?.role === 'manager') && currentVersion?.status === 'submitted';
  const canRequestDeletion = profile?.role === 'manager' && recipe;

  const approveRecipe = useMutation({
    mutationFn: async (approve: boolean) => {
      if (!currentVersionId || !profile?.id) return;
      const { error } = await supabase.from('recipe_versions').update({
        status: approve ? 'approved' : 'changes_requested',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      }).eq('id', currentVersionId);
      if (error) throw error;
      if (approve && totals && parameterScores && goals && parameters) {
        const goalSnapshot: Record<string, { min: number; max: number }> = {};
        for (const g of goals) {
          const param = parameters.find((p) => p.id === g.parameter_id);
          if (param) goalSnapshot[param.name] = { min: g.goal_min, max: g.goal_max };
        }
        await supabase.from('score_snapshots').insert({
          recipe_version_id: currentVersionId,
          overall_score: overallScore(Object.values(parameterScores)),
          parameter_scores: parameterScores,
          goal_snapshot: goalSnapshot,
          triggered_by: 'recipe_save',
          actor_id: profile.id,
        });
      }
      await logActivity(approve ? 'recipe_approved' : 'recipe_changes_requested', 'recipe_version', currentVersionId, { recipe_id: recipeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe_versions', recipeId] });
      queryClient.invalidateQueries({ queryKey: ['score_snapshots', currentVersionId] });
    },
  });

  const requestDeletion = useMutation({
    mutationFn: async () => {
      if (!recipeId || !profile?.id) return;
      const { error } = await supabase.from('deletion_requests').insert({ recipe_id: recipeId, requested_by: profile.id });
      if (error) throw error;
      await logActivity('deletion_requested', 'recipe', recipeId, {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deletion_requests'] }),
  });

  const handleDownloadPdf = () => {
    if (!recipe || !category || !currentVersion || !totals || !parameterScores || !goals || !parameters) return;
    const ingredientsByComponent = (components ?? []).map((comp) => ({
      componentName: comp.name,
      rows: (ingredients ?? []).filter((i) => i.category_component_id === comp.id).map((i) => ({
        name: i.custom_name || 'Ingredient',
        quantity_g: i.quantity_g,
        raw_cooked: i.raw_cooked,
      })),
    }));
    const parameterScoresWithNames = goals.map((g) => {
      const param = parameters.find((p) => p.id === g.parameter_id);
      return { paramName: param?.name ?? '', score: param ? (parameterScores[param.id] ?? 0) : 0, goalMin: g.goal_min, goalMax: g.goal_max };
    });
    downloadRecipePdf({
      recipeName: recipe.name,
      categoryName: category.name,
      versionNumber: currentVersion.version_number,
      ingredientsByComponent,
      totals,
      parameterScores: parameterScoresWithNames,
      overallScore: overall ?? 0,
    });
  };

  if (!recipe || !category) return <p className="text-gray-500">Loading...</p>;

  const tabs = [
    { id: 'ingredients' as const, label: 'Ingredients' },
    { id: 'nutrition'   as const, label: 'Nutrition'   },
    { id: 'scoring'     as const, label: 'Scoring'     },
    { id: 'history'     as const, label: 'Score History' },
    { id: 'compare'     as const, label: 'Version Comparison' },
  ];

  return (
    <div>
      {/* Back link */}
      <div className="mb-4">
        <Link to={`/categories/${categoryId}`} className="text-gray-600 hover:underline">← {category.name}</Link>
      </div>

      {/* Recipe title + actions */}
      <h1 className="text-2xl font-semibold text-gray-800">{recipe.name}</h1>
      <div className="mt-2 flex items-center gap-4 flex-wrap">
        {canDownloadPdf && (
          <button type="button" className="bg-gray-800 text-white px-3 py-1 rounded text-sm" onClick={handleDownloadPdf}>
            Download PDF
          </button>
        )}
        {canApproveRecipe && (
          <>
            <button type="button" className="bg-green-600 text-white px-3 py-1 rounded text-sm" onClick={() => approveRecipe.mutate(true)}>
              Approve recipe
            </button>
            <button type="button" className="bg-amber-600 text-white px-3 py-1 rounded text-sm" onClick={() => approveRecipe.mutate(false)}>
              Request changes
            </button>
          </>
        )}
        {canRequestDeletion && (
          <button type="button" className="text-red-600 text-sm hover:underline"
            onClick={() => { if (window.confirm('Request deletion of this recipe? An admin must approve.')) requestDeletion.mutate(); }}>
            Request deletion
          </button>
        )}
        {versions && versions.length >= 1 && (
          <>
            <span className="text-sm text-gray-600">Version:</span>
            <select className="border rounded px-2 py-1 text-sm" value={currentVersionId ?? ''}
              onChange={(e) => setVersionId(e.target.value || null)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>v{v.version_number} {v.locked ? '(locked)' : ''} — {v.status}</option>
              ))}
            </select>
            {canEdit && (
              <button type="button" className="text-sm text-blue-600 hover:underline"
                onClick={() => createVersion.mutate()} disabled={createVersion.isPending}>
                Create new version
              </button>
            )}
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mt-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t.id} type="button"
            className={`px-3 py-2 text-sm ${activeTab === t.id ? 'border-b-2 border-gray-900 font-medium' : 'text-gray-600'}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Ingredients tab ─────────────────────────────────────────────────── */}
      {activeTab === 'ingredients' && (
        <div className="mt-4">
          <div className="space-y-4">
            {(components ?? []).map((comp) => (
              <ComponentIngredientCard
                key={comp.id}
                component={comp}
                ingredients={(ingredients ?? []).filter((i) => i.category_component_id === comp.id)}
                recipeVersionId={currentVersionId!}
                canEdit={canEdit}
                onChanged={() => queryClient.invalidateQueries({ queryKey: ['recipe_ingredients', currentVersionId] })}
              />
            ))}
          </div>
          {canEdit && (
            <div className="mt-4 flex gap-2">
              <button type="button" className="bg-gray-600 text-white px-4 py-2 rounded" onClick={() => saveDraft.mutate()}>
                Save as Draft
              </button>
              <button
                type="button"
                className="bg-gray-900 text-white px-4 py-2 rounded"
                onClick={() => {
                  if (!currentVersionId || !parameterScores || !goals || !parameters || !profile?.id) return;
                  submitRecipe.mutate({
                    versionId: currentVersionId,
                    recipeId: recipeId!,
                    parameterScores,
                    goals,
                    parameters,
                    actorId: profile.id,
                  });
                }}
                disabled={submitRecipe.isPending}
              >
                Save & Submit
              </button>
              {submitRecipe.error && (
                <span className="text-red-600 text-sm">{(submitRecipe.error as Error).message}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Nutrition tab ──────────────────────────────────────────────────── */}
      {activeTab === 'nutrition' && totals && (
        <div className="mt-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {goals && parameters && goals.length > 0 ? (
              goals.map((g) => {
                const param = parameters.find((p) => p.id === g.parameter_id);
                if (!param) return null;

                /* Compute actual value */
                let value: number | null = null;
                if (param.param_type === 'absolute') {
                  const k = nameToKey[param.name];
                  value = k != null ? (totals[k] ?? null) : null;
                } else {
                  const numParam = parameters.find((p) => p.id === param.numerator_param_id);
                  const denParam = parameters.find((p) => p.id === param.denominator_param_id);
                  const nk = numParam ? nameToKey[numParam.name] : null;
                  const dk = denParam ? nameToKey[denParam.name] : null;
                  const n = nk ? (totals[nk] ?? 0) : 0;
                  const d = dk ? (totals[dk] ?? 0) : 0;
                  value = d ? n / d : null;
                }

                /* Unit label */
                const unit =
                  param.name === 'Calories' ? 'kcal' :
                  param.name === 'Sodium'   ? 'mg'   :
                  param.param_type === 'ratio' ? '' : 'g';

                /* Decimals */
                const decimals = param.name === 'Sodium' ? 0 : 1;

                return (
                  <div key={g.id} className="card p-4">
                    <p className="text-xs font-medium text-gray-500 mb-1">{param.name}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {value != null ? value.toFixed(decimals) : '—'}
                      {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Goal: {g.goal_min} – {g.goal_max}
                      {unit && <span className="ml-0.5">{unit}</span>}
                    </p>
                  </div>
                );
              })
            ) : (
              /* Fallback: show all 9 totals if goals not loaded */
              NUTR_FIELDS.map(({ key, label, unit }) => (
                <div key={key} className="card p-4">
                  <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {totals[key].toFixed(key === 'sodium_mg' ? 0 : 1)}
                    <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Scoring tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'scoring' && (
        <div className="mt-5 space-y-5">
          {/* Empty / loading state */}
          {(!parameterScores || overall == null || !goals || !parameters) && (
            <div className="card p-10 text-center">
              <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-gray-500 text-sm">Add ingredients and fill in all nutrition values to see scores.</p>
            </div>
          )}

          {parameterScores && overall != null && goals && parameters && (() => {
            const overallColor = getScoreColor(overall);
            const overallLabel =
              overallColor === 'green'  ? 'Excellent' :
              overallColor === 'orange' ? 'Needs Improvement' : 'Poor';

            return (
              <>
                {/* ── Overall Score hero ─────────────────────────────────── */}
                <div className={`card p-6 border-l-4 ${
                  overallColor === 'green'  ? 'border-green-500'  :
                  overallColor === 'orange' ? 'border-amber-500'  : 'border-red-500'
                }`}>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    {/* Big number */}
                    <div className="text-center shrink-0">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Overall Score</p>
                      <p className={`text-6xl font-bold leading-none ${
                        overallColor === 'green'  ? 'text-green-600'  :
                        overallColor === 'orange' ? 'text-amber-600'  : 'text-red-600'
                      }`}>
                        {overall.toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">out of 100</p>
                    </div>

                    {/* Bar + label */}
                    <div className="flex-1 w-full">
                      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                        <span>0</span>
                        <span className={`font-semibold ${
                          overallColor === 'green'  ? 'text-green-600'  :
                          overallColor === 'orange' ? 'text-amber-600'  : 'text-red-600'
                        }`}>{overallLabel}</span>
                        <span>100</span>
                      </div>
                      <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            overallColor === 'green'  ? 'bg-green-500'  :
                            overallColor === 'orange' ? 'bg-amber-500'  : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.max(2, overall)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-2 text-right">
                        {goals.length} parameter{goals.length !== 1 ? 's' : ''} evaluated
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Parameter Breakdown ────────────────────────────────── */}
                <div className="card overflow-hidden">
                  <div className="card-header">
                    <h3 className="font-semibold text-gray-900">Parameter Breakdown</h3>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"/>100</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"/>50–99</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"/>0–49</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px]">
                      <thead>
                        <tr>
                          <th className="th text-left">Parameter</th>
                          <th className="th">Actual</th>
                          <th className="th">Goal Range</th>
                          <th className="th">Direction</th>
                          <th className="th">Score</th>
                          <th className="th min-w-[160px]">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goals.map((g) => {
                          const param = parameters.find((p) => p.id === g.parameter_id);
                          if (!param) return null;
                          const score = parameterScores[param.id] ?? 0;
                          const color = getScoreColor(score);

                          /* Compute actual value for this parameter */
                          let actual: number | null = null;
                          if (totals) {
                            if (param.param_type === 'absolute') {
                              const k = nameToKey[param.name];
                              actual = k != null ? (totals[k] ?? null) : null;
                            } else {
                              const numP = parameters.find((p) => p.id === param.numerator_param_id);
                              const denP = parameters.find((p) => p.id === param.denominator_param_id);
                              const nk = numP ? nameToKey[numP.name] : null;
                              const dk = denP ? nameToKey[denP.name] : null;
                              const n = nk ? (totals[nk] ?? 0) : 0;
                              const d = dk ? (totals[dk] ?? 0) : 0;
                              actual = d ? n / d : null;
                            }
                          }

                          const unit =
                            param.name === 'Calories'      ? 'kcal' :
                            param.name === 'Sodium'        ? 'mg'   :
                            param.param_type === 'ratio'   ? ''     : 'g';
                          const decimals = param.name === 'Sodium' ? 0 : 1;

                          /* Is actual within goal range? */
                          const withinRange = actual != null && actual >= g.goal_min && actual <= g.goal_max;

                          return (
                            <tr key={g.id} className="hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                              {/* Name */}
                              <td className="td font-medium text-gray-900">{param.name}</td>

                              {/* Actual value */}
                              <td className="td text-center">
                                <span className={`font-semibold ${
                                  withinRange ? 'text-green-700' :
                                  color === 'orange' ? 'text-amber-700' : 'text-red-700'
                                }`}>
                                  {actual != null ? actual.toFixed(decimals) : '—'}
                                </span>
                                {unit && <span className="text-xs text-gray-400 ml-0.5">{unit}</span>}
                              </td>

                              {/* Goal range */}
                              <td className="td text-center text-sm text-gray-500">
                                {g.goal_min}
                                <span className="text-gray-300 mx-0.5">–</span>
                                {g.goal_max}
                                {unit && <span className="text-xs text-gray-400 ml-0.5">{unit}</span>}
                              </td>

                              {/* Direction */}
                              <td className="td text-center">
                                <span className={`badge text-[11px] ${
                                  param.direction === 'higher_is_better'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50  text-amber-700'
                                }`}>
                                  {param.direction === 'higher_is_better' ? '↑ Higher' : '↓ Lower'}
                                </span>
                              </td>

                              {/* Score badge */}
                              <td className="td text-center">
                                <span className={`inline-flex items-center justify-center w-12 h-7 rounded-lg text-sm font-bold ${
                                  color === 'green'  ? 'bg-green-100  text-green-700'  :
                                  color === 'orange' ? 'bg-amber-100  text-amber-700'  :
                                                       'bg-red-100    text-red-700'
                                }`}>
                                  {score.toFixed(0)}
                                </span>
                              </td>

                              {/* Progress bar */}
                              <td className="td">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        color === 'green'  ? 'bg-green-500'  :
                                        color === 'orange' ? 'bg-amber-500'  : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.max(2, score)}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-400 w-7 text-right shrink-0">
                                    {score.toFixed(0)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Scoring legend ─────────────────────────────────────── */}
                <div className="card p-4 bg-gray-50/60">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">How Scoring Works</p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Each parameter scores <span className="font-semibold text-gray-700">100</span> when the actual value falls within the goal range.
                    Outside the range, the score decreases based on the % deviation from the nearest boundary
                    (5 points lost per 1% deviation). The overall score is the average across all parameters.
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Score History tab ───────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="mt-4 space-y-4">

          {/* Empty state */}
          {scoreSnapshots?.length === 0 && (
            <div className="card flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-violet-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <p className="font-semibold text-gray-700">No score history yet</p>
              <p className="text-sm text-gray-400 mt-1 max-w-xs">
                Score snapshots are recorded each time this recipe version is submitted for approval.
              </p>
            </div>
          )}

          {scoreSnapshots?.map((s) => {
            const overall   = s.overall_score;
            /* ── colour helpers based on score ── */
            const scoreAccent = overall >= 90 ? 'bg-emerald-400'
                              : overall >= 70 ? 'bg-amber-400'
                              :                 'bg-red-400';
            const scoreText   = overall >= 90 ? 'text-emerald-600'
                              : overall >= 70 ? 'text-amber-500'
                              :                 'text-red-500';
            const scoreBg     = overall >= 90 ? 'bg-emerald-50 ring-emerald-200'
                              : overall >= 70 ? 'bg-amber-50  ring-amber-200'
                              :                 'bg-red-50    ring-red-200';
            const scoreBar    = overall >= 90 ? 'bg-emerald-500'
                              : overall >= 70 ? 'bg-amber-400'
                              :                 'bg-red-400';

            const fmtDate = new Date(s.created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            });
            const fmtTime = new Date(s.created_at).toLocaleTimeString('en-GB', {
              hour: '2-digit', minute: '2-digit',
            });
            const isRecipeSave = s.triggered_by === 'recipe_save';
            const paramEntries = Object.entries(s.parameter_scores);

            return (
              <div key={s.id} className="card overflow-hidden">

                {/* Top accent stripe */}
                <div className={`h-1 w-full ${scoreAccent}`} />

                {/* Card header — date + trigger badge */}
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <span className="text-sm font-semibold text-gray-700">{fmtDate}</span>
                    <span className="text-xs text-gray-400">{fmtTime}</span>
                  </div>
                  <span className={`badge text-[11px] font-semibold ${
                    isRecipeSave
                      ? 'bg-violet-50 text-violet-700'
                      : 'bg-amber-50  text-amber-700'
                  }`}>
                    {isRecipeSave
                      ? <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                          Recipe Save
                        </span>
                      : <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                          Goal Update
                        </span>
                    }
                  </span>
                </div>

                {/* Card body — overall score + parameter breakdown */}
                <div className="p-5 flex flex-col sm:flex-row gap-5">

                  {/* ── Overall score panel ──────────────────────── */}
                  <div className={`flex flex-col items-center justify-center rounded-2xl ring-2 px-6 py-5 shrink-0 sm:w-36 ${scoreBg}`}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Overall</p>
                    <p className={`text-5xl font-extrabold tabular-nums leading-none ${scoreText}`}>
                      {overall.toFixed(0)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 font-medium">/ 100</p>
                    {/* Mini progress bar */}
                    <div className="mt-3 w-full bg-white/60 rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full ${scoreBar}`} style={{ width: `${overall}%` }} />
                    </div>
                    <p className={`text-[11px] font-semibold mt-2 ${scoreText}`}>
                      {overall >= 90 ? '🏆 Excellent' : overall >= 70 ? '👍 Good' : '⚠️ Needs work'}
                    </p>
                  </div>

                  {/* ── Parameter breakdown ──────────────────────── */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                      Parameter Breakdown
                    </p>
                    <div className="space-y-3">
                      {paramEntries.map(([paramId, paramScore]) => {
                        const param     = parameters?.find((p) => p.id === paramId);
                        const paramName = param?.name ?? paramId;
                        const goal      = s.goal_snapshot?.[paramName];
                        const ps = paramScore as number;

                        const pBarColor  = ps >= 90 ? 'bg-emerald-500'
                                         : ps >= 70 ? 'bg-amber-400'
                                         :            'bg-red-400';
                        const pTextColor = ps >= 90 ? 'text-emerald-700'
                                         : ps >= 70 ? 'text-amber-600'
                                         :            'text-red-600';
                        const pBadge     = ps >= 90 ? 'bg-emerald-50 text-emerald-700'
                                         : ps >= 70 ? 'bg-amber-50  text-amber-600'
                                         :            'bg-red-50    text-red-600';

                        return (
                          <div key={paramId}>
                            {/* Label row */}
                            <div className="flex items-center justify-between mb-1 gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-semibold text-gray-800 truncate">{paramName}</span>
                                {goal && (
                                  <span className="text-[10px] text-gray-400 shrink-0 hidden sm:inline">
                                    Goal: {goal.min}–{goal.max} {param?.unit ?? ''}
                                  </span>
                                )}
                              </div>
                              <span className={`badge text-[11px] font-bold shrink-0 ${pBadge}`}>
                                <span className={pTextColor}>{ps.toFixed(0)}</span>
                              </span>
                            </div>
                            {/* Goal range label on mobile */}
                            {goal && (
                              <p className="text-[10px] text-gray-400 mb-1 sm:hidden">
                                Goal: {goal.min}–{goal.max} {param?.unit ?? ''}
                              </p>
                            )}
                            {/* Progress bar */}
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${pBarColor}`}
                                style={{ width: `${ps}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Version Comparison tab ──────────────────────────────────────────── */}
      {activeTab === 'compare' && (
        <VersionComparison
          versions={versions ?? []}
          recipeId={recipeId!}
          categoryId={categoryId!}
          goals={goals ?? []}
          parameters={parameters ?? []}
        />
      )}
    </div>
  );
}

/* ─── Scale helper ─────────────────────────────────────────────────────────── */
function scaleFrom100g(per100: number | null | undefined, quantityG: number): number {
  if (per100 == null) return 0;
  return (per100 / 100) * quantityG;
}

/* ─── Per-component ingredient card (display + inline add form) ─────────────── */
function ComponentIngredientCard({
  component,
  ingredients,
  recipeVersionId,
  canEdit,
  onChanged,
}: {
  component: CategoryComponent;
  ingredients: RecipeIngredient[];
  recipeVersionId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [ingType, setIngType]           = useState<'ingredient' | 'subcomponent' | ''>('');
  const [search, setSearch]             = useState('');
  const [selectedIng, setSelectedIng]   = useState<IngredientDatabase | null>(null);
  const [selectedSauce, setSelectedSauce] = useState<SauceLibrary | null>(null);
  const [sauceIngData, setSauceIngData] = useState<SauceIngredient | null>(null);
  const [quantity, setQuantity]         = useState('');
  const [rawCooked, setRawCooked]       = useState<RawCookedEnum | ''>('');
  const [nutr, setNutr] = useState<Record<NutrKey, string>>({
    calories: '', protein_g: '', carbs_g: '', fat_g: '',
    fibre_g: '', omega3_g: '', omega6_g: '', sodium_mg: '', added_sugar_g: '',
  });
  const [submitted, setSubmitted]         = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const [editingIng, setEditingIng]       = useState<RecipeIngredient | null>(null);
  const [editForm, setEditForm]           = useState<Record<string, string>>({});

  const { user }      = useAuth();
  const queryClient   = useQueryClient();

  /* ── Autocomplete search ── */
  const { data: dbIngredients } = useQuery({
    queryKey: ['ingredient_db_search', search],
    queryFn: async () => {
      if (!search.trim()) return [];
      const { data, error } = await supabase
        .from('ingredient_database')
        .select('*')
        .is('deleted_at', null)
        .ilike('name', `%${search.trim()}%`)
        .limit(10);
      if (error) throw error;
      return data as IngredientDatabase[];
    },
    enabled: search.trim().length > 0,
  });

  const { data: dbSauces } = useQuery({
    queryKey: ['sauce_db_search', search],
    queryFn: async () => {
      if (!search.trim()) return [];
      const { data, error } = await supabase
        .from('sauce_library')
        .select('*')
        .ilike('name', `%${search.trim()}%`)
        .limit(10);
      if (error) throw error;
      return data as SauceLibrary[];
    },
    enabled: search.trim().length > 0,
  });

  function applyScale(ing: IngredientDatabase, q: number) {
    setNutr({
      calories:      scaleFrom100g(ing.calories_per_100g,      q).toFixed(2),
      protein_g:     scaleFrom100g(ing.protein_g_per_100g,     q).toFixed(2),
      carbs_g:       scaleFrom100g(ing.carbs_g_per_100g,       q).toFixed(2),
      fat_g:         scaleFrom100g(ing.fat_g_per_100g,         q).toFixed(2),
      fibre_g:       scaleFrom100g(ing.fibre_g_per_100g,       q).toFixed(2),
      omega3_g:      scaleFrom100g(ing.omega3_g_per_100g,      q).toFixed(2),
      omega6_g:      scaleFrom100g(ing.omega6_g_per_100g,      q).toFixed(2),
      sodium_mg:     scaleFrom100g(ing.sodium_mg_per_100g,     q).toFixed(2),
      added_sugar_g: scaleFrom100g(ing.added_sugar_g_per_100g, q).toFixed(2),
    });
  }

  function selectIngredient(ing: IngredientDatabase) {
    setIngType('ingredient');
    setSelectedIng(ing);
    setSelectedSauce(null); setSauceIngData(null);
    setSearch(ing.name);
    setRawCooked(ing.raw_cooked as RawCookedEnum);
    setShowDropdown(false);
    const q = Number(quantity);
    if (q > 0) applyScale(ing, q);
  }

  async function selectSauce(sauce: SauceLibrary) {
    setIngType('subcomponent');
    setSelectedSauce(sauce);
    setSelectedIng(null);
    setSearch(sauce.name);
    setShowDropdown(false);
    const { data } = await supabase
      .from('sauce_ingredients')
      .select('*')
      .eq('sauce_id', sauce.id)
      .limit(1)
      .maybeSingle();
    if (data) {
      setSauceIngData(data as SauceIngredient);
      const q = Number(quantity);
      if (q > 0) applySauceScale(data as SauceIngredient, q);
    }
  }

  function applySauceScale(ing: SauceIngredient, q: number) {
    // Nutrition values in sauce_ingredients are stored as per-100g values
    // (matching the "per 100g" label in AddItemScreen / SauceEditModal)
    const scale = q / 100;
    setNutr({
      calories:      (ing.calories      * scale).toFixed(2),
      protein_g:     (ing.protein_g     * scale).toFixed(2),
      carbs_g:       (ing.carbs_g       * scale).toFixed(2),
      fat_g:         (ing.fat_g         * scale).toFixed(2),
      fibre_g:       (ing.fibre_g       * scale).toFixed(2),
      omega3_g:      (ing.omega3_g      * scale).toFixed(2),
      omega6_g:      (ing.omega6_g      * scale).toFixed(2),
      sodium_mg:     (ing.sodium_mg     * scale).toFixed(2),
      added_sugar_g: (ing.added_sugar_g * scale).toFixed(2),
    });
  }

  /* ── Auto-bind on exact name match (no click needed) ── */
  useEffect(() => {
    if (!dbIngredients || selectedIng) return;
    const match = dbIngredients.find(
      (ing) => ing.name.toLowerCase() === search.trim().toLowerCase()
    );
    if (match) selectIngredient(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbIngredients]);

  useEffect(() => {
    if (!dbSauces || selectedSauce) return;
    const match = dbSauces.find(
      (sauce) => sauce.name.toLowerCase() === search.trim().toLowerCase()
    );
    if (match) void selectSauce(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbSauces]);

  function handleQuantityChange(val: string) {
    setQuantity(val);
    const q = Number(val);
    if (ingType === 'ingredient' && selectedIng && q > 0) applyScale(selectedIng, q);
    if (ingType === 'subcomponent' && sauceIngData && q > 0) applySauceScale(sauceIngData, q);
  }

  function handleTypeChange(t: 'ingredient' | 'subcomponent' | '') {
    setIngType(t);
    setSearch(''); setSelectedIng(null); setSelectedSauce(null); setSauceIngData(null);
    setQuantity(''); setRawCooked('');
    setNutr({ calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', omega3_g: '', omega6_g: '', sodium_mg: '', added_sugar_g: '' });
    setSubmitted(false);
  }

  /* ── Remove mutation ── */
  const removeIng = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipe_ingredients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  /* ── Update mutation ── */
  const updateIng = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from('recipe_ingredients').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { setEditingIng(null); setEditForm({}); onChanged(); },
  });

  /* ── Add mutation ── */
  const addIng = useMutation({
    mutationFn: async () => {
      const name = ingType === 'ingredient'
        ? (selectedIng ? selectedIng.name : search.trim())
        : (selectedSauce ? selectedSauce.name : search.trim());
      const q = Number(quantity);

      /* 1 ── Save to recipe_ingredients */
      const payload: Record<string, unknown> = {
        recipe_version_id:     recipeVersionId,
        category_component_id: component.id,
        custom_name:           name,
        quantity_g:            q,
        raw_cooked:            ingType === 'subcomponent' ? 'cooked' : (rawCooked as RawCookedEnum),
        sauce_id:              ingType === 'subcomponent' ? (selectedSauce?.id ?? null) : null,
      };
      for (const { key } of NUTR_FIELDS) {
        payload[key] = nutr[key] !== '' ? Number(nutr[key]) : null;
      }
      const { error: riErr } = await supabase.from('recipe_ingredients').insert(payload);
      if (riErr) throw riErr;

      /* 2 ── Save to ingredient_database only for brand-new regular ingredients */
      if (ingType === 'ingredient' && !selectedIng) {
        const { data: existing } = await supabase
          .from('ingredient_database')
          .select('id')
          .ilike('name', name)
          .is('deleted_at', null)
          .maybeSingle();

        if (!existing) {
          const to100g = (val: string) => {
            const n = Number(val);
            if (!n || !q) return 0;
            return Number(((n / q) * 100).toFixed(4));
          };

          const dbPayload = {
            name,
            raw_cooked:             rawCooked as RawCookedEnum,
            calories_per_100g:      to100g(nutr.calories),
            protein_g_per_100g:     to100g(nutr.protein_g),
            carbs_g_per_100g:       to100g(nutr.carbs_g),
            fat_g_per_100g:         to100g(nutr.fat_g),
            fibre_g_per_100g:       to100g(nutr.fibre_g),
            omega3_g_per_100g:      to100g(nutr.omega3_g),
            omega6_g_per_100g:      to100g(nutr.omega6_g),
            sodium_mg_per_100g:     to100g(nutr.sodium_mg),
            added_sugar_g_per_100g: to100g(nutr.added_sugar_g),
            created_by:             user?.id ?? null,
          };

          const { error: dbErr } = await supabase.from('ingredient_database').insert(dbPayload);
          if (dbErr) throw dbErr;
        }
      }
    },
    onSuccess: () => {
      setSearch(''); setSelectedIng(null); setSelectedSauce(null); setSauceIngData(null);
      setQuantity(''); setRawCooked('');
      setNutr({ calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', omega3_g: '', omega6_g: '', sodium_mg: '', added_sugar_g: '' });
      setSubmitted(false);
      queryClient.invalidateQueries({ queryKey: ['ingredient_db_search'] });
      queryClient.invalidateQueries({ queryKey: ['ingredient_database'] });
      onChanged();
    },
  });

  function handleAdd() {
    setSubmitted(true);
    const name = ingType === 'ingredient'
      ? (selectedIng ? selectedIng.name : search.trim())
      : ingType === 'subcomponent'
      ? (selectedSauce ? selectedSauce.name : search.trim())
      : search.trim();
    if (!ingType || !name || !(Number(quantity) > 0)) return;
    if (ingType === 'ingredient' && !rawCooked) return;
    addIng.mutate();
  }

  const typeErr  = submitted && !ingType;
  const nameErr  = submitted && !search.trim() && !selectedIng && !selectedSauce;
  const qtyErr   = submitted && !(Number(quantity) > 0);
  const stateErr = submitted && ingType === 'ingredient' && !rawCooked;

  function handleEditSave() {
    if (!editingIng) return;
    const updates: Record<string, unknown> = {
      custom_name: editForm.custom_name || null,
      quantity_g:  Number(editForm.quantity_g),
      raw_cooked:  editForm.raw_cooked || null,
    };
    for (const k of NUTRIENT_KEYS) {
      updates[k] = editForm[k] !== '' ? Number(editForm[k]) : null;
    }
    updateIng.mutate({ id: editingIng.id, updates });
  }

  return (
    <>
    <div className="card overflow-hidden">
      {/* ── Header ── */}
      <div className="card-header">
        <h3 className="font-semibold text-gray-900">{component.name}</h3>
        <span className="badge bg-violet-50 text-violet-700">
          {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Ingredients table ── */}
      {ingredients.length > 0 && (
        <div className="overflow-x-auto border-b border-gray-100">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr>
                <th className="th text-left">Name</th>
                <th className="th">Qty (g)</th>
                <th className="th">State</th>
                {NUTR_FIELDS.map(({ key, label }) => (
                  <th key={key} className="th">{label}</th>
                ))}
                {canEdit && <th className="th w-28" />}
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing) => (
                <tr key={ing.id} className="hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                  <td className="td font-medium text-gray-900">{ing.custom_name || '—'}</td>
                  <td className="td text-center text-gray-600">{ing.quantity_g}</td>
                  <td className="td text-center">
                    <span className={`badge ${ing.raw_cooked === 'raw' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {ing.raw_cooked}
                    </span>
                  </td>
                  {NUTRIENT_KEYS.map((k) => {
                    const v = (ing as unknown as Record<string, unknown>)[k];
                    const missing = v == null;
                    return (
                      <td key={k} className={`td text-center text-xs ${missing ? 'text-red-400 font-medium' : 'text-gray-600'}`}>
                        {missing ? '—' : Number(v).toFixed(1)}
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className="td text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          className="btn-secondary py-0.5 px-2 text-xs"
                          onClick={() => {
                            const f: Record<string, string> = {
                              custom_name: ing.custom_name ?? '',
                              quantity_g:  String(ing.quantity_g),
                              raw_cooked:  ing.raw_cooked ?? '',
                            };
                            for (const k of NUTRIENT_KEYS) {
                              const v = (ing as unknown as Record<string, unknown>)[k];
                              f[k] = v != null ? String(v) : '';
                            }
                            setEditForm(f);
                            setEditingIng(ing);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-danger py-0.5 px-2 text-xs"
                          disabled={removeIng.isPending}
                          onClick={() => removeIng.mutate(ing.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add ingredient form (edit mode only) ── */}
      {canEdit && (
        <div className="px-5 py-4 bg-gray-50/40 space-y-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Add Ingredient
          </p>

          {/* Type + Name + Qty + State — single row */}
          <div className="flex flex-wrap gap-3 items-end">

            {/* Type */}
            <div className="w-36 shrink-0">
              <label className="label">Type <span className="text-red-500">*</span></label>
              <select
                className={typeErr ? 'select !border-red-400 focus:!ring-red-300' : 'select'}
                value={ingType}
                onChange={(e) => handleTypeChange(e.target.value as 'ingredient' | 'subcomponent' | '')}
              >
                <option value="">Select…</option>
                <option value="ingredient">Ingredient</option>
                <option value="subcomponent">Sub Component</option>
              </select>
              {typeErr && <p className="text-[11px] text-red-500 mt-0.5">Required</p>}
            </div>

            {/* Name with autocomplete */}
            <div className="flex-1 min-w-[180px] relative">
              <label className="label">
                {ingType === 'subcomponent' ? 'Sub Component' : 'Ingredient'} name{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                className={nameErr ? 'input !border-red-400 focus:!ring-red-300' : 'input'}
                value={search}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearch(val);
                  setShowDropdown(true);
                  if (ingType === 'ingredient' && selectedIng) {
                    setSelectedIng(null);
                    setRawCooked('');
                    setNutr({ calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', omega3_g: '', omega6_g: '', sodium_mg: '', added_sugar_g: '' });
                  }
                  if (ingType === 'subcomponent' && selectedSauce) {
                    setSelectedSauce(null);
                    setSauceIngData(null);
                    setNutr({ calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', omega3_g: '', omega6_g: '', sodium_mg: '', added_sugar_g: '' });
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder={ingType === 'ingredient' ? 'Search or type ingredient name…' : 'Search sub component…'}
              />
              {nameErr && <p className="text-[11px] text-red-500 mt-0.5">Name is required</p>}

              {/* Combined autocomplete — shows both ingredients and sub components */}
              {showDropdown && ((dbIngredients && dbIngredients.length > 0) || (dbSauces && dbSauces.length > 0)) && (
                <ul className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-full mt-1 max-h-56 overflow-auto">
                  {(dbIngredients ?? []).map((ing) => (
                    <li
                      key={`ing-${ing.id}`}
                      className="px-3 py-2 cursor-pointer hover:bg-violet-50 flex items-center justify-between text-sm"
                      onMouseDown={() => selectIngredient(ing)}
                    >
                      <span className="font-medium text-gray-900">{ing.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="badge text-[10px] bg-violet-50 text-violet-700">Ingredient</span>
                        <span className={`badge text-[10px] ${ing.raw_cooked === 'raw' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {ing.raw_cooked}
                        </span>
                      </div>
                    </li>
                  ))}
                  {(dbSauces ?? []).map((sauce) => (
                    <li
                      key={`sauce-${sauce.id}`}
                      className="px-3 py-2 cursor-pointer hover:bg-amber-50 flex items-center justify-between text-sm"
                      onMouseDown={() => selectSauce(sauce)}
                    >
                      <span className="font-medium text-gray-900">{sauce.name}</span>
                      <span className="badge text-[10px] bg-amber-50 text-amber-700">Sub Component</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Qty */}
            <div className="w-28">
              <label className="label">Qty (g) <span className="text-red-500">*</span></label>
              <input
                type="number" step="any" min="0"
                className={qtyErr ? 'input !border-red-400 focus:!ring-red-300' : 'input'}
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="0"
              />
              {qtyErr && <p className="text-[11px] text-red-500 mt-0.5">Required &gt; 0</p>}
            </div>

            {/* State — only for ingredient type */}
            {ingType === 'ingredient' && (
              <div className="w-32">
                <label className="label">State</label>
                <select
                  disabled={!!selectedIng}
                  className={
                    selectedIng
                      ? 'select bg-gray-50 text-gray-400 cursor-not-allowed opacity-75'
                      : stateErr ? 'select !border-red-400 focus:!ring-red-300' : 'select'
                  }
                  value={rawCooked}
                  onChange={(e) => { if (!selectedIng) setRawCooked(e.target.value as RawCookedEnum | ''); }}
                >
                  <option value="">Select…</option>
                  <option value="raw">Raw</option>
                  <option value="cooked">Cooked</option>
                </select>
                {stateErr && !selectedIng && <p className="text-[11px] text-red-500 mt-0.5">Required</p>}
              </div>
            )}
          </div>

          {/* Nutrition fields */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[11px] text-gray-400">
                Nutrition <span className="text-gray-300">(values for this quantity)</span>
              </p>
              {(selectedIng || selectedSauce) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-500 bg-violet-50 px-2 py-0.5 rounded-full">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                  </svg>
                  Auto-filled · clear name to edit
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
              {NUTR_FIELDS.map(({ key, label, unit }) => (
                <div key={key}>
                  <label className="block text-[10px] font-medium text-gray-400 mb-0.5">
                    {label} <span className="text-gray-300">({unit})</span>
                  </label>
                  <input
                    type="number" step="any" min="0"
                    readOnly={!!(selectedIng || selectedSauce)}
                    className={
                      (selectedIng || selectedSauce)
                        ? 'w-full border border-gray-100 rounded-lg px-2 py-1.5 text-xs bg-gray-50 text-gray-400 cursor-not-allowed select-none outline-none'
                        : 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-transparent transition-all'
                    }
                    value={nutr[key]}
                    onChange={(e) => { if (!(selectedIng || selectedSauce)) setNutr((n) => ({ ...n, [key]: e.target.value })); }}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Add button */}
          <div>
            <button type="button" className="btn-primary" onClick={handleAdd} disabled={addIng.isPending}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M12 4v16m8-8H4" />
              </svg>
              {addIng.isPending ? 'Adding…' : 'Add Ingredient'}
            </button>
            {addIng.isError && (
              <p className="text-red-600 text-sm mt-1">{(addIng.error as Error).message}</p>
            )}
          </div>
        </div>
      )}
    </div>

    {/* ── Edit ingredient modal ── */}
    {editingIng && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-gray-900">Edit Ingredient</h3>
              <p className="text-xs text-gray-400 mt-0.5">{editingIng.custom_name}</p>
            </div>
            <button
              type="button"
              onClick={() => { setEditingIng(null); setEditForm({}); }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">

            {/* Name / Qty / State */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={editForm.custom_name ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, custom_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Qty (g)</label>
                <input
                  type="number" step="any" min="0"
                  className="input"
                  value={editForm.quantity_g ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, quantity_g: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">State</label>
                <select
                  className="select"
                  value={editForm.raw_cooked ?? ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, raw_cooked: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="raw">Raw</option>
                  <option value="cooked">Cooked</option>
                </select>
              </div>
            </div>

            {/* Nutrition fields */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Nutrition (values for this quantity)
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {NUTR_FIELDS.map(({ key, label, unit }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-medium text-gray-400 mb-0.5">
                      {label} <span className="text-gray-300">({unit})</span>
                    </label>
                    <input
                      type="number" step="any" min="0"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-transparent transition-all"
                      value={editForm[key] ?? ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-gray-100">
            {updateIng.isError && (
              <p className="text-red-600 text-sm mr-auto">{(updateIng.error as Error).message}</p>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setEditingIng(null); setEditForm({}); }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={updateIng.isPending}
              onClick={handleEditSave}
            >
              {updateIng.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/* ─── Version Comparison ──────────────────────────────────────────────────── */
function VersionComparison({
  versions,
  goals,
  parameters,
}: {
  versions: RecipeVersion[];
  recipeId: string;
  categoryId: string;
  goals: CategoryGoal[];
  parameters: NutritionParameter[];
}) {
  const [v1Id, setV1Id] = useState(versions[0]?.id ?? '');
  const [v2Id, setV2Id] = useState(versions[1]?.id ?? '');

  const { data: ing1 } = useQuery({
    queryKey: ['recipe_ingredients', v1Id],
    queryFn: async () => {
      const { data, error } = await supabase.from('recipe_ingredients').select('*').eq('recipe_version_id', v1Id).order('sort_order');
      if (error) throw error;
      return data as RecipeIngredient[];
    },
    enabled: !!v1Id,
  });
  const { data: ing2 } = useQuery({
    queryKey: ['recipe_ingredients', v2Id],
    queryFn: async () => {
      const { data, error } = await supabase.from('recipe_ingredients').select('*').eq('recipe_version_id', v2Id).order('sort_order');
      if (error) throw error;
      return data as RecipeIngredient[];
    },
    enabled: !!v2Id,
  });

  const totals1 = useMemo(() => (ing1 ? computeTotals(ing1) : null), [ing1]);
  const totals2 = useMemo(() => (ing2 ? computeTotals(ing2) : null), [ing2]);

  const ntk: Record<string, keyof NonNullable<typeof totals1>> = {
    'Calories': 'calories', 'Protein': 'protein_g', 'Carbs': 'carbs_g', 'Fat': 'fat_g', 'Fibre': 'fibre_g',
    'Omega-3': 'omega3_g', 'Omega-6': 'omega6_g', 'Sodium': 'sodium_mg', 'Added Sugar': 'added_sugar_g',
  };

  const buildScores = (t: typeof totals1) => {
    if (!t || !goals.length) return null;
    const s: Record<string, number> = {};
    for (const g of goals) {
      const param = parameters.find((p) => p.id === g.parameter_id);
      if (!param) continue;
      let actual: number;
      if (param.param_type === 'absolute') {
        actual = t[ntk[param.name] ?? 'protein_g'] ?? 0;
      } else {
        const numParam = parameters.find((p) => p.id === param.numerator_param_id);
        const denParam = parameters.find((p) => p.id === param.denominator_param_id);
        const n = numParam ? (t[ntk[numParam.name] ?? 0] ?? 0) : 0;
        const d = denParam ? (t[ntk[denParam.name] ?? 0] ?? 0) : 0;
        actual = d ? n / d : 0;
      }
      s[param.id] = scoreParameter(actual, g.goal_min, g.goal_max, param.direction);
    }
    return s;
  };

  const scores1  = useMemo(() => buildScores(totals1), [totals1, goals, parameters]);
  const scores2  = useMemo(() => buildScores(totals2), [totals2, goals, parameters]);
  const overall1 = scores1 ? overallScore(Object.values(scores1)) : null;
  const overall2 = scores2 ? overallScore(Object.values(scores2)) : null;
  const v1 = versions.find((v) => v.id === v1Id);
  const v2 = versions.find((v) => v.id === v2Id);

  /* ── UI helpers (display only) ───────────────────────────────────────── */
  const scoreLabel = (s: number | null) =>
    s == null ? '—' : s >= 80 ? 'Excellent' : s >= 50 ? 'Needs Improvement' : 'Poor';
  const scoreRing = (s: number | null) =>
    s == null ? 'text-gray-400' : s >= 80 ? 'text-green-600' : s >= 50 ? 'text-amber-600' : 'text-red-600';
  const scoreBar = (s: number | null) =>
    s == null ? 'bg-gray-300' : s >= 80 ? 'bg-green-500' : s >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const statusCls = (st: string | undefined) => {
    if (st === 'approved')           return 'bg-green-50 text-green-700';
    if (st === 'submitted')          return 'bg-blue-50 text-blue-700';
    if (st === 'changes_requested')  return 'bg-amber-50 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };
  const nutrChips = [
    { label: 'Calories', unit: 'kcal', v1: totals1?.calories,   v2: totals2?.calories   },
    { label: 'Protein',  unit: 'g',    v1: totals1?.protein_g,  v2: totals2?.protein_g  },
    { label: 'Carbs',    unit: 'g',    v1: totals1?.carbs_g,    v2: totals2?.carbs_g    },
    { label: 'Fat',      unit: 'g',    v1: totals1?.fat_g,      v2: totals2?.fat_g      },
    { label: 'Fibre',    unit: 'g',    v1: totals1?.fibre_g,    v2: totals2?.fibre_g    },
    { label: 'Sodium',   unit: 'mg',   v1: totals1?.sodium_mg,  v2: totals2?.sodium_mg  },
  ];

  return (
    <div className="mt-6 space-y-5">

      {/* ── Version selector bar ───────────────────────────────────────────── */}
      <div className="card">
        <div className="card-body">
          <div className="flex flex-wrap items-center gap-8">
            {/* Version A selector */}
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-violet-100 text-violet-700 shrink-0">
                A
              </span>
              <div>
                <label className="label">Version A</label>
                <select className="select" value={v1Id} onChange={(e) => setV1Id(e.target.value)}>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>v{v.version_number} — {v.status}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Swap icon */}
            <div className="flex items-center self-end pb-1">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>

            {/* Version B selector */}
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-amber-100 text-amber-700 shrink-0">
                B
              </span>
              <div>
                <label className="label">Version B</label>
                <select className="select" value={v2Id} onChange={(e) => setV2Id(e.target.value)}>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>v{v.version_number} — {v.status}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Nutrition totals comparison row ────────────────────────────────── */}
      {(totals1 || totals2) && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h3 className="font-semibold text-gray-900">Nutrition Totals</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr>
                  <th className="th text-left">Nutrient</th>
                  <th className="th">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center">A</span>
                      {v1 ? `v${v1.version_number}` : '—'}
                    </span>
                  </th>
                  <th className="th">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center">B</span>
                      {v2 ? `v${v2.version_number}` : '—'}
                    </span>
                  </th>
                  <th className="th">Δ Difference</th>
                </tr>
              </thead>
              <tbody>
                {nutrChips.map(({ label, unit, v1: a, v2: b }) => {
                  const diff = a != null && b != null ? b - a : null;
                  return (
                    <tr key={label} className="hover:bg-gray-50/50 border-b border-gray-50 last:border-0">
                      <td className="td font-medium text-gray-700">{label}</td>
                      <td className="td text-center text-gray-600">
                        {a != null ? <>{a.toFixed(1)}<span className="text-xs text-gray-400 ml-0.5">{unit}</span></> : '—'}
                      </td>
                      <td className="td text-center text-gray-600">
                        {b != null ? <>{b.toFixed(1)}<span className="text-xs text-gray-400 ml-0.5">{unit}</span></> : '—'}
                      </td>
                      <td className="td text-center">
                        {diff != null ? (
                          <span className={`text-sm font-medium ${diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                            <span className="text-xs ml-0.5">{unit}</span>
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Side-by-side version cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* ─ Version A card ─ */}
        <div className="card overflow-hidden">
          <div className="h-1 bg-violet-500" />
          <div className="card-header">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">A</span>
              <span className="font-semibold text-gray-900">
                {v1 ? `Version ${v1.version_number}` : 'Version A'}
              </span>
            </div>
            {v1 && (
              <span className={`badge capitalize ${statusCls(v1.status)}`}>{v1.status.replace('_', ' ')}</span>
            )}
          </div>
          <div className="card-body space-y-4">
            {/* Overall score */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Overall Score</p>
              <div className="flex items-end gap-3">
                <span className={`text-4xl font-bold leading-none ${scoreRing(overall1)}`}>
                  {overall1 != null ? overall1.toFixed(1) : '—'}
                </span>
                <div className="flex-1 pb-1">
                  <p className={`text-xs font-medium mb-1 ${scoreRing(overall1)}`}>{scoreLabel(overall1)}</p>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${scoreBar(overall1)}`}
                      style={{ width: `${overall1 != null ? Math.max(2, overall1) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* Ingredient list */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Ingredients{ing1?.length ? ` (${ing1.length})` : ''}
              </p>
              {ing1 && ing1.length > 0 ? (
                <ul className="space-y-1.5">
                  {ing1.map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                      <span className="font-medium text-gray-800">{i.custom_name || i.id.slice(0, 8)}</span>
                      <span className="text-gray-400 text-xs">{i.quantity_g}g</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 text-sm italic">No ingredients</p>
              )}
            </div>
          </div>
        </div>

        {/* ─ Version B card ─ */}
        <div className="card overflow-hidden">
          <div className="h-1 bg-amber-500" />
          <div className="card-header">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">B</span>
              <span className="font-semibold text-gray-900">
                {v2 ? `Version ${v2.version_number}` : 'Version B'}
              </span>
            </div>
            {v2 && (
              <span className={`badge capitalize ${statusCls(v2.status)}`}>{v2.status.replace('_', ' ')}</span>
            )}
          </div>
          <div className="card-body space-y-4">
            {/* Overall score */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Overall Score</p>
              <div className="flex items-end gap-3">
                <span className={`text-4xl font-bold leading-none ${scoreRing(overall2)}`}>
                  {overall2 != null ? overall2.toFixed(1) : '—'}
                </span>
                <div className="flex-1 pb-1">
                  <p className={`text-xs font-medium mb-1 ${scoreRing(overall2)}`}>{scoreLabel(overall2)}</p>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${scoreBar(overall2)}`}
                      style={{ width: `${overall2 != null ? Math.max(2, overall2) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* Ingredient list */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Ingredients{ing2?.length ? ` (${ing2.length})` : ''}
              </p>
              {ing2 && ing2.length > 0 ? (
                <ul className="space-y-1.5">
                  {ing2.map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                      <span className="font-medium text-gray-800">{i.custom_name || i.id.slice(0, 8)}</span>
                      <span className="text-gray-400 text-xs">{i.quantity_g}g</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 text-sm italic">No ingredients</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
