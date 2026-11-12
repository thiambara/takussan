/**
 * TCK-2587, lot B — la fiche d'une visite (maquette `app-visites-a-mobile.tsx`, « Fiche de visite »,
 * et `app-visites-a.tsx`, « Détail — bureau ») : les états, la barre collante du geste du moment,
 * les messages WhatsApp au visiteur, « Commencer » sans écriture, « Autre… » qui confirme à l'heure
 * choisie.
 *
 * Horloge : mardi 10 novembre 2026, 10:12 à Dakar (UTC+0 toute l'année).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { PropertyVisit } from '@/types/visit';

import { VisitDetail } from '../../VisitDetail';

// Reprise (vérification du lot B, g2) : la machine et la CI sont à l'heure de Dakar (UTC+0), où l'heure
// locale et l'heure de Dakar se confondent ; une lecture en heure locale y passerait inaperçue. Le
// fichier tourne donc dans un fuseau qui en diffère, et Dakar doit rester juste partout.
process.env.TZ = 'Europe/Paris';

const f = fr.visits.fiche;

const etat = vi.hoisted(() => ({
  visite: null as PropertyVisit | null,
  recherche: '',
  user: { id: 7, roles: ['agent'] as string[], first_name: 'Sokhna' as string | null },
  /** L'agence du personnel actif : `null` = pas du personnel (le bailleur, le client). */
  agence: null as number | null,
  profils: undefined as unknown,
  creneaux: [] as (readonly [number | null, string | null, number | null | undefined])[],
  capacites: [] as string[],
  /** Suivi du lot A : l'agent parti ou suspendu, dont `/slots` refuse l'`agent_id` en 422. */
  agentParti: null as number | null,
}));
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const confirmer = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const terminer = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const absent = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const autre = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: etat.user, token: 'jeton' }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/app/visits/1',
  useSearchParams: () => new URLSearchParams(etat.recherche),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/hooks/usePersonnelActif', () => ({ useAgenceDuPersonnelActif: () => etat.agence }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: etat.profils }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: (c: string) => ({ can: etat.capacites.includes(c), isLoading: false }) }));

/** Les créneaux du mercredi 11 : 14:00 pris, 15:00, 15:30 et 17:00 libres. */
function creneaux(jour: string | null) {
  if (!jour) return { data: undefined, isError: false, dataUpdatedAt: 0 };
  const slots = [
    ['14:00', false],
    ['15:00', true],
    ['15:30', true],
    ['16:00', true],
  ].map(([label, available]) => ({ start: `${jour}T${label}:00Z`, label, available }));
  return { data: { data: { slots } }, isError: false, dataUpdatedAt: Date.parse('2026-11-10T10:12:00Z') };
}

vi.mock('@/lib/queries/visits', () => ({
  useVisit: () => ({ data: { data: etat.visite }, isLoading: false, isError: false }),
  useConfirmVisit: () => confirmer,
  useCompleteVisit: () => terminer,
  useMarkVisitNoShow: () => absent,
  useCancelVisit: () => autre,
  useUpdateVisit: () => autre,
  useClaimVisit: () => autre,
  useProposeVisitSlot: () => autre,
  useAttribuerEnLot: () => autre,
  useCreateVisitReport: () => autre,
  useUpdateVisitReport: () => autre,
  useCreneauxDeVisite: (id: number | null, jour: string | null, agent?: number | null) => {
    etat.creneaux.push([id, jour, agent]);
    if (jour && agent != null && agent === etat.agentParti) {
      return { data: undefined, isError: true, error: new ApiError(422, { message: 'Le champ agent est invalide.', errors: { agent_id: ['Le champ agent est invalide.'] } }), dataUpdatedAt: 0 };
    }
    return creneaux(jour);
  },
}));

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

