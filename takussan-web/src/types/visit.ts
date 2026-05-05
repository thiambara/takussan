export type VisitType = 'in_person' | 'virtual' | 'self_guided' | 'hybrid';

export type VisitStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface VisitRequestPayload {
  scheduled_at: string;
  type: VisitType;
  duration_minutes?: number;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  notes?: string;
}

/**
 * TCK-075 — Server-side PropertyVisit shape returned by
 * `/api/property-visits`. Sparse fieldsets mean most columns are
 * optional in the wire format.
 */
export interface PropertyVisit {
  id: number;
  property_id: number;
  visitor_id?: number | null;
  customer_id?: number | null;
  agent_id?: number | null;
  visitor_name?: string | null;
  visitor_phone?: string | null;
  visitor_email?: string | null;
  type?: VisitType | null;
  status?: VisitStatus | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  duration_minutes?: number | null;
  feedback?: string | null;
  rating?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  property?: { id: number; title?: string | null; slug?: string | null } | null;
  visitor?: { id: number; first_name?: string; last_name?: string; email?: string | null } | null;
  agent?: { id: number; first_name?: string; last_name?: string } | null;
  customer?: { id: number; user_id?: number | null } | null;
  created_at?: string | null;
}

export interface VisitFeedbackPayload {
  role: 'customer' | 'agent';
  rating?: number;
  comment?: string;
}

export interface BookingRequestPayload {
  start_date: string;
  end_date: string;
  guests: number;
  message?: string;
}

export interface ReportPayload {
  reason: 'spam' | 'misleading' | 'fraud' | 'inappropriate_content' | 'other';
  details?: string;
}
