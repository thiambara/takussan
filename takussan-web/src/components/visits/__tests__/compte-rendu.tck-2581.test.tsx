/**
 * TCK-2581 (ADR-0101) — après la visite : le compte rendu en trois touches, puis « Et maintenant ? ».
 *
 * Le détail de la visite est rendu ENTIER (`VisitDetail`), sur un `fetch` doublé : les corps
 * RÉELLEMENT envoyés se lisent sur la requête, jamais sur un espion de mutation. Les fixtures ont la
 * forme des réponses de l'API (`PropertyVisitResource` avec `report`, `visitor_display` ; le corps
 * de `POST …/report` avec `suggested_stage`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), recherche: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/visits/228',
  useSearchParams: () => new URLSearchParams(nav.recherche),
}));
const auth = vi.hoisted(() => ({ user: { id: 3, roles: ['agent'] } as { id: number; roles: string[] } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, token: 'jeton', isLoading: false }) }));

const LOCATION = { id: 40, title: 'Studio · Yoff', slug: 'studio-yoff', price: 150000, currency: 'XOF', contract_type: 'rent', rent_period: 'monthly', main_photo_url: null };
const VENTE = { id: 107, title: 'Villa contemporaine', slug: 'villa-contemporaine', price: 95000000, currency: 'XOF', contract_type: 'sale', rent_period: null, main_photo_url: null };
const SEJOUR = { id: 42, title: 'Duplex · Ngor', slug: 'duplex-ngor', price: 55000, currency: 'XOF', contract_type: 'rent', rent_period: 'daily', main_photo_url: null };

const COMPTE_RENDU_FAIT = {
  outcome: 'interested',
  objections: ['price'],
  note: 'Veut emménager en janvier',
  follow_up: null,
  reported_at: '2026-11-11T10:40:00+00:00',
  reported_by: { id: 3, first_name: 'Awa', last_name: 'Ndiaye' },
};

function visiteDe(bien: typeof LOCATION, v: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 228,
    property_id: bien.id,
    agent_id: 3,
    status: 'completed',
    type: 'in_person',
    scheduled_at: '2026-11-11T10:00:00+00:00',
    completed_at: '2026-11-11T10:35:00+00:00',
    property: { id: bien.id, title: bien.title, slug: bien.slug },
    customer: { id: 37, user_id: null, first_name: 'Aliou', last_name: 'Sow', email: null, phone: '+221771234567' },
    abilities: { manage: true },
    visitor_display: { name: 'Aliou Sow', phone: '+221771234567', kind: 'customer', visits_on_property: 1 },
    report: null,
    ...v,
  };
}

interface Envoi {
  readonly methode: string;
  readonly chemin: string;
  readonly recherche: string;
  readonly corps: Record<string, unknown> | null;
}
const envois: Envoi[] = [];
const etat = {
  visite: visiteDe(LOCATION),
  bien: LOCATION as typeof LOCATION,
  etape: 'prospect',
  /** Le PATCH d'étape change-t-il la fiche relue ? (faux : la fiche reste ce que le test pose). */
  patchEcritLEtape: false,
  /** `is_online` du bien (TCK-2637) : l'API ne le rend que sur `include=online` ; `undefined` : absent. */
  enLigne: true as boolean | undefined,
  candidatures: [] as { id: number }[],
};

function json(status: number, corps: unknown) {
  return Promise.resolve(new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } }));
}

