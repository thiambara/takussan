/**
 * TCK-695 (piste P21.04) — la section des garants lit TOUS les garants du bail par
 * `GET /api/leases/{id}/guarantors`.
 *
 * Elle lisait `lease.guarantor`, que l'API n'émet pas : `LeaseController::show` ignore `include`,
 * et l'ajout attache le garant au pivot `lease_guarantor` sans écrire `leases.guarantor_id`. La
 * section affichait donc toujours l'état vide, et le bouton n'était jamais désactivé au plafond.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { LeaseGuarantor } from '@/lib/queries/leases';

const { etat } = vi.hoisted(() => ({
  etat: { garants: [] as LeaseGuarantor[], appels: [] as number[] },
}));

vi.mock('@/lib/queries/leases', () => ({
  useLeaseGuarantors: (leaseId: number) => {
    etat.appels.push(leaseId);
    return { data: { data: etat.garants }, isLoading: false, isError: false };
  },
  useCreateGuarantor: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { GuarantorSection } from '../GuarantorSection';

function garant(id: number, prenom: string, nom: string): LeaseGuarantor {
  return {
    id,
    first_name: prenom,
    last_name: nom,
    phone: `+22177000000${id}`,
    email: `${prenom.toLowerCase()}@exemple.sn`,
    role: null,
  };
}

describe('GuarantorSection — les garants du pivot (TCK-695)', () => {
  beforeEach(() => {
    etat.garants = [];
    etat.appels = [];
  });

  it('affiche chaque garant que rend la route du bail, et non l’état vide', () => {
    etat.garants = [garant(1, 'Awa', 'Diop'), garant(2, 'Moussa', 'Fall')];

    render(withIntl(<GuarantorSection leaseId={42} canManage />));

    expect(etat.appels).toContain(42);
    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.getByText('Moussa Fall')).toBeInTheDocument();
    expect(screen.getByText('+221770000001')).toBeInTheDocument();
    expect(screen.getByText('moussa@exemple.sn')).toBeInTheDocument();
    expect(screen.queryByText('Aucun garant attaché à ce bail.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un garant' })).toBeEnabled();
  });

  it('désactive l’ajout au troisième garant', () => {
    etat.garants = [garant(1, 'Awa', 'Diop'), garant(2, 'Moussa', 'Fall'), garant(3, 'Fatou', 'Sow')];

    render(withIntl(<GuarantorSection leaseId={42} canManage />));

    expect(screen.getByRole('button', { name: 'Ajouter un garant' })).toBeDisabled();
  });

  it('montre l’état vide au gestionnaire, et rien au locataire, quand le bail n’a aucun garant', () => {
    const { unmount } = render(withIntl(<GuarantorSection leaseId={42} canManage />));
    expect(screen.getByText('Aucun garant attaché à ce bail.')).toBeInTheDocument();
    unmount();

    render(withIntl(<GuarantorSection leaseId={42} canManage={false} />));
    expect(screen.queryByText('Garants')).not.toBeInTheDocument();
  });

  it('montre au locataire les garants de son bail, sans bouton d’ajout', () => {
    etat.garants = [garant(1, 'Awa', 'Diop')];

    render(withIntl(<GuarantorSection leaseId={42} canManage={false} />));

    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter un garant' })).not.toBeInTheDocument();
  });
});
