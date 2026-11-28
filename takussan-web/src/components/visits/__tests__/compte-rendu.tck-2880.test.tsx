/**
 * TCK-2880 — après la visite (maquette `app-fil-commercial` a-4/a-5) : la dictée de la note, « Avant
 * cette visite », l'en-tête et le visiteur du bureau, la question « Passer en Qualifié ? » et la
 * relance du lendemain posée par « Passer ».
 *
 * Le détail est rendu ENTIER (`VisitDetail`) sur un `fetch` doublé : les corps RÉELLEMENT envoyés se
 * lisent sur la requête. La reconnaissance vocale est doublée par une classe posée sur `window`.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { ajouterALaNote } from '@/lib/dictee';
import { faitsAvantLaVisite } from '../compte-rendu/AvantCetteVisite';
import { VisitDetail } from '../VisitDetail';
import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import type { PropertyVisit } from '@/types/visit';
import { avecLesGestesDeLApi } from './fixtures/gestes-comme-l-api';

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), recherche: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/visits/228',
  useSearchParams: () => new URLSearchParams(nav.recherche),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3, roles: ['agent'], first_name: 'Sokhna' }, token: 'jeton', isLoading: false }) }));
// Le personnel ACTIF de l'agence 5 : « Avant cette visite » et l'étape du visiteur lui sont réservées.
vi.mock('@/hooks/usePersonnelActif', () => ({ useAgenceDuPersonnelActif: () => 5 }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: undefined }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));
// L'en-tête du téléphone est monté par la coque : ici, sa droite (« Passer ») est rendue sur place.
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: ({ droite }: { droite?: ReactNode }) => <>{droite}</> }));

const LOCATION = { id: 40, title: 'Studio · Yoff', slug: 'studio-yoff', price: 150000, currency: 'XOF', contract_type: 'rent', rent_period: 'monthly', main_photo_url: null };

const FAIT = {
  outcome: 'interested',
  objections: [],
  note: null,
  follow_up: null,
  reported_at: '2026-11-07T10:41:00+00:00',
  reported_by: { id: 3, first_name: 'Sokhna', last_name: 'Sène' },
};

function visiteDe(v: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 228,
    property_id: LOCATION.id,
    agent_id: 3,
    customer_id: 37,
    status: 'completed',
    type: 'in_person',
    scheduled_at: '2026-11-07T10:00:00+00:00',
    completed_at: '2026-11-07T10:35:00+00:00',
    property: { id: LOCATION.id, title: LOCATION.title, slug: LOCATION.slug },
    customer: { id: 37, user_id: null, first_name: 'Mouhamed', last_name: 'Diop', email: null, phone: '+221771234567' },
    abilities: { manage: true },
    visitor_display: { name: 'Mouhamed Diop', phone: '+221771234567', kind: 'customer', visits_on_property: 1 },
    report: null,
    ...v,
  } as PropertyVisit;
}

/** Le fil de la fiche, tel que `/timeline` le rend : du plus récent au plus ancien. */
const FIL: EntreeDuFil[] = [
  // APRÈS la visite : un appel et une 2ᵉ visite demandée — hors de « Avant cette visite ».
  { type: 'contact', id: 8, at: '2026-11-08T09:00:00+00:00', channel: 'call', on: 'customer', causer: { id: 3, name: 'Sokhna Sène' } },
  { type: 'visit', id: 230, at: '2026-11-07T11:00:00+00:00', milestone: 'created', status: 'scheduled', scheduled_at: '2026-11-12T10:00:00+00:00', property: { id: 40, title: 'Studio · Yoff' } },
  { type: 'note', id: 90, at: '2026-11-07T10:41:00+00:00', kind: 'visit_report', body: 'Compte rendu', pinned: true, property_visit_id: 228, author: null },
  { type: 'visit', id: 228, at: '2026-11-03T09:21:00+00:00', milestone: 'confirmed', status: 'completed', scheduled_at: '2026-11-07T10:00:00+00:00', property: { id: 40, title: 'Studio · Yoff' } },
  { type: 'note', id: 81, at: '2026-11-02T19:00:00+00:00', kind: null, body: 'Note interne', pinned: false, property_visit_id: null, author: null },
  { type: 'contact', id: 7, at: '2026-11-02T18:14:00+00:00', channel: 'whatsapp', on: 'lead', causer: { id: 3, name: 'Sokhna Sène' } },
  { type: 'note', id: 80, at: '2026-11-02T17:47:00+00:00', kind: 'lead_message', body: 'Bonjour, la pièce de Yoff est-elle libre ?', pinned: false, property_visit_id: null, author: null },
];

