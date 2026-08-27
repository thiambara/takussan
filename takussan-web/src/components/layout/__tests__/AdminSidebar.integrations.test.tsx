import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { User, UserRole } from '@/types/user';
import { AdminSidebar } from '../AdminSidebar';

/**
 * TCK-370, défaut n°2 — **une page sans aucun chemin**.
 *
 * Mesuré le 2026-08-27, avant ce ticket : `/admin/settings/integrations` n'apparaissait dans
 * AUCUNE entrée de `buildAdminItems`. Son seul chemin était l'onglet de `/admin/settings`, page
 * qui `redirect('/admin')` tout non-super-admin. Un `agency_admin` n'avait donc littéralement
 * aucun moyen d'y arriver sans taper l'URL — alors que `routes/api/integrations.php` ne pose
 * qu'`auth:sanctum` et que `IntegrationController::index` l'accepte sur son agence.
 *
 * ⚠ Le premier test ci-dessous serait coché par n'importe quel lien, y compris un qui mène
 * ailleurs. C'est pourquoi il assert le `href` EXACT, et pourquoi le fichier voisin
 * (`settings/integrations/__tests__/page.test.tsx`) éprouve que la page au bout ne rejette pas
 * l'acteur : *un lien qui mène à une redirection coche « le lien existe » aussi bien qu'un
 * correctif.*
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// Les deux sondages de badges partent au montage ; ils ne sont pas le sujet.
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: async () => ({ meta: { pending_count: 0 } }),
}));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: async () => ({ meta: { pending_count: 0 } }),
}));

function utilisateur(roles: UserRole[]): User {
  return {
    id: 1,
    first_name: 'Awa',
    last_name: 'Ndiaye',
    full_name: 'Awa Ndiaye',
    email: 'awa@example.test',
    roles,
    avatar_url: null,
  } as unknown as User;
}

function monte(roles: UserRole[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <AdminSidebar user={utilisateur(roles)} agencyIsStandard />
      </QueryClientProvider>,
    ),
  );
}

describe('<AdminSidebar> — accès aux intégrations', () => {
  it('donne un chemin de navigation vers les intégrations à un agency_admin', () => {
    monte(['agency_admin']);

    expect(screen.getByRole('link', { name: 'Intégrations' })).toHaveAttribute(
      'href',
      '/admin/settings/integrations',
    );
  });

  it("n'ouvre pas pour autant les paramètres globaux à un agency_admin", () => {
    monte(['agency_admin']);

    // `/api/admin/settings` est sous le middleware `super-admin` : l'entrée « Paramètres » reste
    // super-admin. Corriger « dans le sens de l'API » veut dire les deux à la fois.
    expect(screen.queryByRole('link', { name: 'Paramètres' })).toBeNull();
  });

  it('montre les deux entrées à un super_admin, sans les confondre', () => {
    monte(['super_admin']);

    expect(screen.getByRole('link', { name: 'Intégrations' })).toHaveAttribute(
      'href',
      '/admin/settings/integrations',
    );
    expect(screen.getByRole('link', { name: 'Paramètres' })).toHaveAttribute(
      'href',
      '/admin/settings',
    );
  });
});

/**
 * L'état actif : avant TCK-370, `/admin/settings` était surligné par PRÉFIXE. Avec une entrée
 * « Intégrations » sous ce même préfixe, les deux lignes s'allumaient ensemble.
 */
describe('<AdminSidebar> — surlignage sur /admin/settings/integrations', () => {
  it("n'allume que l'entrée Intégrations", async () => {
    vi.doMock('next/navigation', () => ({
      usePathname: () => '/admin/settings/integrations',
    }));
    vi.resetModules();
    const { AdminSidebar: SidebarRechargee } = await import('../AdminSidebar');

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <SidebarRechargee user={utilisateur(['super_admin'])} agencyIsStandard />
        </QueryClientProvider>,
      ),
    );

    expect(screen.getByRole('link', { name: 'Intégrations' }).className).toContain('font-semibold');
    expect(screen.getByRole('link', { name: 'Paramètres' }).className).not.toContain(
      'font-semibold',
    );
  });
});
