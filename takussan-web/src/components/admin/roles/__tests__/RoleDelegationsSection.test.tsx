import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { RoleDelegationsSection } from '../RoleDelegationsSection';
import {
  useCreateRoleDelegation,
  useDelegationCandidates,
  useRevokeRoleDelegation,
  useRoleDelegations,
} from '@/lib/queries/role-delegations';
import { useCanAll } from '@/hooks/useCan';
import type { RoleDelegation, RoleDelegationStatus } from '@/types/role-delegation';

vi.mock('@/lib/queries/role-delegations', () => ({
  useRoleDelegations: vi.fn(),
  useCreateRoleDelegation: vi.fn(),
  useRevokeRoleDelegation: vi.fn(),
  useDelegationCandidates: vi.fn(),
}));

vi.mock('@/hooks/useCan', () => ({ useCanAll: vi.fn() }));

/**
 * Une délégation telle que `RoleDelegationResource` la sérialise —
 * **`role_label` et `status_label` compris**. Ils sont ici volontairement :
 * un test qui ne les envoie pas ne peut pas prouver qu'on ne les affiche pas.
 */
function delegation(
  id: number,
  status: RoleDelegationStatus,
  over: Partial<RoleDelegation> = {},
): RoleDelegation {
  return {
    id,
    user_id: 100 + id,
    user: { id: 100 + id, first_name: 'Awa', last_name: `Diop ${id}`, email: `a${id}@x.sn` },
    delegator_id: 1,
    delegator: { id: 1, first_name: 'Moussa', last_name: 'Fall' },
    agency_id: 7,
    role: 'agent',
    status,
    starts_at: null,
    ends_at: '2026-12-31T23:59:59+00:00',
    reason: null,
    activated_at: null,
    expired_at: null,
    revoked_at: null,
    created_at: '2026-08-01T10:00:00+00:00',
    updated_at: '2026-08-01T10:00:00+00:00',
    status_label: status === 'scheduled' ? 'À venir' : status === 'expired' ? 'Expiré' : 'X',
    ...over,
  } as RoleDelegation;
}

const LES_QUATRE = [
  delegation(1, 'expired'),
  delegation(2, 'revoked'),
  delegation(3, 'scheduled', { starts_at: '2026-10-01T00:00:00+00:00' }),
  delegation(4, 'active'),
];

