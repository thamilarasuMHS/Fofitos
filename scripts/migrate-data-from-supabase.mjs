/**
 * Data migration: Supabase → AWS PostgreSQL
 *
 * Run once from your terminal:
 *   node scripts/migrate-data-from-supabase.mjs
 *
 * What it does:
 *   1. Reads all data from Supabase (direct PostgreSQL connection)
 *   2. Migrates auth.users → public.users (password hashes are carried over as-is,
 *      they are standard bcrypt so they work with bcryptjs)
 *   3. Inserts all table data into AWS PostgreSQL in dependency order
 *   4. Skips rows that already exist (safe to re-run)
 */

import pg from 'pg';
const { Client } = pg;

// ── Source: Supabase ──────────────────────────────────────────
const SRC = new Client({
  host: 'db.xvcldpqatnsrgffhhxho.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'LkVWDlKNQRvOFW43',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

// ── Target: AWS PostgreSQL ────────────────────────────────────
const DST = new Client({
  host: '13.234.115.104',
  port: 5432,
  database: 'Fofitos_Nutrition',
  user: 'postgres',
  password: '$erver2026',
  ssl: false,
  connectionTimeoutMillis: 20000,
});

async function copyTable(srcClient, dstClient, srcQuery, dstTable, cols, conflictCol = 'id') {
  const { rows } = await srcClient.query(srcQuery);
  if (rows.length === 0) { console.log(`  ${dstTable}: 0 rows (empty)`); return; }

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const values = cols.map(c => row[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const colsSql = cols.map(c => `"${c}"`).join(', ');
    try {
      await dstClient.query(
        `INSERT INTO public."${dstTable}" (${colsSql}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO NOTHING`,
        values
      );
      inserted++;
    } catch (err) {
      console.warn(`    ⚠ Row skipped (${dstTable}): ${err.message}`);
      skipped++;
    }
  }
  console.log(`  ${dstTable}: ${inserted} inserted, ${skipped} skipped`);
}

async function run() {
  console.log('Connecting to Supabase...');
  await SRC.connect();
  console.log('Connected to Supabase ✓');

  console.log('Connecting to AWS PostgreSQL...');
  await DST.connect();
  console.log('Connected to AWS PostgreSQL ✓\n');

  console.log('Clearing existing AWS data (safe reset)...');
  // TRUNCATE users CASCADE wipes everything in one shot (all tables reference users/profiles).
  // Also truncate independent tables that don't chain from users.
  await DST.query('TRUNCATE public.users CASCADE');
  await DST.query('TRUNCATE public.nutrition_parameters CASCADE');
  await DST.query('TRUNCATE public.component_library CASCADE');
  console.log('  AWS database cleared ✓\n');

  console.log('Starting data migration...\n');

  // ── 1. users (from auth.users) ────────────────────────────
  console.log('Migrating users (auth.users → public.users)...');
  {
    const { rows } = await SRC.query(`
      SELECT id, email, encrypted_password
      FROM auth.users
      ORDER BY created_at
    `);
    let inserted = 0, skipped = 0;
    for (const row of rows) {
      try {
        await DST.query(
          `INSERT INTO public.users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
          [row.id, row.email, row.encrypted_password]
        );
        inserted++;
      } catch (err) {
        console.warn(`    ⚠ User skipped (${row.email}): ${err.message}`);
        skipped++;
      }
    }
    console.log(`  users: ${inserted} inserted, ${skipped} skipped`);
  }

  // ── 2. profiles ───────────────────────────────────────────
  console.log('Migrating profiles...');
  await copyTable(SRC, DST,
    `SELECT id, email, full_name, role, status, created_at, updated_at, last_active_at FROM public.profiles ORDER BY created_at`,
    'profiles',
    ['id', 'email', 'full_name', 'role', 'status', 'created_at', 'updated_at', 'last_active_at']
  );

  // ── 3. nutrition_parameters ───────────────────────────────
  console.log('Migrating nutrition_parameters...');
  await copyTable(SRC, DST,
    `SELECT id, name, unit, param_type, numerator_param_id, denominator_param_id, direction, sort_order, is_active, created_at, updated_at FROM public.nutrition_parameters ORDER BY sort_order`,
    'nutrition_parameters',
    ['id', 'name', 'unit', 'param_type', 'numerator_param_id', 'denominator_param_id', 'direction', 'sort_order', 'is_active', 'created_at', 'updated_at']
  );

  // ── 4. component_library ─────────────────────────────────
  console.log('Migrating component_library...');
  await copyTable(SRC, DST,
    `SELECT id, name, sort_order, created_at, updated_at FROM public.component_library ORDER BY sort_order`,
    'component_library',
    ['id', 'name', 'sort_order', 'created_at', 'updated_at']
  );

  // ── 5. ingredient_database ────────────────────────────────
  console.log('Migrating ingredient_database...');
  await copyTable(SRC, DST,
    `SELECT id, name, raw_cooked, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, fibre_g_per_100g, omega3_g_per_100g, omega6_g_per_100g, sodium_mg_per_100g, added_sugar_g_per_100g, created_by, created_at, updated_at, deleted_at FROM public.ingredient_database ORDER BY created_at`,
    'ingredient_database',
    ['id', 'name', 'raw_cooked', 'calories_per_100g', 'protein_g_per_100g', 'carbs_g_per_100g', 'fat_g_per_100g', 'fibre_g_per_100g', 'omega3_g_per_100g', 'omega6_g_per_100g', 'sodium_mg_per_100g', 'added_sugar_g_per_100g', 'created_by', 'created_at', 'updated_at', 'deleted_at']
  );

  // ── 6. ingredient_edit_history ────────────────────────────
  console.log('Migrating ingredient_edit_history...');
  await copyTable(SRC, DST,
    `SELECT id, ingredient_id, edited_by, field_name, old_value, new_value, created_at FROM public.ingredient_edit_history ORDER BY created_at`,
    'ingredient_edit_history',
    ['id', 'ingredient_id', 'edited_by', 'field_name', 'old_value', 'new_value', 'created_at']
  );

  // ── 7. sauce_library ─────────────────────────────────────
  console.log('Migrating sauce_library...');
  await copyTable(SRC, DST,
    `SELECT id, name, batch_total_g, created_by, created_at, updated_at FROM public.sauce_library ORDER BY created_at`,
    'sauce_library',
    ['id', 'name', 'batch_total_g', 'created_by', 'created_at', 'updated_at']
  );

  // ── 8. sauce_ingredients ──────────────────────────────────
  console.log('Migrating sauce_ingredients...');
  await copyTable(SRC, DST,
    `SELECT id, sauce_id, ingredient_id, custom_name, quantity_g, calories, protein_g, carbs_g, fat_g, fibre_g, omega3_g, omega6_g, sodium_mg, added_sugar_g, sort_order, created_at FROM public.sauce_ingredients ORDER BY created_at`,
    'sauce_ingredients',
    ['id', 'sauce_id', 'ingredient_id', 'custom_name', 'quantity_g', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'omega3_g', 'omega6_g', 'sodium_mg', 'added_sugar_g', 'sort_order', 'created_at']
  );

  // ── 9. categories ─────────────────────────────────────────
  console.log('Migrating categories...');
  await copyTable(SRC, DST,
    `SELECT id, name, created_by, status, submitted_at, approved_by, approved_at, created_at, updated_at FROM public.categories ORDER BY created_at`,
    'categories',
    ['id', 'name', 'created_by', 'status', 'submitted_at', 'approved_by', 'approved_at', 'created_at', 'updated_at']
  );

  // ── 10. category_goals ────────────────────────────────────
  console.log('Migrating category_goals...');
  await copyTable(SRC, DST,
    `SELECT id, category_id, parameter_id, goal_min, goal_max, created_at, updated_at FROM public.category_goals ORDER BY created_at`,
    'category_goals',
    ['id', 'category_id', 'parameter_id', 'goal_min', 'goal_max', 'created_at', 'updated_at']
  );

  // ── 11. category_components ───────────────────────────────
  console.log('Migrating category_components...');
  await copyTable(SRC, DST,
    `SELECT id, category_id, name, sort_order, created_at FROM public.category_components ORDER BY created_at`,
    'category_components',
    ['id', 'category_id', 'name', 'sort_order', 'created_at']
  );

  // ── 12. recipes ───────────────────────────────────────────
  console.log('Migrating recipes...');
  await copyTable(SRC, DST,
    `SELECT id, category_id, name, flavour_tags, created_by, created_at, updated_at, deleted_at FROM public.recipes ORDER BY created_at`,
    'recipes',
    ['id', 'category_id', 'name', 'flavour_tags', 'created_by', 'created_at', 'updated_at', 'deleted_at']
  );

  // ── 13. recipe_versions ───────────────────────────────────
  console.log('Migrating recipe_versions...');
  // Insert without parent_version_id first to avoid FK circular ref
  {
    const { rows } = await SRC.query(`
      SELECT id, recipe_id, version_number, parent_version_id, status, locked,
             submitted_at, approved_by, approved_at, reviewer_notes,
             created_by, created_at, updated_at
      FROM public.recipe_versions ORDER BY created_at
    `);
    let inserted = 0, skipped = 0;
    // First pass: insert all rows without parent_version_id
    for (const row of rows) {
      try {
        await DST.query(
          `INSERT INTO public.recipe_versions
            (id, recipe_id, version_number, status, locked, submitted_at, approved_by, approved_at, reviewer_notes, created_by, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO NOTHING`,
          [row.id, row.recipe_id, row.version_number, row.status, row.locked,
           row.submitted_at, row.approved_by, row.approved_at, row.reviewer_notes,
           row.created_by, row.created_at, row.updated_at]
        );
        inserted++;
      } catch (err) {
        console.warn(`    ⚠ recipe_version skipped: ${err.message}`);
        skipped++;
      }
    }
    // Second pass: set parent_version_id
    for (const row of rows) {
      if (row.parent_version_id) {
        await DST.query(
          `UPDATE public.recipe_versions SET parent_version_id = $1 WHERE id = $2`,
          [row.parent_version_id, row.id]
        ).catch(() => {});
      }
    }
    console.log(`  recipe_versions: ${inserted} inserted, ${skipped} skipped`);
  }

  // ── 14. recipe_ingredients ────────────────────────────────
  console.log('Migrating recipe_ingredients...');
  await copyTable(SRC, DST,
    `SELECT id, recipe_version_id, category_component_id, ingredient_id, sauce_id, custom_name, quantity_g, raw_cooked, calories, protein_g, carbs_g, fat_g, fibre_g, omega3_g, omega6_g, sodium_mg, added_sugar_g, sort_order, created_at, updated_at FROM public.recipe_ingredients ORDER BY created_at`,
    'recipe_ingredients',
    ['id', 'recipe_version_id', 'category_component_id', 'ingredient_id', 'sauce_id', 'custom_name', 'quantity_g', 'raw_cooked', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'omega3_g', 'omega6_g', 'sodium_mg', 'added_sugar_g', 'sort_order', 'created_at', 'updated_at']
  );

  // ── 15. score_snapshots ───────────────────────────────────
  console.log('Migrating score_snapshots...');
  await copyTable(SRC, DST,
    `SELECT id, recipe_version_id, overall_score, parameter_scores, goal_snapshot, triggered_by, actor_id, created_at FROM public.score_snapshots ORDER BY created_at`,
    'score_snapshots',
    ['id', 'recipe_version_id', 'overall_score', 'parameter_scores', 'goal_snapshot', 'triggered_by', 'actor_id', 'created_at']
  );

  // ── 16. activity_logs ─────────────────────────────────────
  console.log('Migrating activity_logs...');
  await copyTable(SRC, DST,
    `SELECT id, actor_id, action, entity_type, entity_id, metadata, created_at FROM public.activity_logs ORDER BY created_at`,
    'activity_logs',
    ['id', 'actor_id', 'action', 'entity_type', 'entity_id', 'metadata', 'created_at']
  );

  // ── 17. deletion_requests ─────────────────────────────────
  console.log('Migrating deletion_requests...');
  await copyTable(SRC, DST,
    `SELECT id, recipe_id, requested_by, status, reviewed_by, reviewed_at, created_at, updated_at FROM public.deletion_requests ORDER BY created_at`,
    'deletion_requests',
    ['id', 'recipe_id', 'requested_by', 'status', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at']
  );

  console.log('\n✅ Data migration complete!\n');

  // ── Summary ───────────────────────────────────────────────
  const tables = [
    'users', 'profiles', 'nutrition_parameters', 'component_library',
    'ingredient_database', 'sauce_library', 'categories', 'recipes',
    'recipe_versions', 'recipe_ingredients', 'score_snapshots', 'activity_logs'
  ];
  console.log('Row counts in AWS PostgreSQL:');
  for (const t of tables) {
    const { rows } = await DST.query(`SELECT COUNT(*) FROM public."${t}"`);
    console.log(`  ${t}: ${rows[0].count}`);
  }

  await SRC.end();
  await DST.end();
}

run().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
