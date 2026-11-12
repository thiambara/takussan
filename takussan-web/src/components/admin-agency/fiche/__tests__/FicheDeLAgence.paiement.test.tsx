import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/app/actions/admin-agency', async () => (await import('./doublures')).ACTIONS);
vi.mock('@/context/AuthContext', async () => (await import('./doublures')).auth);
vi.mock('@/hooks/useCan', async () => (await import('./doublures')).can);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);
vi.mock('@/lib/queries/admin-users', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).EQUIPE }));
vi.mock('@/lib/queries/agency-queues', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).fileDeModeration }));

import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';

import { ACTIONS, reinitialiserLesDoublures } from './doublures';
import { AGENCE, barreDuBureau, champ, enregistrer, rendreLaFiche } from './outils';

/**
 * TCK-2536, porté sur la fiche de TCK-2670 — les moyens de paiement hors ligne de l'agence (contrat
 * de TCK-2504) : `settings.offline_payment_wave_number`, `settings.offline_payment_orange_money_number`
 * (rendus en E.164 par l'API) et `settings.offline_payment_bank_details` (500 caractères au plus).
 *
 * L'API FUSIONNE `settings` clé par clé : une clé absente est conservée, une clé à `null` est effacée.
 * La fiche n'envoie donc que les clés modifiées — un `null` parti par mégarde effacerait le numéro
 * qu'un locataire lit sur son lien de paiement.
 */

const DECLAREE: Agency = {
  ...AGENCE,
  settings: {
    offline_payment_wave_number: '+221771234567',
    offline_payment_orange_money_number: '+221781112233',
    offline_payment_bank_details: 'BICIS Dakar\nSN012 01001 000123456789 21',
  },
};

const wave = () => champ('offline_payment_wave_number');
const orange = () => champ('offline_payment_orange_money_number');
const banque = () => champ('offline_payment_bank_details');
const ouvrir = (agence: Agency) => rendreLaFiche(agence, { section: 'paiement' });

beforeEach(() => {
  reinitialiserLesDoublures();
  ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: AGENCE });
});

