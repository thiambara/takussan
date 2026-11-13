/**
 * TCK-2601 — l'espace où publier l'annonce commencée sans compte, jugé par `preparerLEspace` une fois
 * la session ouverte (la feuille l'appelle avant toute écriture du bien) :
 *
 * - aucun espace → créé sans question ; le drapeau éteint mène à l'assistant hôte, rien de versé ;
 * - un espace particulier → rendu actif, publié d'ici ;
 * - agence `standard`, bailleur seul, plusieurs espaces (AC3) → l'annonce est VERSÉE au brouillon
 *   serveur sous `property-create-wizard:publication` (et nulle autre clé), puis l'assistant connecté
 *   s'ouvre sur elle ; plusieurs espaces font d'abord choisir ;
 * - un refus du serveur (20 brouillons, 256 Ko) se dit, l'annonce reste ici (condition 2).
 *
 * L'assistant est doublé : on éprouve la décision qu'il reçoit, pas ses étapes (éprouvées ailleurs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { ModeAnonyme } from '@/components/property-form/PropertyWizard';
import { moteurEnMemoire, ouvrirBrouillonLocal, type MoteurDeStockage } from '@/lib/publication/brouillon-local';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur, usePathname: () => '/publish', useSearchParams: () => new URLSearchParams() }));

const doublures = vi.hoisted(() => ({
  anonyme: null as ModeAnonyme | null,
  autoOnboard: vi.fn(),
  profils: vi.fn(),
  basculer: vi.fn(),
  refreshUser: vi.fn(async () => undefined),
}));

vi.mock('@/components/property-form/PropertyWizard', () => ({
  AssistantDePublication: ({ anonyme }: { anonyme: ModeAnonyme }) => {
    doublures.anonyme = anonyme;
    return <div>assistant</div>;
  },
}));
vi.mock('@/app/actions/auto-onboard', () => ({ autoOnboardAction: doublures.autoOnboard }));
vi.mock('@/hooks/useProfiles', () => ({
  profilesKeys: { all: ['profiles', 'me'] },
  fetchProfilesViaProxy: doublures.profils,
  useSwitchActiveProfile: () => ({ mutateAsync: doublures.basculer }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ refreshUser: doublures.refreshUser, user: { id: 1 } }) }));
vi.mock('@/components/auth/useConnexionParTelephone', () => ({ useConnexionParTelephone: () => true }));
vi.mock('@/lib/queries/referentiel-public', () => ({ useEquipementsApprouves: () => ({ data: { data: [] } }) }));
vi.mock('@/components/entree/CoqueDEntree', () => ({ DeclarerEntree: () => null }));

import { PublierSansCompte } from '../PublierSansCompte';

const espace = (id: string, agencyId: number, type: string, kind: 'individual' | 'standard', name: string) => ({
  id,
  type,
  agency_id: agencyId,
  agency: { id: agencyId, kind, name },
});
const PERSONNEL = espace('p-perso', 7, 'agency_admin', 'individual', 'Awa Diop');
const AGENCE = espace('p-agence', 3, 'agent', 'standard', 'Immo Plateau');
const BAILLEUR = espace('p-bailleur', 9, 'owner', 'individual', 'Moussa Fall');

const VALEURS = { type: 'apartment' as const, title: 'Appartement à Mermoz', price: '250000', city: 'Dakar' };

let reponseDuVersement: Response;
const fetchOriginal = globalThis.fetch;
const versements: { url: string; corps: unknown }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  doublures.anonyme = null;
  versements.length = 0;
  reponseDuVersement = new Response('{"data":{}}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    if (url.includes('/wizard-drafts/')) {
      versements.push({ url, corps: JSON.parse(String(init?.body ?? 'null')) });
      return reponseDuVersement;
    }
    return new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = fetchOriginal;
});

async function monter(espaces: readonly unknown[], actif: string | null = null, moteur: MoteurDeStockage = moteurEnMemoire()) {
  doublures.profils.mockResolvedValue({ data: espaces, meta: { active_profile_id: actif } });
  render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <PublierSansCompte surPublier={vi.fn()} brouillonLocal={() => ouvrirBrouillonLocal({ moteur })} />
      </QueryClientProvider>,
    ),
  );
  await waitFor(() => expect(doublures.anonyme).not.toBeNull());
  return doublures.anonyme!;
}

describe('TCK-2601 — l’espace où publier l’annonce sans compte', () => {
  it('aucun espace : créé sans question, publié d’ici, rien de versé', async () => {
    doublures.autoOnboard.mockResolvedValue({ ok: true, created: true });
    const anonyme = await monter([]);
    await expect(anonyme.preparerLEspace(VALEURS, 5)).resolves.toBe('pret');
    expect(doublures.refreshUser).toHaveBeenCalled();
    expect(versements).toEqual([]);
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it('aucun espace, création automatique éteinte : l’assistant hôte, l’annonce reste ici', async () => {
    doublures.autoOnboard.mockResolvedValue({ ok: false, reason: 'disabled' });
    const anonyme = await monter([]);
    await expect(anonyme.preparerLEspace(VALEURS, 5)).resolves.toBe('ailleurs');
    expect(routeur.push).toHaveBeenCalledWith('/onboarding/host');
    expect(versements).toEqual([]);
  });

  it('un espace particulier d’une autre agence que l’actif : basculé, publié d’ici', async () => {
    const anonyme = await monter([PERSONNEL], 'p-ailleurs');
    await expect(anonyme.preparerLEspace(VALEURS, 5)).resolves.toBe('pret');
    expect(doublures.basculer).toHaveBeenCalledWith('p-perso');
    expect(versements).toEqual([]);
  });

  it('une agence standard (AC3) : versée sous SA clé, à cette étape, puis l’assistant connecté', async () => {
    const anonyme = await monter([AGENCE], 'p-agence');
    await expect(anonyme.preparerLEspace({ ...VALEURS, phone: '+221770000901' } as never, 5)).resolves.toBe('ailleurs');
    expect(versements).toHaveLength(1);
    expect(versements[0]!.url).toBe('/api/me/wizard-drafts/property-create-wizard%3Apublication');
    // Les clés de l'annonce, et elles seules (ADR-0093 § 6) : rien d'une personne ne passe.
    expect(versements[0]!.corps).toEqual({ step: 5, data: VALEURS });
    expect(doublures.basculer).not.toHaveBeenCalled();
    expect(routeur.push).toHaveBeenCalledWith('/app/properties/new?brouillon=publication');
  });

  it('bailleur seul, même dans une agence particulière : versée, jamais publiée d’ici', async () => {
    const anonyme = await monter([BAILLEUR], null);
    await expect(anonyme.preparerLEspace(VALEURS, 5)).resolves.toBe('ailleurs');
    expect(versements).toHaveLength(1);
    expect(doublures.basculer).toHaveBeenCalledWith('p-bailleur');
    expect(routeur.push).toHaveBeenCalledWith('/app/properties/new?brouillon=publication');
  });

  it.each([
    ['key', /20 brouillons/],
    ['data', /trop longue/],
  ])('le serveur refuse le versement (422 sur %s) : le dire, ne partir nulle part', async (champ, message) => {
    reponseDuVersement = new Response(JSON.stringify({ errors: { [champ]: ['refus'] } }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
    const anonyme = await monter([AGENCE], 'p-agence');
    const issue = await anonyme.preparerLEspace(VALEURS, 5);
    expect(issue).toEqual({ erreur: expect.stringMatching(message) });
    expect((issue as { erreur: string }).erreur).toMatch(/reste gardée dans ce navigateur/);
    expect(routeur.push).not.toHaveBeenCalled();
    expect(doublures.basculer).not.toHaveBeenCalled();
  });

  /**
   * TCK-2601 (r1) — « Précédent » après le versement : la page revenue (montée de nouveau, ou gardée
   * telle quelle par le routeur) ne reverse pas l'ancienne copie par-dessus ce qui a été saisi depuis
   * dans l'assistant connecté. Le brouillon local, marqué, garde ses valeurs et ses photos.
   */
  it('r1 — versée une fois : marquée sans être effacée ; revenue par « Précédent », aucun second versement', async () => {
    const moteur = moteurEnMemoire();
    const anonyme = await monter([AGENCE], 'p-agence', moteur);
    await expect(anonyme.preparerLEspace(VALEURS, 5)).resolves.toBe('ailleurs');
    expect(versements).toHaveLength(1);
    const relu = await ouvrirBrouillonLocal({ moteur }).ouvrir();
    expect(relu.verse?.cle).toBe('property-create-wizard:publication');

    // La même page, gardée par le routeur : « Publier » de nouveau.
    await waitFor(() => expect(doublures.anonyme).not.toBe(anonyme));
    await expect(doublures.anonyme!.preparerLEspace(VALEURS, 5)).resolves.toBe('ailleurs');
    // Une page montée de nouveau sur le même navigateur.
    cleanup();
    doublures.anonyme = null;
    const remontee = await monter([AGENCE], 'p-agence', moteur);
    await waitFor(() => expect(doublures.anonyme).not.toBe(null));
    await new Promise((r) => setTimeout(r, 0));
    await expect(doublures.anonyme!.preparerLEspace({ ...VALEURS, title: 'Ancienne copie' }, 5)).resolves.toBe('ailleurs');
    void remontee;

    expect(versements).toHaveLength(1);
    expect(routeur.push).toHaveBeenCalledTimes(3);
    expect(routeur.push).toHaveBeenLastCalledWith('/app/properties/new?brouillon=publication');
  });

  it('r1 — un versement refusé ne marque rien : la tentative suivante verse', async () => {
    reponseDuVersement = new Response(JSON.stringify({ errors: { key: ['refus'] } }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    const moteur = moteurEnMemoire();
    const anonyme = await monter([AGENCE], 'p-agence', moteur);
    await anonyme.preparerLEspace(VALEURS, 5);
    expect((await ouvrirBrouillonLocal({ moteur }).ouvrir()).verse).toBeNull();
    reponseDuVersement = new Response('{"data":{}}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    await expect(anonyme.preparerLEspace(VALEURS, 5)).resolves.toBe('ailleurs');
    expect(versements).toHaveLength(2);
  });

  it('plusieurs espaces : versée, puis « Où publier ce bien ? » ; le choix bascule et ouvre l’assistant connecté', async () => {
    const user = userEvent.setup();
    const anonyme = await monter([PERSONNEL, AGENCE], 'p-perso');
    await expect(anonyme.preparerLEspace(VALEURS, 5)).resolves.toBe('ailleurs');
    expect(versements).toHaveLength(1);
    expect(routeur.push).not.toHaveBeenCalled();

    expect(await screen.findByRole('heading', { name: 'Où publier ce bien ?' })).toBeInTheDocument();
    expect(screen.queryByText('assistant')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Immo Plateau/ }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/new?brouillon=publication'));
    expect(doublures.basculer).toHaveBeenCalledWith('p-agence');
  });

  it('plusieurs espaces : un échec de bascule se dit, et « Revenir à l’annonce » rouvre l’assistant', async () => {
    const user = userEvent.setup();
    doublures.basculer.mockRejectedValue(new Error('403'));
    const anonyme = await monter([PERSONNEL, AGENCE], 'p-perso');
    await anonyme.preparerLEspace(VALEURS, 5);
    await user.click(await screen.findByRole('button', { name: /Mon espace personnel/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’ouvrir cet espace');
    expect(routeur.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Revenir à l’annonce' }));
    expect(await screen.findByText('assistant')).toBeInTheDocument();
  });
});
