import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2921 — trois états de la section « Réglages de bail » (maquette `app-agence-reglages-bail` a) :
 *
 * - AC1 (e1) : aucun réglage de source `agency` → l'encart « Votre agence n'a encore rien réglé… » ;
 * - AC2/AC3 (e3, e4) : venu du nouveau bail (`retour`) → « Vous venez du nouveau bail de X » et
 *   « Reprendre le bail » vers la même adresse ; après « Enregistrer », l'encart passe au succès ;
 *   arrivé d'ailleurs, aucun encart de bail ;
 * - AC4 (e5) : `can_edit: false` → l'encart de lecture et les quatre valeurs en texte, aucun champ,
 *   ni « Enregistrer » ni « Revenir à la valeur de la plateforme ». Choisi sur `can_edit` SEUL.
 */
const { LECTURE, ENREGISTRER, REVENIR, LOCATAIRES } = vi.hoisted(() => {
  const reglage = (surcharge: Record<string, unknown>) => ({
    value: 0,
    source: 'platform',
    platform_value: 0,
    setting_id: null,
    type: 'decimal',
    min: 0,
    min_exclusive: false,
    max: 50,
    ...surcharge,
  });
  const reglages = {
    agence: [
      reglage({ key: 'lease.late_fee_percent', value: 5, source: 'agency', platform_value: 0, setting_id: 41 }),
      reglage({ key: 'lease.late_fee_grace_days', type: 'integer', max: 30 }),
      reglage({ key: 'lease.early_termination_penalty_months', value: 2, platform_value: 2, type: 'integer', max: 12 }),
      reglage({ key: 'lease.rent_review_max_pct', value: 10, source: 'agency', platform_value: 20, setting_id: 43, min_exclusive: true, max: 100 }),
    ],
    plateforme: [
      reglage({ key: 'lease.late_fee_percent' }),
      reglage({ key: 'lease.late_fee_grace_days', type: 'integer', max: 30 }),
      reglage({ key: 'lease.early_termination_penalty_months', value: 2, platform_value: 2, type: 'integer', max: 12 }),
      reglage({ key: 'lease.rent_review_max_pct', value: 20, platform_value: 20, min_exclusive: true, max: 100 }),
    ],
  };
  return {
    LECTURE: {
      reglages,
      data: { data: { can_edit: true, settings: reglages.agence } } as { data: { can_edit: boolean; settings: unknown[] } },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    ENREGISTRER: { mutateAsync: vi.fn(async (_v: { key: string; value: number }): Promise<unknown> => ({})), isPending: false },
    REVENIR: { mutateAsync: vi.fn(async (_v: { settingId: number }): Promise<unknown> => undefined), isPending: false },
    LOCATAIRES: new Map<number, { data: unknown }>([[7, { data: { id: 7, first_name: 'Ndèye Sokhna', last_name: 'Thiam' } }]]),
  };
});

vi.mock('@/lib/queries/reglages-de-bail', () => ({
  useReglagesDeBail: () => LECTURE,
  useEnregistrerReglageDeBail: () => ENREGISTRER,
  useRevenirALaPlateforme: () => REVENIR,
}));
vi.mock('@/lib/queries/leases', () => ({
  useLeaseCustomer: (id: number | null | undefined) => ({ data: id ? LOCATAIRES.get(id) : undefined }),
}));

import { ReglagesDeBail } from '../ReglagesDeBail';

const TEXTE_VIDE = /Votre agence n’a encore rien réglé : chaque nouveau bail reprend les valeurs de la plateforme/;
const TEXTE_LECTURE = 'Vous pouvez consulter ces réglages, pas les modifier. Seule une personne qui administre l’agence peut les changer.';
const RETOUR = { propertyId: 11, customerId: 7, locataireId: 7 } as const;
const carte = (titre: string) => screen.getByRole('region', { name: titre });

function poser(canEdit: boolean, jeu: 'agence' | 'plateforme') {
  LECTURE.data = { data: { can_edit: canEdit, settings: LECTURE.reglages[jeu] } };
}

beforeEach(() => {
  poser(true, 'agence');
  ENREGISTRER.mutateAsync.mockReset();
  ENREGISTRER.mutateAsync.mockImplementation(async () => ({}));
});

describe('AC1 (e1) — rien de réglé', () => {
  it('quatre réglages de la plateforme : l’encart est rendu', () => {
    poser(true, 'plateforme');
    render(withIntl(<ReglagesDeBail />));
    expect(screen.getByText(TEXTE_VIDE)).toBeInTheDocument();
  });

  it('un réglage de l’agence suffit à le retirer', () => {
    render(withIntl(<ReglagesDeBail />));
    expect(screen.queryByText(TEXTE_VIDE)).toBeNull();
  });

  it('en lecture, il ne s’adresse pas à qui ne peut rien changer', () => {
    poser(false, 'plateforme');
    render(withIntl(<ReglagesDeBail />));
    expect(screen.queryByText(TEXTE_VIDE)).toBeNull();
  });
});

describe('AC2/AC3 (e3, e4) — venu du nouveau bail', () => {
  it('nomme le locataire du bail et y ramène, à la même adresse', () => {
    render(withIntl(<ReglagesDeBail retour={RETOUR} />));
    expect(screen.getByText(/Vous venez du nouveau bail de/)).toHaveTextContent(
      'Vous venez du nouveau bail de Ndèye Sokhna Thiam. Votre saisie est gardée en brouillon.',
    );
    expect(screen.getByRole('link', { name: 'Reprendre le bail' })).toHaveAttribute('href', '/app/leases/new?property=11&customer=7');
  });

  it('sans locataire choisi, la phrase sans nom', () => {
    render(withIntl(<ReglagesDeBail retour={{ propertyId: 11 }} />));
    expect(screen.getByText('Vous venez d’un nouveau bail. Votre saisie est gardée en brouillon.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reprendre le bail' })).toHaveAttribute('href', '/app/leases/new?property=11');
  });

  it('après « Enregistrer », l’encart passe au succès, « Reprendre le bail » toujours là', async () => {
    const user = userEvent.setup();
    render(withIntl(<ReglagesDeBail retour={RETOUR} />));
    const champ = within(carte('Pénalité de retard')).getByRole('textbox', { name: 'Pénalité de retard' });
    await user.clear(champ);
    await user.type(champ, '8');
    await user.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0]!);

    const encart = await screen.findByText((_contenu, el) => el?.tagName === 'P' && el.textContent === 'Réglages enregistrés. Vos prochains baux les reprennent.' && el.closest('[data-slot="encart-des-reglages"]') !== null);
    expect(within(encart.closest('[data-slot="encart-des-reglages"]') as HTMLElement).getByRole('link', { name: 'Reprendre le bail' })).toHaveAttribute(
      'href',
      '/app/leases/new?property=11&customer=7',
    );
    expect(screen.queryByText(/Vous venez du nouveau bail/)).toBeNull();
  });

  it('arrivé sans paramètre de retour : aucun encart de bail', async () => {
    const user = userEvent.setup();
    render(withIntl(<ReglagesDeBail />));
    expect(screen.queryByText(/Vous venez/)).toBeNull();
    const champ = within(carte('Pénalité de retard')).getByRole('textbox', { name: 'Pénalité de retard' });
    await user.clear(champ);
    await user.type(champ, '8');
    await user.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0]!);
    expect(await screen.findByText('Réglages enregistrés. Vos prochains baux les reprennent.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reprendre le bail' })).toBeNull();
  });
});

