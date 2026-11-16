/**
 * TCK-2864 (AC5, maquette `app-profil-pieces` `SectionVersement`) — un compte bancaire « À confirmer »
 * porte « Envoyer le RIB » : le geste ouvre le choix d'un fichier, l'envoie (sous step-up : c'est
 * `useApiMutation` qui le résout), et la page se relit — le compte passe « En revue ».
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PayoutMethodsSection } from '../PayoutMethodsSection';

const ENVOI = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const AUTRE = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const REFRESH = vi.hoisted(() => vi.fn());
const TOAST = vi.hoisted(() => vi.fn());
const LISTE = vi.hoisted(() => ({ current: { isLoading: false, data: { data: [] as unknown[] } } }));
vi.mock('@/lib/queries/payments', () => ({
  useMyPayoutMethods: () => LISTE.current,
  useCreateMyPayoutMethod: () => AUTRE,
  useSetDefaultPayoutMethod: () => AUTRE,
  useDeleteMyPayoutMethod: () => AUTRE,
  useSendPayoutBankStatement: () => ENVOI,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: REFRESH }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: TOAST }) }));

const WAVE = { id: 1, kind: 'wave', masked_identifier: '•••• 4018', is_default: true, verified: false, verification_status: 'to_confirm' };
const BANQUE = { id: 2, kind: 'bank_transfer', masked_identifier: '•••• 4417', is_default: false, verified: false, verification_status: 'to_confirm' };

describe('PayoutMethodsSection — « Envoyer le RIB » (TCK-2864)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    LISTE.current = { isLoading: false, data: { data: [WAVE, BANQUE] } };
  });

  it('seul le compte bancaire à confirmer porte « À confirmer » et « Envoyer le RIB » ; Wave reste « En attente »', () => {
    render(withIntl(<PayoutMethodsSection />));
    expect(screen.getAllByText('À confirmer')).toHaveLength(1);
    expect(screen.getByText('En attente de vérification')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: /Envoyer le RIB/ });
    expect(boutons).toHaveLength(1);
    expect(boutons[0]).toHaveAccessibleName('Envoyer le RIB du compte •••• 4417');
    expect(screen.getByText('un relevé d’identité bancaire est attendu')).toBeInTheDocument();
  });

  it('AC5 — un PDF choisi part pour CE compte ; succès : un avis, et la page se relit', async () => {
    ENVOI.mutateAsync.mockResolvedValue({ data: { ...BANQUE, verification_status: 'in_review' } });
    const user = userEvent.setup();
    const { container } = render(withIntl(<PayoutMethodsSection />));

    await user.click(screen.getByRole('button', { name: /Envoyer le RIB/ }));
    const rib = new File(['%PDF-1.4'], 'rib.pdf', { type: 'application/pdf' });
    await user.upload(container.querySelector('[data-slot="choix-du-rib"]') as HTMLInputElement, rib);

    await waitFor(() => expect(ENVOI.mutateAsync).toHaveBeenCalledWith({ id: 2, file: rib }));
    await waitFor(() => expect(REFRESH).toHaveBeenCalled());
    expect(TOAST).toHaveBeenCalledWith(expect.objectContaining({ title: 'RIB envoyé : votre compte est en revue.' }));
  });

  it('AC5 — relu « en revue », le compte dit « En revue » et ne propose plus l’envoi', () => {
    LISTE.current = { isLoading: false, data: { data: [{ ...BANQUE, verification_status: 'in_review' }] } };
    render(withIntl(<PayoutMethodsSection />));
    expect(screen.getByText('En revue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Envoyer le RIB/ })).toBeNull();
  });

  it('un refus (step-up abandonné, fichier refusé) se dit, et rien n’est relu', async () => {
    ENVOI.mutateAsync.mockRejectedValue(undefined);
    const user = userEvent.setup();
    const { container } = render(withIntl(<PayoutMethodsSection />));
    await user.click(screen.getByRole('button', { name: /Envoyer le RIB/ }));
    await user.upload(container.querySelector('[data-slot="choix-du-rib"]') as HTMLInputElement, new File(['x'], 'rib.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le RIB n’a pas pu être envoyé.');
    expect(REFRESH).not.toHaveBeenCalled();
  });
});
