/**
 * Tag types — TCK-023 / TCK-066.
 *
 * Source of truth: `takussan-api/app/Http/Controllers/Api/TagController@format`.
 * The backend schema uses `name` (not `label`) and has no `is_active` flag —
 * lifecycle is managed via `deleted_at` (soft delete) and `color`/`icon`.
 */

export type TagType = 'amenity' | 'feature' | 'label' | 'crm';

export interface Tag {
  id: number;
  name: string;
  slug: string;
  type: TagType;
  icon: string | null;
  color: string | null;
  description: string | null;
  properties_count?: number;
  created_at?: string;
}