/** La fiche du client 45 et ses biens correspondants ; le reste répond 404. */
const CLIENT_45 = {
  id: 45,
  first_name: 'Abdoulaye',
  pipeline_stage: 'prospect',
  seeking_contract_type: 'rent',
  seeking_property_types: ['shop'],
  seeking_neighborhoods: ['Plateau', 'Yoff'],
  budget_max: '500000.00',
};
const BIENS_45 = [
  { id: 81, title: 'Local d’angle', slug: 'local-d-angle', type: 'shop', contract_type: 'rent', price: '480000.00', bedrooms: null, visibility: 'public', status: 'available', city: 'Dakar', neighborhood: 'Plateau' },
  { id: 82, title: 'Boutique 45 m²', slug: 'boutique-45', type: 'shop', contract_type: 'rent', price: '300000.00', bedrooms: null, visibility: 'public', status: 'available', city: 'Dakar', neighborhood: 'Yoff' },
  { id: 83, title: 'Bureau privé', slug: null, type: 'office', contract_type: 'rent', price: '420000.00', bedrooms: null, visibility: 'private', status: 'available', city: 'Dakar', neighborhood: 'Point E' },
];
const urlDe = (entree: RequestInfo | URL) => (typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url);
const fetchEspion = vi.fn((entree: RequestInfo | URL, _init?: RequestInit) => {
  const url = urlDe(entree);
  const json = (corps: unknown) => Promise.resolve(new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (/\/api\/customers\/45\/matching-properties/.test(url)) return json({ data: BIENS_45, meta: { total: 3, per_page: 20, current_page: 1, last_page: 1 } });
  if (/\/api\/customers\/45(\?|$)/.test(url)) return json({ data: CLIENT_45 });
  return Promise.resolve(new Response('{}', { status: 404 }));
});
const lecturesDuClient = () => fetchEspion.mock.calls.map(([e]) => urlDe(e)).filter((u) => /\/api\/customers\//.test(u));

function visite(o: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 1,
    property_id: 10,
    visitor_id: null,
    customer_id: 45,
    agent_id: 7,
    type: 'in_person',
    status: 'confirmed',
    scheduled_at: '2026-11-10T10:57:00Z',
    duration_minutes: 30,
    created_at: '2026-11-10T07:12:00Z',
    property: { id: 10, title: 'Local commercial', slug: 'local-commercial', address: { line: '12, rue Carnot', neighborhood: 'Dakar-Plateau', city: 'Dakar' } },
    customer: { id: 45, user_id: null, first_name: 'Abdoulaye', last_name: 'Cissé', email: null, phone: '+221771234567' },
    visitor_display: { name: 'Abdoulaye Cissé', phone: '+221771234567', kind: 'customer', visits_on_property: 1 },
    abilities: { manage: true },
    ...o,
  } as PropertyVisit;
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><VisitDetail id={1} /></QueryClientProvider>));
}