interface Envoi {
  readonly methode: string;
  readonly chemin: string;
  readonly corps: Record<string, unknown> | null;
}
const envois: Envoi[] = [];
const etat = {
  visite: visiteDe(),
  etape: 'prospect',
  /** `suggested_stage` de la fiche relue ; `undefined` : la clé absente. */
  suggestion: undefined as { to: string; reason: string; at: string } | null | undefined,
  fil: FIL as EntreeDuFil[],
  lectures: [] as string[],
  /** Délai de la lecture de la fiche (ms). */
  delaiFiche: 0,
};

function json(status: number, corps: unknown) {
  if (status === 204) return Promise.resolve(new Response(null, { status }));
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
  etat.visite = visiteDe();
  etat.etape = 'prospect';
  etat.suggestion = undefined;
  etat.fil = FIL;
  etat.lectures = [];
  etat.delaiFiche = 0;
  ecrans(false);
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(entree), 'http://api.test');
      const methode = init?.method ?? 'GET';
      const corps = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      if (methode !== 'GET') envois.push({ methode, chemin: url.pathname, corps });
      else etat.lectures.push(`${url.pathname}${url.search}`);
      if (url.pathname === '/api/property-visits/228/report') {
        const report = { ...FAIT, ...(etat.visite.report ?? {}), ...corps };
        etat.visite = { ...etat.visite, report: report as PropertyVisit['report'] };
        const suggere = corps?.outcome === 'interested' && ['lead', 'prospect'].includes(etat.etape);
        return json(methode === 'POST' ? 201 : 200, {
          data: avecLesGestesDeLApi(etat.visite),
          customer_note: { id: 1, customer_id: 37 },
          suggested_stage: methode === 'POST' && suggere ? { from: etat.etape, to: 'qualified' } : null,
        });
      }
      if (url.pathname === '/api/property-visits/228') return json(200, { data: avecLesGestesDeLApi(etat.visite) });
      if (url.pathname === `/api/properties/${LOCATION.id}`) return json(200, { data: { ...LOCATION, is_online: true } });
      if (url.pathname === '/api/customers/37/pipeline-stage') return json(200, { data: { id: 37, pipeline_stage: 'qualified' } });
      if (url.pathname === '/api/customers/37/suggested-stage/dismiss') {
        etat.suggestion = null;
        return json(204, null);
      }
      if (url.pathname === '/api/customers/37/timeline') return json(200, { data: etat.fil, meta: { current_page: 1, last_page: 1, total: etat.fil.length, per_page: 50 } });
      if (url.pathname === '/api/customers/37/matching-properties') return json(200, { data: [], meta: { total: 0 } });
      if (url.pathname === '/api/customers/37') {
        const corps = { data: { id: 37, first_name: 'Mouhamed', pipeline_stage: etat.etape, ...(etat.suggestion !== undefined ? { suggested_stage: etat.suggestion } : {}) } };
        if (etat.delaiFiche > 0) return new Promise<Response>((r) => setTimeout(() => r(new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } })), etat.delaiFiche));
        return json(200, { data: { id: 37, first_name: 'Mouhamed', pipeline_stage: etat.etape, ...(etat.suggestion !== undefined ? { suggested_stage: etat.suggestion } : {}) } });
      }
      if (url.pathname === '/api/bookings') return json(200, { data: [], meta: { total: 0 } });
      if (url.pathname === '/api/tasks') return json(201, { data: { id: 9 } });
      if (url.pathname === '/api/tasks/9') return json(204, null);
      return json(404, {});
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

