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
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).API }));

import fr from '@/messages/fr.json';
import type { Agency } from '@/types/agency';
import type { KycDocument, KycDossier } from '@/types/super-admin';

import { ACTIONS, KYC, ROUTEUR, reinitialiserLesDoublures } from './doublures';
import { AGENCE, INDIVIDUELLE, barreDuBureau, champ, enregistrer, rendreLaFiche } from './outils';

/**
 * TCK-2670 — la fiche de l'agence : un formulaire pour toutes les sections, une barre, un `PATCH`
 * qui ne porte que ce qui a changé ; la jauge de complétude ; la garde de sortie ; la reprise des
 * numéros du dossier de vérification ; un refus dans une autre section qui y mène.
 *
 * Les deux structures (téléphone et bureau) sont dans le même arbre, découpées par CSS : jsdom les
 * voit toutes les deux, chaque requête se borne donc à son `data-slot`.
 */

const sommaire = () => document.querySelector<HTMLElement>('[data-slot="sommaire-de-la-fiche"]')!;
const navigationDuBureau = () => document.querySelector<HTMLElement>('[data-slot="navigation-des-sections"]')!;
const jaugeDuBureau = () => document.querySelector<HTMLElement>('[data-slot="jauge-de-la-fiche"]');
const sectionDeLURL = () => new URLSearchParams(window.location.search).get('section');

const MIEUX: Agency = { ...AGENCE, logo_url: 'http://127.0.0.1:8002/storage/logo.png', phone: '+221338210000', email: 'contact@dakar-immo.sn' };

function piece(id: number, type: 'ninea' | 'rccm', numero: string | null): KycDocument {
  return { id, document_type: type, document_number: numero, status: 'pending' } as unknown as KycDocument;
}
function dossier(documents: KycDocument[], status: KycDossier['status'] = 'pending'): { data: KycDossier } {
  return { data: { id: 3, status, documents, expires_at: null } as unknown as KycDossier };
}

beforeEach(() => {
  reinitialiserLesDoublures();
  ACTIONS.updateAgencyAction.mockImplementation(async (_id: number, corps: Record<string, unknown>) => ({
    ok: true,
    data: { ...AGENCE, ...corps, settings: { ...(corps.settings as object) } },
  }));
});

describe('TCK-2670 — un formulaire pour toutes les sections', () => {
  it('AC1 — Wave puis l’accroche, deux sections : « 2 modifications », un seul PATCH, ces deux clés seules', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AGENCE, { section: 'paiement', vitrine: true });

    await user.type(champ('offline_payment_wave_number'), '77 123 45 67');
    expect(within(barreDuBureau()!).getByText(/1 modification non enregistrée/)).toBeInTheDocument();

    // Changer de section ne relit rien et ne perd rien : la section est dans l'URL, le formulaire reste monté.
    await user.click(within(navigationDuBureau()).getByRole('link', { name: /Fiche publique/ }));
    expect(sectionDeLURL()).toBe('publique');
    await user.type(await screen.findByLabelText(/Accroche/), 'Votre agence au Plateau');

    expect(within(barreDuBureau()!).getByText(/2 modifications non enregistrées/)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="barre-de-la-fiche-telephone"]')).toHaveTextContent('2 modifications');

    const corps = await enregistrer(user);
    expect(corps).toEqual({ tagline: 'Votre agence au Plateau', settings: { offline_payment_wave_number: '77 123 45 67' } });
    expect(ACTIONS.updateAgencyAction).toHaveBeenCalledTimes(1);
    expect(ACTIONS.updateAgencyAction).toHaveBeenCalledWith(7, corps);

    // Enregistré : la barre s'en va, le message dit « enregistré », la page est relue.
    await waitFor(() => expect(barreDuBureau()).toBeNull());
    expect(ROUTEUR.refresh).toHaveBeenCalledTimes(1);
  });

  it('sans modification, ni barre ni « Enregistrer » : rien à envoyer', async () => {
    rendreLaFiche(AGENCE, { section: 'paiement' });
    await screen.findByText('Paiement hors ligne', { selector: 'h2' });
    expect(barreDuBureau()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });

  it('« Annuler » remet toute la saisie à l’enregistré, toutes sections', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AGENCE, { section: 'paiement' });
    await user.type(champ('offline_payment_wave_number'), '771234567');
    await user.click(within(navigationDuBureau()).getByRole('link', { name: /Identité et contact/ }));
    await user.type(champ('phone'), '+221338210000');

    await user.click(within(barreDuBureau()!).getByRole('button', { name: 'Annuler' }));
    expect(barreDuBureau()).toBeNull();
    expect(champ('phone')).toHaveValue('');
    await user.click(within(navigationDuBureau()).getByRole('link', { name: /Paiement hors ligne/ }));
    expect(champ('offline_payment_wave_number')).toHaveValue('');
  });

  it('une agence relue sans envoi (logo déposé, puis `router.refresh()`) garde la saisie en cours', async () => {
    const user = userEvent.setup();
    const { relire } = rendreLaFiche(AGENCE);
    await user.type(champ('phone'), '+221338210000');

    relire({ ...AGENCE, logo_url: 'http://127.0.0.1:8002/storage/logo.png' });

    expect(champ('phone')).toHaveValue('+221338210000');
    expect(within(barreDuBureau()!).getByText(/1 modification non enregistrée/)).toBeInTheDocument();
    // Le logo relu n'est pas une modification : seul le téléphone part.
    expect(await enregistrer(user)).toEqual({ phone: '+221338210000' });
  });

  it('un refus de second facteur ouvre la garde, puis l’enregistrement est rejoué (TCK-761)', async () => {
    ACTIONS.updateAgencyAction
      .mockResolvedValueOnce({ ok: false, status: 403, message: 'Second facteur requis.', code: 'two_factor_required' })
      .mockResolvedValueOnce({ ok: true, data: { ...AGENCE, phone: '+221338210000' } });
    const garde = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    rendreLaFiche(AGENCE, { garde });
    await user.type(champ('phone'), '+221338210000');

    await enregistrer(user, 2);
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(screen.queryByText('Second facteur requis.')).toBeNull();
  });
});

