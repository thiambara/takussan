export type UserRole = 'customer' | 'agent' | 'agency_admin' | 'owner' | 'service_provider' | 'super_admin';

export type UserStatus = 'active' | 'inactive' | 'banned';

export type User = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  email_verified_at: string | null;
  roles: UserRole[];
  status: UserStatus;
  created_at: string;
};
