/**
 * TCK-2584 — vérification adverse (d1) : au téléphone, le sous-titre « n sur N » de la demande
 * ouverte se compte dans la page SERVIE, jamais dans la liste rendue où la demande désignée
 * (`?lead=`) est préposée à chaque page sans être comptée dans `meta.total`.
 *
 * Le fichier voisin `ContactLeadsInbox.test.tsx` ne sert qu'une page : ce qu'il garde du défaut
 * (« 2 sur 2 » pour une seule à traiter) ne dit rien de la page 2, où il se lisait « 26 sur 25 ».
 * Le double de `useContactLeads` honore ici la page demandée, `meta.total` et `meta.last_page`.
 *
 * Vérifié par ablation : relire le rang dans `lignes` (et rehausser le total à `rang + 1`) rend
 * rouges les cas « 23 sur 25 », « 25 sur 25 » et « désignée hors de la page ».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ContactLeadsInbox } from '../ContactLeadsInbox';
import type { ContactLead, DelaisDeReponse } from '@/lib/queries/contact-leads';

const etat = vi.hoisted(() => ({
  leads: [] as ContactLead[],
  filtres: [] as string[],
  affinages: [] as unknown[],
  roles: ['agent'] as string[],
  capacites: ['crm.assign'] as string[],
  recherche: '',
  large: true,
  erreur: false,
  chargement: false,
  designe: null as { data?: ContactLead; isError?: boolean } | null,
  lues: [] as (number | null)[],
  membres: [{ id: 21, first_name: 'Moussa', last_name: 'Fall' }] as { id: number; first_name: string; last_name: string }[],
  delais: null as DelaisDeReponse | null,
  delaisActives: [] as boolean[],
  planifier: null as Record<string, unknown> | null,
  parPage: {} as Record<number, ContactLead[]>,
  total: 0,
  lastPage: 1,
}));
const handle = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const convert = { mutateAsync: vi.fn().mockResolvedValue({ customer: { id: 88 } }), isPending: false };
const assign = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const contact = { mutate: vi.fn() };
const refetch = vi.fn();
const toastAdd = vi.fn();

vi.mock('@/lib/queries/contact-leads', () => ({
  useContactLeads: (filtre: string, page: number, affinage: unknown) => {
    etat.filtres.push(filtre);
    etat.affinages.push(affinage);
    return {
      data: etat.erreur || etat.chargement ? undefined : { data: etat.parPage[page] ?? [], meta: { total: etat.total, last_page: etat.lastPage } },
      isLoading: etat.chargement,
      isError: etat.erreur,
      isFetching: false,
      refetch,
    };
  },
  // Deux lecteurs : la demande désignée (`?lead=`) et une demande ouverte absente de la page.
  useContactLead: (id: number | null) => {
    etat.lues.push(id);
    if (id === null || !etat.designe) return { data: undefined, isError: false };
    return { data: etat.designe.data ? { data: etat.designe.data } : undefined, isError: etat.designe.isError ?? false };
  },
  useHandleLead: () => handle,
  useConvertLead: () => convert,
  useAssignLead: () => assign,
  useEnregistrerContact: () => contact,
  useUnhandledLeadsCount: () => ({ data: { meta: { total: etat.leads.filter((l) => !l.handled_at).length } } }),
  useCompteDeLaVue: () => ({ data: { meta: { total: 1 } } }),
  useDemandesEnRetard: () => ({ data: { meta: { total: 1 } } }),
  useDelaisDeReponse: ({ enabled }: { enabled: boolean }) => {
    etat.delaisActives.push(enabled);
    return { data: enabled && etat.delais ? { data: etat.delais } : undefined };
  },
  useBienDeLaDemande: (id: number | null) => ({
    data: id === null ? undefined : { data: { id, title: 'Villa à Almadies', price: 85000, currency: 'XOF', contract_type: 'rent', main_photo_url: null } },
    isPending: false,
  }),
}));

vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => etat.large }));

const remplacer = vi.hoisted(() => vi.fn());
const pousser = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.recherche),
  useRouter: () => ({ replace: remplacer, push: pousser }),
  usePathname: () => '/app/leads',
}));

const lecturesDesMembres = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    const chemin = args[1] as string;
    if (chemin.includes('/members')) {
      lecturesDesMembres.push(args);
      return { data: { data: etat.membres }, isLoading: false };
    }
    return { data: { data: [] }, isLoading: false, isFetching: false };
  },
}));

// P152.05 — « Attribuer » se juge par `crm.assign` dans l'agence de la demande.
const lecturesDesCapacites = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/hooks/useCan', () => ({
  useCan: (capacite: string, ...reste: unknown[]) => (lecturesDesCapacites.push([capacite, ...reste]), {
    can: etat.capacites.includes(capacite),
    isLoading: false,
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, roles: etat.roles, agency_id: 3 } }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

// L'en-tête du téléphone est rendu PAR LA COQUE : on retient ce que la boîte y déclare.
const declarations = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({
  DeclarerEnTete: (d: Record<string, unknown>) => (declarations.push(d), null),
}));

vi.mock('@/components/visits/PlanifierUneVisite', () => ({
  PlanifierDialog: (props: Record<string, unknown>) => {
    etat.planifier = props;
    return <div data-testid="planifier" />;
  },
}));

const MESSAGE =
  'Bonjour, je cherche un appartement de trois pièces pour ma famille, disponible dès janvier, avec parking si possible.';

/** L'horloge figée : mardi 10 novembre 2026, 12:00 à Dakar (UTC). */
const MAINTENANT = new Date('2026-11-10T12:00:00Z');

