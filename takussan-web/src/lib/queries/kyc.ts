import { ApiError } from '@/lib/api';
import type { KycDossierResponse } from '@/types/super-admin';
import { cheminApi } from '@/lib/chemin-api';

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
  // TCK-601 — l'échéance du dossier vérifié. ⚠ Demandée par sparse fieldsets : sans elle, la
  // colonne n'est pas sélectionnée et la Resource la rend nulle.
  'expires_at',
  'created_at',
  'updated_at',
].join(',');

export async function fetchAgencyKyc(agencyId: number): Promise<KycDossierResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[kyc_dossiers]', KYC_DOSSIER_FIELDS);
  qs.set('include', 'subject,reviewer');
  const res = await fetch(cheminApi`/api/agencies/${agencyId}/kyc?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<KycDossierResponse>(res);
}

/**
 * Dépose une pièce du dossier KYC de l'agence.
 *
 * TCK-601 — `expiresAt` (`YYYY-MM-DD`) est l'échéance de la PIÈCE : obligatoire pour la pièce du
 * dirigeant (`director_id`), postérieure à aujourd'hui (422 sinon). C'est elle qui fixe la fin de
 * validité du dossier une fois vérifié.
 *
 * TCK-2671 — sur un dossier VÉRIFIÉ, l'API accepte encore la pièce du dirigeant qui arrive à
 * échéance (`KycWorkflowService::renew`) : le dossier repasse alors en examen. Elle rend 201.
 */
export async function uploadAgencyKycDocument(
  agencyId: number,
  documentType: 'rccm' | 'ninea' | 'director_id',
  file: File,
  expiresAt?: string,
  documentNumber?: string,
): Promise<KycDossierResponse> {
  const body = new FormData();
  body.set('document_type', documentType);
  body.set('document', file);
  if (expiresAt) body.set('expires_at', expiresAt);
  // TCK-2669 (ADR-0104 § 2) — le numéro de la pièce (RCCM, NINEA), jamais celui du dirigeant
  // (`prohibited_if:document_type,director_id`) : il sert aussi aux mentions légales (TCK-2671).
  const numero = documentNumber?.trim();
  if (numero && documentType !== 'director_id') body.set('document_number', numero);

  const res = await fetch(cheminApi`/api/agencies/${agencyId}/kyc/documents`, {
    method: 'POST',
    credentials: 'include',
    body,
  });
  return jsonOrThrow<KycDossierResponse>(res);
}

export async function submitAgencyKyc(agencyId: number): Promise<KycDossierResponse> {
  const res = await fetch(cheminApi`/api/agencies/${agencyId}/kyc/submit`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<KycDossierResponse>(res);
}
