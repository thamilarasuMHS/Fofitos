import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, AppRole } from '@/types/database';

const roleColors: Record<AppRole, string> = {
  admin:     'bg-violet-100 text-violet-700',
  manager:   'bg-blue-100 text-blue-700',
  dietician: 'bg-emerald-100 text-emerald-700',
  chef:      'bg-amber-100 text-amber-700',
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:           'badge-active',
    pending_approval: 'badge-pending',
    rejected:         'badge-rejected',
    deactivated:      'badge-deactivated',
  };
  return (
    <span className={`badge ${map[status] ?? 'badge-draft'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function UserAvatar({ name, email }: { name: string | null; email: string }) {
  const initials = (name ?? email)
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ background: 'linear-gradient(135deg, #7c3aed, #c026d3)' }}>
      {initials}
    </div>
  );
}

export function UserManagement() {
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, role, status }: { id: string; role?: AppRole; status?: Profile['status'] }) => {
      const updates: Partial<Profile> = {};
      if (role != null) updates.role = role;
      if (status != null) updates.status = status;
      const { error } = await supabase.from('profiles').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  });

  const pending = users?.filter((u) => u.status === 'pending_approval') ?? [];
  const active  = users?.filter((u) => u.status === 'active') ?? [];
  const others  = users?.filter((u) => !['pending_approval', 'active'].includes(u.status)) ?? [];
  const allSorted = [...pending, ...active, ...others];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading users…
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">{users?.length ?? 0} total users</p>
      </div>

      {/* ── Pending requests banner ────────────────────── */}
      {pending.length > 0 && (
        <div className="card mb-6 overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/>
              <h2 className="font-semibold text-gray-900">Pending Access Requests</h2>
            </div>
            <span className="badge badge-pending">{pending.length} pending</span>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map((u) => (
              <div key={u.id} className="px-6 py-4 flex flex-wrap items-center gap-4">
                <UserAvatar name={u.full_name} email={u.email} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{u.full_name || '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Requested {new Date(u.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    className="select w-auto text-sm"
                    defaultValue=""
                    onChange={(e) => {
                      const role = e.target.value as AppRole;
                      if (role) updateProfile.mutate({ id: u.id, role, status: 'active' });
                    }}
                  >
                    <option value="">Approve as…</option>
                    <option value="manager">Manager</option>
                    <option value="dietician">Dietician</option>
                    <option value="chef">Chef</option>
                  </select>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => updateProfile.mutate({ id: u.id, status: 'rejected' })}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All users table ────────────────────────────── */}
      <div className="table-wrap">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900">All Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">User</th>
                <th className="th">Role</th>
                <th className="th">Status</th>
                <th className="th">Joined</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allSorted.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={u.full_name} email={u.email} />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{u.full_name || '—'}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    {u.status === 'active' ? (
                      <select
                        className="select w-auto text-xs py-1"
                        value={u.role}
                        onChange={(e) => updateProfile.mutate({ id: u.id, role: e.target.value as AppRole })}
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="dietician">Dietician</option>
                        <option value="chef">Chef</option>
                      </select>
                    ) : (
                      <span className={`badge ${roleColors[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="td">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="td text-gray-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="td">
                    {u.status === 'active' && (
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => {
                          if (window.confirm('Deactivate this user? They will not be able to log in.')) {
                            updateProfile.mutate({ id: u.id, status: 'deactivated' });
                          }
                        }}
                      >
                        Deactivate
                      </button>
                    )}
                    {u.status === 'deactivated' && (
                      <button
                        type="button"
                        className="btn-success"
                        onClick={() => updateProfile.mutate({ id: u.id, status: 'active' })}
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
