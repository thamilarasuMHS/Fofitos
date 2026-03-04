import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { SauceLibrary as Sauce, Profile } from '@/types/database';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Types & constants ──────────────────────────────────── */
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

/* ── SauceLibrary list page ─────────────────────────────── */
export function SauceLibrary() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: sauces, isLoading } = useQuery({
    queryKey: ['sauce_library'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sauce_library').select('*').order('name');
      if (error) throw error;
      return data as Sauce[];
    },
  });

  /* Fetch profiles to resolve creator names */
  const creatorIds = [...new Set((sauces ?? []).map((s) => s.created_by).filter(Boolean))] as string[];
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
    return p ? (p.full_name ?? p.email) : '—';
  }

  const canEdit = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'dietician';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading sauces…
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sub Component Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">{sauces?.length ?? 0} sauces</p>
        </div>
        {canEdit && (
          <Link to="/sauce-library/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4"/>
            </svg>
            New Sauce
          </Link>
        )}
      </div>

      {/* Empty state */}
      {(sauces?.length ?? 0) === 0 ? (
        <div className="card px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M9 3h6M8 7h8l-1 10H9L8 7z"/><path d="M6 7a6 6 0 0012 0"/>
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No sauces yet</p>
          <p className="text-gray-400 text-sm mt-1">Build your sauce library to reuse across recipes.</p>
          {canEdit && (
            <Link to="/sauce-library/new" className="btn-primary mt-5 inline-flex">
              Create first sauce
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {sauces?.map((s) => (
            <div key={s.id} className="card px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                {/* Left: icon + name + batch */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path d="M9 3h6M8 7h8l-1 10H9L8 7z"/><path d="M6 7a6 6 0 0012 0"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Batch total: {s.batch_total_g}g</p>
                  </div>
                </div>

                {/* Right: meta + edit button */}
                <div className="flex items-center gap-6 shrink-0">
                  {/* Created By */}
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 uppercase shrink-0">
                      {(creatorName(s.created_by)[0] ?? '?')}
                    </span>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Created by</p>
                      <p className="text-xs font-medium text-gray-700">{creatorName(s.created_by)}</p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-8 bg-gray-100" />

                  {/* Created On */}
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                    </svg>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Created on</p>
                      <p className="text-xs font-medium text-gray-700">{fmtDate(s.created_at)}</p>
                    </div>
                  </div>

                  {/* Edit button */}
                  {canEdit && (
                    <>
                      <div className="w-px h-8 bg-gray-100" />
                      <button
                        type="button"
                        className="btn-secondary py-1.5 px-3 text-xs"
                        onClick={() => setEditingId(s.id)}
                      >
                        Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingId && (
        <SauceEditModal
          sauceId={editingId}
          onClose={() => setEditingId(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['sauce_library'] });
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Sauce Edit Modal ───────────────────────────────────── */
function SauceEditModal({ sauceId, onClose, onSuccess }: {
  sauceId: string; onClose: () => void; onSuccess: () => void;
}) {
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [batchTotal, setBatchTotal] = useState('');
  const [nutrForm, setNutrForm] = useState<Record<NutrKey, string>>({ ...EMPTY_NUTR });
  const [initialized, setInitialized] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /* Load existing sauce data */
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
  });

  /* Populate form once data arrives */
  useEffect(() => {
    if (sauceDetail && !initialized) {
      setName(sauceDetail.sauce.name ?? '');
      setBatchTotal(String(sauceDetail.sauce.batch_total_g ?? ''));
      if (sauceDetail.ing) {
        const ing = sauceDetail.ing as Record<string, unknown>;
        setNutrForm({
          calories:      String(ing.calories      ?? ''),
          protein_g:     String(ing.protein_g     ?? ''),
          carbs_g:       String(ing.carbs_g       ?? ''),
          fat_g:         String(ing.fat_g         ?? ''),
          fibre_g:       String(ing.fibre_g       ?? ''),
          omega3_g:      String(ing.omega3_g      ?? ''),
          omega6_g:      String(ing.omega6_g      ?? ''),
          sodium_mg:     String(ing.sodium_mg     ?? ''),
          added_sugar_g: String(ing.added_sugar_g ?? ''),
        });
      }
      setInitialized(true);
    }
  }, [sauceDetail, initialized]);

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

  function topInputCls(hasError: boolean) {
    return `input${hasError ? ' !border-red-400 focus:!ring-red-300' : ''}`;
  }
  function nutrInputCls(hasError: boolean) {
    return `w-28 border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all placeholder:text-gray-300 ${
      hasError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:ring-violet-400'
    }`;
  }

  function handleSave() {
    setSubmitted(true);
    if (!isFormValid) return;
    saveSauce.mutate();
  }

  const saveSauce = useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      const batch = Number(batchTotal) || 1;
      await supabase.from('sauce_library')
        .update({ name: name.trim(), batch_total_g: batch }).eq('id', sauceId);
      await supabase.from('sauce_ingredients').delete().eq('sauce_id', sauceId);
      await supabase.from('sauce_ingredients').insert({
        sauce_id:      sauceId,
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
    onSuccess: () => onSuccess(),
  });

  /* Loading */
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3 text-gray-400 text-sm">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading sauce…
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Edit Sauce</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Sauce name + batch */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Sauce name <span className="text-red-500">*</span></label>
              <input className={topInputCls(nameErr)} value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fofitos Tikka Sauce" />
              {nameErr && <p className="text-xs text-red-500 mt-1">Required</p>}
            </div>
            <div>
              <label className="label">Batch total (g) <span className="text-red-500">*</span></label>
              <input type="number" className={topInputCls(batchErr)} value={batchTotal}
                onChange={(e) => setBatchTotal(e.target.value)} placeholder="1000" />
              {batchErr && <p className="text-xs text-red-500 mt-1">Must be greater than 0</p>}
            </div>
          </div>

          {/* Nutrition fields */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">
                Nutrition Values <span className="text-red-500">*</span>
              </p>
              <span className="text-xs text-gray-400">per 100g — all required</span>
            </div>
            <div className="space-y-2.5">
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
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" className="btn-primary"
            onClick={handleSave} disabled={saveSauce.isPending}>
            {saveSauce.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
