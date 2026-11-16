/**
 * TCK-2909 (et AC5 bis de TCK-2864, maquette `app-profil-pieces` l. 701) — sous le moyen par défaut,
 * « reversements du 5 de chaque mois » quand le mandat du profil bailleur actif porte un jour de
 * versement (`meta.payout_day` de `GET /api/me/payout-methods`) ; rien sans lui, rien sous un autre moyen.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PayoutMethodsSection } from '../PayoutMethodsSection';

const AUTRE = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const LISTE = vi.hoisted(() => ({ current: { isLoading: false, data: { data: [] as unknown[], meta: {} as Record<string, unknown> } } }));
vi.mock('@/lib/queries/payments', () => ({
  useMyPayoutMethods: () => LISTE.current,
  useCreateMyPayoutMethod: () => AUTRE,
  useSetDefaultPayoutMethod: () => AUTRE,
  useDeleteMyPayoutMethod: () => AUTRE,
  useSendPayoutBankStatement: () => AUTRE,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const WAVE = { id: 1, kind: 'wave', masked_identifier: '•••• 4018', is_default: true, verified: true, verification_status: 'verified' };
const BANQUE = { id: 2, kind: 'bank_transfer', masked_identifier: '•••• 4417', is_default: false, verified: true, verification_status: 'verified' };

describe('PayoutMethodsSection — jour de versement (TCK-2909)', () => {
  beforeEach(() => {
    LISTE.current = { isLoading: false, data: { data: [WAVE, BANQUE], meta: { payout_day: 5 } } };
  });

  it('le moyen par défaut dit « reversements du 5 de chaque mois », et lui seul', () => {
    const { container } = render(withIntl(<PayoutMethodsSection />));
    expect(screen.getByText('reversements du 5 de chaque mois')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="jour-de-versement"]')).toHaveLength(1);
  });

  it('sans jour de versement (null ou absent) : rien', () => {
    LISTE.current = { isLoading: false, data: { data: [WAVE, BANQUE], meta: { payout_day: null } } };
    const { container, unmount } = render(withIntl(<PayoutMethodsSection />));
    expect(container.querySelector('[data-slot="jour-de-versement"]')).toBeNull();
    unmount();

    LISTE.current = { isLoading: false, data: { data: [WAVE, BANQUE], meta: {} } };
    const second = render(withIntl(<PayoutMethodsSection />));
    expect(second.container.querySelector('[data-slot="jour-de-versement"]')).toBeNull();
  });
});
