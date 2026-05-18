import { apiRequest, buildQueryString } from './api';
import type { MyProfilesResponse, Profile } from '@/types/profile';

export const ACTIVE_PROFILE_COOKIE = 'active_profile_id';

const PROFILE_FIELDS = ['id', 'type', 'numeric_id', 'agency_id', 'status', 'created_at'].join(',');
const AGENCY_FIELDS = ['id', 'name', 'slug'].join(',');

const profilesQuery = buildQueryString({
  fields: { profiles: PROFILE_FIELDS, agencies: AGENCY_FIELDS },
  include: 'agency',
});

export async function fetchMyProfiles(token: string, activeProfileId?: string): Promise<MyProfilesResponse> {
  const headers: Record<string, string> = {};
  if (activeProfileId) headers['X-Active-Profile-Hint'] = activeProfileId;

  return apiRequest<MyProfilesResponse>(
    `/api/me/profiles${profilesQuery ? `?${profilesQuery}` : ''}`,
    { token, headers },
  );
}

export async function patchActiveProfile(
  token: string,
  profileId: string,
): Promise<{ data: Profile }> {
  return apiRequest<{ data: Profile }>('/api/me/active-profile', {
    method: 'PATCH',
    token,
    body: { profile_id: profileId },
  });
}
