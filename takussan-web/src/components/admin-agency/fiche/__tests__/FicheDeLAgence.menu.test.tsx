import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/app/actions/admin-agency', async () => (await import('./doublures')).ACTIONS);
vi.mock('@/context/AuthContext', async () => (await import('./doublures')).auth);
vi.mock('@/hooks/useCan', async () => (await import('./doublures')).can);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);
vi.mock('@/lib/queries/admin-users', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).EQUIPE }));
vi.mock('@/lib/queries/agency-queues', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).fileDeModeration }));

import fr from '@/messages/fr.json';
import { CODES_DE_MODULE } from '@/lib/navigation/modules';
import type { Agency } from '@/types/agency';

import { ACTIONS, reinitialiserLesDoublures } from './doublures';
import { AGENCE, INDIVIDUELLE, barreDuBureau, champ, enregistrer, rendreLaFiche } from './outils';

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence »), porté sur la section « Menu de l'équipe »
 * de la fiche (TCK-2670).
 *
 * Cochée = affichée : une agence sans la clé a tout coché ; décocher puis enregistrer envoie
 * `settings.hidden_modules` dans l'ordre des codes, `[]` compris (tout réafficher doit s'enregistrer).
 * Section intacte : la clé ne part pas (revue, M5) — l'API conserve une clé absente, et la liste lue
 * au chargement écraserait celle qu'un autre admin aurait enregistrée depuis.
 * Une agence `individual` n'a pas la section et n'envoie pas la clé (l'API la refuse, 422).
 */

const M = fr.admin.agencyConfig.modules;
type Code = keyof typeof M.items;
const LIBELLE: Record<Code, string> = { ...Object.fromEntries(CODES_DE_MODULE.map((c) => [c, M.items[c].label])) } as Record<Code, string>;
const caseDe = (code: Code) => screen.queryByRole('checkbox', { name: new RegExp(`^${LIBELLE[code]}`) });
const ouvrir = (agence: Agency) => rendreLaFiche(agence, { section: 'menu' });
const avec = (hidden_modules: unknown): Agency => ({ ...AGENCE, settings: { hidden_modules } as Agency['settings'] });

beforeEach(() => {
  reinitialiserLesDoublures();
  ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: AGENCE });
});

