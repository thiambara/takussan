import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/app/actions/admin-agency', async () => (await import('./doublures')).ACTIONS);
vi.mock('@/context/AuthContext', async () => (await import('./doublures')).auth);
vi.mock('@/hooks/useCan', async () => (await import('./doublures')).can);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);
vi.mock('@/lib/queries/admin-users', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).EQUIPE }));
vi.mock('@/lib/queries/agency-queues', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).fileDeModeration }));
vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), ...(await import('./doublures')).API }));

import { ApiError } from '@/lib/api';
import type { Agency } from '@/types/agency';
import type { KycDocument, KycDossier } from '@/types/super-admin';

import { ACTIONS, KYC, reinitialiserLesDoublures } from './doublures';
import { AGENCE, arbreDeLaFiche, champ, enregistrer, rendreLaFiche } from './outils';

/**
 * TCK-2670 — les décisions du porteur (2026-11-12), chacune avec son test :
 *
 * - 2a : « Abandonner » remet à la DERNIÈRE réponse enregistrée, pas aux valeurs du chargement ;
 *   `beforeunload` seulement quand la saisie diffère de l'enregistré.
 * - 3a : la vérification se lit du dossier (`GET /api/agencies/{id}/kyc`, la lecture de la page de
 *   vérification, jugée par la même capacité `agency.update_kyc`) ; une lecture refusée (403) ou en
 *   panne ne la compte ni remplie ni en erreur. En attente : à compléter. Vérifié avec une pièce
 *   échue : à compléter, en alerte. Vérifié et à jour : remplie.
 * - 4a : le rendu serveur et l'hydratation donnent le même arbre — aucune erreur récupérable.
 */

const MIEUX: Agency = { ...AGENCE, logo_url: 'http://127.0.0.1:8002/storage/logo.png', phone: '+221338210000', email: 'contact@dakar-immo.sn' };
const navigationDuBureau = () => document.querySelector<HTMLElement>('[data-slot="navigation-des-sections"]')!;
const jaugeDuBureau = () => document.querySelector<HTMLElement>('[data-slot="jauge-de-la-fiche"]');
/** La jauge n'existe qu'une fois le dossier lu (ou sa lecture échouée). */
async function jauge(texte: RegExp | string): Promise<HTMLElement> {
  await waitFor(() => expect(jaugeDuBureau()).not.toBeNull());
  expect(await within(jaugeDuBureau()!).findByText(texte)).toBeInTheDocument();
  return jaugeDuBureau()!;
}

function dossier(status: KycDossier['status'], documents: Partial<KycDocument>[] = []): { data: KycDossier } {
  return { data: { id: 3, status, documents, expires_at: null } as unknown as KycDossier };
}

/** Le `beforeunload` que le navigateur enverrait : `defaultPrevented` = la boîte s'ouvre. */
function quitterLaPage(): boolean {
  const evenement = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(evenement);
  return evenement.defaultPrevented;
}

beforeEach(() => {
  reinitialiserLesDoublures();
  ACTIONS.updateAgencyAction.mockImplementation(async (_id: number, corps: Record<string, unknown>) => ({
    ok: true,
    data: { ...AGENCE, ...corps, settings: { ...(corps.settings as object) } },
  }));
});

describe('2a — la garde de sortie', () => {
  it('« Abandonner » remet à la dernière réponse enregistrée, pas aux valeurs du chargement', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AGENCE);
    await user.type(champ('phone'), '+221338210000');
    await enregistrer(user);
    await waitFor(() => expect(document.querySelector('[data-slot="barre-de-la-fiche"]')).toBeNull());
    await user.type(champ('phone'), '9');
    expect(champ('phone')).toHaveValue('+2213382100009');

    const lien = within(navigationDuBureau()).getByRole('link', { name: /Vérification/ });
    lien.addEventListener('click', (e) => e.preventDefault());
    await user.click(lien);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Abandonner les modifications' }));
    expect(champ('phone')).toHaveValue('+221338210000');
  });

  it('`beforeunload` seulement quand la saisie diffère de l’enregistré', async () => {
    const user = userEvent.setup();
    rendreLaFiche(AGENCE);
    expect(quitterLaPage()).toBe(false);
    await user.type(champ('phone'), '+2213');
    expect(quitterLaPage()).toBe(true);
    await user.clear(champ('phone'));
    // Revenue à l'enregistré : plus rien à perdre.
    expect(quitterLaPage()).toBe(false);
  });
});

describe('3a — la vérification dans la jauge', () => {
  const lienVerification = () => within(jaugeDuBureau()!).queryByRole('link', { name: /Vérification de l’agence/ });
  const pointDeLaVerification = () => within(navigationDuBureau()).getByRole('link', { name: /Vérification/ });

  it('une lecture refusée (403) : ni remplie, ni en erreur — hors du compte', async () => {
    KYC.fetchAgencyKyc.mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    rendreLaFiche(MIEUX);
    await jauge(/Fiche complète à \d+ %/);
    expect(lienVerification()).toBeNull();
    expect(within(pointDeLaVerification()).queryByLabelText('À traiter')).toBeNull();
    // 3 présents sur 11 comptés (la vérification sortie du compte) : 27 %.
    expect(within(jaugeDuBureau()!).getByText('Fiche complète à 27 %')).toBeInTheDocument();
  });

  it('un dossier en attente : à compléter, sans alerte', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier('pending'));
    rendreLaFiche(MIEUX);
    await jauge('Fiche complète à 25 %');
    expect(lienVerification()).not.toBeNull();
    expect(within(pointDeLaVerification()).queryByLabelText('À traiter')).toBeNull();
  });

  it('un dossier vérifié dont une pièce est échue : à compléter, en alerte', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier('verified', [{ id: 1, document_type: 'director_id', document_expires_at: '2021-04-26' }]));
    rendreLaFiche(MIEUX);
    await jauge('Fiche complète à 25 %');
    expect(lienVerification()).not.toBeNull();
    expect(within(pointDeLaVerification()).getByLabelText('À traiter')).toBeInTheDocument();
  });

  it('un dossier vérifié et à jour : la vérification est remplie', async () => {
    KYC.fetchAgencyKyc.mockResolvedValue(dossier('verified', [{ id: 1, document_type: 'director_id', document_expires_at: '2099-01-01' }]));
    rendreLaFiche(MIEUX);
    await jauge('Fiche complète à 33 %');
    expect(lienVerification()).toBeNull();
  });
});

describe('4a — rendu serveur puis hydratation', () => {
  it('même arbre : aucune erreur récupérable à l’hydratation', async () => {
    window.history.replaceState(null, '', '/app/agency');
    const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(arbreDeLaFiche(MIEUX, {}, client()));
    const conteneur = document.createElement('div');
    conteneur.innerHTML = html;
    document.body.appendChild(conteneur);
    const erreurs: unknown[] = [];
    await act(async () => {
      hydrateRoot(conteneur, arbreDeLaFiche(MIEUX, {}, client()), { onRecoverableError: (e) => erreurs.push(e) });
    });
    expect(erreurs).toEqual([]);
    await waitFor(() => expect(within(conteneur).getAllByText(/Fiche complète à \d+ %/).length).toBeGreaterThan(0));
    conteneur.remove();
  });
});
