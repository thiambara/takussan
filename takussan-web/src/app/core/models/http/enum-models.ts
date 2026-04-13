// Fichier regroupant tous les enums du backend

export enum BookingStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Cancelled = 'cancelled',
  Completed = 'completed'
}

export enum ProprietyStatus {
  Available = 'available',
  Sold = 'sold',
  Rented = 'rented',
  UnderMaintenance = 'under_maintenance',
  Unavailable = 'unavailable',
  Pending = 'pending'
}

export enum UserStatus {
  Active = 'active',
  Inactive = 'inactive',
  Blocked = 'blocked',
  Deleted = 'deleted'
}

export enum UserRole {
  Customer = 'customer',
  Admin = 'admin',
  SuperAdmin = 'super_admin',
  Vendor = 'vendor'
}

export enum CustomerStatus {
  Active = 'active',
  Inactive = 'inactive',
  Blocked = 'blocked',
  Deleted = 'deleted'
}
