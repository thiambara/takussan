import { describe, expect, it, vi } from 'vitest';
import { ShieldCheck } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';
import { AppSidebar, avecEntreeAdmin, type NavItem } from '../AppSidebar';

/**
 * TCK-633 (lot B, AC1) — l'entrée d'administration de la barre `/app` mène à une page que le profil
 * peut ouvrir : « Mon espace » vers la première page d'un solo, rien s'il n'y en a aucune.
 */
vi.mock('next/navigation', () => ({ usePathname: () => '/app' }));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));

const SOLO: AccesAdmin = {
  chemins: ['/admin/agency', '/admin/agency/kyc', '/admin/finances'],
  espaceIndividuel: true,
};
const STANDARD: AccesAdmin = { chemins: ['/admin', '/admin/team', '/admin/agency'], espaceIndividuel: false };
const AUCUN: AccesAdmin = { chemins: [], espaceIndividuel: false };

const ADMIN = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  avatar_url: null,
  roles: ['agency_admin'],
  agency_id: 7,
} as unknown as User;

function monte(acces: AccesAdmin, agencyIsStandard?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AccesAdminProvider acces={acces}>
          <AppSidebar user={ADMIN} agencyIsStandard={agencyIsStandard} />
        </AccesAdminProvider>
      </QueryClientProvider>,
    ),
  );
}

const emplacement = (href: string): NavItem => ({
  href,
  labelKey: 'administration',
  icon: ShieldCheck,
  section: 'admin',
  emphasized: true,
});

describe('avecEntreeAdmin (TCK-633)', () => {
  it("remplace la destination et le libellé de l'entrée de section « admin »", () => {
    expect(avecEntreeAdmin([emplacement('/admin')], { href: '/admin/agency', cle: 'mySpace' })).toEqual([
      { ...emplacement('/admin'), href: '/admin/agency', labelKey: 'mySpace', labelSpace: 'nav.admin' },
    ]);
  });

  it("retire l'entrée quand aucune page n'est accessible, et ne touche à rien d'autre", () => {
    const accueil: NavItem = { href: '/app', labelKey: 'dashboard', icon: ShieldCheck, section: 'primary' };
    expect(avecEntreeAdmin([accueil, emplacement('/admin')], null)).toEqual([accueil]);
  });
});

describe("<AppSidebar> — l'entrée d'administration suit les pages accessibles", () => {
  it('un solo voit « Mon espace » vers sa première page, sans en-tête « Administration »', () => {
    const { container } = monte(SOLO, false);
    expect(screen.getByRole('link', { name: 'Mon espace' })).toHaveAttribute('href', '/admin/agency');
    expect(container.querySelector('a[href="/admin"]')).toBeNull();
    const entetes = Array.from(container.querySelectorAll('nav p')).map((p) => p.textContent?.trim());
    expect(entetes).not.toContain('Administration');
  });

  it('un admin standard garde « Administration » vers /admin', () => {
    monte(STANDARD, true);
    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
  });

  it("aucune page accessible : aucune entrée d'administration", () => {
    const { container } = monte(AUCUN, true);
    expect(container.querySelector('nav a[href^="/admin"]')).toBeNull();
  });
});
