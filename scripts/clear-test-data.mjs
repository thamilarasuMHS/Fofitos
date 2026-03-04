#!/usr/bin/env node
/**
 * Clear all test / development data from the Supabase cloud database.
 *
 * Deletes (in FK-safe order):
 *   recipe_ingredients → recipe_versions → recipes
 *   category_components, category_goals → categories
 *   sauce_ingredients → sauce_library
 *   ingredient_database
 *
 * Does NOT touch configuration tables:
 *   nutrition_parameters, component_library, profiles
 *
 * Requirements
 * ────────────
 * Add your Supabase service-role key to .env:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 * (Find it: Supabase Dashboard → Project Settings → API → service_role secret)
 *
 * Usage
 * ─────
 *   npm run db:clear
 *  or
 *   node scripts/clear-test-data.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/* ── Config ──────────────────────────────────────────────────── */
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('\n  ✗  Missing environment variables.\n');
  console.error('  Make sure your .env contains:\n');
  console.error('    VITE_SUPABASE_URL=https://<project>.supabase.co');
  console.error('    SUPABASE_SERVICE_ROLE_KEY=eyJ...\n');
  console.error('  Get the service-role key from:');
  console.error('    Supabase Dashboard → Project Settings → API → service_role\n');
  process.exit(1);
}

/* Service-role client bypasses Row Level Security entirely */
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ── Helpers ─────────────────────────────────────────────────── */
async function clearTable(table) {
  // Delete all rows created after a date well before any real data,
  // which satisfies Supabase's "at least one filter" requirement.
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .gte('created_at', '2000-01-01T00:00:00Z');

  if (error) {
    console.error(`  ✗  ${table}:`, error.message);
    throw error;
  }
  console.log(`  ✓  ${table}: ${count ?? 0} rows deleted`);
}

/* ── Main ────────────────────────────────────────────────────── */
async function main() {
  console.log('\n🧹  Clearing all test data from Supabase...\n');

  // ── Recipes (children first) ───────────────────────────────
  await clearTable('recipe_ingredients');
  await clearTable('recipe_versions');
  await clearTable('recipes');

  // ── Categories (children first) ────────────────────────────
  await clearTable('category_components');
  await clearTable('category_goals');
  await clearTable('categories');

  // ── Sub-components / Sauce library ────────────────────────
  await clearTable('sauce_ingredients');
  await clearTable('sauce_library');

  // ── Ingredient database ────────────────────────────────────
  await clearTable('ingredient_database');

  console.log('\n✓  All test data cleared successfully!\n');
}

main().catch((err) => {
  console.error('\n  ✗  Script failed:', err.message, '\n');
  process.exit(1);
});
