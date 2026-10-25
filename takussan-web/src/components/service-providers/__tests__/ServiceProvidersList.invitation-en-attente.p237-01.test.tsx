import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { ServiceProvidersList } from '../ServiceProvidersList';

/**
 * P237.01 (TCK-2371) — relancer ou révoquer part par l'identifiant d'invitation que l'API porte sur
 * la ligne (`pending_invitation_id`), sans chercher l'invitation par e-mail. La recherche avalait
 * ses pannes en « Aucune invitation en attente », et un prestataire invité au seul numéro n'avait
 * jamais d'invitation trouvée.
 */
const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const AUCUNE = 'Aucune invitation en attente pour ce contact.';

/** Un brouillon invité au seul numéro : ni compte, ni e-mail. */
function donnees(pendingInvitationId: number | null) {
  return {
    data: [{
      id: 3, user_id: null, agency_id: 7, status: 'draft', created_at: null, user: null,
      metadata: { first_name: 'Awa', last_name: 'Sarr', phone: '+221770000237', email: null },
      specialties: null, service_areas: null,
      pending_invitation_id: pendingInvitationId,
    }],
    meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
    links: { first: null, last: null, prev: null, next: null },
  } as never;
}

/** Le geste répond `geste` ; la liste, que la requête relit au montage, se relit telle quelle. */
function monter(pendingInvitationId: number | null, geste: () => Promise<unknown> = async () => ({ data: { id: 44 } })) {
  apiRequestMock.mockImplementation(async (chemin: string) =>
    chemin.startsWith('/api/invitations/') ? geste() : donnees(pendingInvitationId));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees(pendingInvitationId)} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

const chemins = () => apiRequestMock.mock.calls.map(([chemin]) => String(chemin));

describe('<ServiceProvidersList> — relance et révocation par l’invitation de la ligne (P237.01)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    toastAdd.mockReset();
  });

  it.each([
    ['resend', "Renvoyer l'invitation"],
    ['revoke', 'Révoquer'],
  ] as const)('%s : un brouillon invité au seul numéro part par son invitation, sans recherche', async (geste, libelle) => {
    monter(44);

    await userEvent.click(await screen.findByRole('button', { name: libelle }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
    expect(chemins()).toContain(`/api/invitations/44/${geste}`);
    expect(chemins().some((c) => c.startsWith('/api/invitations?'))).toBe(false);
  });

  it('une panne du geste dit la panne, jamais « Aucune invitation en attente »', async () => {
    monter(44, async () => {
      throw new ApiError(500, { message: 'Erreur du serveur.' });
    });

    await userEvent.click(await screen.findByRole('button', { name: "Renvoyer l'invitation" }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
    expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ description: AUCUNE }));
  });

  it('sans invitation en attente, le dit sans requête', async () => {
    monter(null);

    await userEvent.click(await screen.findByRole('button', { name: "Renvoyer l'invitation" }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      description: AUCUNE,
    })));
    expect(chemins().some((c) => c.startsWith('/api/invitations'))).toBe(false);
  });
});
