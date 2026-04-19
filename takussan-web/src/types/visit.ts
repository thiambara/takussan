export type VisitType = 'in_person' | 'virtual' | 'self_guided' | 'hybrid';

export interface VisitRequestPayload {
  scheduled_at: string;
  type: VisitType;
  duration_minutes?: number;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  notes?: string;
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
