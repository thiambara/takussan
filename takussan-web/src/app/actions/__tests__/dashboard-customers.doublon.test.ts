/**
 * TCK-591 — le 409 de doublon se reconnaît à son CODE, `customer.duplicate` depuis TCK-588
 * (ADR-0032 : une erreur est un code `<domaine>.<clé>`). Le formulaire ne sait présenter la fiche
 * existante comme une aide que si l'action en extrait `existing` : un code renommé d'un seul côté
 * rendait un 409 ordinaire, sans « Ouvrir sa fiche » ni « Créer quand même ».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/api';
import { createCustomerAction } from '../dashboard-customers';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));

const createCustomerMock = vi.fn();
vi.mock('@/lib/queries/customers', () => ({
  attachCustomerTags: vi.fn(),
  createCustomer: (...a: unknown[]) => createCustomerMock(...a),
  createCustomerNote: vi.fn(),
  detachCustomerTag: vi.fn(),
  updateCustomer: vi.fn(),
  uploadCustomerDocument: vi.fn(),
  validateCustomerDocumentFile: vi.fn(),
  CUSTOMER_DOCUMENT_REJECTION_NAMESPACE: 'customers',
}));

const EXISTING = [{ id: 5, name: 'Awa Diop', matched_on: 'phone' }];

describe('createCustomerAction — doublon', () => {
  beforeEach(() => {
    createCustomerMock.mockReset();
  });

  it('rend les fiches existantes sur un 409 customer.duplicate', async () => {
    const err = new ApiError(409, { code: 'customer.duplicate', message: 'Doublon.', existing: EXISTING });
    createCustomerMock.mockImplementation(async () => {
      throw err;
    });

    const result = await createCustomerAction({ first_name: 'Awa' } as never);

    expect(result).toMatchObject({ ok: false, status: 409, duplicates: EXISTING });
  });

  it('ne lit pas de doublon sur un autre code', async () => {
    const err = new ApiError(409, { code: 'customer_duplicate', message: 'Doublon.', existing: EXISTING });
    createCustomerMock.mockImplementation(async () => {
      throw err;
    });

    const result = await createCustomerAction({ first_name: 'Awa' } as never);

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect((result as { duplicates?: unknown }).duplicates).toBeUndefined();
  });
});