describe('TCK-2670 — un refus dans une autre section y mène', () => {
  it('un 422 sur le nom, envoyé depuis « Paiement » : la fiche ouvre « Identité », l’erreur sous le champ, le point d’alerte', async () => {
    ACTIONS.updateAgencyAction.mockResolvedValueOnce({
      ok: false,
      status: 422,
      message: 'Les données sont invalides.',
      errors: { name: ['Ce nom est déjà pris.'] },
    });
    const user = userEvent.setup();
    rendreLaFiche(AGENCE, { section: 'identite' });
    await user.clear(champ('name'));
    await user.type(champ('name'), 'Immo Plateau');
    await user.click(within(navigationDuBureau()).getByRole('link', { name: /Paiement hors ligne/ }));
    await user.type(champ('offline_payment_wave_number'), '771234567');

    await enregistrer(user);

    await waitFor(() => expect(sectionDeLURL()).toBe('identite'));
    expect(champ('name')).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('field-name-error')).toHaveTextContent('Ce nom est déjà pris.');
    await waitFor(() => expect(document.activeElement).toBe(champ('name')));
    const ligne = within(navigationDuBureau()).getByRole('link', { name: /Identité et contact/ });
    expect(within(ligne).getByRole('img', { name: fr.admin.agencyConfig.fiche.etats.alerte })).toBeInTheDocument();
    // La saisie de l'autre section n'est pas perdue.
    expect(within(barreDuBureau()!).getByText(/2 modifications non enregistrées/)).toBeInTheDocument();
  });
});

