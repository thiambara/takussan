/**
 * Customer resource — shapes aligned with the backend JSON envelope emitted
 * by `CustomerResource` (see `takussan-api/app/Http/Resources/...`).
 *
 * Fields are kept permissive because the actual response depends on the
 * `fields[customers]` sparse fieldset the caller asked for. Always rely on
 * the fields you explicitly requested when consuming these types.
 */

import type { PaginatedResponse } from './api';

export type IdType = 'id_card' | 'passport' | 'driving_license';

export type CustomerStatus = 'active' | 'inactive' | 'blocked' | 'deleted';

export type CustomerPipelineStage =
  | 'lead'
  | 'prospect'
  | 'qualified'
  | 'negotiating'
  | 'converted'
  | 'lost';

export interface CustomerListItem {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string | null;
  phone: string | null;
  status: CustomerStatus;
  pipeline_stage: CustomerPipelineStage | null;
  occupation?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CustomerDetail extends CustomerListItem {
  birth_date: string | null;
  id_type: IdType | null;
  id_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  added_by_id: number | null;
  user_id: number | null;
  metadata: Record<string, unknown> | null;
}

export interface CustomerNote {
  id: number;
  customer_id: number;
  author_id: number | null;
  author_name?: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerDocument {
  id: number;
  name: string;
  type: string;
  size: number;
  url: string;
  uploaded_at: string;
}

export interface CustomerRelationship {
  id: number;
  user_id: number;
  customer_id: number;
  relationship_type: 'owner_tenant' | 'agent_client' | 'broker_client' | string;
  is_primary: boolean;
  status: 'active' | 'ended' | 'suspended' | string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
}

export type PaginatedCustomers = PaginatedResponse<CustomerListItem>;
