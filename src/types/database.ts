export type AppRole = 'admin' | 'manager' | 'dietician' | 'chef';
export type UserStatus = 'pending_approval' | 'active' | 'deactivated' | 'rejected';
export type ParamUnit = 'g' | 'mg' | 'kcal' | 'ratio';
export type ParamTypeEnum = 'absolute' | 'ratio';
export type DirectionEnum = 'higher_is_better' | 'lower_is_better';
export type CategoryStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type RecipeStatus = 'draft' | 'submitted' | 'approved' | 'changes_requested';
export type RawCookedEnum = 'raw' | 'cooked';
export type SnapshotTrigger = 'recipe_save' | 'goal_update';
export type DeletionStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
}

export interface NutritionParameter {
  id: string;
  name: string;
  unit: ParamUnit;
  param_type: ParamTypeEnum;
  numerator_param_id: string | null;
  denominator_param_id: string | null;
  direction: DirectionEnum;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  created_by: string;
  status: CategoryStatus;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryGoal {
  id: string;
  category_id: string;
  parameter_id: string;
  goal_min: number;
  goal_max: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryComponent {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Recipe {
  id: string;
  category_id: string;
  name: string;
  flavour_tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RecipeVersion {
  id: string;
  recipe_id: string;
  version_number: number;
  parent_version_id: string | null;
  status: RecipeStatus;
  locked: boolean;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_version_id: string;
  category_component_id: string;
  ingredient_id: string | null;
  sauce_id: string | null;
  custom_name: string | null;
  quantity_g: number;
  raw_cooked: RawCookedEnum;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  omega3_g: number | null;
  omega6_g: number | null;
  sodium_mg: number | null;
  added_sugar_g: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface IngredientDatabase {
  id: string;
  name: string;
  raw_cooked: RawCookedEnum;
  calories_per_100g: number;
  protein_g_per_100g: number;
  carbs_g_per_100g: number;
  fat_g_per_100g: number;
  fibre_g_per_100g: number;
  omega3_g_per_100g: number;
  omega6_g_per_100g: number;
  sodium_mg_per_100g: number;
  added_sugar_g_per_100g: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SauceLibrary {
  id: string;
  name: string;
  batch_total_g: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SauceIngredient {
  id: string;
  sauce_id: string;
  ingredient_id: string | null;
  custom_name: string | null;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  omega3_g: number;
  omega6_g: number;
  sodium_mg: number;
  added_sugar_g: number;
  sort_order: number;
  created_at: string;
}

export interface ScoreSnapshot {
  id: string;
  recipe_version_id: string;
  overall_score: number;
  parameter_scores: Record<string, number>;
  goal_snapshot: Record<string, { min: number; max: number }>;
  triggered_by: SnapshotTrigger;
  actor_id: string | null;
  created_at: string;
}

export interface ComponentLibrary {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DeletionRequest {
  id: string;
  recipe_id: string;
  requested_by: string;
  status: DeletionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}
