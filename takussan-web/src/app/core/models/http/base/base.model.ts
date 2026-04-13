export type ClassType<T> = new (...args: any[]) => T;
export type TableName =
// liste of table names in alphabetical order
'activity_logs'
| 'addresses'
| 'bookings'
| 'booking_payments'
| 'customers'
| 'notifications'
| 'permissions'
| 'properties'
| 'property_collaborators'
| 'reviews'
| 'roles'
| 'tags'
| 'user_customer_relationships'
| 'users';

export interface BaseModelInterface {
  id?: number;
  created_at?: string;
  updated_at?: string;
  metadata?: any;
  selected?: boolean;
}