describe('TCK-2670 — la garde de sortie', () => {
  it('un lien qui quitte la fiche est retenu : « Rester » garde tout, « Abandonner » remet à l’enregistré et part', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AGENCE);
    await user.type(champ('phone'), '+221338210000');
    const verification = () => within(navigationDuBureau()).getByRole('link', { name: /Vérification/ });
    let parti = 0;
    const compter = (e: MouseEvent) => {
      if ((e.target as Element).closest('a')?.getAttribute('href') === '/app/agency/kyc') parti += 1;
      e.preventDefault();
    };
    document.addEventListener('click', compter);

    await user.click(verification());
    const boite = await screen.findByRole('dialog', { name: 'Quitter sans enregistrer ?' });
    expect(parti).toBe(0);
    await user.click(within(boite).getByRole('button', { name: 'Rester' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(champ('phone')).toHaveValue('+221338210000');

    await user.click(verification());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Abandonner les modifications' }));
    expect(parti).toBe(1);
    expect(champ('phone')).toHaveValue('');
    document.removeEventListener('click', compter);
  });

  it('un lien de section ne déclenche pas la garde : rien ne se perd', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AGENCE);
    await user.type(champ('phone'), '+221338210000');
    await user.click(within(navigationDuBureau()).getByRole('link', { name: /Paiement hors ligne/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sectionDeLURL()).toBe('paiement');
  });

  it('sans modification, rien n’est retenu', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AGENCE);
    const lien = within(navigationDuBureau()).getByRole('link', { name: /Vérification/ });
    let parti = 0;
    const compter = (e: MouseEvent) => {
      parti += 1;
      e.preventDefault();
    };
    lien.addEventListener('click', compter);
    await user.click(lien);
    expect(parti).toBe(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TCK-2670 — la complétude', () => {
  it('agence standard, logo, téléphone et e-mail, dossier à compléter : 3 sur 12, 25 %', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier([]));
    rendreLaFiche(MIEUX);
    expect(await within(sommaire()).findByText('Fiche complète à 25 %')).toBeInTheDocument();
    expect(within(jaugeDuBureau()!).getByText('Fiche complète à 25 %')).toBeInTheDocument();
    expect(within(jaugeDuBureau()!).getByText(/9 éléments à remplir/)).toBeInTheDocument();
    // Les deux premiers, dans l'ordre d'impact, sont des liens vers leur champ.
    const liens = within(sommaire())
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.includes('#field-'));
    expect(liens.map((a) => a.getAttribute('href'))).toEqual(['?section=paiement#field-offline_payment_wave_number', '?section=facturation#field-legal_name']);
  });

  // Les listes suivent la langue de l'interface, jamais celle du navigateur (`Intl.ListFormat(undefined)`
  // rendait « … and Vitrine » sous jsdom, et chez un visiteur dont le navigateur n'est pas en français).
  it('« Ensuite : … » se lit en français, « et » compris', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier([]));
    rendreLaFiche(MIEUX);
    const ensuite = await within(sommaire()).findByText(/^Ensuite :/);
    expect(ensuite.textContent).toMatch(/, Pourquoi nous et Vitrine\.$/);
    expect(ensuite.textContent).not.toMatch(/\band\b/);
  });

  it('une agence individuelle ne compte pas les quatre mentions légales : 3 sur 8, 38 %', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier([]));
    rendreLaFiche({ ...INDIVIDUELLE, logo_url: MIEUX.logo_url, phone: MIEUX.phone, email: MIEUX.email });
    expect(await within(sommaire()).findByText('Fiche complète à 38 %')).toBeInTheDocument();
    expect(within(jaugeDuBureau()!).getByText(/5 éléments à remplir/)).toBeInTheDocument();
    expect(within(jaugeDuBureau()!).queryByRole('link', { name: /Raison sociale|NINEA|Adresse du siège/ })).toBeNull();
  });

  it('un lien de la jauge ouvre sa section et focalise son champ', async () => {
    const user = userEvent.setup();
    rendreLaFiche(MIEUX);
    await waitFor(() => expect(jaugeDuBureau()).not.toBeNull());
    await user.click(within(jaugeDuBureau()!).getByRole('link', { name: /Numéro Wave pour vos locataires/ }));
    expect(sectionDeLURL()).toBe('paiement');
    await waitFor(() => expect(document.activeElement).toBe(champ('offline_payment_wave_number')));
  });

  it('un dossier illisible ne compte pas la vérification, et ne la dit pas manquante', async () => {
    KYC.fetchAgencyKyc.mockRejectedValue(new Error('500'));
    rendreLaFiche(MIEUX);
    await within(sommaire()).findByText(/Fiche complète à \d+ %/);
    expect(within(jaugeDuBureau()!).queryByRole('link', { name: /Vérification de l’agence/ })).toBeNull();
  });
});

describe('TCK-2670 — « Reprendre ces deux numéros »', () => {
  it('remplit NINEA et RCCM depuis le dossier, sans rien envoyer ; l’envoi ne part qu’à « Enregistrer »', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier([piece(1, 'ninea', '005678912 2G3'), piece(2, 'rccm', 'SN-DKR-2019-B-12345')]));
    const user = userEvent.setup();
    rendreLaFiche(AGENCE, { section: 'facturation' });

    // Deux boutons, l'un du téléphone, l'autre du bureau (CSS) : le même geste.
    await user.click((await screen.findAllByRole('button', { name: 'Reprendre ces deux numéros' }))[0]);
    expect(ACTIONS.updateAgencyAction).not.toHaveBeenCalled();
    expect(champ('ninea')).toHaveValue('005678912 2G3');
    expect(champ('rccm')).toHaveValue('SN-DKR-2019-B-12345');
    expect(within(barreDuBureau()!).getByText(/2 modifications non enregistrées/)).toBeInTheDocument();

    expect(await enregistrer(user)).toEqual({ ninea: '005678912 2G3', rccm: 'SN-DKR-2019-B-12345' });
  });

  it('une mention déjà saisie n’est jamais écrasée : seul le numéro manquant se reprend', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier([piece(1, 'ninea', '005678912 2G3'), piece(2, 'rccm', 'SN-DKR-2019-B-12345')]));
    const user = userEvent.setup();
    rendreLaFiche({ ...AGENCE, ninea: '000111222' }, { section: 'facturation' });

    await user.click((await screen.findAllByRole('button', { name: 'Reprendre ce numéro' }))[0]);
    expect(champ('ninea')).toHaveValue('000111222');
    expect(champ('rccm')).toHaveValue('SN-DKR-2019-B-12345');
  });

  it('sans numéro au dossier, aucun bouton', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier([piece(1, 'ninea', null)]));
    rendreLaFiche(AGENCE, { section: 'facturation' });
    await screen.findByText('Facturation et mentions légales', { selector: 'h2' });
    await waitFor(() => expect(KYC.fetchAgencyKyc).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Reprendre/ })).toBeNull();
  });
});
