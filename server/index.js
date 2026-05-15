import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pool from './db.js';

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'fofitos-jwt-secret-2026';

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

// ── JWT middleware ────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Auth routes ───────────────────────────────────────────────
app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT u.id, u.email, u.password_hash, p.role, p.status, p.full_name FROM public.users u JOIN public.profiles p ON p.id = u.id WHERE u.email = $1',
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, status: user.status },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    // Update last_active_at
    await pool.query('UPDATE public.profiles SET last_active_at = now() WHERE id = $1', [user.id]);
    res.json({
      data: {
        session: {
          access_token: token,
          user: { id: user.id, email: user.email, user_metadata: { full_name: user.full_name } },
        },
        user: { id: user.id, email: user.email, user_metadata: { full_name: user.full_name } },
      },
      error: null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, options } = req.body;
  const fullName = options?.data?.full_name ?? null;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO public.users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash]
    );
    const user = rows[0];
    await pool.query(
      'INSERT INTO public.profiles (id, email, full_name, role, status) VALUES ($1, $2, $3, $4, $5)',
      [user.id, user.email, fullName, 'dietician', 'pending_approval']
    );
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: 'dietician', status: 'pending_approval' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      data: {
        session: {
          access_token: token,
          user: { id: user.id, email: user.email, user_metadata: { full_name: fullName } },
        },
        user: { id: user.id, email: user.email, user_metadata: { full_name: fullName } },
      },
      error: null,
    });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/session', requireAuth, (req, res) => {
  res.json({
    data: {
      session: {
        access_token: req.headers.authorization.slice(7),
        user: { id: req.user.userId, email: req.user.email },
      },
    },
    error: null,
  });
});

