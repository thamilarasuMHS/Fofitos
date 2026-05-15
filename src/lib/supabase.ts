// Drop-in replacement for @supabase/supabase-js — backed by Express API + AWS PostgreSQL
// Exports `supabase` with the same interface so all existing imports work unchanged.

const API_BASE = '/api';
const TOKEN_KEY = 'fofitos_token';

type AuthCallback = (event: string, session: Session | null) => void;

interface Session {
  access_token: string;
  user: { id: string; email: string; user_metadata?: Record<string, unknown> };
}

let _session: Session | null = null;
const _authListeners: AuthCallback[] = [];

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function notifyListeners(event: string, session: Session | null) {
  _authListeners.forEach(cb => cb(event, session));
}

async function apiFetch(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
  authRequired = true
): Promise<{ data: unknown; error: { message: string } | null }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (authRequired && token) headers['Authorization'] = `Bearer ${token}`;

  let url = `${API_BASE}${path}`;
  if (params && Object.keys(params).length) {
    url += '?' + new URLSearchParams(params).toString();
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (json.error) return { data: null, error: json.error };
    return { data: json.data ?? json, error: null };
  } catch (err: unknown) {
    return { data: null, error: { message: (err as Error).message } };
  }
}

// ── Query builder ─────────────────────────────────────────────

type FilterParams = Record<string, string>;

class QueryBuilder {
  private _table: string;
  private _method: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private _selectCols = '*';
  private _filters: FilterParams = {};
  private _body: unknown = null;
  private _single = false;
  private _maybeSingle = false;
  private _returnSelect = false;

  constructor(table: string) {
    this._table = table;
  }

  select(cols = '*') {
    if (this._method === 'insert' || this._method === 'update') {
      this._returnSelect = true;
      this._selectCols = cols;
      return this;
    }
    this._method = 'select';
    this._selectCols = cols;
    return this;
  }

  insert(data: unknown) {
    this._method = 'insert';
    this._body = data;
    return this;
  }

  update(data: unknown) {
    this._method = 'update';
    this._body = data;
    return this;
  }

  delete() {
    this._method = 'delete';
    return this;
  }

  eq(col: string, val: unknown) { this._filters[`eq_${col}`] = String(val); return this; }
  neq(col: string, val: unknown) { this._filters[`neq_${col}`] = String(val); return this; }
  is(col: string, val: null | string) {
    this._filters[`is_${col}`] = val === null ? 'null' : String(val);
    return this;
  }
  ilike(col: string, pattern: string) { this._filters[`ilike_${col}`] = pattern; return this; }
  in(col: string, arr: unknown[]) { this._filters[`in_${col}`] = arr.join(','); return this; }
  or(conditions: string) { this._filters['or'] = conditions; return this; }
  gte(col: string, val: unknown) { this._filters[`gte_${col}`] = String(val); return this; }
  lte(col: string, val: unknown) { this._filters[`lte_${col}`] = String(val); return this; }
  filter(col: string, op: string, val: unknown) {
    this._filters[`filter_${col}`] = `${op}.${val === null ? 'null' : val}`;
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? 'desc' : 'asc';
    const existing = this._filters['order'];
    this._filters['order'] = existing ? `${existing},${col}.${dir}` : `${col}.${dir}`;
    return this;
  }
  limit(n: number) { this._filters['limit'] = String(n); return this; }
  range(from: number, to: number) {
    this._filters['limit'] = String(to - from + 1);
    this._filters['offset'] = String(from);
    return this;
  }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }

  then(
    resolve: (v: { data: unknown; error: { message: string } | null }) => void,
    reject?: (e: unknown) => void
  ): Promise<void> {
    return this._execute().then(resolve, reject);
  }

  async _execute(): Promise<{ data: unknown; error: { message: string } | null }> {
    const params: FilterParams = { ...this._filters };
    if (this._method === 'select') {
      params['select'] = this._selectCols;
    }
    if (this._single) params['single'] = 'true';
    if (this._maybeSingle) params['maybeSingle'] = 'true';

    let result: { data: unknown; error: { message: string } | null };

    if (this._method === 'select') {
      result = await apiFetch('GET', `/rest/${this._table}`, undefined, params);
    } else if (this._method === 'insert') {
      result = await apiFetch('POST', `/rest/${this._table}`, this._body);
      if (!result.error && this._returnSelect) {
        const inserted = result.data as { id?: string };
        if (inserted?.id) {
          result = await apiFetch('GET', `/rest/${this._table}`, undefined, { eq_id: inserted.id, single: 'true' });
        }
      }
    } else if (this._method === 'update') {
      result = await apiFetch('PATCH', `/rest/${this._table}`, this._body, params);
    } else {
      result = await apiFetch('DELETE', `/rest/${this._table}`, undefined, params);
    }

    return result;
  }
}

// ── Auth interface ────────────────────────────────────────────
const auth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const res = await apiFetch('POST', '/auth/signin', { email, password }, undefined, false);
    if (!res.error) {
      const d = res.data as { session: Session };
      _session = d.session;
      setToken(d.session.access_token);
      notifyListeners('SIGNED_IN', _session);
    }
    return res;
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: unknown }) {
    const res = await apiFetch('POST', '/auth/signup', { email, password, options }, undefined, false);
    if (!res.error) {
      const d = res.data as { session: Session };
      _session = d.session;
      setToken(d.session.access_token);
      notifyListeners('SIGNED_IN', _session);
    }
    return res;
  },

  async signOut() {
    _session = null;
    setToken(null);
    notifyListeners('SIGNED_OUT', null);
    return { error: null };
  },

  async getSession() {
    const token = getToken();
    if (!token) return { data: { session: null }, error: null };
    if (_session) return { data: { session: _session }, error: null };
    const res = await apiFetch('GET', '/auth/session');
    if (!res.error) {
      _session = (res.data as { session: Session }).session;
    }
    return res as { data: { session: Session | null }; error: null };
  },

  async getUser() {
    const token = getToken();
    if (!token) return { data: { user: null }, error: null };
    return apiFetch('GET', '/auth/user');
  },

  onAuthStateChange(callback: AuthCallback) {
    _authListeners.push(callback);
    const token = getToken();
    if (token && _session) {
      setTimeout(() => callback('SIGNED_IN', _session), 0);
    } else if (!token) {
      setTimeout(() => callback('SIGNED_OUT', null), 0);
    } else {
      apiFetch('GET', '/auth/session').then(res => {
        if (!res.error) {
          _session = (res.data as { session: Session }).session;
          callback('SIGNED_IN', _session);
        } else {
          setToken(null);
          callback('SIGNED_OUT', null);
        }
      });
    }
    const subscription = {
      unsubscribe() {
        const idx = _authListeners.indexOf(callback);
        if (idx !== -1) _authListeners.splice(idx, 1);
      },
    };
    return { data: { subscription }, error: null };
  },
};

// ── RPC ───────────────────────────────────────────────────────
function rpc(fn: string, params?: Record<string, unknown>) {
  return apiFetch('POST', `/rpc/${fn}`, params ?? {});
}

// ── Main client export ────────────────────────────────────────
export const supabase = {
  auth,
  from: (table: string) => new QueryBuilder(table),
  rpc,
};
