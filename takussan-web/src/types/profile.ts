export type ProfileType = 'owner' | 'agent' | 'broker' | 'service_provider';

export type ProfileAgencySummary = {
  id: number;
  name: string;
  slug: string;
};

export type Profile = {
  id: string;
  type: ProfileType;
  numeric_id: number;
  agency_id: number | null;
  agency?: ProfileAgencySummary;
  status: string | null;
  created_at: string | null;
};

export type MyProfilesResponse = {
  data: Profile[];
  meta: {
    active_profile_id: string | null;
    count: number;
  };
};
