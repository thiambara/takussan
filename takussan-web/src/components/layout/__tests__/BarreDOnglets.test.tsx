/**
 * TCK-2481 (ADR-0089 §3) — la barre d'onglets mobile de `/app`, montée seule, persona par persona.
 *
 * Ce qu'elle garde : les quatre onglets de chaque persona puis « Menu » (AC1), l'onglet actif lisible
 * sans la couleur seule (arbitrage 12), des compteurs qui sont CEUX du menu et ne sondent que sous
 * `md` (arbitrage 8), et des remplaçants tirés de la DISPOSITION, jamais des épingles de
 * l'utilisateur (arbitrage 6, TCK-2480).
 */
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import type { IdDestination } from '@/lib/navigation/catalogue';
import type { PreferencesDeNavigation } from '@/lib/navigation/preferences';
import type { ProfileType } from '@/types/profile';
import type { User, UserRole } from '@/types/user';
import { ToastProvider } from '@/components/ui/toast';
import { BarreDOnglets } from '../BarreDOnglets';
import { PreferencesDuMenuProvider } from '../PreferencesDuMenu';

const etat = vi.hoisted(() => ({
  chemin: '/app',
  nonLus: 0,
  appels: [] as { enabled?: boolean }[],
  /** Les onglets déclarés du client, remplacés le temps d'un test (`null` : ceux du dépôt). */
  ongletsDuClient: null as readonly string[] | null,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => etat.chemin,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: (o: { enabled?: boolean }) => {
    etat.appels.push(o);
    return o.enabled ? etat.nonLus : 0;
  },
}));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/lib/navigation/dispositions', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/navigation/dispositions')>();
  const client = original.DISPOSITIONS.client;
  return {
    ...original,
    DISPOSITIONS: {
      ...original.DISPOSITIONS,
      get client() {
        return etat.ongletsDuClient
          ? { ...client, onglets: etat.ongletsDuClient as readonly IdDestination[] }
          : client;
      },
    },
  };
});

