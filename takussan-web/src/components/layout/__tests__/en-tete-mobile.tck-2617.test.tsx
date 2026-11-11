/**
 * TCK-2617 (décision 5 (a) du porteur) — l'en-tête du téléphone de `/app` : quatre formes, le titre de
 * la page en haut (sans logo), une seule flèche de retour, la conversation ouverte sans coque.
 *
 * jsdom ne lit ni les media queries ni `display` calculé : ce qui est éprouvé ici, c'est la STRUCTURE
 * (H1 dans l'en-tête d'une racine, attribut `data-forme-en-tete` que lit la règle CSS, barre d'onglets
 * retirée) ; le « un seul H1 exposé » est relevé au navigateur à 390 et 1280 (notes du ticket).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';
import { DeclarerEnTete } from '../en-tete-de-la-coque';
import { PageHeader } from '@/components/console/PageHeader';

const chemin = vi.hoisted(() => ({ valeur: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.valeur,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: () => Promise.resolve({ ok: true, data: { data: [], meta: { total: 0, unread: 0, current_page: 1 } } }),
  markNotificationReadAction: vi.fn(),
  markNotificationUnreadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/lib/queries/demarrage-espace', () => ({ useDemarrageDeLEspace: () => ({}) }));
vi.mock('@/lib/queries/credits-solde', () => ({ useSoldeCredits: () => null }));
vi.mock('@/hooks/useImpersonation', () => ({
  useImpersonationCourante: () => ({ data: null }),
  useQuitterImpersonation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/agency/AgencyStandardWelcomeWizard', () => ({ AgencyStandardWelcomeWizard: () => null }));
vi.mock('@/components/agent/AgentWelcomeWizard', () => ({ AgentWelcomeWizard: () => null }));
vi.mock('@/components/customer/CustomerWelcomeWizard', () => ({ CustomerWelcomeWizard: () => null }));
vi.mock('@/components/customer/MinimalProfileTriggerProvider', () => ({
  MinimalProfileTriggerProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/owner/OwnerWelcomeWizard', () => ({ OwnerWelcomeWizard: () => null }));
vi.mock('@/components/tenant/TenantWelcomeWizard', () => ({ TenantWelcomeWizard: () => null }));

function monter(contenu: React.ReactNode = <p>contenu</p>, roles: UserRole[] = ['customer', 'agent', 'agency_admin']) {
  const user = { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles } as unknown as User;
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <AppShell user={user} agencyIsStandard>
            {contenu}
          </AppShell>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}


beforeEach(() => {
  chemin.valeur = '/app';
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());

const entete = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-slot="en-tete-mobile"]');
const coque = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-portee-app]')!;

describe('TCK-2617 — la forme de l’en-tête suit la route', () => {
  it('racine (/app/leases) : le titre du menu est LE h1 de l’en-tête, sans logo ni lien', () => {
    chemin.valeur = '/app/leases';
    const { container } = monter();
    const e = entete(container)!;
    expect(e).toHaveAttribute('data-forme', 'racine');
    expect(within(e).getByRole('heading', { level: 1 })).toHaveTextContent('Baux');
    expect(within(e).queryAllByRole('link')).toEqual([]);
    expect(within(e).getByRole('button', { name: 'Aller à une page ou changer d’espace' })).toBeInTheDocument();
    expect(within(e).getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    // La règle CSS du H1 unique lit cet attribut (globals.css) ; la barre d'onglets est là.
    expect(coque(container)).toHaveAttribute('data-forme-en-tete', 'racine');
    expect(coque(container)).toHaveAttribute('data-barre-onglets');
  });

  it('le titre déclaré par l’en-tête de page (`PageHeader`) remplace le titre du menu', () => {
    chemin.valeur = '/app/leases';
    const { container } = monter(<PageHeader title="Contrats en cours" />);
    expect(within(entete(container)!).getByRole('heading', { level: 1 })).toHaveTextContent('Contrats en cours');
  });

  it('détail (/app/leases/7) : la flèche unique vers la liste, un titre court en <p>, ni cloche ni palette', () => {
    chemin.valeur = '/app/leases/7';
    const { container } = monter(<DeclarerEnTete titre="Bail de la Villa Ngor" />);
    const e = entete(container)!;
    expect(e).toHaveAttribute('data-forme', 'detail');
    const retour = within(e).getByRole('link', { name: 'Retour' });
    expect(retour).toHaveAttribute('href', '/app/leases');
    expect(retour.className).toContain('size-11');
    const svg = retour.querySelector('svg')!;
    expect(svg.getAttribute('class')).toContain('lucide-arrow-left');
    expect(svg.getAttribute('class')).toContain('size-5');
    expect(within(e).queryByRole('heading')).toBeNull();
    expect(e.querySelector('p')).toHaveTextContent('Bail de la Villa Ngor');
    expect(within(e).queryByRole('button', { name: 'Notifications' })).toBeNull();
    expect(within(e).queryByRole('button', { name: 'Aller à une page ou changer d’espace' })).toBeNull();
    // Sans actions déclarées, pas de « ⋯ ».
    expect(within(e).queryByRole('button', { name: 'Plus d’actions' })).toBeNull();
  });

  it('détail avec actions secondaires : « ⋯ » de 44 px', () => {
    chemin.valeur = '/app/leases/7';
    const { container } = monter(<DeclarerEnTete titre="Bail" actions={<button type="button">Résilier</button>} />);
    const plus = within(entete(container)!).getByRole('button', { name: 'Plus d’actions' });
    expect(plus.className).toContain('size-11');
  });

  it('plein écran (/app/leases/new) : « ✕ » vers la liste, le titre, l’étape ; pas de barre d’onglets', () => {
    chemin.valeur = '/app/leases/new';
    const { container } = monter(<DeclarerEnTete etape={{ n: 2, total: 4 }} />);
    const e = entete(container)!;
    expect(e).toHaveAttribute('data-forme', 'plein-ecran');
    expect(within(e).getByRole('link', { name: 'Fermer' })).toHaveAttribute('href', '/app/leases');
    expect(e).toHaveTextContent('Nouveau bail');
    expect(e).toHaveTextContent('Étape 2 sur 4');
    expect(container.querySelector('[data-slot="barre-onglets"]')).toBeNull();
    expect(coque(container)).not.toHaveAttribute('data-barre-onglets');
    // La colonne reste (dès `md`) : un formulaire n'est pas le plein écran de la publication.
    expect(container.querySelector('aside')).not.toBeNull();
  });

  it('plein écran déclaré (TCK-2581) : la ligne `sousTitre` remplace l’étape, `droite` se pose à droite', () => {
    chemin.valeur = '/app/visits/228';
    const { container } = monter(
      <DeclarerEnTete
        forme="plein-ecran"
        titre="Compte rendu"
        sousTitre="Visite de 10:00 · terminée à 10:35"
        droite={<span data-testid="a-droite">30 s</span>}
        etape={{ n: 1, total: 2 }}
        repli="/app/visits/228"
      />,
    );
    const e = entete(container)!;
    expect(e).toHaveAttribute('data-forme', 'plein-ecran');
    expect(within(e).getByRole('link', { name: 'Fermer' })).toHaveAttribute('href', '/app/visits/228');
    expect(e).toHaveTextContent('Visite de 10:00 · terminée à 10:35');
    expect(e).not.toHaveTextContent('Étape 1 sur 2');
    expect(within(e).getByTestId('a-droite')).toHaveTextContent('30 s');
  });

  it('accueil (/app) : l’espace en bouton à gauche, pas de h1 dans l’en-tête', () => {
    const { container } = monter();
    const e = entete(container)!;
    expect(e).toHaveAttribute('data-forme', 'accueil');
    expect(within(e).getAllByRole('button')[0]).toHaveAttribute('data-slot', 'espace-de-l-en-tete');
    expect(within(e).queryByRole('heading')).toBeNull();
  });

  it('accueil : la gauche nomme l’ESPACE (sans agence : le persona), pas la personne', () => {
    const { container } = monter();
    const espace = within(entete(container)!).getAllByRole('button')[0]!;
    expect(espace).not.toHaveTextContent('Awa Diop');
    // Les initiales de l'avatar précèdent (« AD ») : le nom de l'espace termine le texte du bouton.
    expect(espace.textContent?.trim()).toMatch(/(Client|Locataire|Bailleur|Agent|Administrateur|Hôte|Prestataire|Plateforme)$/);
  });
});

describe('TCK-2617 — la conversation ouverte : un état, pas une route', () => {
  it('ni en-tête de coque ni barre d’onglets ; la région des non-lus reste ; refermée, tout revient', () => {
    chemin.valeur = '/app/messages';
    const { container, rerender } = monter(<DeclarerEnTete conversation />);
    expect(entete(container)).toBeNull();
    expect(container.querySelector('[data-slot="barre-onglets"]')).toBeNull();
    expect(coque(container)).not.toHaveAttribute('data-barre-onglets');
    expect(container.querySelector('[data-slot="annonce-non-lus"][aria-live]')).not.toBeNull();
    // La colonne et la palette ne bougent pas : ce n'est pas le plein écran de la publication.
    expect(container.querySelector('aside')).not.toBeNull();
    rerender(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <ToastProvider>
            <AppShell user={{ id: 1, roles: ['customer', 'agent'] } as unknown as User} agencyIsStandard>
              <DeclarerEnTete conversation={false} />
            </AppShell>
          </ToastProvider>
        </QueryClientProvider>,
      ),
    );
    expect(entete(container)).not.toBeNull();
    expect(container.querySelector('[data-slot="barre-onglets"]')).not.toBeNull();
  });
});

describe('TCK-2617 — hors de la coque, une déclaration ne fait rien', () => {
  it('sans fournisseur (`/super-admin`, le site public), `DeclarerEnTete` et `PageHeader` rendent sans lever', () => {
    const { container } = render(withIntl(<><DeclarerEnTete titre="X" conversation /><PageHeader title="Utilisateurs" /></>));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Utilisateurs');
    expect(container.querySelector('[data-slot="en-tete-mobile"]')).toBeNull();
  });
});

describe('TCK-2617 — un seul H1 exposé : la règle de `globals.css`', () => {
  it('sous `md`, le H1 du contenu d’une RACINE est masqué (celui de l’en-tête le remplace)', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*\[data-forme-en-tete="racine"\] main h1 \{\s*display: none;\s*\}\s*\}/);
    // Aucune autre forme : un détail, l'accueil et un formulaire gardent le H1 de leur contenu.
    expect(css.match(/\[data-forme-en-tete=/g)).toHaveLength(1);
  });
});
