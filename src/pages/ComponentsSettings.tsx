import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ComponentLibrary } from '@/types/database';

/* ── Default seed components ──────────────────────────────────────────────── */
const DEFAULT_COMPONENTS = [
  'Bread', 'Cereals & Grains', 'Salad', 'Sauce',
  'Base Gravy', 'Protein', 'Seed & Nut', 'Fruit', 'Others',
];

/* ── ComponentsSettings page ──────────────────────────────────────────────── */
export function ComponentsSettings() {
  const queryClient = useQueryClient();

  /* Form state — add */
  const [showAdd, setShowAdd]         = useState(false);
  const [addName, setAddName]         = useState('');
  const [addSubmitted, setAddSubmitted] = useState(false);

  /* Form state — edit */
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState('');
  const [editSubmitted, setEditSubmitted] = useState(false);

  /* Delete confirm */
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* Seed guard */
  const [seeded, setSeeded] = useState(false);

  /* ── Query ── */
  const { data: components, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['component_library'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('component_library')
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as ComponentLibrary[];
    },
    retry: false, /* Don't retry — table may not exist yet */
  });

  /* ── Seed defaults if empty ── */
  const seedDefaults = useMutation({
    mutationFn: async () => {
      const rows = DEFAULT_COMPONENTS.map((name, i) => ({ name, sort_order: i }));
      const { error } = await supabase.from('component_library').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['component_library'] });
      setSeeded(true);
    },
  });

  useEffect(() => {
    if (!isLoading && !isError && components && components.length === 0 && !seeded) {
      seedDefaults.mutate();
    }
  }, [isLoading, isError, components, seeded]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Add ── */
  const addComponent = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('component_library').insert({
        name: name.trim(),
        sort_order: components?.length ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['component_library'] });
      setAddName(''); setAddSubmitted(false); setShowAdd(false);
    },
  });

  /* ── Update ── */
  const updateComponent = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('component_library').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['component_library'] });
      setEditingId(null); setEditName(''); setEditSubmitted(false);
    },
  });

  /* ── Delete ── */
  const deleteComponent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('component_library').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['component_library'] });
      setDeletingId(null);
    },
  });

  /* ── Handlers ── */
  function handleAdd() {
    setAddSubmitted(true);
    if (!addName.trim()) return;
    const isDuplicate = components?.some(
      (c) => c.name.toLowerCase() === addName.trim().toLowerCase()
    );
    if (isDuplicate) return;
    addComponent.mutate(addName);
  }

  function startEdit(c: ComponentLibrary) {
    setEditingId(c.id); setEditName(c.name); setEditSubmitted(false);
  }

  function handleUpdate() {
    setEditSubmitted(true);
    if (!editName.trim() || !editingId) return;
    const isDuplicate = components?.some(
      (c) => c.name.toLowerCase() === editName.trim().toLowerCase() && c.id !== editingId
    );
    if (isDuplicate) return;
    updateComponent.mutate({ id: editingId, name: editName });
  }

  const addNameErr     = addSubmitted && !addName.trim();
  const addNameDupErr  = addSubmitted && !!addName.trim() && !!components?.some(
    (c) => c.name.toLowerCase() === addName.trim().toLowerCase()
  );
  const editNameErr    = editSubmitted && !editName.trim();
  const editNameDupErr = editSubmitted && !!editName.trim() && !!components?.some(
    (c) => c.name.toLowerCase() === editName.trim().toLowerCase() && c.id !== editingId
  );

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading components…
        </div>
      </div>
    );
  }

  /* ── Table not found ── */
  if (isError) {
    const msg = (queryError as Error)?.message ?? '';
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Components</h1>
        </div>
        <div className="card px-8 py-12 text-center max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
          </div>
          <p className="font-semibold text-gray-800 text-lg mb-2">Table not found</p>
          <p className="text-gray-500 text-sm mb-5">
            The <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-gray-700">component_library</code> table
            does not exist in your Supabase database yet.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-left text-xs font-mono text-gray-600 border border-gray-200 mb-4">
            <p className="text-gray-400 mb-2">-- Run this in your Supabase SQL editor:</p>
            <p>create table component_library (</p>
            <p className="pl-4">id uuid primary key default gen_random_uuid(),</p>
            <p className="pl-4">name text not null,</p>
            <p className="pl-4">sort_order int4 not null default 0,</p>
            <p className="pl-4">created_at timestamptz default now(),</p>
            <p className="pl-4">updated_at timestamptz default now()</p>
            <p>);</p>
          </div>
          {msg && <p className="text-xs text-red-400 mt-2">{msg}</p>}
          <button
            type="button"
            className="btn-secondary mt-2"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['component_library'] })}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Components</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {components?.length ?? 0} component{(components?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {!showAdd && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => { setShowAdd(true); setAddName(''); setAddSubmitted(false); }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 4v16m8-8H4"/>
            </svg>
            Add Component
          </button>
        )}
      </div>

      {/* ── Add form ── */}
      {showAdd && (
        <div className="card mb-5">
          <div className="card-header">
            <h3 className="font-semibold text-gray-900">New Component</h3>
          </div>
          <div className="card-body">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label">Component name <span className="text-red-500">*</span></label>
                <input
                  className={(addNameErr || addNameDupErr) ? 'input !border-red-400 focus:!ring-red-300' : 'input'}
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="e.g. Bread"
                  autoFocus
                />
                {addNameErr    && <p className="text-xs text-red-500 mt-1">Name is required</p>}
                {addNameDupErr && <p className="text-xs text-red-500 mt-1">A component with this name already exists</p>}
              </div>
              <div className="flex gap-2 pb-0.5">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleAdd}
                  disabled={addComponent.isPending}
                >
                  {addComponent.isPending ? 'Adding…' : 'Add'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setShowAdd(false); setAddName(''); setAddSubmitted(false); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Components table ── */}
      <div className="card overflow-hidden">
        {(components?.length ?? 0) === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No components yet</p>
            <p className="text-gray-400 text-sm mt-1">Add components to get started.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th text-left">Component Name</th>
                <th className="th w-16 text-center">Order</th>
                <th className="th w-36 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {components?.map((comp, idx) => (
                <tr key={comp.id} className="hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">
                  {editingId === comp.id ? (
                    /* ── Inline edit row ── */
                    <>
                      <td className="td" colSpan={2}>
                        <div className="flex items-center gap-2">
                          <input
                            className={(editNameErr || editNameDupErr) ? 'input !border-red-400 focus:!ring-red-300 max-w-sm' : 'input max-w-sm'}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                            autoFocus
                          />
                          {editNameErr    && <p className="text-xs text-red-500">Required</p>}
                          {editNameDupErr && <p className="text-xs text-red-500">Already exists</p>}
                        </div>
                      </td>
                      <td className="td text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="btn-primary py-1 px-3 text-xs"
                            onClick={handleUpdate}
                            disabled={updateComponent.isPending}
                          >
                            {updateComponent.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary py-1 px-3 text-xs"
                            onClick={() => { setEditingId(null); setEditName(''); setEditSubmitted(false); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    /* ── Normal row ── */
                    <>
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-violet-50 text-violet-600 text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-gray-900">{comp.name}</span>
                        </div>
                      </td>
                      <td className="td text-center text-gray-400 text-sm">{comp.sort_order}</td>
                      <td className="td text-right">
                        {deletingId === comp.id ? (
                          /* Delete confirm */
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-gray-500">Delete?</span>
                            <button
                              type="button"
                              className="btn-danger py-1 px-3 text-xs"
                              onClick={() => deleteComponent.mutate(comp.id)}
                              disabled={deleteComponent.isPending}
                            >
                              {deleteComponent.isPending ? '…' : 'Yes'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary py-1 px-3 text-xs"
                              onClick={() => setDeletingId(null)}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="btn-secondary py-1 px-3 text-xs"
                              onClick={() => startEdit(comp)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-danger py-1 px-3 text-xs"
                              onClick={() => setDeletingId(comp.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