/** Simule un viewport (patron de `MessagesPage.test.tsx`) : `(max-width: Npx)` vaut `largeur <= N`. */
function largeurDeFenetre(largeurPx: number): void {
  window.matchMedia = ((query: string) => {
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    return {
      matches: max !== null && largeurPx <= Number(max[1]),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

interface Compte {
  readonly roles: UserRole[];
  readonly typeProfilActif?: ProfileType;
  readonly agencyIsStandard?: boolean;
}
const COMPTES: Record<string, Compte> = {
  client: { roles: ['customer'] },
  locataire: { roles: ['customer', 'tenant'] },
  bailleur: { roles: ['customer', 'owner'], typeProfilActif: 'owner' },
  agent: { roles: ['customer', 'agent'] },
  'admin-agence': { roles: ['customer', 'agency_admin'] },
  hote: { roles: ['customer', 'agency_admin', 'owner'], agencyIsStandard: false },
  prestataire: { roles: ['customer', 'service_provider'] },
  plateforme: { roles: ['customer', 'super_admin'] },
};

function monter(persona: string, chemin = '/app', navigation?: PreferencesDeNavigation) {
  etat.chemin = chemin;
  const compte = COMPTES[persona];
  const user = {
    id: 1,
    first_name: 'Awa',
    last_name: 'Diop',
    full_name: 'Awa Diop',
    email: 'awa@example.test',
    roles: compte.roles,
  } as unknown as User;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const barre = (
    <BarreDOnglets
      user={user}
      agencyIsStandard={compte.agencyIsStandard ?? true}
      typeProfilActif={compte.typeProfilActif ?? null}
      menuOuvert={false}
      onOuvrirMenu={vi.fn()}
      refMenu={createRef<HTMLButtonElement>()}
    />
  );
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        {navigation ? (
          // Le fournisseur des préférences signale un échec d'enregistrement par un toast.
          <ToastProvider>
            <PreferencesDuMenuProvider navigationInitiale={navigation} persona="client" modeIconesInitial="complet">
              {barre}
            </PreferencesDuMenuProvider>
          </ToastProvider>
        ) : (
          barre
        )}
      </QueryClientProvider>,
    ),
  );
}

const barre = () => screen.getByRole('navigation', { name: 'Accès rapide' });
const onglets = () =>
  within(barre())
    .getAllByRole('link')
    .map((a) => [a.textContent, a.getAttribute('href')]);

beforeEach(() => {
  etat.nonLus = 0;
  etat.appels.length = 0;
  etat.ongletsDuClient = null;
  largeurDeFenetre(1366);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});

describe('TCK-2481 — AC1 : quatre onglets par persona, puis « Menu »', () => {
  const ADMIN = [
    ['Accueil', '/app'],
    ['Demandes', '/app/leads'],
    ['Biens', '/app/properties'],
    ['Messagerie', '/app/messages'],
  ];
  it.each([
    ['client', [['Accueil', '/app'], ['Favoris', '/app/favorites'], ['Visites', '/app/visits'], ['Messagerie', '/app/messages']]],
    ['locataire', [['Accueil', '/app'], ['Paiements', '/app/payments'], ['Interventions', '/app/maintenance'], ['Messagerie', '/app/messages']]],
    ['bailleur', [['Accueil', '/app'], ['Mes biens', '/app/properties'], ['Demandes', '/app/leads'], ['Messagerie', '/app/messages']]],
    ['agent', [['Accueil', '/app'], ['Demandes', '/app/leads'], ['Visites', '/app/visits'], ['Messagerie', '/app/messages']]],
    ['admin-agence', ADMIN],
    ['hote', [['Accueil', '/app'], ['Mes biens', '/app/properties'], ['Réservations', '/app/bookings'], ['Messagerie', '/app/messages']]],
    ['prestataire', [['Accueil', '/app'], ['Interventions', '/app/maintenance'], ['Messagerie', '/app/messages'], ['Documents', '/app/documents']]],
    ['plateforme', ADMIN],
  ] as [string, string[][]][])('%s', (persona, attendus) => {
    monter(persona);
    expect(onglets()).toEqual(attendus);
    const items = within(barre()).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(within(items.at(-1)!).getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it('la barre ne vit que sous md', () => {
    monter('agent');
    expect(barre()).toHaveClass('md:hidden');
  });
});

describe('TCK-2481 × TCK-2480 — un remplaçant vient de la disposition, jamais des épingles (arbitrage 6)', () => {
  // Le client épingle « Documents » (TCK-2480 : l'entrée quitte « Plus » pour « Épinglés », EN TÊTE du
  // menu rendu) ; un onglet déclaré n'est rendu par rien (`demandes`, les contacts reçus, n'est pas au
  // menu du client — `paiements`, si : le catalogue l'ajoute sous « Plus »). La destination suivante
  // de la DISPOSITION est « Favoris » — sur le menu rendu, ce serait « Documents ».
  it('onglet absent, documents épinglé : « Favoris » prend sa place', () => {
    etat.ongletsDuClient = ['tableau-de-bord', 'demandes', 'visites', 'messagerie'];
    monter('client', '/app', { v: 1, personas: { client: { epingles: ['documents'] } } });
    expect(onglets()).toEqual([
      ['Accueil', '/app'],
      ['Favoris', '/app/favorites'],
      ['Visites', '/app/visits'],
      ['Messagerie', '/app/messages'],
    ]);
  });

  it('les onglets du dépôt ne bougent pas quand on épingle', () => {
    monter('client', '/app', { v: 1, personas: { client: { epingles: ['documents', 'visites'] } } });
    expect(onglets()).toEqual([
      ['Accueil', '/app'],
      ['Favoris', '/app/favorites'],
      ['Visites', '/app/visits'],
      ['Messagerie', '/app/messages'],
    ]);
  });
});

describe('TCK-2481 — l’onglet actif, lisible sans la couleur seule', () => {
  it('sous-page d’un onglet : il porte aria-current et l’indicateur, les autres rien', () => {
    monter('agent', '/app/leads/12');
    const demandes = within(barre()).getByRole('link', { name: 'Demandes' });
    expect(demandes).toHaveAttribute('aria-current', 'page');
    expect(demandes).toHaveClass('font-semibold');
    expect(demandes.querySelector('[data-slot="indicateur-onglet"]')).not.toBeNull();
    expect(barre().querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(barre().querySelectorAll('[data-slot="indicateur-onglet"]')).toHaveLength(1);
  });

  it('page hors onglets (`/app/leases`) : aucun onglet allumé — `/app` est une racine exacte', () => {
    monter('agent', '/app/leases');
    expect(barre().querySelectorAll('[aria-current]')).toHaveLength(0);
  });
});

describe('TCK-2481 — les compteurs, ceux du menu', () => {
  it('sous md : la pastille, et un nom accessible qui CONTIENT le libellé visible', () => {
    largeurDeFenetre(390);
    etat.nonLus = 3;
    monter('agent');
    const messagerie = within(barre()).getByRole('link', { name: 'Messagerie, 3 messages non lus' });
    const pastille = messagerie.querySelector('[data-slot="pastille-onglet"]');
    expect(pastille).toHaveTextContent('3');
    expect(pastille).toHaveAttribute('aria-hidden', 'true');
  });

  it('au-delà de 99 : « 99+ », sans texte en dur ; le nom accessible garde le compte exact', () => {
    largeurDeFenetre(390);
    etat.nonLus = 120;
    monter('agent');
    const messagerie = within(barre()).getByRole('link', { name: 'Messagerie, 120 messages non lus' });
    expect(messagerie.querySelector('[data-slot="pastille-onglet"]')).toHaveTextContent('99+');
  });

  it('à zéro : ni pastille ni mot de plus', () => {
    largeurDeFenetre(390);
    monter('agent');
    expect(within(barre()).getByRole('link', { name: 'Messagerie' })).toBeInTheDocument();
    expect(barre().querySelector('[data-slot="pastille-onglet"]')).toBeNull();
  });

  it('sous md : la barre sonde les compteurs de SES onglets', () => {
    largeurDeFenetre(390);
    monter('agent');
    expect(etat.appels.some((o) => o.enabled === true)).toBe(true);
  });

  it('dès md (barre masquée) : aucun sondage', () => {
    largeurDeFenetre(1366);
    monter('agent');
    expect(etat.appels.length).toBeGreaterThan(0);
    for (const o of etat.appels) expect(o.enabled).toBe(false);
  });
});
