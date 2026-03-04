import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/* ── Types ─────────────────────────────────────────────── */
type NutrKey =
  | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g'
  | 'omega3_g' | 'omega6_g' | 'sodium_mg' | 'added_sugar_g';

const NUTRITION_FIELDS: { key: NutrKey; label: string; unit: string }[] = [
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

/* ── SauceNew page ──────────────────────────────────────── */
export function SauceNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [batchTotal, setBatchTotal] = useState('');
  const [nutrForm, setNutrForm] = useState<Record<NutrKey, string>>({ ...EMPTY_NUTR });
  const [submitted, setSubmitted] = useState(false);

  function setField(key: NutrKey, value: string) {
    setNutrForm((f) => ({ ...f, [key]: value }));
  }

  /* ── Validation ─────────────────────────────────────── */
  const nameErr    = submitted && !name.trim();
  const batchErr   = submitted && (batchTotal.trim() === '' || Number(batchTotal) <= 0);
  const nutrErrors = NUTRITION_FIELDS.reduce<Record<NutrKey, boolean>>(
    (acc, { key }) => ({
      ...acc,
      [key]: submitted && (nutrForm[key] === '' || Number(nutrForm[key]) <= 0),
    }),
    {} as Record<NutrKey, boolean>
  );
  const isFormValid =
    name.trim() !== '' &&
    batchTotal.trim() !== '' && Number(batchTotal) > 0 &&
    NUTRITION_FIELDS.every(({ key }) => nutrForm[key] !== '' && Number(nutrForm[key]) > 0);

  /* ── Input class helpers ─────────────────────────────── */
  function topInputCls(hasError: boolean) {
    return `input${hasError ? ' !border-red-400 focus:!ring-red-300' : ''}`;
  }
  function nutrInputCls(hasError: boolean) {
    return `w-32 border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all placeholder:text-gray-300 ${
      hasError
        ? 'border-red-400 focus:ring-red-300'
        : 'border-gray-200 focus:ring-violet-400'
    }`;
  }

  /* ── Save ────────────────────────────────────────────── */
  const saveSauce = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Not authenticated');
      const batch = Number(batchTotal);
      const { data: newSauce, error } = await supabase
        .from('sauce_library')
        .insert({ name: name.trim(), batch_total_g: batch, created_by: profile.id })
        .select('id').single();
      if (error) throw error;
      if (!newSauce) return;
      await supabase.from('sauce_ingredients').insert({
        sauce_id:      newSauce.id,
        ingredient_id: null,
        custom_name:   name.trim(),
        quantity_g:    batch,
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
      queryClient.invalidateQueries({ queryKey: ['sauce_library'] });
      navigate('/sauce-library');
    },
  });

  function handleSave() {
    setSubmitted(true);
    if (!isFormValid) return;
    saveSauce.mutate();
  }

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/sauce-library"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7"/>
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Sauce</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add a sauce or gravy to your library</p>
        </div>
      </div>

      <div className="max-w-xl space-y-6">

        {/* ── Sauce Details ─────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">Sauce Details</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">
                  Sauce name <span className="text-red-500">*</span>
                </label>
                <input
                  className={topInputCls(nameErr)}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fofitos Tikka Sauce"
                />
                {nameErr && <p className="text-xs text-red-500 mt-1">Sauce name is required</p>}
              </div>
              <div>
                <label className="label">
                  Batch total (g) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  className={topInputCls(batchErr)}
                  value={batchTotal}
                  onChange={(e) => setBatchTotal(e.target.value)}
                  placeholder="e.g. 1000"
                />
                {batchErr && <p className="text-xs text-red-500 mt-1">Must be greater than 0</p>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Nutrition Values ──────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">
              Nutrition Values <span className="text-red-500">*</span>
            </h2>
            <span className="text-xs text-gray-400">per 100g — all fields required</span>
          </div>
          <div className="card-body space-y-2.5">
            {NUTRITION_FIELDS.map(({ key, label, unit }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-800 font-medium">{label}</span>
                  <span className="ml-1.5 text-xs text-gray-400">(per 100g)</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className={nutrInputCls(nutrErrors[key])}
                    value={nutrForm[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    placeholder="0"
                  />
                  <span className="text-xs text-gray-400 w-8 text-right">{unit}</span>
                </div>
              </div>
            ))}
            {submitted && NUTRITION_FIELDS.some(({ key }) => nutrForm[key] === '' || Number(nutrForm[key]) <= 0) && (
              <p className="text-xs text-red-500 pt-1">All nutrition values must be greater than 0</p>
            )}
          </div>
        </div>

        {/* ── Action buttons ─────────────────────────────── */}
        <div className="flex gap-3 pb-8">
          <button
            type="button"
            className="btn-primary px-8"
            onClick={handleSave}
            disabled={saveSauce.isPending}
          >
            {saveSauce.isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving…
              </span>
            ) : 'Save Sauce'}
          </button>
          <Link to="/sauce-library" className="btn-secondary px-8">Cancel</Link>
        </div>

      </div>
    </div>
  );
}