function ecrans(telephone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: telephone && query.includes('48rem'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  envois.length = 0;
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.recherche = '';
  auth.user = { id: 3, roles: ['agent'] };
  etat.visite = visiteDe(LOCATION);
  etat.bien = LOCATION;
  etat.etape = 'prospect';
  etat.patchEcritLEtape = false;
  etat.enLigne = true;
  etat.candidatures = [];
  ecrans(false);
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(entree), 'http://api.test');
      const methode = init?.method ?? 'GET';
      const corps = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      if (methode !== 'GET') envois.push({ methode, chemin: url.pathname, recherche: url.search, corps });
      if (url.pathname === '/api/property-visits/228/report') {
        const report = { ...COMPTE_RENDU_FAIT, ...(etat.visite.report ?? {}), ...corps };
        etat.visite = { ...etat.visite, report: report as PropertyVisit['report'] };
        const suggere = corps?.outcome === 'interested' && ['lead', 'prospect'].includes(etat.etape);
        return json(methode === 'POST' ? 201 : 200, {
          data: etat.visite,
          customer_note: { id: 1, customer_id: 37 },
          suggested_stage: methode === 'POST' && suggere ? { from: etat.etape, to: 'qualified' } : null,
        });
      }
      if (url.pathname === '/api/property-visits/228/complete') {
        etat.visite = { ...etat.visite, status: 'completed', completed_at: '2026-11-11T08:40:00+00:00' };
        return json(200, { data: etat.visite });
      }
      if (url.pathname === '/api/property-visits/228') return json(200, { data: etat.visite });
      if (url.pathname === `/api/properties/${etat.bien.id}`) {
        const enLigne = (url.searchParams.get('include') ?? '').split(',').includes('online');
        return json(200, { data: { ...etat.bien, ...(enLigne && etat.enLigne !== undefined ? { is_online: etat.enLigne } : {}) } });
      }
      if (url.pathname === '/api/customers/37/pipeline-stage') {
        if (etat.patchEcritLEtape) etat.etape = String(corps?.pipeline_stage);
        return json(200, { data: { id: 37, pipeline_stage: 'qualified' } });
      }
      if (url.pathname === '/api/customers/37/matching-properties') return json(200, { data: [{ id: 1 }, { id: 2 }, { id: 3 }], meta: { total: 3 } });
      if (url.pathname === '/api/customers/37') return json(200, { data: { id: 37, first_name: 'Aliou', pipeline_stage: etat.etape } });
      if (url.pathname === '/api/bookings') return json(200, { data: etat.candidatures, meta: { total: etat.candidatures.length } });
      if (url.pathname === '/api/tasks') return json(201, { data: { id: 9 } });
      return json(404, {});
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function monter() {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <VisitDetail id={228} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const ecritures = (chemin: string) => envois.filter((e) => e.chemin === chemin);

async function enregistrer(user: ReturnType<typeof userEvent.setup>, verdict: RegExp) {
  await user.click(await screen.findByRole('radio', { name: verdict }));
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
}

describe('TCK-2581 — le compte rendu', () => {
  it.each([
    [/^Intéressé$/, 'interested'],
    [/^À réfléchir$/, 'thinking'],
    [/^Pas intéressé$/, 'not_interested'],
  ])('« %s » puis « Enregistrer » envoie outcome=%s, objections et note', async (verdict, outcome) => {
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('radio', { name: verdict }));
    await user.click(screen.getByRole('button', { name: 'Prix', pressed: false }));
    await user.click(screen.getByRole('button', { name: 'Garant', pressed: false }));
    await user.type(screen.getByLabelText('Une note'), '  Rappeler lundi  ');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(ecritures('/api/property-visits/228/report')).toHaveLength(1));
    const [envoi] = ecritures('/api/property-visits/228/report');
    expect(envoi.methode).toBe('POST');
    expect(envoi.corps).toEqual({ outcome, objections: ['price', 'guarantor'], note: 'Rappeler lundi' });
  });

  it('sans verdict, rien ne part : la question le dit', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Choisissez comment s’est passée la visite.')).toBeTruthy();
    expect(ecritures('/api/property-visits/228/report')).toHaveLength(0);
  });

  it('AC1 — « Intéressé » enregistré : « Et maintenant ? » s\'ouvre, « Inviter à candidater » en tête et « Conseillé »', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByRole('radio', { name: /^Intéressé$/ });
    expect(document.querySelector('[data-slot="et-maintenant-a-venir"]')).toBeTruthy();
    await enregistrer(user, /^Intéressé$/);

    await waitFor(() => expect(document.querySelector('[data-slot="et-maintenant"] [data-slot="suite"]')).toBeTruthy());
    const suite = within(document.querySelector('[data-slot="et-maintenant"]') as HTMLElement).getByText('Inviter à candidater');
    const lignes = [...document.querySelectorAll('[data-slot="et-maintenant"] [data-slot="suite"]')];
    expect(lignes[0]?.textContent).toContain('Inviter à candidater');
    expect(within(lignes[0] as HTMLElement).getByText('Conseillé')).toBeTruthy();
    expect(suite).toBeTruthy();
    expect(document.querySelector('[data-slot="et-maintenant-a-venir"]')).toBeNull();
  });

  it('AC2 — le lien WhatsApp porte la fiche publique du bien, sa langue et `?action=reserver`', async () => {
    const user = userEvent.setup();
    monter();
    await enregistrer(user, /^Intéressé$/);
    const bouton = await screen.findByRole('link', { name: /Envoyer par WhatsApp/ });
    const href = bouton.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/221771234567?text=')).toBe(true);
    const texte = decodeURIComponent(href.split('?text=')[1] ?? '');
    expect(texte).toContain(`${window.location.origin}/fr/properties/studio-yoff?action=reserver`);
    expect(texte).toContain('Aliou');
  });

  it('AC2 — le message WhatsApp, qui part AU CLIENT, ne porte que le prénom, le bien et le lien : ni la note, ni les objections', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('radio', { name: /^Intéressé$/ }));
    await user.click(screen.getByRole('button', { name: 'Prix', pressed: false }));
    await user.click(screen.getByRole('button', { name: 'Garant', pressed: false }));
    await user.type(screen.getByLabelText('Une note'), 'Budget serré, hésite avec Ngor');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(ecritures('/api/property-visits/228/report')).toHaveLength(1));

    const bouton = await screen.findByRole('link', { name: /Envoyer par WhatsApp/ });
    const texte = decodeURIComponent((bouton.getAttribute('href') ?? '').split('?text=')[1] ?? '');
    expect(texte).toBe(
      `Bonjour Aliou, voici le lien pour déposer votre candidature pour Studio · Yoff : ${window.location.origin}/fr/properties/studio-yoff?action=reserver`,
    );
    expect(texte).not.toContain('Budget serré');
    expect(texte).not.toMatch(/Prix|Garant|price|guarantor/i);
    // L'aperçu affiché à l'agent est ce texte même.
    expect(document.querySelector('[data-slot="apercu-whatsapp"]')?.textContent).toContain(texte);
  });

  it('AC2 — un bien qui n’est pas en ligne : l’invitation reste inactive, dit pourquoi, et n’offre aucun lien', async () => {
    etat.enLigne = false;
    etat.visite = visiteDe(LOCATION, { report: COMPTE_RENDU_FAIT as PropertyVisit['report'] });
    monter();
    expect(await screen.findByText('Ce bien n’est pas en ligne : le lien ne s’ouvrirait pas')).toBeTruthy();
    const invitation = screen.getByText('Inviter à candidater').closest('[aria-disabled]');
    expect(invitation?.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('link', { name: /Envoyer par WhatsApp/ })).toBeNull();
    expect(document.querySelector('[data-slot="apercu-whatsapp"]')).toBeNull();
    // Les autres suites restent offertes.
    expect(screen.getByText('Saisir sa candidature maintenant').closest('[aria-disabled="true"]')).toBeNull();
  });

  it('AC2 — `is_online` pas encore su : l’invitation reste inactive, sans le motif « hors ligne »', async () => {
    etat.enLigne = undefined;
    etat.visite = visiteDe(LOCATION, { report: COMPTE_RENDU_FAIT as PropertyVisit['report'] });
    monter();
    const invitation = (await screen.findByText('Inviter à candidater')).closest('[aria-disabled]');
    expect(invitation?.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByText('Ce bien n’est pas en ligne : le lien ne s’ouvrirait pas')).toBeNull();
    expect(screen.getByText('Il candidate depuis son téléphone')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Envoyer par WhatsApp/ })).toBeNull();
  });

  it('AC3 — l\'interrupteur est allumé ; éteint puis « Terminer » : aucun PATCH d\'étape', async () => {
    const user = userEvent.setup();
    monter();
    await enregistrer(user, /^Intéressé$/);
    const interrupteur = await screen.findByRole('switch');
    expect(interrupteur.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Passer en « Qualifié »')).toBeTruthy();
    // Rien ne part tant qu'on n'a pas validé.
    expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(0);

    await user.click(interrupteur);
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(0);
  });

  it('AC3 — allumé, « Terminer » envoie l\'étape « Qualifié », une seule fois', async () => {
    const user = userEvent.setup();
    monter();
    await enregistrer(user, /^Intéressé$/);
    await screen.findByRole('switch');
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    await waitFor(() => expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(1));
    expect(ecritures('/api/customers/37/pipeline-stage')[0]?.corps).toEqual({ pipeline_stage: 'qualified' });
    expect(ecritures('/api/customers/37/pipeline-stage')[0]?.methode).toBe('PATCH');
  });

  it('choisir une suite la trace (`follow_up`) et applique l\'étape allumée', async () => {
    const user = userEvent.setup();
    monter();
    await enregistrer(user, /^Intéressé$/);
    await user.click(await screen.findByRole('link', { name: /Envoyer par WhatsApp/ }));
    await waitFor(() => expect(ecritures('/api/property-visits/228/report').filter((e) => e.methode === 'PATCH')).toHaveLength(1));
    expect(ecritures('/api/property-visits/228/report').find((e) => e.methode === 'PATCH')?.corps).toEqual({ follow_up: 'invite_apply' });
    expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(1);
  });

  it('AC3 — choisir une suite PUIS « Terminer » : l\'étape ne s\'écrit qu\'une fois', async () => {
    // La fiche relue reste « Prospect » (le double ne la change pas) : seule la mémoire de l'écran
    // (`etapeAppliquee`) retient que l'étape est déjà partie.
    const user = userEvent.setup();
    monter();
    await enregistrer(user, /^Intéressé$/);
    await user.click(await screen.findByRole('link', { name: /Envoyer par WhatsApp/ }));
    await waitFor(() => expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(1);
  });

  it('AC3 — l\'étape a avancé depuis l\'ouverture de l\'écran : « Terminer » ne l\'écrase pas', async () => {
    const user = userEvent.setup();
    monter();
    await enregistrer(user, /^Intéressé$/);
    expect((await screen.findByRole('switch')).getAttribute('aria-checked')).toBe('true');
    // Un collègue fait avancer la fiche pendant que l'écran est ouvert : l'écran l'ignore encore.
    etat.etape = 'negotiation';
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(0);
  });

  it('une fiche déjà « Qualifié » : pas d\'interrupteur', async () => {
    etat.etape = 'qualified';
    const user = userEvent.setup();
    monter();
    await enregistrer(user, /^Intéressé$/);
    await screen.findByText('Inviter à candidater');
    await waitFor(() => expect(screen.queryByRole('switch')).toBeNull());
  });

  it('AC5 — « Créer le bail » est inactif sans candidature acceptée', async () => {
    etat.visite = visiteDe(LOCATION, { report: COMPTE_RENDU_FAIT as PropertyVisit['report'] });
    monter();
    await screen.findByText('Créer le bail');
    await waitFor(() => expect(screen.getByText('Dès qu’une candidature est acceptée')).toBeTruthy());
    expect(screen.queryByRole('link', { name: /Créer le bail/ })).toBeNull();
    const demande = envois.length; // aucune écriture n'est partie à l'ouverture
    expect(demande).toBe(0);
  });

  it('AC5 — une candidature acceptée de ce client sur ce bien : le lien vers le bail prérempli', async () => {
    etat.visite = visiteDe(LOCATION, { report: COMPTE_RENDU_FAIT as PropertyVisit['report'] });
    etat.candidatures = [{ id: 300 }];
    const appels = vi.mocked(fetch);
    monter();
    const lien = await screen.findByRole('link', { name: /Créer le bail/ });
    expect(lien.getAttribute('href')).toBe('/app/leases/new?booking_id=300');
    const lecture = appels.mock.calls.map(([u]) => new URL(String(u), 'http://api.test')).find((u) => u.pathname === '/api/bookings');
    expect(lecture?.searchParams.get('filter[customer_id]')).toBe('37');
    expect(lecture?.searchParams.get('filter[property_id]')).toBe('40');
    expect(lecture?.searchParams.get('filter[kind]')).toBe('application');
    expect(lecture?.searchParams.get('filter[status]')).toBe('confirmed');
  });

  it('AC4 — une vente : « Inviter à faire une offre » et « Saisir son offre », jamais de bail', async () => {
    etat.bien = VENTE as unknown as typeof LOCATION;
    etat.visite = visiteDe(etat.bien, { report: COMPTE_RENDU_FAIT as PropertyVisit['report'] });
    monter();
    expect(await screen.findByText('Inviter à faire une offre')).toBeTruthy();
    expect(screen.getByText('Saisir son offre maintenant')).toBeTruthy();
    expect(screen.queryByText('Inviter à candidater')).toBeNull();
    expect(screen.queryByText('Créer le bail')).toBeNull();
  });

  it('AC4 — une location au mois : « Saisir sa candidature »', async () => {
    etat.visite = visiteDe(LOCATION, { report: COMPTE_RENDU_FAIT as PropertyVisit['report'] });
    monter();
    expect(await screen.findByText('Saisir sa candidature maintenant')).toBeTruthy();
  });

  it('AC4 — un séjour court : ni invitation, ni saisie, ni bail', async () => {
    etat.bien = SEJOUR as unknown as typeof LOCATION;
    etat.visite = visiteDe(etat.bien, { report: COMPTE_RENDU_FAIT as PropertyVisit['report'] });
    monter();
    expect(await screen.findByText('Planifier une 2ᵉ visite')).toBeTruthy();
    expect(screen.queryByText(/Inviter à/)).toBeNull();
    expect(screen.queryByText(/^Saisir s/)).toBeNull();
    expect(screen.queryByText('Créer le bail')).toBeNull();
  });

  it('un visiteur sans fiche : « Créer sa fiche » prérempli, les suites sur fiche inactives', async () => {
    etat.visite = visiteDe(LOCATION, {
      customer: null,
      visitor_name: 'Mouhamed Fall',
      visitor_phone: '+221770001122',
      visitor_display: { name: 'Mouhamed Fall', phone: '+221770001122', kind: 'anonymous', visits_on_property: 1 },
      report: COMPTE_RENDU_FAIT as PropertyVisit['report'],
      abilities: { manage: true, create_customer: true },
    });
    monter();
    const lien = await screen.findByRole('link', { name: /Créer sa fiche/ });
    const cible = new URL(lien.getAttribute('href') ?? '', 'http://x');
    expect(cible.pathname).toBe('/app/customers/new');
    // L'identifiant de la visite, rien d'autre : ni nom ni numéro dans l'URL (historique, journaux, Referer).
    expect([...cible.searchParams.entries()]).toEqual([['visite', '228']]);
    expect(lien.getAttribute('href')).not.toMatch(/770001122|Mouhamed|Fall/);
    const saisie = (await screen.findByText('Saisir sa candidature maintenant')).closest('[aria-disabled]');
    expect(saisie).toBeTruthy();
  });

  it('TCK-2716 — sans `abilities.create_customer`, « Créer sa fiche » ne s’offre pas, même avec la carte du visiteur', async () => {
    etat.visite = visiteDe(LOCATION, {
      customer: null,
      visitor_display: { name: 'Mouhamed Fall', phone: '+221770001122', kind: 'anonymous', visits_on_property: 1 },
      report: COMPTE_RENDU_FAIT as PropertyVisit['report'],
      abilities: { manage: true, create_customer: false },
    });
    monter();
    expect(await screen.findByText('Saisir sa candidature maintenant')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Créer sa fiche/ })).toBeNull();
  });

  it('AC6 — le client voit son avis (1 à 5) et aucun compte rendu', async () => {
    auth.user = { id: 98, roles: ['customer'] };
    // Ce que l'API rend au client (relevé sur la visite 1315, son client) : ni `report`, ni `metadata`, ni
    // fiche (`customer` et `visitor` à null, `visitor_id` null) — seul `abilities.feedback_customer` dit que c'est lui.
    const { report: _absent, visitor_display: _carte, metadata: _outil, ...sansCle } = visiteDe(LOCATION, { customer: null, visitor_id: null, abilities: { manage: false, feedback_customer: true } });
    etat.visite = { ...sansCle, completed_at: new Date(Date.now() - 3600_000).toISOString() } as PropertyVisit;
    monter();
    expect(await screen.findByText('Votre retour visiteur')).toBeTruthy();
    expect(screen.queryByText('Compte rendu')).toBeNull();
    expect(screen.queryByText('Et maintenant ?')).toBeNull();
    expect(document.querySelector('[data-slot="suite-de-la-visite"]')).toBeNull();
  });

  it('le personnel ne note plus la visite : le retour d\'agent se LIT, sans formulaire', async () => {
    etat.visite = visiteDe(LOCATION, { metadata: { feedback_agent: { user_id: 3, rating: 4, comment: 'Bon contact' } } });
    monter();
    expect(await screen.findByText('Retour de l’agent')).toBeTruthy();
    expect(screen.getByText('4 / 5')).toBeTruthy();
    expect(screen.getByText('Bon contact')).toBeTruthy();
    expect(screen.queryByText('Retour agent')).toBeNull();
    expect(screen.queryByText('Votre retour visiteur')).toBeNull();
  });
});

