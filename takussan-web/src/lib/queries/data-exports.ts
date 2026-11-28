import type { DataExportsResponse } from '@/types/super-admin';
import { appelBff } from '@/lib/bff';

export async function fetchMyDataExports(): Promise<DataExportsResponse> {
  return appelBff<DataExportsResponse>('/api/me/data-exports');
}

export async function requestMyDataExport(): Promise<DataExportsResponse> {
  return appelBff<DataExportsResponse>('/api/me/data-exports', { method: 'POST' });
}
