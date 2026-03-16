import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { NutritionParameter, ParamUnit, ParamTypeEnum, DirectionEnum } from '@/types/database';

export function Settings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    unit: 'g' as ParamUnit,
    param_type: 'absolute' as ParamTypeEnum,
    numerator_param_id: '',
    denominator_param_id: '',
    direction: 'higher_is_better' as DirectionEnum,
  });

  const { data: parameters, isLoading } = useQuery({
    queryKey: ['nutrition_parameters_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nutrition_parameters')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data as NutritionParameter[];
    },
  });

  const { data: inUseCount } = useQuery({
    queryKey: ['category_goals_param_usage'],
    queryFn: async () => {
      const { data, error } = await supabase.from('category_goals').select('parameter_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.parameter_id] = (counts[row.parameter_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const absolutes = parameters?.filter((p) => p.param_type === 'absolute') ?? [];

  const insertParam = useMutation({
    mutationFn: async (payload: {
      name: string; unit: ParamUnit; param_type: ParamTypeEnum;
      numerator_param_id?: string; denominator_param_id?: string; direction: DirectionEnum;
    }) => {
      const { error } = await supabase.from('nutrition_parameters').insert({
        name: payload.name, unit: payload.unit, param_type: payload.param_type,
        direction: payload.direction,
        numerator_param_id: payload.param_type === 'ratio' ? payload.numerator_param_id : null,
        denominator_param_id: payload.param_type === 'ratio' ? payload.denominator_param_id : null,
        sort_order: (parameters?.length ?? 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_parameters_all'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition_parameters'] });
      setShowForm(false);
      setForm({ name: '', unit: 'g', param_type: 'absolute', numerator_param_id: '', denominator_param_id: '', direction: 'higher_is_better' });
    },
  });

  const deleteParam = useMutation({
    mutationFn: async (id: string) => {
      const count = inUseCount?.[id] ?? 0;
      if (count > 0) throw new Error(`Used in ${count} categories. Remove from all categories first.`);
      const { error } = await supabase.from('nutrition_parameters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_parameters_all'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition_parameters'] });
      queryClient.invalidateQueries({ queryKey: ['category_goals_param_usage'] });
    },
  });

  const toggleParam = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('nutrition_parameters')
        .update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition_parameters_all'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition_parameters'] });
      toast.success('Parameter updated.');
    },
  });

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

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Master Nutrition Parameter Library</p>
        </div>
        {!showForm && (
          <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4"/>
            </svg>
            Add Parameter
          </button>
        )}
      </div>

      {/* Add parameter form */}
      {showForm && (
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">New Parameter</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className="label">Name</label>
                <input className="input" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Protein" />
              </div>
              <div>
                <label className="label">Unit</label>
                <select className="select" value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as ParamUnit }))}>
                  <option value="g">grams (g)</option>
                  <option value="mg">milligrams (mg)</option>
                  <option value="kcal">kcal</option>
                  <option value="ratio">ratio</option>
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select className="select" value={form.param_type}
                  onChange={(e) => setForm((f) => ({ ...f, param_type: e.target.value as ParamTypeEnum }))}>
                  <option value="absolute">Absolute Value</option>
                  <option value="ratio">Ratio</option>
                </select>
              </div>
              <div>
                <label className="label">Direction</label>
                <select className="select" value={form.direction}
                  onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as DirectionEnum }))}>
                  <option value="higher_is_better">Higher is better ↑</option>
                  <option value="lower_is_better">Lower is better ↓</option>
                </select>
              </div>
              {form.param_type === 'ratio' && (
                <>
                  <div>
                    <label className="label">Numerator</label>
                    <select className="select" value={form.numerator_param_id}
                      onChange={(e) => setForm((f) => ({ ...f, numerator_param_id: e.target.value }))}>
                      <option value="">Select parameter</option>
                      {absolutes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Denominator</label>
                    <select className="select" value={form.denominator_param_id}
                      onChange={(e) => setForm((f) => ({ ...f, denominator_param_id: e.target.value }))}>
                      <option value="">Select parameter</option>
                      {absolutes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" className="btn-primary"
                onClick={() => {
                  if (!form.name.trim()) return;
                  if (form.param_type === 'ratio' && (!form.numerator_param_id || !form.denominator_param_id)) {
                    alert('Select numerator and denominator for ratio.');
                    return;
                  }
                  insertParam.mutate({
                    name: form.name.trim(), unit: form.unit,
                    param_type: form.param_type, direction: form.direction,
                    numerator_param_id: form.param_type === 'ratio' ? form.numerator_param_id : undefined,
                    denominator_param_id: form.param_type === 'ratio' ? form.denominator_param_id : undefined,
                  });
                }}
                disabled={insertParam.isPending}
              >
                {insertParam.isPending ? 'Saving…' : 'Save Parameter'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Parameters table */}
      <div className="table-wrap">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Parameter</th>
                <th className="th">Unit</th>
                <th className="th">Type</th>
                <th className="th">Direction</th>
                <th className="th">Status</th>
                <th className="th">Used in</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {parameters?.map((p) => {
                const usedIn = inUseCount?.[p.id] ?? 0;
                return (
                  <tr key={p.id} className={`transition-colors ${p.is_active ? 'hover:bg-gray-50/50' : 'opacity-50 bg-gray-50/60'}`}>
                    <td className="td font-medium text-gray-900">{p.name}</td>
                    <td className="td">
                      <span className="badge bg-gray-100 text-gray-600">{p.unit}</span>
                    </td>
                    <td className="td">
                      <span className={`badge ${p.param_type === 'ratio' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {p.param_type}
                      </span>
                    </td>
                    <td className="td">
                      <span className={`badge ${p.direction === 'higher_is_better' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {p.direction === 'higher_is_better' ? '↑ Higher is better' : '↓ Lower is better'}
                      </span>
                    </td>
                    <td className="td">
                      <span className={`badge ${p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="td">
                      {usedIn > 0
                        ? <span className="text-xs text-violet-600 font-medium">{usedIn} {usedIn === 1 ? 'category' : 'categories'}</span>
                        : <span className="text-xs text-gray-400">—</span>
                      }
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <button type="button"
                          className={p.is_active ? 'btn-secondary' : 'btn-primary'}
                          onClick={() => toggleParam.mutate({ id: p.id, is_active: !p.is_active })}
                          disabled={toggleParam.isPending}>
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button type="button" className="btn-danger"
                          onClick={() => {
                            const count = inUseCount?.[p.id] ?? 0;
                            if (count > 0) {
                              toast.error('Cannot delete parameter', {
                                description: `Used in ${count} categor${count === 1 ? 'y' : 'ies'}. Remove from all categories before deleting.`,
                              });
                              return;
                            }
                            toast('Delete this parameter?', {
                              description: 'This cannot be undone.',
                              action: { label: 'Delete', onClick: () => deleteParam.mutate(p.id) },
                              cancel: { label: 'Cancel', onClick: () => {} },
                            });
                          }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