app.get('/api/auth/user', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT u.id, u.email, p.full_name FROM public.users u JOIN public.profiles p ON p.id = u.id WHERE u.id = $1',
      [req.user.userId]
    );
    const user = rows[0];
    res.json({ data: { user: user ? { id: user.id, email: user.email, user_metadata: { full_name: user.full_name } } : null }, error: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Generic REST handler ──────────────────────────────────────

// Known FK relationships for nested selects
const FK_RELATIONSHIPS = {
  recipe_versions:  { recipes:              { fk: 'recipe_id',         pk: 'id', table: 'recipes'              } },
  recipes:          { categories:           { fk: 'category_id',       pk: 'id', table: 'categories'           } },
  deletion_requests:{ recipes:              { fk: 'recipe_id',         pk: 'id', table: 'recipes'              } },
  category_goals:   { nutrition_parameters: { fk: 'parameter_id',      pk: 'id', table: 'nutrition_parameters' } },
  score_snapshots:  { recipe_versions:      { fk: 'recipe_version_id', pk: 'id', table: 'recipe_versions'      } },
  recipe_ingredients:{ ingredient_database: { fk: 'ingredient_id',     pk: 'id', table: 'ingredient_database'  },
                       sauce_library:       { fk: 'sauce_id',          pk: 'id', table: 'sauce_library'        } },
};

// Character-based parser — handles spaces and nested parens correctly
// e.g. "id, name, recipes!inner (col1, col2, categories (name))"
function parseNestedSelect(selectStr) {
  if (!selectStr || selectStr.trim() === '*') return { mainCols: ['*'], resources: [] };
  const mainCols = [];
  const resources = [];
  const s = selectStr;
  let i = 0;
  let token = '';

  while (i <= s.length) {
    const ch = i < s.length ? s[i] : null;
    if (ch === '(') {
      // Read balanced parentheses content
      let depth = 1;
      let inner = '';
      i++;
      while (i < s.length && depth > 0) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') { depth--; if (depth === 0) break; }
        if (depth > 0) inner += s[i];
        i++;
      }
      i++; // skip closing )
      const trimmed = token.trim();
      if (trimmed) {
        const bangIdx = trimmed.indexOf('!');
        const relName = bangIdx >= 0 ? trimmed.slice(0, bangIdx).trim() : trimmed;
        const isInner = trimmed.includes('!inner');
        resources.push({ relName, isInner, innerSelect: inner.trim() });
      }
      token = '';
    } else if (ch === ',' || ch === null) {
      const trimmed = token.trim();
      if (trimmed) mainCols.push(trimmed);
      token = '';
      i++;
    } else {
      token += ch;
      i++;
    }
  }

  if (mainCols.length === 0 && resources.length === 0) mainCols.push('*');
  return { mainCols, resources };
}

// Build WHERE clause from filter params
function buildWhere(filters, params, tableAlias) {
  const clauses = [];
  const prefix = tableAlias ? `${tableAlias}.` : '';
  for (const [key, val] of Object.entries(filters)) {
    if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset' ||
        key === 'single' || key === 'count') continue;
    if (key.startsWith('eq_')) {
      params.push(val);
      clauses.push(`${prefix}"${key.slice(3)}" = $${params.length}`);
    } else if (key.startsWith('neq_')) {
      params.push(val);
      clauses.push(`${prefix}"${key.slice(4)}" != $${params.length}`);
    } else if (key.startsWith('is_')) {
      const col = key.slice(3);
      clauses.push(val === 'null' || val === null ? `${prefix}"${col}" IS NULL` : `${prefix}"${col}" IS NOT NULL`);
    } else if (key.startsWith('ilike_')) {
      params.push(val);
      clauses.push(`${prefix}"${key.slice(6)}" ILIKE $${params.length}`);
    } else if (key.startsWith('in_')) {
      const arr = Array.isArray(val) ? val : val.split(',');
      const placeholders = arr.map((_, i) => { params.push(arr[i]); return `$${params.length}`; });
      clauses.push(`${prefix}"${key.slice(3)}" IN (${placeholders.join(',')})`);
    } else if (key.startsWith('gte_')) {
      params.push(val);
      clauses.push(`${prefix}"${key.slice(4)}" >= $${params.length}`);
    } else if (key.startsWith('lte_')) {
      params.push(val);
      clauses.push(`${prefix}"${key.slice(4)}" <= $${params.length}`);
    } else if (key === 'or') {
      // Parse Supabase or() format: "field.eq.value,field2.is.null"
      const orClauses = val.split(',').map(part => {
        const [col, op, ...rest] = part.trim().split('.');
        const v = rest.join('.');
        if (op === 'eq') { params.push(v); return `${prefix}"${col}" = $${params.length}`; }
        if (op === 'is') return v === 'null' ? `${prefix}"${col}" IS NULL` : `${prefix}"${col}" IS NOT NULL`;
        if (op === 'neq') { params.push(v); return `${prefix}"${col}" != $${params.length}`; }
        return null;
      }).filter(Boolean);
      if (orClauses.length) clauses.push(`(${orClauses.join(' OR ')})`);
    } else if (key.startsWith('filter_')) {
      // Joined table filters: filter_recipes.deleted_at=is.null
      const rest = key.slice(7);
      const dotIdx = rest.indexOf('.');
      const joinedTable = rest.slice(0, dotIdx);
      const col = rest.slice(dotIdx + 1);
      const [op, opVal] = val.split('.');
      if (op === 'is') {
        clauses.push(`"${joinedTable}"."${col}" IS ${opVal === 'null' ? 'NULL' : 'NOT NULL'}`);
      }
    }
  }
  return clauses;
}

