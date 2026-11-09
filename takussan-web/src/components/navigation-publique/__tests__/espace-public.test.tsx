/**
 * TCK-2493 / TCK-2494 (ADR-0091) — ce que le site public montre de l'espace du compte : l'écran
 * « Compte » / « Moi » (`/account`), le menu « Mon espace » de l'en-tête de bureau, la carte de
 * rappel de l'accueil connecté.
 *
 * Les lignes elles-mêmes sont jugées sur la composition (`barre-publique.test.ts`) ; ici, le rendu :
 * ce qui paraît, dans quel ordre, avec quels détails, et ce qui ne paraît pas.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { Rappel } from '../useRappelDuPersona';
import type { User, UserRole } from '@/types/user';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
const etat = vi.hoisted(() => ({
  chemin: '/fr/account',
  requete: '',
  user: null as User | null,
  profilActif: null as string | null,
  compteurs: {} as Record<string, number>,
  rappel: { loyer: null, retard: null, visite: null } as Rappel,
  profils: null as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routeur,
  useSearchParams: () => new URLSearchParams(etat.requete),
  usePathname: () => etat.chemin,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: etat.user,
    activeProfileId: etat.profilActif,
    token: etat.user ? 'jeton' : null,
    isLoading: false,
    logout: vi.fn(async () => {}),
    refreshUser: vi.fn(),
    setActiveProfileId: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));

vi.mock('@/components/layout/useCompteursDuMenu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/layout/useCompteursDuMenu')>()),
  useCompteursDuMenu: () => new Proxy(etat.compteurs, { get: (cible, cle: string) => cible[cle] ?? 0 }),
}));

// Seule la LECTURE est doublée : ce que la ligne « Loyer » en dit (`useDetailDuLoyer`) reste le vrai.
vi.mock('../useRappelDuPersona', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useRappelDuPersona')>()),
  useRappelDuPersona: () => etat.rappel,
}));

const soldeMock = vi.hoisted(() => vi.fn<(o: { enabled: boolean }) => number | null>(() => null));
vi.mock('@/lib/queries/credits-solde', () => ({
  useSoldeCredits: (o: { enabled: boolean }) => soldeMock(o),
}));

const largeur = vi.hoisted(() => ({ xl: false }));
vi.mock('@/hooks/useMatchesMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useMatchesMedia')>()),
  useMatchesMedia: (requete: string) => (requete === '(width >= 80rem)' ? largeur.xl : false),
}));

vi.mock('@/app/actions/locale', () => ({ setLocaleAction: vi.fn(async () => {}) }));

const { ToastProvider } = await import('@/components/ui/toast');
const { EcranDuCompte } = await import('../EcranDuCompte');
const { MenuMonEspace } = await import('../MenuMonEspace');
const { CarteDeRappel } = await import('../CarteDeRappel');

function compte(roles: UserRole[], champs: Partial<User> = {}): User {
  return {
    id: 3, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', phone: null, roles, ...champs,
  } as unknown as User;
}

function monter(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Le layout public monte `ToastProvider` : la bascule d'espace (`useSwitchActiveProfile`) le lit.
  return render(
    <QueryClientProvider client={client}>{withIntl(<ToastProvider>{ui}</ToastProvider>)}</QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(routeur).forEach((f) => f.mockReset());
  etat.chemin = '/fr/account';
  etat.requete = '';
  etat.user = null;
  etat.profilActif = null;
  etat.compteurs = {};
  etat.rappel = { loyer: null, retard: null, visite: null };
  etat.profils = null;
  soldeMock.mockReset();
  soldeMock.mockReturnValue(null);
  largeur.xl = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).includes('/api/me/profiles') && etat.profils ? etat.profils : { data: [], meta: {} }),
    })),
  );
});

describe('TCK-2493 — l’écran « Compte » (anonyme)', () => {
  it('vouvoie, comme le reste du site (revue TCK-2493) : aucun tutoiement à l’écran', () => {
    monter(<EcranDuCompte />);
    const texte = document.body.textContent ?? '';
    expect(texte).toContain('Connectez-vous avec votre numéro');
    expect(texte).not.toMatch(/\b(tu|ton|ta|tes|toi)\b|-toi\b/i);
  });

  it('« Se connecter » ramène à la page que la case « Compte » a quittée (TCK-568)', () => {
    etat.requete = `depuis=${encodeURIComponent('/fr/properties?contract_type=rent')}`;
    monter(<EcranDuCompte />);
    expect(screen.getByRole('heading', { level: 1, name: 'Compte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
      'href',
      `/auth/login?redirect=${encodeURIComponent('/fr/properties?contract_type=rent')}`,
    );
  });

  it('une destination étrangère dans `?depuis=` est ignorée : jamais une redirection ouverte', () => {
    etat.requete = `depuis=${encodeURIComponent('//evil.example/fr')}`;
    monter(<EcranDuCompte />);
    const href = screen.getByRole('link', { name: 'Se connecter' }).getAttribute('href') ?? '';
    expect(href).not.toContain('evil');
    expect(href).toBe(`/auth/login?redirect=${encodeURIComponent('/fr/account')}`);
  });

  it('porte ce que le menu public portait : langue, Agences, Agents, Conditions, Confidentialité, Publier', () => {
    monter(<EcranDuCompte />);
    expect(screen.getByRole('group', { name: 'Langue' })).toBeInTheDocument();
    for (const nom of ['Agences', 'Agents et propriétaires', 'Conditions d’utilisation', 'Confidentialité', 'Publier gratuitement']) {
      expect(screen.getByRole('link', { name: nom })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Agences' })).toHaveAttribute('href', '/fr/agencies');
    expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
  });
});

describe('TCK-2493 — l’écran « Moi » (connecté)', () => {
  it('salue par le prénom ; un compte sans nom est salué sans « undefined », par son numéro lisible', () => {
    etat.user = compte(['customer'], { first_name: '', last_name: '', full_name: '', email: null, phone: '+221770000623' } as Partial<User>);
    monter(<EcranDuCompte />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Bonjour$/);
    expect(document.body.textContent).not.toMatch(/undefined|null/);
    expect(screen.getByText('+221 77 000 06 23')).toBeInTheDocument();
  });

  it('agent : « Publier un bien » en tête, ses sections, Favoris et Recherches gardés, « Ouvrir mon espace complet »', () => {
    etat.user = compte(['customer', 'agent']);
    etat.profilActif = 'agent:4';
    monter(<EcranDuCompte />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bonjour Awa' })).toBeInTheDocument();
    const liens = screen.getAllByRole('link').map((a) => a.textContent?.trim());
    expect(liens[0]).toBe('Publier un bien');
    expect(screen.getByRole('link', { name: 'Ouvrir mon espace complet' })).toHaveAttribute('href', '/app');
    // Ce qui quitte la barre d'un pro (Favoris) reste atteignable ici (ADR-0091 §3).
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/app/favorites', '/app/saved-searches']));
    // Jamais le tableau de bord : « Ouvrir mon espace complet » y mène.
    expect(screen.queryByRole('link', { name: 'Tableau de bord' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();
  });

  it('locataire : la ligne Loyer porte le montant dû et l’échéance', () => {
    etat.user = compte(['customer', 'tenant']);
    etat.rappel = { loyer: { montant: 150000, devise: 'XOF', echeance: '2026-12-05' }, retard: null, visite: null };
    monter(<EcranDuCompte />);
    const loyer = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/app/payments' && a.textContent?.includes('dû le'));
    expect(loyer).toBeDefined();
    expect(loyer!.textContent).toMatch(/150\s?000/);
    // Le même nom que la case de la barre : « Loyer », pas « Paiements ».
    expect(loyer!.textContent).toMatch(/^Loyer/);
  });

  it('locataire en retard : la ligne Loyer dit le montant en retard, avant l’échéance à venir', () => {
    etat.user = compte(['customer', 'tenant']);
    etat.rappel = {
      loyer: { montant: 150000, devise: 'XOF', echeance: '2026-12-05' },
      retard: { nombre: 6, montant: 6343953 },
      visite: null,
    };
    monter(<EcranDuCompte />);
    // La carte de rappel de « Moi » mène aussi aux paiements (« Payer ») : on lit la LIGNE.
    const loyer = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/app/payments' && a.textContent?.startsWith('Loyer'));
    expect(loyer!.textContent).toMatch(/^Loyer.*6\s?343\s?953.*en retard/);
    expect(loyer!.textContent).not.toMatch(/dû le/);
  });

  it('admin d’agence avec une file de modération : « Moi » se rend, et le compteur se lit (revue TCK-2493)', async () => {
    etat.user = compte(['customer', 'agency_admin']);
    etat.profilActif = 'agency_admin:9';
    etat.profils = {
      data: [{ id: 'agency_admin:9', type: 'agency_admin', agency_id: 9, agency: { id: 9, name: 'Dakar Immo', kind: 'standard' } }],
      meta: { active_profile_id: 'agency_admin:9' },
    };
    etat.compteurs = { reviewModeration: 2, propertyModeration: 1 };
    monter(<EcranDuCompte />);
    // `nav.sidebar.counters.reviewModeration` n'existe pas : lire le compteur là faisait tomber l'écran.
    const avis = await screen.findByRole('link', { name: /, 2 en attente$/ });
    expect(avis).toHaveAttribute('href', expect.stringContaining('/app/agency/moderation'));
    expect(screen.getByRole('link', { name: /, 1 en attente$/ })).toHaveAttribute('href', '/app/agency/moderation/properties');
  });

  const ADMIN_STANDARD = {
    data: [{ id: 'agency_admin:9', type: 'agency_admin', agency_id: 9, agency: { id: 9, name: 'Dakar Immo', kind: 'standard' } }],
    meta: { active_profile_id: 'agency_admin:9' },
  };

  it('TCK-642 — admin : la rangée « Crédits » porte le solde, et mène à /app/credits (AC3)', async () => {
    etat.user = compte(['customer', 'agency_admin']);
    etat.profilActif = 'agency_admin:9';
    etat.profils = ADMIN_STANDARD;
    soldeMock.mockReturnValue(12);
    monter(<EcranDuCompte />);
    const credits = await screen.findByRole('link', { name: 'Crédits : 12 crédits' });
    expect(credits).toHaveAttribute('href', '/app/credits');
    expect(credits.querySelector('[data-slot="solde-credits"]')).toHaveTextContent('12');
    expect(soldeMock).toHaveBeenCalledWith({ enabled: true });
  });

  it('TCK-642 — solde inconnu (refus, panne, chargement) : ni rangée « Crédits », ni « 0 » (AC5)', async () => {
    etat.user = compte(['customer', 'agency_admin']);
    etat.profilActif = 'agency_admin:9';
    etat.profils = ADMIN_STANDARD;
    soldeMock.mockReturnValue(null);
    monter(<EcranDuCompte />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /^Crédits/ })).toBeNull();
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).not.toContain('/app/credits');
  });

  it('TCK-642 — sans droit sur le portefeuille : aucune lecture du solde (AC2)', () => {
    etat.user = compte(['customer', 'owner']);
    etat.profilActif = 'owner:2';
    soldeMock.mockReturnValue(12);
    monter(<EcranDuCompte />);
    expect(soldeMock).not.toHaveBeenCalledWith({ enabled: true });
    expect(screen.queryByRole('link', { name: /^Crédits/ })).toBeNull();
  });

  it('un seul espace : pas de sélecteur ; plusieurs : « Changer d’espace », l’actif marqué', async () => {
    etat.user = compte(['customer', 'agent', 'owner']);
    etat.profilActif = 'agent:4';
    etat.profils = {
      data: [
        { id: 'agent:4', type: 'agent', agency_id: 9, agency: { id: 9, name: 'Dakar Immo', kind: 'standard' } },
        { id: 'owner:2', type: 'owner', agency_id: null, agency: null },
      ],
      meta: { active_profile_id: 'agent:4' },
    };
    monter(<EcranDuCompte />);
    const section = await screen.findByRole('region', { name: 'Changer d’espace' });
    const boutons = within(section).getAllByRole('button');
    expect(boutons).toHaveLength(2);
    expect(boutons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.espace)).toEqual(['agent:4']);
  });
});

describe('TCK-2494 — le menu « Mon espace »', () => {
  async function ouvrir() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Mon espace/ }));
    return screen.findByRole('menu');
  }

  it('locataire : Loyer (avec le montant dû) en tête, Interventions, Mon bail, Documents, puis Messages', async () => {
    etat.user = compte(['customer', 'tenant']);
    etat.rappel = { loyer: { montant: 150000, devise: 'XOF', echeance: '2026-12-05' }, retard: null, visite: null };
    monter(<MenuMonEspace user={etat.user} />);
    const menu = await ouvrir();
    const lignes = Array.from(menu.querySelectorAll('[data-ligne]')).map((el) => el.getAttribute('data-ligne'));
    expect(lignes.slice(0, 2)).toEqual(['paiements', 'maintenance']);
    expect(lignes).toEqual(expect.arrayContaining(['baux', 'documents', 'messagerie']));
    expect(lignes.indexOf('messagerie')).toBeGreaterThan(lignes.indexOf('documents'));
    expect(menu.querySelector('[data-ligne="paiements"]')!.textContent).toMatch(/^Loyer.*150\s?000.*dû le/);
    // Pas d'action de publication pour un locataire.
    expect(within(menu).queryByRole('menuitem', { name: 'Publier un bien' })).toBeNull();
  });

  it('locataire en retard : la ligne Loyer porte le montant en retard', async () => {
    etat.user = compte(['customer', 'tenant']);
    etat.rappel = { loyer: null, retard: { nombre: 6, montant: 6343953 }, visite: null };
    monter(<MenuMonEspace user={etat.user} />);
    const menu = await ouvrir();
    expect(menu.querySelector('[data-ligne="paiements"]')!.textContent).toMatch(/^Loyer.*6\s?343\s?953.*en retard/);
  });

  it('TCK-642 — entre lg et xl (pastille de l’en-tête masquée), « Crédits » et son solde dans le menu de l’admin', async () => {
    etat.user = compte(['customer', 'agency_admin']);
    etat.profilActif = 'agency_admin:9';
    soldeMock.mockReturnValue(12);
    largeur.xl = false;
    monter(<MenuMonEspace user={etat.user} />);
    const menu = await ouvrir();
    const credits = within(menu).getByRole('menuitem', { name: 'Crédits : 12 crédits' });
    expect(credits.querySelector('[data-slot="solde-credits"]')).toHaveTextContent('12');
  });

  it('TCK-642 — dès xl (la pastille porte le solde), ou solde inconnu : pas de ligne « Crédits »', async () => {
    etat.user = compte(['customer', 'agency_admin']);
    etat.profilActif = 'agency_admin:9';
    soldeMock.mockReturnValue(12);
    largeur.xl = true;
    const { unmount } = monter(<MenuMonEspace user={etat.user} />);
    expect(within(await ouvrir()).queryByRole('menuitem', { name: /Crédits/ })).toBeNull();
    unmount();
    largeur.xl = false;
    soldeMock.mockReturnValue(null);
    monter(<MenuMonEspace user={etat.user} />);
    expect(within(await ouvrir()).queryByRole('menuitem', { name: /Crédits/ })).toBeNull();
  });

  it('le nom du bouton dit ce qui attend, sans espace avant la virgule', () => {
    etat.user = compte(['customer', 'agent']);
    etat.profilActif = 'agent:4';
    etat.compteurs = { unhandledLeads: 3 };
    monter(<MenuMonEspace user={etat.user} />);
    const bouton = screen.getByRole('button', { name: /^Mon espace/ });
    // jsdom concatène un texte masqué sans espace ; Chrome en pose une (« Mon espace , 3 … ») : le
    // nom doit donc être posé d'un bloc, par `aria-label`.
    expect(bouton).toHaveAttribute('aria-label', expect.stringMatching(/^Mon espace, \d+ /));
  });

  it('agent : « Publier un bien » en tête, puis Demandes, Visites, Clients, Agenda, Mes biens', async () => {
    etat.user = compte(['customer', 'agent']);
    etat.profilActif = 'agent:4';
    monter(<MenuMonEspace user={etat.user} />);
    const menu = await ouvrir();
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveTextContent('Publier un bien');
    const lignes = Array.from(menu.querySelectorAll('[data-ligne]')).map((el) => el.getAttribute('data-ligne'));
    expect(lignes.slice(0, 2)).toEqual(['demandes', 'visites']);
    expect(lignes).toEqual(expect.arrayContaining(['clients', 'calendrier', 'mes-biens']));
  });

  it('le point de l’avatar dit qu’une ligne attend, et le bouton le nomme', () => {
    etat.user = compte(['customer', 'agent']);
    etat.profilActif = 'agent:4';
    etat.compteurs = { unhandledLeads: 2 };
    const { container } = monter(<MenuMonEspace user={etat.user} />);
    expect(container.querySelector('[data-slot="point-mon-espace"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Mon espace, 2 éléments en attente/ })).toBeInTheDocument();
  });

  it('rien n’attend : ni point, ni mention', () => {
    etat.user = compte(['customer', 'agent']);
    etat.profilActif = 'agent:4';
    const { container } = monter(<MenuMonEspace user={etat.user} />);
    expect(container.querySelector('[data-slot="point-mon-espace"]')).toBeNull();
    expect(screen.getByRole('button', { name: /Mon espace/ }).textContent).not.toMatch(/attente/);
  });
});

describe('TCK-2493 — la carte de rappel de l’accueil connecté', () => {
  it('anonyme : rien', () => {
    const { container } = monter(<CarteDeRappel />);
    expect(container.querySelector('[data-slot="carte-de-rappel"]')).toBeNull();
  });

  it('rien n’attend : rien — pas de « Tout est à jour » qui prendrait la place des biens', () => {
    etat.user = compte(['customer', 'tenant']);
    const { container } = monter(<CarteDeRappel />);
    expect(container.querySelector('[data-slot="carte-de-rappel"]')).toBeNull();
  });

  it('un retard passe avant l’échéance : « Loyer en retard », Payer', () => {
    etat.user = compte(['customer', 'tenant']);
    etat.rappel = {
      loyer: { montant: 150000, devise: 'XOF', echeance: '2026-12-05' },
      retard: { nombre: 2, montant: 300000 },
      visite: null,
    };
    monter(<CarteDeRappel />);
    const carte = screen.getByRole('region', { name: 'Ce qui vous attend' });
    expect(carte).toHaveTextContent('Loyer en retard');
    expect(within(carte).getByRole('link', { name: 'Payer' })).toHaveAttribute('href', '/app/payments');
  });

  it('agent : la prochaine visite, et les demandes à traiter avec', () => {
    etat.user = compte(['customer', 'agent']);
    etat.profilActif = 'agent:4';
    etat.compteurs = { unhandledLeads: 3 };
    etat.rappel = { loyer: null, retard: null, visite: { date: '2026-11-12T10:00:00Z', bien: 'Villa Ngor' } };
    monter(<CarteDeRappel />);
    const carte = screen.getByRole('region', { name: 'Ce qui vous attend' });
    expect(carte).toHaveTextContent(/Visite le/);
    expect(carte).toHaveTextContent('Villa Ngor · et 3 demandes à traiter');
  });

  it('agent sans visite : les demandes à traiter mènent à la file « à traiter »', () => {
    etat.user = compte(['customer', 'agent']);
    etat.profilActif = 'agent:4';
    etat.compteurs = { unhandledLeads: 4 };
    monter(<CarteDeRappel />);
    const carte = screen.getByRole('region', { name: 'Ce qui vous attend' });
    expect(carte).toHaveTextContent('4 demandes à traiter');
    expect(within(carte).getByRole('link', { name: 'Traiter' }).getAttribute('href')).toMatch(/^\/app\/leads/);
  });
});
