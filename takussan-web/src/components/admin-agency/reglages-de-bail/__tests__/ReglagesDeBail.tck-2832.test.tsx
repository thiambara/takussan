import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

/**
 * TCK-2832 — la section « Réglages de bail » (maquette `app-agence-reglages-bail`, approche A) :
 * quatre cartes, la valeur appliquée et sa source, la valeur de la plateforme ; UN seul
 * « Enregistrer » qui n'écrit que les valeurs modifiées ; un refus sur les bornes de l'API avant
 * tout envoi ; le message du champ rendu par l'API (AC5) ; et « Revenir à la valeur de la
 * plateforme », qui retire la ligne d'agence (DELETE), jamais une écriture à 0.
 */
const { LECTURE, ENREGISTRER, REVENIR } = vi.hoisted(() => {
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
  return {
    LECTURE: {
      data: {
        data: {
          can_edit: true,
          settings: [
            reglage({ key: 'lease.late_fee_percent', value: 5, source: 'agency', platform_value: 0, setting_id: 41 }),
            reglage({ key: 'lease.late_fee_grace_days', type: 'integer', max: 30 }),
            reglage({ key: 'lease.early_termination_penalty_months', value: 2, platform_value: 2, type: 'integer', min: 1, max: 24 }),
            reglage({ key: 'lease.rent_review_max_pct', value: 10, source: 'agency', platform_value: 20, setting_id: 43, min_exclusive: true, max: 100 }),
          ],
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    ENREGISTRER: { mutateAsync: vi.fn(async (_v: { key: string; value: number }): Promise<unknown> => ({})), isPending: false },
    REVENIR: { mutateAsync: vi.fn(async (_v: { settingId: number }): Promise<unknown> => undefined), isPending: false },
  };
});

vi.mock('@/lib/queries/reglages-de-bail', () => ({
  useReglagesDeBail: () => LECTURE,
  useEnregistrerReglageDeBail: () => ENREGISTRER,
  useRevenirALaPlateforme: () => REVENIR,
}));

import { ReglagesDeBail } from '../ReglagesDeBail';

const carte = (titre: string) => screen.getByRole('region', { name: titre });
const champ = (titre: string) => within(carte(titre)).getByRole('textbox', { name: titre });
const enregistrer = () => screen.getAllByRole('button', { name: 'Enregistrer' })[0]!;

async function saisir(titre: string, valeur: string) {
  await userEvent.clear(champ(titre));
  await userEvent.type(champ(titre), valeur);
}

beforeEach(() => {
  ENREGISTRER.mutateAsync.mockReset();
  ENREGISTRER.mutateAsync.mockImplementation(async () => ({}));
  REVENIR.mutateAsync.mockClear();
});

describe('ReglagesDeBail (TCK-2832, approche A)', () => {
  it('dit, carte par carte, la valeur, sa source, la plateforme et les bornes de l’API', () => {
    render(withIntl(<ReglagesDeBail />));

    expect(champ('Pénalité de retard')).toHaveValue('5');
    expect(within(carte('Pénalité de retard')).getByText('Réglage de l’agence')).toBeInTheDocument();
    expect(within(carte('Délai de grâce')).getByText('Réglage de la plateforme')).toBeInTheDocument();
    expect(within(carte('Pénalité de retard')).getByText('De 0 à 50 %')).toBeInTheDocument();
    expect(within(carte('Indemnité de départ anticipé')).getByText('De 1 à 24 mois')).toBeInTheDocument();
    expect(within(carte('Plafond de révision du loyer')).getByText('Plus de 0, jusqu’à 100 %')).toBeInTheDocument();
    expect(within(carte('Plafond de révision du loyer')).getByText('20 %')).toBeInTheDocument();
    expect(screen.getByText('S’applique aussi aux baux en cours qui n’ont pas leur propre valeur.')).toBeInTheDocument();
  });

  it('sans modification, aucune barre d’enregistrement', () => {
    render(withIntl(<ReglagesDeBail />));
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });

  it('AC1 — un seul « Enregistrer » n’écrit que les valeurs modifiées', async () => {
    render(withIntl(<ReglagesDeBail />));

    await saisir('Délai de grâce', '7');
    await saisir('Pénalité de retard', '8');
    expect(screen.getAllByText('2 modifications non enregistrées · Pénalité de retard, Délai de grâce')[0]).toBeInTheDocument();
    // Le libellé RÉEL d'« Annuler » (common.actions) : une clé absente rend la clé en test, mais fait
    // tomber la page entière dans le navigateur à la première saisie (relevé du 2026-11-14).
    expect(screen.getAllByRole('button', { name: 'Annuler' }).length).toBeGreaterThan(0);
    await userEvent.click(enregistrer());

    expect(ENREGISTRER.mutateAsync).toHaveBeenCalledTimes(2);
    expect(ENREGISTRER.mutateAsync).toHaveBeenCalledWith({ key: 'lease.late_fee_percent', value: 8 });
    expect(ENREGISTRER.mutateAsync).toHaveBeenCalledWith({ key: 'lease.late_fee_grace_days', value: 7 });
    expect(await screen.findByText('Réglages enregistrés. Vos prochains baux les reprennent.')).toBeInTheDocument();
  });

  it('AC2 — « Revenir à la valeur de la plateforme » retire la ligne d’agence, sans rien écrire', async () => {
    render(withIntl(<ReglagesDeBail />));

    await userEvent.click(within(carte('Pénalité de retard')).getByRole('button', { name: 'Revenir à la valeur de la plateforme' }));

    expect(REVENIR.mutateAsync).toHaveBeenCalledWith({ settingId: 41 });
    expect(ENREGISTRER.mutateAsync).not.toHaveBeenCalled();
  });

  it('une carte sans ligne d’agence ne propose pas d’y revenir', () => {
    render(withIntl(<ReglagesDeBail />));
    expect(within(carte('Délai de grâce')).queryByRole('button', { name: /Revenir/ })).toBeNull();
  });

  it('une valeur hors des bornes est refusée avant tout envoi, et rien ne part', async () => {
    render(withIntl(<ReglagesDeBail />));

    await saisir('Pénalité de retard', '60');
    await saisir('Délai de grâce', '3');
    await userEvent.click(enregistrer());

    expect(within(carte('Pénalité de retard')).getByText('La pénalité de retard ne peut pas dépasser 50 %.')).toBeInTheDocument();
    expect(champ('Pénalité de retard')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText('1 valeur à corriger avant d’enregistrer')[0]).toBeInTheDocument();
    expect(ENREGISTRER.mutateAsync).not.toHaveBeenCalled();
  });

  it('l’indemnité se juge sur les bornes de l’API (1 à 24), en entier', async () => {
    render(withIntl(<ReglagesDeBail />));

    await saisir('Indemnité de départ anticipé', '0');
    await userEvent.click(enregistrer());
    expect(within(carte('Indemnité de départ anticipé')).getByText('L’indemnité de départ ne peut pas descendre sous 1 mois.')).toBeInTheDocument();

    await saisir('Indemnité de départ anticipé', '2.5');
    await userEvent.click(enregistrer());
    expect(within(carte('Indemnité de départ anticipé')).getByText('L’indemnité de départ se saisit en nombre entier.')).toBeInTheDocument();
    expect(ENREGISTRER.mutateAsync).not.toHaveBeenCalled();
  });

  it('AC5 — un refus de l’API se dit avec le message du champ, sur sa carte', async () => {
    ENREGISTRER.mutateAsync.mockRejectedValueOnce(
      new ApiError(422, { message: 'Invalide', errors: { value: ['La valeur ne peut pas dépasser 50.'] } }),
    );
    render(withIntl(<ReglagesDeBail />));

    await saisir('Pénalité de retard', '12');
    await userEvent.click(enregistrer());

    await waitFor(() => expect(within(carte('Pénalité de retard')).getByText('La valeur ne peut pas dépasser 50.')).toBeInTheDocument());
  });
});
