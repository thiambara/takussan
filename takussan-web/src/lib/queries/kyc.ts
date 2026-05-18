import { ApiError } from '@/lib/api';
import type { KycDossierResponse } from '@/types/super-admin';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

const KYC_DOSSIER_FIELDS = [
  'id',
  'subject_type',
  'subject_id',
  'status',
  'submitted_at',
  'reviewed_at',
  'reviewed_by',
  'rejection_reason',
  'metadata',
  'created_at',
  'updated_at',
].join(',');

export async function fetchAgencyKyc(agencyId: number): Promise<KycDossierResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[kyc_dossiers]', KYC_DOSSIER_FIELDS);
  qs.set('include', 'subject,reviewer');
  const res = await fetch(`/api/agencies/${agencyId}/kyc?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<KycDossierResponse>(res);
}

export async function uploadAgencyKycDocument(
  agencyId: number,
  documentType: 'rccm' | 'ninea' | 'director_id',
  file: File,
): Promise<KycDossierResponse> {
  const body = new FormData();
  body.set('document_type', documentType);
  body.set('document', file);

  const res = await fetch(`/api/agencies/${agencyId}/kyc/documents`, {
    method: 'POST',
    credentials: 'include',
    body,
  });
  return jsonOrThrow<KycDossierResponse>(res);
}

export async function submitAgencyKyc(agencyId: number): Promise<KycDossierResponse> {
  const res = await fetch(`/api/agencies/${agencyId}/kyc/submit`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<KycDossierResponse>(res);
}