function lead(overrides: Partial<ContactLead> = {}): ContactLead {
  return {
    id: 1,
    property_id: 10,
    agency_id: 3,
    recipient_user_id: 7,
    channel: 'form',
    source: 'whatsapp',
    medium: 'share',
    name: 'Awa Diop',
    email: 'awa@example.sn',
    phone: '+221771234567',
    message: MESSAGE,
    handled_at: null,
    handled_by_id: null,
    customer_id: null,
    known_customer: null,
    created_at: '2026-11-10T11:35:00Z',
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    recipient: { id: 7, first_name: 'Fatou', last_name: 'Ndiaye' },
    ...overrides,
  };
}

function rendre() {
  return render(withIntl(<ContactLeadsInbox />));
}
describe('<ContactLeadsInbox> — « n sur N » au-delà de la page 1 (TCK-2584, d1)', () => {
  const page1 = Array.from({ length: 20 }, (_, i) => lead({ id: i + 1, name: `Page 1 n° ${i + 1}` }));
  const page2 = Array.from({ length: 5 }, (_, i) => lead({ id: i + 21, name: `Page 2 n° ${i + 21}` }));
  const traitee = lead({ id: 99, name: 'Mariama Sy', handled_at: '2026-11-10T11:50:00Z' });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MAINTENANT);
    etat.leads = [...page1, ...page2];
    etat.parPage = { 1: page1, 2: page2 };
    etat.total = 25;
    etat.lastPage = 2;
    etat.filtres = [];
    etat.affinages = [];
    etat.roles = ['agent'];
    etat.capacites = ['crm.assign'];
    etat.large = false;
    etat.erreur = false;
    etat.chargement = false;
    etat.designe = null;
    etat.lues = [];
    etat.delais = null;
    etat.delaisActives = [];
    etat.planifier = null;
    declarations.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Passe en page 2 par la pagination, ouvre `ouverte`, et rend le sous-titre de l'écran plein. */
  async function sousTitreEnPage2(designee: ContactLead, ouverte: number): Promise<unknown> {
    etat.designe = { data: designee };
    etat.recherche = `lead=${designee.id}`;
    const user = userEvent.setup();
    const { rerender } = rendre();
    await user.click(screen.getAllByRole('button', { name: /Suivant/ })[0]!);
    expect(screen.getByText('Page 2 n° 23')).toBeInTheDocument();
    declarations.length = 0;
    etat.recherche = `lead=${designee.id}&ouverte=${ouverte}`;
    rerender(withIntl(<ContactLeadsInbox />));
    return declarations.filter((d) => d.forme === 'plein-ecran').at(-1)?.sousTitre;
  }

  it('la désignée traitée, hors de la page servie, ne décale pas le rang : la 3e de la page 2 est « 23 sur 25 »', async () => {
    expect(await sousTitreEnPage2(traitee, 23)).toBe('23 sur 25 à traiter');
  });

  it('la dernière de la page 2 est « 25 sur 25 », jamais « 26 sur 25 » ni « 26 sur 26 »', async () => {
    expect(await sousTitreEnPage2(traitee, 25)).toBe('25 sur 25 à traiter');
  });

  it('la désignée DANS la page 2, ouverte elle-même, garde son rang servi', async () => {
    expect(await sousTitreEnPage2(page2[0]!, 21)).toBe('Ouverte depuis la notification · 21 sur 25');
  });

  it('la désignée d’une autre page, ouverte en page 2, se lit sans rang', async () => {
    expect(await sousTitreEnPage2(page1[4]!, 5)).toBe('Ouverte depuis la notification');
  });
});