describe('Fiche de l’agence — paiement hors ligne (TCK-2536)', () => {
  it('lit les trois réglages tels que l’API les rend, sans reformatage local', () => {
    ouvrir(DECLAREE);
    expect(wave()).toHaveValue('+221771234567');
    expect(orange()).toHaveValue('+221781112233');
    expect(banque()).toHaveValue('BICIS Dakar\nSN012 01001 000123456789 21');
  });

  it('une agence sans réglage a trois champs vides', () => {
    ouvrir(AGENCE);
    expect(wave()).toHaveValue('');
    expect(orange()).toHaveValue('');
    expect(banque()).toHaveValue('');
  });

  it('les trois champs paraissent aussi pour une agence individuelle (l’API ne les lui refuse pas)', () => {
    ouvrir({ ...DECLAREE, kind: 'individual' });
    expect(wave()).toHaveValue('+221771234567');
    expect(banque()).toBeInTheDocument();
  });

  it('rien de touché : pas de barre, rien à envoyer', () => {
    ouvrir(DECLAREE);
    expect(barreDuBureau()).toBeNull();
  });

  it('AC1 — la saisie libre part telle quelle, SEULE, et le champ affiche ensuite le numéro normalisé rendu par l’API', async () => {
    ACTIONS.updateAgencyAction.mockResolvedValue({
      ok: true,
      data: { ...DECLAREE, settings: { ...DECLAREE.settings, offline_payment_wave_number: '+221771234500' } },
    });
    const user = userEvent.setup();
    ouvrir(DECLAREE);

    await user.clear(wave());
    await user.type(wave(), '77 123 45 00');
    const corps = await enregistrer(user);

    expect(corps).toEqual({ settings: { offline_payment_wave_number: '77 123 45 00' } });
    await waitFor(() => expect(wave()).toHaveValue('+221771234500'));
    expect(screen.getByText(fr.admin.agencyConfig.successSaved)).toBeInTheDocument();
    // La réponse fait foi : l'E.164 relu n'est pas une modification.
    expect(barreDuBureau()).toBeNull();
  });

  // Revue de TCK-2536 — Orange Money a sa propre relecture : la tester par Wave ne disait rien d'elle.
  it('AC1 — Orange Money, seul touché : la saisie part seule, le champ relit l’E.164 de l’API, et un second envoi ne le renvoie pas', async () => {
    ACTIONS.updateAgencyAction.mockResolvedValue({
      ok: true,
      data: { ...DECLAREE, settings: { ...DECLAREE.settings, offline_payment_orange_money_number: '+221781112234' } },
    });
    const user = userEvent.setup();
    ouvrir(DECLAREE);

    await user.clear(orange());
    await user.type(orange(), '78 111 22 34');
    expect(await enregistrer(user)).toEqual({ settings: { offline_payment_orange_money_number: '78 111 22 34' } });
    await waitFor(() => expect(orange()).toHaveValue('+221781112234'));
    expect(wave()).toHaveValue('+221771234567');

    await user.type(banque(), '{Enter}Agence Plateau');
    expect(await enregistrer(user, 2)).toEqual({
      settings: { offline_payment_bank_details: 'BICIS Dakar\nSN012 01001 000123456789 21\nAgence Plateau' },
    });
  });

  it('AC1 — relu après l’enregistrement, un second envoi ne renvoie pas le numéro (la référence suit la réponse)', async () => {
    ACTIONS.updateAgencyAction.mockResolvedValue({ ok: true, data: { ...AGENCE, settings: { offline_payment_wave_number: '+221771234567' } } });
    const user = userEvent.setup();
    ouvrir(AGENCE);

    await user.type(wave(), '77 123 45 67');
    await enregistrer(user);
    await waitFor(() => expect(wave()).toHaveValue('+221771234567'));

    await user.type(orange(), '781112233');
    expect(await enregistrer(user, 2)).toEqual({ settings: { offline_payment_orange_money_number: '781112233' } });
  });

  it('AC2 — l’erreur 422 de l’API s’affiche sous le bon champ, et pas dans le bandeau', async () => {
    ACTIONS.updateAgencyAction.mockResolvedValue({
      ok: false,
      status: 422,
      message: 'Les données fournies sont invalides.',
      errors: { 'settings.offline_payment_orange_money_number': ['Ce numéro de téléphone n’est pas valide.'] },
    });
    const user = userEvent.setup();
    ouvrir(AGENCE);

    await user.type(orange(), 'abc');
    await enregistrer(user);

    await waitFor(() => expect(orange()).toHaveAttribute('aria-invalid', 'true'));
    expect(orange()).toHaveAccessibleDescription('Ce numéro de téléphone n’est pas valide.');
    expect(wave()).not.toHaveAttribute('aria-invalid');
    expect(banque()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Les données fournies sont invalides.')).not.toBeInTheDocument();
    expect(screen.queryByText(fr.admin.agencyConfig.successSaved)).not.toBeInTheDocument();
  });

  it('AC2 — l’erreur de longueur des coordonnées bancaires va sous la zone de texte', async () => {
    ACTIONS.updateAgencyAction.mockResolvedValue({
      ok: false,
      status: 422,
      message: 'Les données fournies sont invalides.',
      errors: { 'settings.offline_payment_bank_details': ['Le texte ne peut pas dépasser 500 caractères.'] },
    });
    const user = userEvent.setup();
    ouvrir(AGENCE);

    await user.type(banque(), 'BICIS');
    await enregistrer(user);

    await waitFor(() => expect(banque()).toHaveAttribute('aria-invalid', 'true'));
    expect(banque()).toHaveAccessibleDescription(expect.stringContaining('Le texte ne peut pas dépasser 500 caractères.'));
  });

  it('AC3 — vider un champ envoie null pour LUI seul ; les deux autres ne partent pas', async () => {
    const user = userEvent.setup();
    ouvrir(DECLAREE);
    await user.clear(orange());
    expect(await enregistrer(user)).toEqual({ settings: { offline_payment_orange_money_number: null } });
  });

  it('AC3 — un champ réduit à des blancs vaut vide : null', async () => {
    const user = userEvent.setup();
    ouvrir(DECLAREE);
    await user.clear(banque());
    await user.type(banque(), '   ');
    expect(await enregistrer(user)).toEqual({ settings: { offline_payment_bank_details: null } });
  });

  it('des blancs ajoutés autour d’une valeur inchangée ne la font pas partir (l’API les retire) : aucune modification', async () => {
    const user = userEvent.setup();
    ouvrir(DECLAREE);
    await user.type(banque(), '  ');
    expect(barreDuBureau()).toBeNull();
  });

  it('les sauts de ligne des coordonnées bancaires partent tels quels', async () => {
    const user = userEvent.setup();
    ouvrir(AGENCE);
    await user.type(banque(), 'CBAO{Enter}SN08 1234');
    expect(await enregistrer(user)).toEqual({ settings: { offline_payment_bank_details: 'CBAO\nSN08 1234' } });
  });

  it('la zone de texte est bornée à 500 caractères, comme l’API', () => {
    ouvrir(AGENCE);
    expect(banque()).toHaveAttribute('maxLength', '500');
  });

  it('l’aperçu du lien de paiement suit la saisie', async () => {
    const user = userEvent.setup();
    ouvrir(AGENCE);
    expect(screen.getByText(fr.admin.agencyConfig.fiche.paiement.apercuVide)).toBeInTheDocument();
    await user.type(wave(), '77 123 45 67');
    expect(screen.queryByText(fr.admin.agencyConfig.fiche.paiement.apercuVide)).toBeNull();
    expect(screen.getAllByText('77 123 45 67').length).toBeGreaterThan(0);
  });
});