function monter() {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <VisitDetail id={228} />
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const ecritures = (chemin: string) => envois.filter((e) => e.chemin === chemin);

/** La reconnaissance doublée : la dernière instance créée, et ce qu'on lui a demandé. */
class ReconnaissanceDoublee {
  static derniere: ReconnaissanceDoublee | null = null;
  lang = '';
  continuous = false;
  interimResults = true;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  demarree = false;
  constructor() {
    ReconnaissanceDoublee.derniere = this;
  }
  start() {
    this.demarree = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  entendre(texte: string) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: texte } }] });
  }
}

describe('TCK-2880 — la dictée de la note (AC1)', () => {
  it('ajouterALaNote : le texte reconnu va à la fin, séparé d\'une espace, sans dépasser la borne', () => {
    expect(ajouterALaNote('Le loyer lui convient.', ' trouve la douche petite ')).toBe('Le loyer lui convient. trouve la douche petite');
    expect(ajouterALaNote('', 'trouve la douche petite')).toBe('trouve la douche petite');
    expect(ajouterALaNote('abc', 'defgh', 6)).toBe('abc de');
    expect(ajouterALaNote('Note', '   ')).toBe('Note');
  });

  it('à 390, avec `webkitSpeechRecognition` : « Dicter » ; la dictée s\'ajoute à la fin de la note, en fr-FR', async () => {
    ecrans(true);
    nav.recherche = 'etape=compte-rendu';
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = ReconnaissanceDoublee;
    const user = userEvent.setup();
    monter();
    const note = await screen.findByLabelText('Une note');
    await user.type(note, 'Le loyer lui convient.');
    await user.click(screen.getByRole('button', { name: 'Dicter' }));
    const r = ReconnaissanceDoublee.derniere;
    expect(r?.demarree).toBe(true);
    expect(r?.lang).toBe('fr-FR');
    expect(screen.getByText('J’écoute…')).toBeTruthy();
    act(() => r?.entendre('trouve la douche petite'));
    expect((note as HTMLTextAreaElement).value).toBe('Le loyer lui convient. trouve la douche petite');

    // Le texte dicté part avec le compte rendu, comme un texte tapé.
    await user.click(screen.getByRole('radio', { name: /^Intéressé$/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(ecritures('/api/property-visits/228/report')).toHaveLength(1));
    expect(ecritures('/api/property-visits/228/report')[0]?.corps?.note).toBe('Le loyer lui convient. trouve la douche petite');
  });

  it('un refus du micro se dit sous le champ, la note reste intacte', async () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = ReconnaissanceDoublee;
    const user = userEvent.setup();
    monter();
    const note = await screen.findByLabelText('Une note');
    await user.type(note, 'Garant : son frère');
    await user.click(screen.getByRole('button', { name: 'Dicter' }));
    act(() => ReconnaissanceDoublee.derniere?.onerror?.({ error: 'not-allowed' }));
    act(() => ReconnaissanceDoublee.derniere?.onend?.());
    expect(await screen.findByText(/Le micro est refusé/)).toBeTruthy();
    expect((note as HTMLTextAreaElement).value).toBe('Garant : son frère');
  });

  it('sans l\'API, « Dicter » n\'est pas dans le DOM', async () => {
    ecrans(true);
    nav.recherche = 'etape=compte-rendu';
    monter();
    await screen.findByLabelText('Une note');
    expect(screen.queryByRole('button', { name: 'Dicter' })).toBeNull();
  });
});

describe('TCK-2880 — le bureau de la visite terminée (AC2, AC3)', () => {
  it('faitsAvantLaVisite : la demande, les gestes et les jalons ANTÉRIEURS à la visite, dans l\'ordre du fil', () => {
    const faits = faitsAvantLaVisite(FIL, { scheduled_at: '2026-11-07T10:00:00+00:00' });
    expect(faits.map((e) => `${e.type}-${e.id}`)).toEqual(['visit-228', 'contact-7', 'note-80']);
  });

  it('AC2 — « Avant cette visite » : trois faits datés, le message cité, en une requête', async () => {
    monter();
    const carte = await screen.findByRole('heading', { name: 'Avant cette visite' });
    const section = carte.closest('section') as HTMLElement;
    const lignes = within(section).getAllByRole('listitem');
    expect(lignes).toHaveLength(3);
    expect(lignes[0]?.textContent).toMatch(/Visite confirmée/);
    expect(lignes[0]?.textContent).toMatch(/3 nov\..*09:21/);
    expect(lignes[1]?.textContent).toMatch(/Réponse WhatsApp \(Sokhna\)/);
    expect(lignes[2]?.textContent).toMatch(/Demande reçue/);
    expect(lignes[2]?.textContent).toMatch(/« Bonjour, la pièce de Yoff est-elle libre \? »/);
    expect(section.textContent).not.toMatch(/Note interne|Compte rendu|Appel|Visite demandée/);
    const lus = etat.lectures.filter((l) => l.startsWith('/api/customers/37/timeline'));
    expect(lus).toHaveLength(1);
    expect(decodeURIComponent(lus[0] ?? '')).toMatch(/filter\[type\]=note,contact,visit/);
  });

  it('AC2 — une visite sans fiche client ne montre pas la carte', async () => {
    etat.visite = visiteDe({ customer: null, customer_id: null, visitor_display: { name: 'Awa', phone: '+221770000000', kind: 'anonymous', visits_on_property: 1 } } as Partial<PropertyVisit>);
    monter();
    await screen.findByRole('radio', { name: /^Intéressé$/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('heading', { name: 'Avant cette visite' })).toBeNull();
    expect(etat.lectures.some((l) => l.includes('/timeline'))).toBe(false);
  });

  it('AC3 — l\'en-tête porte « Voir le bien » (→ fiche du bien) et « Ouvrir la fiche de Mouhamed » (→ /app/customers/37)', async () => {
    monter();
    const bien = await screen.findByRole('link', { name: 'Voir le bien' });
    expect(bien.getAttribute('href')).toBe('/app/properties/40');
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche de Mouhamed' }).getAttribute('href')).toBe('/app/customers/37');
  });

  it('la carte du visiteur : « {téléphone} · 1re visite · Prospect »', async () => {
    monter();
    await waitFor(() => expect(document.querySelector('[data-slot="ligne-du-visiteur"]')?.textContent).toMatch(/77 123 45 67 · 1re visite · Prospect$/));
  });
});

describe('TCK-2880 — « Et maintenant ? » (AC4, AC5)', () => {
  it('AC4 — un Prospect, à 390 : « Passer en Qualifié ? · Prospect → Qualifié », « Plus tard » et « Oui » ; « Oui » le passe en Qualifié', async () => {
    ecrans(true);
    etat.visite = visiteDe({ report: FAIT as PropertyVisit['report'] });
    etat.suggestion = { to: 'qualified', reason: 'visit_interested', at: '2026-11-07T10:41:00+00:00' };
    nav.recherche = 'etape=et-maintenant';
    const user = userEvent.setup();
    monter();
    expect(await screen.findByText('Passer en Qualifié ?')).toBeTruthy();
    expect(screen.getByText('Prospect → Qualifié')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plus tard' })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(/Sans choix, une relance est proposée demain dans « Aujourd’hui »/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Oui' }));
    await waitFor(() => expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(1));
    expect(ecritures('/api/customers/37/pipeline-stage')[0]?.corps).toEqual({ pipeline_stage: 'qualified' });
  });

  it('« Plus tard » écarte la proposition POUR CE FAIT (le `reason` de l\'API), sans toucher à l\'étape', async () => {
    etat.visite = visiteDe({ report: FAIT as PropertyVisit['report'] });
    etat.suggestion = { to: 'qualified', reason: 'visit_interested', at: '2026-11-07T10:41:00+00:00' };
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Plus tard' }));
    await waitFor(() => expect(ecritures('/api/customers/37/suggested-stage/dismiss')).toHaveLength(1));
    expect(ecritures('/api/customers/37/suggested-stage/dismiss')[0]?.corps).toEqual({ reason_event: 'visit_interested' });
    await waitFor(() => expect(screen.queryByText('Passer en Qualifié ?')).toBeNull());
    expect(ecritures('/api/customers/37/pipeline-stage')).toHaveLength(0);
  });

  it('« Plus tard » tient au remontage : la question ne revient pas, même pendant la relecture de la fiche', async () => {
    ecrans(true);
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
    // Le compte rendu « Intéressé » écrit : l'API propose « Qualifié » pour ce fait.
    etat.suggestion = { to: 'qualified', reason: 'visit_interested', at: '2026-11-07T10:41:00+00:00' };
    await user.click(await screen.findByRole('radio', { name: /^Intéressé$/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/app/visits/228?etape=et-maintenant'));
    nav.recherche = 'etape=et-maintenant';
    rerender(arbre());
    await user.click(await screen.findByRole('button', { name: 'Plus tard' }));
    await waitFor(() => expect(ecritures('/api/customers/37/suggested-stage/dismiss')).toHaveLength(1));

    // « Modifier », puis retour : l'écran se remonte, la fiche se relit lentement.
    etat.delaiFiche = 150;
    nav.recherche = 'etape=compte-rendu';
    rerender(arbre());
    await screen.findByRole('heading', { level: 1, name: 'Comment s’est passée la visite ?' });
    nav.recherche = 'etape=et-maintenant';
    rerender(arbre());
    await screen.findByText('Inviter à candidater');
    expect(screen.queryByText('Passer en Qualifié ?')).toBeNull();
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText('Passer en Qualifié ?')).toBeNull();
  });

  it('rien n\'est proposé par l\'API : ni question, ni interrupteur', async () => {
    etat.visite = visiteDe({ report: FAIT as PropertyVisit['report'] });
    etat.suggestion = null;
    monter();
    await screen.findByText('Inviter à candidater');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Passer en Qualifié ?')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('AC5 — « Passer » sans suite choisie : une tâche « Relancer Mouhamed » échue demain ; « Annuler » la supprime', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T10:45:00+00:00'));
    ecrans(true);
    etat.visite = visiteDe({ report: FAIT as PropertyVisit['report'] });
    nav.recherche = 'etape=et-maintenant';
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Passer' }));
    await waitFor(() => expect(ecritures('/api/tasks')).toHaveLength(1));
    const tache = ecritures('/api/tasks')[0]?.corps;
    expect(tache?.title).toBe('Relancer Mouhamed');
    expect(tache?.due_at).toBe('2026-11-08T09:00:00.000Z');
    expect(tache).toMatchObject({ taskable_id: 37, taskable_type: 'App\\Models\\Customer' });
    await waitFor(() => expect(ecritures('/api/property-visits/228/report').at(-1)?.corps).toEqual({ follow_up: 'remind' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/app/visits/228'));

    expect(await screen.findByText('Relance posée pour demain')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(envois.filter((e) => e.methode === 'DELETE' && e.chemin === '/api/tasks/9')).toHaveLength(1));
    await waitFor(() => expect(ecritures('/api/property-visits/228/report').at(-1)?.corps).toEqual({ follow_up: null }));
    vi.useRealTimers();
  });

  it('« Passer » juste après une suite choisie sur le même écran : aucune tâche', async () => {
    ecrans(true);
    etat.visite = visiteDe({ report: FAIT as PropertyVisit['report'] });
    nav.recherche = 'etape=et-maintenant';
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('link', { name: /Envoyer par WhatsApp/ }));
    await waitFor(() => expect(ecritures('/api/property-visits/228/report').at(-1)?.corps).toEqual({ follow_up: 'invite_apply' }));
    await waitFor(() => expect(etat.lectures.filter((l) => l.startsWith('/api/property-visits/228')).length).toBeGreaterThan(1));
    await user.click(screen.getByRole('button', { name: 'Passer' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/app/visits/228'));
    expect(ecritures('/api/tasks')).toHaveLength(0);
  });

  it('« Passer » après une suite choisie : aucune tâche, le détail', async () => {
    ecrans(true);
    etat.visite = visiteDe({ report: { ...FAIT, follow_up: 'invite_apply' } as PropertyVisit['report'] });
    nav.recherche = 'etape=et-maintenant';
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Passer' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/app/visits/228'));
    expect(ecritures('/api/tasks')).toHaveLength(0);
  });
});
