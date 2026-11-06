/**
 * TCK-2491 (ADR-0090 §2, §8) — la coque de `/app` SANS barre du haut.
 *
 * - AC1 : dès `md`, aucune barre du haut. jsdom ne lit pas les media queries : ce qui est éprouvé, c'est
 *   que TOUT en-tête (`<header>`, repère `banner`) que la coque monte porte `md:hidden` — une barre qui
 *   reviendrait sans lui rougit ici. Et, quel que soit l'élément qui la rendrait (`<div>`, `<nav>`…),
 *   rien de visible dès `md` n'est monté entre les bannières et la rangée colonne + contenu, ni dans
 *   cette rangée (revue adverse, M5). La colonne porte la cloche, « Aller à » et le menu du compte.
 * - AC2 : sous `md`, l'en-tête compacte — la marque (vers `/`), « Aller à » (la palette, raccourci
 *   annoncé), la cloche — et la barre d'onglets.
 * - AC4 : l'ordre du document est l'ordre de tabulation — évitement → bannières → (en-tête mobile,
 *   absent dès `md`) → colonne → contenu → barre d'onglets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';

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

function monter(roles: UserRole[] = ['customer', 'agent'], agencySuspended = false) {
  const user = { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles } as unknown as User;
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <AppShell user={user} agencyIsStandard agencySuspended={agencySuspended}>
            <p>contenu</p>
          </AppShell>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const classes = (el: Element) => el.className.split(/\s+/);
const apres = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  chemin.valeur = '/app';
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());

describe('TCK-2491 (AC1) — dès md, aucune barre du haut ; la colonne porte ce qu’elle portait', () => {
  it('tout en-tête monté par la coque se cache dès `md` (une barre qui reviendrait rougit ici)', () => {
    const { container } = monter();
    const entetes = Array.from(container.querySelectorAll('header'));
    expect(entetes.length).toBeGreaterThan(0);
    for (const entete of entetes) expect(classes(entete), entete.outerHTML.slice(0, 120)).toContain('md:hidden');
    expect(container.querySelector('[data-slot="en-tete-mobile"]')).not.toBeNull();
  });

  // Revue adverse (M5) : la garde ci-dessus ne voit qu'un `<header>`. Une barre rendue en `<div>`, en
  // `<nav>` ou en `<section>` lui échapperait. Celle-ci juge la STRUCTURE, quel que soit l'élément : au
  // dessus de la rangée colonne + contenu, la coque ne monte que l'évitement, des bannières
  // (`role="status"`) et ce qui se cache dès `md` ; dans la rangée, que la colonne et le contenu.
  it('rien de visible dès `md` entre les bannières et la rangée colonne + contenu, ni dans la rangée', () => {
    const { container } = monter(['customer', 'agency_admin'], true);
    const main = container.querySelector('main')!;
    const rangee = main.parentElement!;
    const coque = rangee.parentElement!;
    const decrire = (e: Element) => e.outerHTML.slice(0, 140);

    const auDessus = Array.from(coque.children).slice(0, Array.from(coque.children).indexOf(rangee));
    expect(auDessus.length).toBeGreaterThan(0);
    for (const e of auDessus) {
      const permis =
        (e.tagName === 'A' && (e.getAttribute('href') ?? '').startsWith('#')) ||
        e.getAttribute('role') === 'status' ||
        classes(e).includes('md:hidden');
      expect(permis, decrire(e)).toBe(true);
    }
    expect(auDessus.some((e) => e.getAttribute('role') === 'status'), 'la bannière de suspension est montée').toBe(true);

    for (const e of Array.from(rangee.children)) {
      const permis =
        e === main ||
        (classes(e).includes('hidden') && classes(e).includes('md:block') && e.querySelector('aside') !== null) ||
        classes(e).includes('md:hidden');
      expect(permis, decrire(e)).toBe(true);
    }
    expect(Array.from(rangee.children).filter((e) => e.querySelector('aside') !== null || e.tagName === 'ASIDE')).toHaveLength(1);
  });

  it('la colonne de bureau porte la marque, la cloche, « Aller à » et le menu du compte', () => {
    const { container } = monter();
    const colonne = container.querySelector('aside')!;
    // La colonne de bureau est dans une enveloppe `hidden md:block` : elle est la vue de bureau.
    expect(classes(colonne.parentElement!)).toEqual(expect.arrayContaining(['hidden', 'md:block']));
    for (const slot of ['marque', 'cloche', 'aller-a', 'pied-du-compte']) {
      expect(colonne.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
    expect(within(colonne).getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });
});

describe('TCK-2491 (AC2) — sous md, l’en-tête compacte', () => {
  it('la marque vers `/`, « Aller à » (palette, raccourci annoncé), la cloche — et rien d’autre', () => {
    const { container } = monter();
    const entete = container.querySelector<HTMLElement>('[data-slot="en-tete-mobile"]')!;
    const liens = within(entete).getAllByRole('link');
    expect(liens.map((l) => l.getAttribute('href'))).toEqual(['/']);
    const boutons = within(entete).getAllByRole('button');
    expect(boutons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Aller à une page ou changer d’espace',
      'Notifications',
    ]);
    expect(boutons[0]).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    // 40 px au doigt : la cible tactile des deux boutons.
    expect(classes(boutons[0]!)).toContain('size-10');
    expect(classes(boutons[1]!)).toContain('max-md:size-10');
  });

  it('plein écran (/app/properties/new) : ni en-tête, ni colonne', () => {
    chemin.valeur = '/app/properties/new';
    const { container } = monter();
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
  });
});

describe('TCK-2491 (AC4) — l’ordre de tabulation suit l’ordre du document', () => {
  it('évitement → bannière de suspension → en-tête mobile → colonne → contenu → barre d’onglets', () => {
    const { container } = monter(['customer', 'agency_admin'], true);
    const evitement = screen.getByRole('link', { name: 'Aller au contenu principal' });
    const banniere = screen.getByRole('status', { hidden: true });
    const entete = container.querySelector('[data-slot="en-tete-mobile"]')!;
    const colonne = container.querySelector('aside')!;
    const contenu = container.querySelector('main')!;
    const onglets = screen.getByRole('navigation', { name: 'Accès rapide' });
    // Le lien d'évitement est le PREMIER focalisable du document.
    const focalisables = container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    expect(focalisables[0]).toBe(evitement);
    const chaine = [evitement, banniere, entete, colonne, contenu, onglets];
    for (let i = 1; i < chaine.length; i++) expect(apres(chaine[i - 1]!, chaine[i]!), `maillon ${i}`).toBe(true);
  });
});