function monte(options: { delegations?: RoleDelegation[]; peutDeleguer?: boolean } = {}) {
  const { delegations = LES_QUATRE, peutDeleguer = true } = options;

  vi.mocked(useRoleDelegations).mockReturnValue({
    data: { data: delegations, meta: { total: delegations.length } },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useRoleDelegations>);

  vi.mocked(useCanAll).mockReturnValue({ can: peutDeleguer, isLoading: false });

  render(withIntl(<RoleDelegationsSection agencyId={7} />));
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(useCreateRoleDelegation).mockReturnValue({
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCreateRoleDelegation>);

  vi.mocked(useRevokeRoleDelegation).mockReturnValue({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useRevokeRoleDelegation>);

  vi.mocked(useDelegationCandidates).mockReturnValue({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
  } as unknown as ReturnType<typeof useDelegationCandidates>);
});

describe('<RoleDelegationsSection> — TCK-369', () => {
  /**
   * AC2. Le critère demande un test qui **échouerait si les statuts rendaient
   * pareil** : on compare donc les quatre classes DEUX À DEUX, sans jamais
   * nommer une classe attendue. Uniformiser les variantes de badge — c'est le
   * geste exact qu'un refactor distrait produit — fait rougir ce test, alors
   * qu'une assertion du type `toHaveClass('bg-primary')` resterait verte tant
   * que la variante `active` ne bouge pas.
   */
  it('rend les quatre statuts avec des habillages deux à deux distincts', () => {
    monte();

    const classes = (['active', 'scheduled', 'expired', 'revoked'] as const).map(
      (statut) => screen.getByTestId(`delegation-status-${statut}`).className,
    );

    const distinctes = new Set(classes);
    expect(distinctes.size).toBe(4);
  });

  /**
   * AC2 (suite). « L'active se distingue, l'expirée s'efface sans
   * disparaître » : c'est une propriété de la LIGNE, pas seulement du badge.
   */
  it("estompe les lignes closes et laisse pleines celles qui portent un effet", () => {
    monte();

    const ligne = (statut: RoleDelegationStatus) =>
      document.querySelector(`tr[data-status="${statut}"]`) as HTMLElement;

    expect(ligne('active').className).not.toContain('opacity-');
    expect(ligne('scheduled').className).not.toContain('opacity-');
    expect(ligne('expired').className).toContain('opacity-60');
    expect(ligne('revoked').className).toContain('opacity-60');
  });

  /**
   * Le principe non négociable n°5 : le texte affiché appartient au front.
   * `RoleDelegationResource` émet `status_label` (« À venir », « Expiré ») et
   * `role_label` (« Agent », « Administrateur d'agence ») **en français en
   * dur, écrits dans le PHP**. Les afficher marcherait en français et
   * rendrait un écran anglais à moitié traduit.
   */
  it("n'affiche pas les libellés français que la ressource PHP fabrique", () => {
    monte();

    expect(screen.getByText('Programmée')).toBeInTheDocument();
    // « À venir » est le `status_label` du backend pour `scheduled`.
    expect(screen.queryByText('À venir')).not.toBeInTheDocument();
    expect(screen.queryByText('Expiré')).not.toBeInTheDocument();
  });

  /** L'ordre de lecture : ce qui produit un effet AVANT ce qui n'en produit plus. */
  it('classe les délégations par effet — active, programmée, puis closes', () => {
    monte();

    const statuts = Array.from(document.querySelectorAll('tr[data-status]')).map((tr) =>
      tr.getAttribute('data-status'),
    );

    expect(statuts).toEqual(['active', 'scheduled', 'expired', 'revoked']);
  });

  /**
   * AC6, versant client. `useCan` **n'autorise rien** — c'est la policy qui
   * décide, et `tests/Feature/Api/Permissions/RoleDelegationTest.php`
   * (`test_non_admin_cannot_create_delegation_returns_403`) le tient. Ce test
   * couvre l'autre moitié : ne pas PROPOSER un geste dont on connaît le refus.
   */
  it('cache la création ET la révocation à qui ne porte pas team.assign_role', () => {
    monte({ peutDeleguer: false });

    expect(screen.queryByRole('button', { name: 'Déléguer un rôle' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Révoquer la délégation/ }),
    ).not.toBeInTheDocument();
  });

  it('interroge la capacité DANS le contexte de l’agence, jamais globalement', () => {
    monte();

    // Une capacité se juge pour un couple (utilisateur, agence) — principe
    // non négociable n°2. Omettre `agencyId` interrogerait le profil actif,
    // qui peut être celui d'une AUTRE agence.
    expect(vi.mocked(useCanAll).mock.calls[0][1]).toEqual({ agencyId: 7 });
  });

  it('offre la révocation aux seules délégations qu’elle changerait', () => {
    monte();

    const revocables = screen
      .getAllByRole('button', { name: /Révoquer la délégation/ })
      .map((b) => b.getAttribute('aria-label'));

    // `RoleDelegationService::revoke` sort en tête sur `expired` et `revoked`
    // — le bouton y serait un geste sans effet.
    expect(revocables).toHaveLength(2);
    expect(revocables.join(' ')).toContain('Diop 4');
    expect(revocables.join(' ')).toContain('Diop 3');
    expect(revocables.join(' ')).not.toContain('Diop 1');
  });

  it('ouvre la confirmation de révocation sur la bonne délégation', async () => {
    const user = userEvent.setup();
    monte();

    await user.click(
      screen.getByRole('button', { name: 'Révoquer la délégation de Awa Diop 4' }),
    );

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText(/Awa Diop 4/)).toBeInTheDocument();
  });

  /**
   * **Le cas que le ticket ne nomme pas, et qui est le plus coûteux des
   * quatre statuts.** `HasProfiles::hasActiveAgencyDelegation()` exige
   * `status = active` ET `ends_at > now()` : les droits tombent à `ends_at`,
   * à la seconde. Mais la colonne `status` n'est réécrite que par
   * `ProcessRoleDelegationsJob`, toutes les 5 minutes
   * (`config('role_delegations.scheduler_interval_minutes')`).
   *
   * Pendant cette fenêtre, l'API sert `status: "active"` pour une délégation
   * qui n'accorde plus rien. L'écran ne doit pas la relayer : il rassurerait
   * sur des droits éteints et proposerait une révocation sans effet.
   */
  it('traite comme expirée une délégation « active » dont ends_at est passée', () => {
    monte({
      delegations: [
        // Le job n'est pas encore passé : le serveur dit toujours « active ».
        delegation(5, 'active', { ends_at: '2026-08-01T00:00:00+00:00' }),
      ],
    });

    expect(screen.getByTestId('delegation-status-expired')).toHaveTextContent('Expirée');
    expect(screen.queryByTestId('delegation-status-active')).not.toBeInTheDocument();
    // Révoquer une délégation qui n'accorde plus rien est un geste vide.
    expect(
      screen.queryByRole('button', { name: /Révoquer la délégation/ }),
    ).not.toBeInTheDocument();
  });

  it('laisse « active » une délégation dont ends_at est encore devant', () => {
    monte({ delegations: [delegation(6, 'active', { ends_at: '2027-08-01T00:00:00+00:00' })] });

    expect(screen.getByTestId('delegation-status-active')).toHaveTextContent('Active');
    expect(
      screen.getByRole('button', { name: /Révoquer la délégation/ }),
    ).toBeInTheDocument();
  });

  /**
   * La symétrie inverse serait un mensonge : une délégation `scheduled` dont
   * le `starts_at` est passé n'accorde toujours RIEN — la policy exige
   * `status = active`, que seul le job pose. « Programmée » y est exact.
   */
  it('laisse « programmée » une délégation dont starts_at est passée', () => {
    monte({
      delegations: [
        delegation(7, 'scheduled', {
          starts_at: '2026-08-01T00:00:00+00:00',
          ends_at: '2027-08-01T00:00:00+00:00',
        }),
      ],
    });

    expect(screen.getByTestId('delegation-status-scheduled')).toHaveTextContent('Programmée');
  });

  it('rend un état vide plutôt qu’un tableau à zéro ligne', () => {
    monte({ delegations: [] });

    expect(screen.getByText('Aucune délégation')).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
  });
});