describe('Fiche de l’agence — menu de l’équipe (TCK-2483)', () => {
  it('chaque code de module a son libellé, et seulement eux', () => {
    expect(Object.keys(M.items)).toEqual([...CODES_DE_MODULE]);
  });

  it('une agence sans la clé : les six modules sont affichés (cases cochées)', () => {
    ouvrir(AGENCE);
    expect(screen.getByRole('heading', { level: 2, name: fr.admin.agencyConfig.fiche.menu.titre })).toBeInTheDocument();
    for (const code of CODES_DE_MODULE) expect(caseDe(code), code).toBeChecked();
  });

  // TCK-2670 (fidélité, ADR-0106 § 2 c) — la case est celle de la partie connectée (`ui/checkbox`),
  // jamais un <input> natif : check-champs-uniformes ne voit pas les cases à cocher.
  it('chaque case est la primitive `ui/checkbox`, pas un champ natif', () => {
    ouvrir(AGENCE);
    for (const code of CODES_DE_MODULE) {
      const c = caseDe(code)!;
      expect(c.tagName, code).not.toBe('INPUT');
      expect(c).toHaveAttribute('data-slot', 'checkbox');
    }
  });

  it('un module masqué a sa case décochée, et la case dit ce qu’elle retire', () => {
    ouvrir(avec(['commissions']));
    expect(caseDe('commissions')).not.toBeChecked();
    expect(caseDe('calendar')).toBeChecked();
    expect(caseDe('analytics')).toHaveAccessibleDescription(M.items.analytics.hint);
  });

  it('section intacte : une autre modification n’envoie pas la liste lue au chargement', async () => {
    const user = userEvent.setup();
    rendreLaFiche(avec(['analytics']));
    await user.type(champ('name'), ' Plateau');
    expect(await enregistrer(user)).toEqual({ name: 'Dakar Immo Plateau' });
  });

  it('un code inconnu lu sur l’agence ne décoche rien, et ne repart pas quand une case change', async () => {
    const user = userEvent.setup();
    ouvrir(avec(['obsolete', 'credits']));
    for (const code of CODES_DE_MODULE) {
      if (code === 'credits') expect(caseDe(code)).not.toBeChecked();
      else expect(caseDe(code), code).toBeChecked();
    }
    await user.click(caseDe('calendar')!);
    expect(await enregistrer(user)).toEqual({ settings: { hidden_modules: ['calendar', 'credits'] } });
  });

  it('décocher « Calendrier » puis enregistrer envoie la liste dans l’ordre des codes', async () => {
    const user = userEvent.setup();
    ouvrir(avec(['analytics']));
    await user.click(caseDe('calendar')!);
    expect(caseDe('calendar')).not.toBeChecked();
    expect(await enregistrer(user)).toEqual({ settings: { hidden_modules: ['calendar', 'analytics'] } });
  });

  it('tout recocher envoie une liste vide (le réaffichage s’enregistre)', async () => {
    const user = userEvent.setup();
    ouvrir(avec(['credits']));
    await user.click(caseDe('credits')!);
    expect(caseDe('credits')).toBeChecked();
    expect(await enregistrer(user)).toEqual({ settings: { hidden_modules: [] } });
  });

  it('décocher puis recocher n’est pas une modification', async () => {
    const user = userEvent.setup();
    ouvrir(AGENCE);
    await user.click(caseDe('calendar')!);
    expect(barreDuBureau()).not.toBeNull();
    await user.click(caseDe('calendar')!);
    expect(barreDuBureau()).toBeNull();
  });

  // Revue adverse de TCK-2486, M1 — la référence suit la RÉPONSE de l'API, et l'écran aussi.
  it('revue M1 — la liste rendue par l’enregistrement fait foi pour l’écran et pour l’envoi suivant', async () => {
    const user = userEvent.setup();
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: avec(['analytics', 'calendar']) });
    ouvrir(AGENCE);
    await user.click(caseDe('calendar')!);
    expect(await enregistrer(user)).toEqual({ settings: { hidden_modules: ['calendar'] } });
    await waitFor(() => expect(caseDe('analytics')).not.toBeChecked());

    await user.click(caseDe('calendar')!);
    expect(await enregistrer(user, 2)).toEqual({ settings: { hidden_modules: ['analytics'] } });
  });

  it('l’aperçu barre l’entrée masquée du menu d’un agent', async () => {
    const user = userEvent.setup();
    ouvrir(AGENCE);
    const apercu = screen.getByText(fr.admin.agencyConfig.fiche.menu.apercu).closest('div')!.parentElement!;
    expect(within(apercu).queryAllByRole('img', { name: fr.admin.agencyConfig.fiche.menu.masque })).toHaveLength(0);
    await user.click(caseDe('calendar')!);
    expect(within(apercu).getAllByRole('img', { name: fr.admin.agencyConfig.fiche.menu.masque }).length).toBeGreaterThan(0);
  });

  it('une agence individuelle n’a pas la section, ni sa ligne, et n’envoie pas la clé', async () => {
    const user = userEvent.setup();
    ouvrir({ ...INDIVIDUELLE, settings: { hidden_modules: ['calendar'] } });
    // `?section=menu` n'existe pas pour elle : la fiche ouvre l'identité.
    expect(screen.queryByRole('heading', { level: 2, name: fr.admin.agencyConfig.fiche.menu.titre })).toBeNull();
    expect(caseDe('calendar')).toBeNull();
    expect(screen.queryByRole('link', { name: new RegExp(fr.admin.agencyConfig.fiche.sections.menu.titre) })).toBeNull();
    await user.type(champ('name'), ' Plateau');
    expect(await enregistrer(user)).toEqual({ name: 'Awa Ndiaye Plateau' });
  });
});