const texteDe = (href: string | null) => decodeURIComponent((href ?? '').split('?text=')[1] ?? '');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:12:00Z'));
  vi.clearAllMocks();
  etat.visite = visite();
  etat.recherche = '';
  etat.user = { id: 7, roles: ['agent'], first_name: 'Sokhna' };
  etat.agence = null;
  etat.profils = undefined;
  etat.creneaux = [];
  etat.capacites = [];
  etat.agentParti = null;
  confirmer.mutateAsync.mockResolvedValue({});
  vi.stubGlobal('fetch', fetchEspion);
  ecrans(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Aucune écriture : ni mutation, ni requête autre qu'une lecture. */
function aucuneEcriture() {
  for (const m of [confirmer, terminer, absent, autre]) expect(m.mutateAsync).not.toHaveBeenCalled();
  for (const [, init] of fetchEspion.mock.calls) expect(init?.method ?? 'GET').toBe('GET');
}

describe('TCK-2587 lot B — à confirmer (téléphone)', () => {
  beforeEach(() => {
    etat.visite = visite({ status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-11T14:00:00Z', notes: 'Je viens avec mon associé.' });
  });

  it('la tête dit le jour et la tranche ; la demande propose les heures libres, la première dans la barre', () => {
    monter();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mer. 11 nov.');
    expect(screen.getByText(f.statut.aConfirmer)).toBeInTheDocument();
    expect(screen.getByText('Demande reçue il y a 3 h')).toBeInTheDocument();
    const demande = screen.getByText(f.demande.titre).closest('section') as HTMLElement;
    expect(within(demande).getByText('« Je viens avec mon associé. »')).toBeInTheDocument();
    // 14:00 est pris : la tranche commence à 15:00.
    expect(within(demande).queryByRole('button', { name: '14:00' })).toBeNull();
    expect(within(demande).getByRole('button', { name: '15:00' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Confirmer pour mer. 11 à 15:00' })).toBeInTheDocument();
  });

  it('choisir 15:30 change la barre, et la confirmation poste cette heure', async () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: '15:30' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer pour mer. 11 à 15:30' }));
    await waitFor(() => expect(confirmer.mutateAsync).toHaveBeenCalledWith({ scheduled_at: '2026-11-11T15:30:00Z' }));
  });

  it('« Autre… » ouvre le choix du jour et de l’heure ; « Confirmer à 16:00 » poste cet instant et referme', async () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: f.demande.autre }));
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByLabelText(f.autreHeure.jour)).toHaveValue('2026-11-11');
    fireEvent.click(within(dialogue).getByRole('button', { name: '16:00' }));
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Confirmer à 16:00' }));
    await waitFor(() => expect(confirmer.mutateAsync).toHaveBeenCalledWith({ scheduled_at: '2026-11-11T16:00:00Z' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('`?heure=autre` (la carte de la liste) ouvre le choix d’emblée ; le fermer retire le paramètre', async () => {
    etat.recherche = 'heure=autre';
    monter();
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByRole('heading', { name: f.autreHeure.titre })).toBeInTheDocument();
    fireEvent.click(within(dialogue).getByRole('button', { name: f.autreHeure.fermer }));
    expect(nav.replace).toHaveBeenCalledWith('/app/visits/1');
    aucuneEcriture();
  });

  it('le client qui a demandé la visite ne voit ni la demande à confirmer, ni sa propre carte, ni la barre', () => {
    etat.user = { id: 30, roles: ['customer'], first_name: 'Abdoulaye' };
    etat.visite = visite({ status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-11T14:00:00Z', visitor_id: 30, abilities: { manage: false, feedback_customer: true } });
    monter();
    expect(screen.queryByText(f.demande.titre)).toBeNull();
    expect(screen.queryByRole('link', { name: /WhatsApp/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Annuler la visite/ })).toBeInTheDocument();
  });
});

describe('TCK-2587 lot B — jour J (téléphone)', () => {
  it('l’heure en très grand, « dans 45 min », et le message « en route » prêt, signé, en un geste', () => {
    monter();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('10:57');
    expect(screen.getByText('dans 45 min')).toBeInTheDocument();
    expect(screen.getByText('Aujourd’hui · mardi 10 novembre')).toBeInTheDocument();
    const attendu = 'Bonjour Abdoulaye, je suis en route, j’arrive vers 10 h 57. — Sokhna';
    expect(screen.getByText(attendu)).toBeInTheDocument();
    const enRoute = screen.getByRole('link', { name: f.barre.enRoute });
    expect(enRoute.getAttribute('href')).toBe(`https://wa.me/221771234567?text=${encodeURIComponent(attendu)}`);
    expect(enRoute).toHaveAttribute('target', '_blank');
  });

  it('« Prévenir d’un retard » ouvre WhatsApp avec « 10 minutes de retard », encodé', () => {
    monter();
    const retard = screen.getByRole('link', { name: new RegExp(`^${f.autres.retard}`) });
    expect(texteDe(retard.getAttribute('href'))).toBe(
      'Bonjour Abdoulaye, j’aurai 10 minutes de retard pour notre visite de 10 h 57. Merci de votre patience. — Sokhna',
    );
  });

  it('sans prénom du personnel, le message part sans signature ni tiret pendant', () => {
    etat.user = { id: 7, roles: ['agent'], first_name: null };
    monter();
    const texte = texteDe(screen.getByRole('link', { name: f.barre.enRoute }).getAttribute('href'));
    expect(texte).toBe('Bonjour Abdoulaye, je suis en route, j’arrive vers 10 h 57.');
  });

  it('sans numéro joignable : ni « en route », ni retard, ni WhatsApp — « Commencer » seul', () => {
    etat.visite = visite({
      customer: { id: 45, user_id: null, first_name: 'Abdoulaye', last_name: 'Cissé', email: null, phone: null },
      visitor_display: { name: 'Abdoulaye Cissé', phone: null, kind: 'customer', visits_on_property: 1 },
    });
    monter();
    expect(screen.queryByRole('link', { name: f.barre.enRoute })).toBeNull();
    expect(screen.queryByRole('link', { name: new RegExp(`^${f.autres.retard}`) })).toBeNull();
    expect(screen.queryByText(f.enRoute.titre)).toBeNull();
    expect(screen.getByRole('button', { name: f.barre.commencer })).toBeInTheDocument();
  });

  it('« Commencer » pose l’heure du clic dans l’URL, et n’écrit rien', () => {
    // 10:12 pour 10:40 : dans les 30 min qui précèdent l'heure, le geste se clique (m1).
    etat.visite = visite({ scheduled_at: '2026-11-10T10:40:00Z' });
    monter();
    fireEvent.click(screen.getByRole('button', { name: f.barre.commencer }));
    expect(nav.replace).toHaveBeenCalledWith('/app/visits/1?commencee=10:12');
    aucuneEcriture();
  });

  it('plus de 30 min avant l’heure, « Commencer » est grisé et dit à partir de quand (m1)', () => {
    monter();
    const commencer = screen.getByRole('button', { name: f.barre.commencer });
    expect(commencer).toBeDisabled();
    const pourquoi = screen.getByText('« Commencer » est possible à partir de 10:27, 30 min avant la visite.');
    expect(commencer).toHaveAttribute('aria-describedby', pourquoi.id);
    fireEvent.click(commencer);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('à 30 min de l’heure tout juste, « Commencer » se clique et ne dit plus rien (m1)', () => {
    etat.visite = visite({ scheduled_at: '2026-11-10T10:42:00Z' });
    monter();
    const commencer = screen.getByRole('button', { name: f.barre.commencer });
    expect(commencer).toBeEnabled();
    expect(commencer).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/« Commencer » est possible à partir de/)).toBeNull();
  });

  it('une visite confirmée pour un autre jour : ni « en route », ni « Commencer »', () => {
    etat.visite = visite({ scheduled_at: '2026-11-12T10:00:00Z' });
    monter();
    expect(screen.queryByRole('link', { name: f.barre.enRoute })).toBeNull();
    expect(screen.queryByRole('button', { name: f.barre.commencer })).toBeNull();
  });
});

describe('TCK-2587 lot B — après l’heure (téléphone)', () => {
  it('commencée avant l’heure : « En cours », la progression depuis le clic, « Absent » grisé jusqu’à 10:57', () => {
    etat.recherche = 'commencee=10:05';
    monter();
    expect(screen.getByText(f.statut.enCours)).toBeInTheDocument();
    expect(screen.getByText('Commencée à 10:05 · fin prévue à 10:35')).toBeInTheDocument();
    expect(screen.getByText('7 min sur 30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: f.barre.absent })).toBeDisabled();
    expect(screen.getByText('« Absent » est possible à partir de 10:57, l’heure de la visite.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: f.barre.terminer })).toBeEnabled();
  });

  it('l’heure atteinte : « Absent » actif, et il l’envoie', async () => {
    etat.visite = visite({ scheduled_at: '2026-11-10T10:00:00Z' });
    monter();
    expect(screen.getByText('depuis 12 min')).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: f.barre.absent });
    expect(bouton).toBeEnabled();
    await act(async () => {
      fireEvent.click(bouton);
    });
    expect(absent.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('la fin prévue passée : « Heure passée », sans progression ni « depuis »', () => {
    etat.visite = visite({ scheduled_at: '2026-11-10T09:00:00Z' });
    monter();
    expect(screen.getAllByText(f.statut.apres).length).toBeGreaterThan(0);
    expect(screen.queryByText(/min sur/)).toBeNull();
    expect(screen.queryByText(/^depuis/)).toBeNull();
    expect(screen.getByRole('button', { name: f.barre.terminer })).toBeEnabled();
  });
});

describe('TCK-2587 lot B — bureau', () => {
  beforeEach(() => ecrans(false));

  it('à confirmer : le titre de page, « Proposer une autre heure » et « Confirmer à 15:00 » qui poste l’heure', async () => {
    etat.visite = visite({ status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-11T14:00:00Z' });
    monter();
    expect(screen.getByRole('heading', { level: 1, name: f.bureau.titre.aConfirmer })).toBeInTheDocument();
    expect(screen.getByText('Demandée il y a 3 h par Abdoulaye Cissé pour mercredi 11 novembre, l’après-midi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: f.bureau.proposerAutreHeure })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer à 15:00' }));
    await waitFor(() => expect(confirmer.mutateAsync).toHaveBeenCalledWith({ scheduled_at: '2026-11-11T15:00:00Z' }));
  });

  it('jour J : « Visite de 10:57 », la barre du jour avec le message et « Commencer » ; un seul h1', () => {
    monter();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Visite de 10:57');
    const barre = screen.getByText('Dans 45 min').closest('[data-slot="barre-du-jour-j"]') as HTMLElement;
    expect(within(barre).getByRole('link', { name: f.barre.enRoute })).toBeInTheDocument();
    expect(within(barre).getByRole('button', { name: f.barre.commencer })).toBeInTheDocument();
  });

  it('jour J à plus de 30 min de l’heure : « Commencer » grisé, « possible à partir de 10:27 » sous la plage (m1)', () => {
    monter();
    const barre = document.querySelector('[data-slot="barre-du-jour-j"]') as HTMLElement;
    const commencer = within(barre).getByRole('button', { name: f.barre.commencer });
    expect(commencer).toBeDisabled();
    expect(commencer).toHaveAttribute('aria-describedby', within(barre).getByText('« Commencer » possible à partir de 10:27').id);
  });

  it('jour J dans les 30 min : « Commencer » se clique au bureau aussi (m1)', () => {
    etat.visite = visite({ scheduled_at: '2026-11-10T10:40:00Z' });
    monter();
    const barre = document.querySelector('[data-slot="barre-du-jour-j"]') as HTMLElement;
    expect(within(barre).getByRole('button', { name: f.barre.commencer })).toBeEnabled();
    expect(within(barre).queryByText(/possible à partir de/)).toBeNull();
  });
  it('le créneau dit la maquette : « Mer. 11 nov. 2026 », « après-midi — à fixer », « mercredi après-midi, heure à fixer » et les créneaux libres du jour', () => {
    etat.visite = visite({ status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-11T14:00:00Z' });
    monter();
    const carte = document.querySelector('[data-slot="carte-creneau"]') as HTMLElement;
    expect(within(carte).getByText('Mer. 11 nov. 2026')).toBeInTheDocument();
    expect(within(carte).getByText('après-midi — à fixer')).toBeInTheDocument();
    expect(within(carte).getByText('Demande de Abdoulaye · il y a 3 h · mercredi après-midi, heure à fixer')).toBeInTheDocument();
    expect(within(carte).getByText('Vos créneaux libres mercredi après-midi : 15:00 · 15:30 · 16:00')).toBeInTheDocument();
  });

  it('au-delà de six jours, la demande redit la date entière', () => {
    etat.visite = visite({ status: 'scheduled', preferred_window: 'morning', scheduled_at: '2026-11-17T09:00:00Z' });
    monter();
    const carte = document.querySelector('[data-slot="carte-creneau"]') as HTMLElement;
    expect(within(carte).getByText('Demande de Abdoulaye · il y a 3 h · mardi 17 novembre matin, heure à fixer')).toBeInTheDocument();
  });

  it('le numéro se lit groupé, les liens gardent l’E.164 ; un visiteur nommé par son numéro ne le voit pas redit', () => {
    monter();
    const carte = document.querySelector('[data-slot="carte-visiteur"]') as HTMLElement;
    expect(within(carte).getByText('+221 77 123 45 67')).toBeInTheDocument();
    expect(within(carte).getByRole('link', { name: f.bureau.appeler })).toHaveAttribute('href', 'tel:+221771234567');
  });

  it('au bureau, un visiteur nommé par son numéro ne le voit pas redit sous son nom', () => {
    etat.visite = visite({ customer: null, customer_id: null, visitor_display: { name: '+221 77 123 45 67', phone: '+221771234567', kind: 'anonymous', visits_on_property: 1 } } as Partial<PropertyVisit>);
    monter();
    expect(within(document.querySelector('[data-slot="carte-visiteur"]') as HTMLElement).getAllByText('+221 77 123 45 67')).toHaveLength(1);
  });
});

describe('TCK-2587 lot B — la barre à deux gestes', () => {
  const barre = () => document.querySelector('[data-slot="barre-d-action"]') as HTMLElement;

  it('jour J : « Commencer », le dernier geste, est le secondaire (prop de la primitive, réponse 6)', () => {
    monter();
    expect(barre()).toHaveAttribute('data-secondaire', 'dernier');
    expect(barre().className).toContain('*:last:not-first:flex-none');
  });

  it('en cours : « Absent », le premier geste, est le secondaire', () => {
    etat.recherche = 'commencee=10:05';
    monter();
    expect(barre()).toHaveAttribute('data-secondaire', 'premier');
    expect(barre().className).toContain('*:first:not-last:flex-none');
  });

  it('des boutons de 48 px, comme la maquette : `taille="action"` sur la barre de la fiche (complément du team-lead)', () => {
    monter();
    expect(barre()).toHaveAttribute('data-taille', 'action');
  });
});

describe('TCK-2587 lot B — le numéro au téléphone', () => {
  it('groupé sous le nom, et pas redit quand il tient lieu de nom', () => {
    monter();
    expect(within(document.querySelector('[data-slot="carte-visiteur"]') as HTMLElement).getByText('+221 77 123 45 67')).toBeInTheDocument();
  });

  it('un visiteur sans nom se nomme par son numéro, une seule fois', () => {
    etat.visite = visite({ customer: null, customer_id: null, visitor_display: { name: '+221 77 123 45 67', phone: '+221771234567', kind: 'anonymous', visits_on_property: 1 } } as Partial<PropertyVisit>);
    monter();
    expect(within(document.querySelector('[data-slot="carte-visiteur"]') as HTMLElement).getAllByText('+221 77 123 45 67')).toHaveLength(1);
  });
});

describe('TCK-2587 lot B — réponses du team-lead', () => {
  const RAPPORT = { report: null } as Partial<PropertyVisit>;

  it('3 — en cours (téléphone) : pas de « Faire le compte rendu » avant la fin prévue ; `?etape=compte-rendu` reste servi', () => {
    etat.visite = visite({ scheduled_at: '2026-11-10T10:00:00Z', ...RAPPORT });
    const rendu = monter();
    expect(screen.getByText(f.statut.enCours)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="faire-le-compte-rendu"]')).toBeNull();
    rendu.unmount();
    etat.recherche = 'etape=compte-rendu';
    monter();
    expect(document.querySelector('[data-slot="etape-compte-rendu"]')).not.toBeNull();
  });

  it('3 — après la fin prévue (téléphone) : la carte du compte rendu revient', () => {
    etat.visite = visite({ scheduled_at: '2026-11-10T09:30:00Z', ...RAPPORT });
    monter();
    expect(document.querySelector('[data-slot="faire-le-compte-rendu"]')).not.toBeNull();
  });

  it('3 — en cours (bureau) : ni carte ni formulaire du compte rendu, la colonne du visiteur à sa place ; après : le formulaire', () => {
    ecrans(false);
    etat.visite = visite({ scheduled_at: '2026-11-10T10:00:00Z', ...RAPPORT });
    const rendu = monter();
    expect(document.querySelector('[data-slot="carte-compte-rendu"]')).toBeNull();
    expect(document.querySelector('[data-slot="carte-visiteur"]')).not.toBeNull();
    rendu.unmount();
    etat.visite = visite({ scheduled_at: '2026-11-10T09:30:00Z', ...RAPPORT });
    monter();
    expect(document.querySelector('[data-slot="carte-compte-rendu"]')).not.toBeNull();
  });

  it('2 — la signature porte l’agence du profil actif : « — Sokhna, Dakar Immo » ; l’espace personnel n’en est pas une', () => {
    etat.agence = 3;
    etat.profils = { data: [{ id: 5, type: 'agent', status: 'active', agency_id: 3, agency: { id: 3, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard' } }], meta: { active_profile_id: 5 } };
    const rendu = monter();
    expect(texteDe(screen.getByRole('link', { name: f.barre.enRoute }).getAttribute('href'))).toMatch(/ — Sokhna, Dakar Immo$/);
    rendu.unmount();
    etat.profils = { data: [{ id: 5, type: 'agency_admin', status: 'active', agency_id: 3, agency: { id: 3, name: 'Espace de Sokhna', slug: 'e', kind: 'individual' } }], meta: { active_profile_id: 5 } };
    monter();
    expect(texteDe(screen.getByRole('link', { name: f.barre.enRoute }).getAttribute('href'))).toMatch(/ — Sokhna$/);
  });

  it('1c — le personnel actif lit la fiche du client (sans `fields`) : « Cherche » et « Étape »', async () => {
    ecrans(false);
    etat.agence = 3;
    monter();
    const dl = await waitFor(() => {
      const el = document.querySelector('[data-slot="cherche-etape"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(dl).getByText(/^Location · commerce · Plateau, Yoff · jusqu’à 500\s000\sF\/mois$/u)).toBeInTheDocument();
    expect(within(dl).getByText('Prospect')).toBeInTheDocument();
    const fiche = lecturesDuClient().filter((u) => /\/api\/customers\/45(\?|$)/.test(u));
    expect(fiche.length).toBeGreaterThan(0);
    expect(fiche.every((u) => !u.includes('fields'))).toBe(true);
  });

  it('1c — le bailleur (aucun profil de personnel actif) ne lit ni la fiche du client ni ses biens correspondants', async () => {
    ecrans(false);
    etat.user = { id: 12, roles: ['owner'], first_name: 'Moussa' };
    etat.visite = visite({ abilities: { manage: true } });
    monter();
    await act(async () => {
      await Promise.resolve();
    });
    expect(lecturesDuClient()).toEqual([]);
    expect(document.querySelector('[data-slot="cherche-etape"]')).toBeNull();
    expect(document.querySelector('[data-slot="biens-correspondants"]')).toBeNull();
  });

  it('1b — biens correspondants : trois biens, « Partager (2) » envoie les deux publics, « Proposer » un seul ; le privé n’est pas proposé', async () => {
    ecrans(false);
    etat.agence = 3;
    monter();
    const carte = await waitFor(() => {
      const el = document.querySelector('[data-slot="biens-correspondants"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(carte).getByText('Local d’angle · Plateau')).toBeInTheDocument();
    expect(within(carte).getByText('Bureau privé · Point E')).toBeInTheDocument();
    const partager = within(carte).getByRole('link', { name: 'Partager (2)' });
    const message = texteDe(partager.getAttribute('href'));
    expect(message).toContain('Bonjour Abdoulaye, voici des biens qui correspondent à votre recherche :');
    expect(message).toContain('/properties/local-d-angle');
    expect(message).toContain('/properties/boutique-45');
    expect(message).not.toContain('Bureau privé');
    expect(within(carte).getAllByRole('link', { name: /^Proposer « / })).toHaveLength(2);
    expect(texteDe(within(carte).getByRole('link', { name: 'Proposer « Boutique 45 m² » sur WhatsApp' }).getAttribute('href'))).not.toContain('local-d-angle');
  });

  it('4 — bureau, commencée avant l’heure : « Absent » grisé, « Possible à partir de 10:57 » le décrit', () => {
    ecrans(false);
    etat.recherche = 'commencee=10:05';
    monter();
    const barre = document.querySelector('[data-slot="barre-du-jour-j"]') as HTMLElement;
    const absent = within(barre).getByRole('button', { name: f.barre.absent });
    expect(absent).toBeDisabled();
    const aide = within(barre).getByText('Possible à partir de 10:57');
    expect(absent.getAttribute('aria-describedby')).toBe(aide.id);
  });

  it('5 — bureau, à confirmer : un bouton unique « Confirmer à 15:00 », sans menu d’autres heures ; « Proposer une autre heure » à côté', () => {
    ecrans(false);
    etat.visite = visite({ status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-11T14:00:00Z' });
    monter();
    expect(screen.getByRole('button', { name: 'Confirmer à 15:00' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: fr.visits.parLeTemps.autresHeures })).toBeNull();
    expect(screen.getByRole('button', { name: f.bureau.proposerAutreHeure })).toBeInTheDocument();
  });

  it('d1 — « Autre heure » lit les créneaux de l’agent de la visite', () => {
    etat.visite = visite({ status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-11T14:00:00Z', agent_id: 21 });
    etat.recherche = 'heure=autre';
    monter();
    expect(etat.creneaux.some(([id, jour, agent]) => id === 10 && jour !== null && agent === 21)).toBe(true);
    // Toute lecture de créneaux de la fiche — la tranche ET le choix « Autre heure » — porte l'agent.
    expect(etat.creneaux.every(([, , agent]) => agent === 21)).toBe(true);
  });
});

describe('TCK-2587 — suivi du lot A : l’agent de la visite parti ou suspendu (`/slots` en 422)', () => {
  const MESSAGE = 'L’agent de cette visite n’est plus disponible : réattribuez-la';
  beforeEach(() => {
    etat.visite = visite({ status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-11T14:00:00Z', agent_id: 21 });
    etat.agentParti = 21;
    etat.agence = 3;
  });

  it('téléphone, avec `crm.assign` : la demande le dit, et la barre réattribue au lieu de confirmer', () => {
    etat.capacites = ['crm.assign'];
    monter();
    const ligne = document.querySelector('[data-slot="carte-demande-recue"] [data-slot="agent-indisponible"]') as HTMLElement;
    expect(within(ligne).getByRole('status')).toHaveTextContent(MESSAGE);
    expect(within(ligne).getByRole('button', { name: 'Réattribuer' })).toBeInTheDocument();
    const barre = document.querySelector('[data-slot="barre-d-action"]') as HTMLElement;
    expect(within(barre).getByRole('button', { name: 'Réattribuer' })).toBeInTheDocument();
    expect(within(barre).queryByRole('button', { name: /^Confirmer/ })).toBeNull();
    // Ni heure, ni « Autre… » : l'autre heure lirait les mêmes créneaux refusés.
    expect(screen.queryByRole('button', { name: f.demande.autre })).toBeNull();
    // Aucune relecture sans agent : les heures de l'appelant ne remplacent pas celles de la visite.
    expect(etat.creneaux.filter(([, jour]) => jour !== null).every(([, , agent]) => agent === 21)).toBe(true);
  });

  it('téléphone, sans `crm.assign` : la ligne seule, aucun geste inventé', () => {
    monter();
    const ligne = document.querySelector('[data-slot="carte-demande-recue"] [data-slot="agent-indisponible"]') as HTMLElement;
    expect(within(ligne).getByRole('status')).toHaveTextContent(MESSAGE);
    expect(screen.queryByRole('button', { name: 'Réattribuer' })).toBeNull();
  });

  it('bureau : « Réattribuer » prend la place de « Confirmer à … » ; le corps dit pourquoi', () => {
    ecrans(false);
    etat.capacites = ['crm.assign'];
    monter();
    expect(screen.queryByRole('button', { name: /^Confirmer à/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Réattribuer' })).toHaveLength(1);
    const corps = document.querySelector('[data-slot="carte-creneau"] [data-slot="agent-indisponible"]') as HTMLElement;
    expect(within(corps).getByRole('status')).toHaveTextContent(MESSAGE);
  });

  it('« Autre heure » (`?heure=autre`) : le dialogue le dit au lieu de rester vide', () => {
    etat.recherche = 'heure=autre';
    monter();
    const dialogue = document.querySelector('[data-slot="autre-heure"]') as HTMLElement;
    expect(within(dialogue).getByRole('status')).toHaveTextContent(MESSAGE);
  });
});
