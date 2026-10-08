import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { Tag, TagType } from '@/types/tag';
import type { TagFormPayload } from '@/lib/schemas/tag';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * Tag (admin) queries — TCK-023 / TCK-066. Sparse fieldsets are mandatory
 * per CLAUDE.md; we only request the columns displayed in the admin table.
 */

export const TAG_ADMIN_FIELDS = [
  'id',
  'name',
  'slug',
  'type',
  'icon',
  'color',
  'description',
  'created_at',
] as const;

export interface TagListFilters {
  readonly type?: TagType | '';
  readonly search?: string;
}

export interface FetchTagsParams {
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly filters?: TagListFilters;
}

function buildListParams({
  page,
  perPage,
  sort,
  filters,
}: FetchTagsParams): SpatieQueryParams {
  const filter: Record<string, string> = {};
  if (filters?.type) filter.type = filters.type;
  if (filters?.search) filter.search = filters.search;

  return {
    fields: { tags: TAG_ADMIN_FIELDS },
    filter,
    sort: sort ?? 'name',
    page: page ?? 1,
    per_page: perPage ?? 100,
  };
}

export async function fetchTags(
  token: string,
  params: FetchTagsParams = {},
): Promise<PaginatedResponse<Tag>> {
  const qs = buildQueryString(buildListParams(params));
  return apiRequest<PaginatedResponse<Tag>>(cheminApi`/api/tags${requete(qs)}`, { token });
}

export async function createTag(token: string, payload: TagFormPayload): Promise<Tag> {
  const res = await apiRequest<ApiResponse<Tag>>(`/api/tags`, {
    method: 'POST',
    body: payload,
    token,
  });
  return res.data;
}

export async function updateTag(
  token: string,
  tagId: number,
  payload: Partial<TagFormPayload>,
): Promise<Tag> {
  const res = await apiRequest<ApiResponse<Tag>>(cheminApi`/api/tags/${tagId}`, {
    method: 'PATCH',
    body: payload,
    token,
  });
  return res.data;
}

export async function deleteTag(token: string, tagId: number): Promise<void> {
  await apiRequest<unknown>(cheminApi`/api/tags/${tagId}`, {
    method: 'DELETE',
    token,
  });
}
