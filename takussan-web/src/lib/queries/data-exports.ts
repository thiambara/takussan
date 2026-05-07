import type { DataExportsResponse } from '@/types/super-admin';
import { ApiError } from '@/lib/api';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

export async function fetchMyDataExports(): Promise<DataExportsResponse> {
  const res = await fetch('/api/me/data-exports', { credentials: 'include' });
  return jsonOrThrow<DataExportsResponse>(res);
}

export async function requestMyDataExport(): Promise<DataExportsResponse> {
  const res = await fetch('/api/me/data-exports', {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<DataExportsResponse>(res);
}