// Build ORDER BY clause
function buildOrder(orderParam, tableAlias) {
  if (!orderParam) return '';
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const parts = (Array.isArray(orderParam) ? orderParam : [orderParam]).map(o => {
    const [col, dir] = o.split('.');
    return `${prefix}"${col}" ${dir === 'desc' ? 'DESC' : 'ASC'}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
}

// Execute a SELECT query with joins (recursive, handles any depth)
async function executeSelect(mainTable, query) {
  const params = [];

  // Recursively build SELECT columns and JOIN clauses from a nested select string.
  // prefix is the alias prefix for joined columns, e.g. '' for main, 'recipes__' for first join.
  function buildSQL(table, selectStr, prefix) {
    const { mainCols, resources } = parseNestedSelect(selectStr);
    const selectParts = mainCols.includes('*')
      ? [`"${table}".*`]
      : mainCols.map(c => {
          const col = c.trim();
          return prefix
            ? `"${table}"."${col}" AS "${prefix}${col}"`
            : `"${table}"."${col}"`;
        });
    const joinClauses = [];

    for (const res of resources) {
      const rel = FK_RELATIONSHIPS[table]?.[res.relName];
      if (!rel) continue;
      const joinType = res.isInner ? 'INNER JOIN' : 'LEFT JOIN';
      joinClauses.push(`${joinType} public."${rel.table}" ON "${rel.table}"."${rel.pk}" = "${table}"."${rel.fk}"`);
      const sub = buildSQL(rel.table, res.innerSelect, `${prefix}${res.relName}__`);
      selectParts.push(...sub.selectParts);
      joinClauses.push(...sub.joinClauses);
    }

    return { selectParts, joinClauses, hasResources: resources.length > 0 };
  }

  const { selectParts, joinClauses, hasResources } = buildSQL(mainTable, query.select || '*', '');

  const whereClauses = buildWhere(query, params, mainTable);
  const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const orderStr = buildOrder(query.order, mainTable);
  const limitStr = query.limit ? `LIMIT ${parseInt(query.limit)}` : '';
  const offsetStr = query.offset ? `OFFSET ${parseInt(query.offset)}` : '';

  const sql = `SELECT ${selectParts.join(', ')} FROM public."${mainTable}" ${joinClauses.join(' ')} ${whereStr} ${orderStr} ${limitStr} ${offsetStr}`.trim();

  const { rows } = await pool.query(sql, params);

  if (!hasResources) return rows;

  // Re-nest aliased columns (e.g. "recipes__name" → row.recipes.name)
  return rows.map(row => {
    const result = {};
    for (const [k, v] of Object.entries(row)) {
      const parts = k.split('__');
      if (parts.length === 1) {
        result[k] = v;
      } else {
        let obj = result;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = v;
      }
    }
    return result;
  });
}

// GET /api/rest/:table — SELECT
app.get('/api/rest/:table', requireAuth, async (req, res) => {
  try {
    const rows = await executeSelect(req.params.table, req.query);
    const single = req.query.single === 'true' || req.query.maybeSingle === 'true';
    if (single) {
      return res.json({ data: rows[0] ?? null, error: null });
    }
    // Count for pagination
    if (req.query.count === 'exact') {
      const params = [];
      const whereClauses = buildWhere(req.query, params, req.params.table);
      const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const { rows: cr } = await pool.query(`SELECT COUNT(*) FROM public."${req.params.table}" ${whereStr}`, params);
      res.set('X-Total-Count', cr[0].count);
    }
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(`GET /api/rest/${req.params.table}:`, err.message);
    res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// POST /api/rest/:table — INSERT
app.post('/api/rest/:table', requireAuth, async (req, res) => {
  try {
    const records = Array.isArray(req.body) ? req.body : [req.body];
    const inserted = [];
    for (const record of records) {
      const keys = Object.keys(record);
      const vals = Object.values(record);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      const colsSql = keys.map(k => `"${k}"`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO public."${req.params.table}" (${colsSql}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        vals
      );
      inserted.push(rows[0]);
    }
    res.json({ data: inserted.length === 1 ? inserted[0] : inserted, error: null });
  } catch (err) {
    console.error(`POST /api/rest/${req.params.table}:`, err.message);
    res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// PATCH /api/rest/:table — UPDATE
app.patch('/api/rest/:table', requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    const params = [];
    const setClauses = Object.entries(updates).map(([k, v]) => {
      params.push(v);
      return `"${k}" = $${params.length}`;
    });
    const whereClauses = buildWhere(req.query, params, null);
    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `UPDATE public."${req.params.table}" SET ${setClauses.join(', ')} ${whereStr} RETURNING *`,
      params
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(`PATCH /api/rest/${req.params.table}:`, err.message);
    res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// DELETE /api/rest/:table — DELETE
app.delete('/api/rest/:table', requireAuth, async (req, res) => {
  try {
    const params = [];
    const whereClauses = buildWhere(req.query, params, null);
    if (!whereClauses.length) return res.status(400).json({ error: 'No filters provided for DELETE' });
    const whereStr = `WHERE ${whereClauses.join(' AND ')}`;
    const { rows } = await pool.query(
      `DELETE FROM public."${req.params.table}" ${whereStr} RETURNING *`,
      params
    );
    res.json({ data: rows, error: null });
  } catch (err) {
    console.error(`DELETE /api/rest/${req.params.table}:`, err.message);
    res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// POST /api/rpc/:fn — PostgreSQL function call
app.post('/api/rpc/:fn', requireAuth, async (req, res) => {
  try {
    const fn = req.params.fn;
    const args = req.body || {};
    const keys = Object.keys(args);
    const vals = Object.values(args);
    const argsSql = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const sql = `SELECT * FROM public.${fn}(${argsSql})`;
    const { rows } = await pool.query(sql, vals);
    res.json({ data: rows.length === 1 ? rows[0] : rows, error: null });
  } catch (err) {
    console.error(`RPC ${req.params.fn}:`, err.message);
    res.status(500).json({ data: null, error: { message: err.message } });
  }
});

app.listen(PORT, () => {
  console.log(`Fofitos API server running on http://localhost:${PORT}`);
});
