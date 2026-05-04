export type RoleScope = 'global' | 'agency';

export interface RolePermission {
  readonly id: number;
  readonly name: string;
}

export interface RoleListItem {
  readonly id: number;
  readonly name: string;
  readonly guard_name: string;
  readonly team_id: number | null;
  readonly scope: RoleScope;
  readonly is_predefined: boolean;
  readonly permissions?: readonly RolePermission[];
}

export interface RolesListResponse {
  readonly data: readonly RoleListItem[];
}

export interface RoleResponse {
  readonly data: RoleListItem;
}

export interface PermissionCatalogueEntry {
  readonly id: number;
  readonly name: string;
  readonly action: string;
}

export interface PermissionCatalogueGroup {
  readonly resource: string;
  readonly permissions: readonly PermissionCatalogueEntry[];
}

export interface PermissionsCatalogueResponse {
  readonly data: readonly PermissionCatalogueGroup[];
}
