export type MaintenanceStatus = 'new' | 'in_progress' | 'resolved' | 'cancelled';

export type MaintenancePriority = 'low' | 'normal' | 'urgent';

export type MaintenanceRequest = {
  id: number;
  property_id: number;
  reporter_id: number;
  assigned_to: number | null;
  title: string;
  description: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  photos: string[];
  resolved_at: string | null;
  created_at: string;
};