describe('TCK-2581 — au téléphone, deux étapes plein écran', () => {
  it('sur le détail : la carte « Faire le compte rendu » mène à `?etape=compte-rendu`', async () => {
    ecrans(true);
    monter();
    const carte = await screen.findByRole('link', { name: /Faire le compte rendu/ });
    expect(carte.getAttribute('href')).toBe('/app/visits/228?etape=compte-rendu');
    expect(screen.queryByRole('radio', { name: /^Intéressé$/ })).toBeNull();
  });

  it('l\'étape « compte-rendu » remplace le détail ; enregistrer REMPLACE l\'URL par « et-maintenant »', async () => {
    ecrans(true);
    nav.recherche = 'etape=compte-rendu';
    const user = userEvent.setup();
    monter();
    expect(await screen.findByRole('heading', { level: 1, name: 'Comment s’est passée la visite ?' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Studio · Yoff', level: 1 })).toBeNull();
    expect(screen.getByText(/rejoint la fiche de Aliou/)).toBeTruthy();
    await enregistrer(user, /^Intéressé$/);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/app/visits/228?etape=et-maintenant'));
  });

  it('« Modifier » puis retour sans enregistrer : la validation suivante ne réécrit pas l\'étape sur un `from` périmé', async () => {
    // L'écran « Et maintenant ? » se démonte à « Modifier » ; `SuiteDeLaVisite` garde la réponse de
    // l'écriture (`suggested_stage.from` = « Prospect »), et un écran remonté oublie ce qu'il a écrit.
    ecrans(true);
    etat.patchEcritLEtape = true;
    nav.recherche = 'etape=compte-rendu';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const arbre = () =>
      withIntl(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <VisitDetail id={228} />
          </ToastProvider>
        </QueryClientProvider>,
      );
    const user = userEvent.setup();
    const { rerender } = render(arbre());
    await enregistrer(user, /^Intéressé$/);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/app/visits/228?etape=et-maintenant'));

    nav.recherche = 'etape=et-maintenant';
    rerender(arbre());
    await user.click(await screen.findByRole('link', { name: /Envoyer par WhatsApp/ }));
    await waitFor(() => expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(1));

    nav.recherche = 'etape=compte-rendu';
    rerender(arbre());
    await screen.findByRole('heading', { level: 1, name: 'Comment s’est passée la visite ?' });
    nav.recherche = 'etape=et-maintenant';
    rerender(arbre());
    await user.click(await screen.findByRole('button', { name: 'Terminer' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(1);
  });

  it('« Terminer la visite » enchaîne sur le compte rendu', async () => {
    ecrans(true);
    etat.visite = visiteDe(LOCATION, { status: 'confirmed', completed_at: null, scheduled_at: '2026-11-11T08:00:00+00:00' });
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Marquer effectuée' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/app/visits/228?etape=compte-rendu'));
  });
});