describe('AC4 (e5) — lecture seule, sur `can_edit` seul', () => {
  it('l’encart de lecture, les quatre valeurs en texte, aucun champ ni geste d’écriture', () => {
    poser(false, 'agence');
    const { container } = render(withIntl(<ReglagesDeBail retour={RETOUR} />));

    expect(screen.getByText(TEXTE_LECTURE)).toBeInTheDocument();
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revenir à la valeur de la plateforme/ })).toBeNull();
    // Ni encart du bail : on n'y vient que par « Modifier », que l'API ne montre qu'à qui écrit.
    expect(screen.queryByRole('link', { name: 'Reprendre le bail' })).toBeNull();

    const valeurs = [...container.querySelectorAll('[data-slot="valeur-du-reglage"]')].map((n) => n.textContent?.replace(/ | /g, ' '));
    expect(valeurs).toEqual(['5 %', '0 jour', '2 mois', '10 %']);
    expect(within(carte('Pénalité de retard')).getByText('Réglage de l’agence')).toBeInTheDocument();
    expect(within(carte('Plafond de révision du loyer')).getByText('20 %')).toBeInTheDocument();
  });

  it('avec `can_edit: true`, les quatre champs sont là (e0 inchangé)', () => {
    render(withIntl(<ReglagesDeBail />));
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
    expect(screen.queryByText(TEXTE_LECTURE)).toBeNull();
  });
});
