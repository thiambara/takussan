/**
 * TCK-2482 (AC1) — la palette dans la coque `/app` montée en entier : ⌘K / Ctrl K et le bouton de la
 * barre haute l'ouvrent, Échap la ferme et rend le focus à l'élément d'avant ; rien en plein écran ; la
 * coque retient la page sur l'appareil.
 *
 * Les `vi.mock` sont ceux d'`AppShell.menu-et-credits.test.tsx` (la liste à jour de ce qu'exige une
 * coque montée), `next/navigation` rendu réglable et `@/hooks/useProfiles` ajouté (la palette et le
 * sélecteur d'espace le lisent).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { lirePagesRecentes } from '@/lib/navigation/pages-recentes';
import type { User, UserRole } from '@/types/user';
import { AppShell } from '../AppShell';

const chemin = vi.hoisted(() => ({ valeur: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.valeur,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
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

const NOM = 'Aller à une page ou changer d’espace';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
function utilisateur(roles: UserRole[]): User {
  return { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles } as unknown as User;
}
function monter(roles: UserRole[] = ['customer', 'tenant'], modulesMasques?: readonly string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AppShell user={utilisateur(roles)} agencyIsStandard modulesMasques={modulesMasques}>
            <button type="button">avant</button>
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-2482 — la palette dans la coque', () => {
  it('AC1 — Ctrl K ouvre la palette sur son champ ; Échap la ferme et rend le focus à l’élément précédent', async () => {
    const u = userEvent.setup();
    monter();
    const avant = screen.getByRole('button', { name: 'avant' });
    avant.focus();
    await u.keyboard('{Control>}k{/Control}');
    const dialogue = await screen.findByRole('dialog', { name: NOM });
    // Base UI pose `initialFocus` après le montage (rapport de la tâche 3, écart 4).
    await waitFor(() => expect(within(dialogue).getByRole('combobox')).toHaveFocus());
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
    expect(avant).toHaveFocus();
  });

  it('sous macOS, ⌘K l’ouvre, et le referme', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(UA_MAC);
    const u = userEvent.setup();
    monter();
    await u.keyboard('{Meta>}k{/Meta}');
    expect(await screen.findByRole('dialog', { name: NOM })).toBeInTheDocument();
    await u.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
  });

  it('le bouton de la barre haute l’ouvre ; à la fermeture, le focus lui revient', async () => {
    const u = userEvent.setup();
    monter();
    const bouton = screen.getByRole('button', { name: NOM });
    // Revue M2 — le raccourci annoncé est celui du libellé : Ctrl K hors Apple.
    expect(bouton).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    await u.click(bouton);
    expect(await screen.findByRole('dialog', { name: NOM })).toBeInTheDocument();
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
    expect(bouton).toHaveFocus();
  });

  it('A7 — touché au doigt (Safari iOS ne focalise pas le bouton) : le focus revient quand même au bouton', async () => {
    const u = userEvent.setup();
    monter();
    const avant = screen.getByRole('button', { name: 'avant' });
    avant.focus();
    const bouton = screen.getByRole('button', { name: NOM });
    // `fireEvent.click` ne déplace pas le focus : c'est le toucher de Safari iOS. L'élément focalisé
    // reste « avant » — le retour doit pourtant viser le bouton touché.
    fireEvent.click(bouton);
    const dialogue = await screen.findByRole('dialog', { name: NOM });
    await waitFor(() => expect(within(dialogue).getByRole('combobox')).toHaveFocus());
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
    expect(bouton).toHaveFocus();
  });

  it('plein écran (/app/properties/new) : ni bouton, ni raccourci', async () => {
    chemin.valeur = '/app/properties/new';
    const u = userEvent.setup();
    monter(['customer', 'agent']);
    expect(screen.queryByRole('button', { name: NOM })).toBeNull();
    await u.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog', { name: NOM })).toBeNull();
    // A6 — le navigateur garde son propre raccourci : la coque n'écoute pas (`dispatchEvent` rend
    // `false` sur un événement annulé).
    expect(fireEvent.keyDown(window, { key: 'k', ctrlKey: true })).toBe(true);
  });

  it('la coque retient la page courante sur l’appareil, pas une page plein écran', () => {
    chemin.valeur = '/app/payments';
    const { unmount } = monter();
    expect(lirePagesRecentes(1)).toEqual(['/app/payments']);
    unmount();
    chemin.valeur = '/app/properties/new';
    monter(['customer', 'agent']);
    expect(lirePagesRecentes(1)).toEqual(['/app/payments']);
  });

  it('revue I3 — huit fiches de bail visitées n’effacent pas les autres sections de « Récents »', async () => {
    chemin.valeur = '/app/payments';
    const { rerender } = monter();
    const arbre = () => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <AppShell user={utilisateur(['customer', 'tenant'])} agencyIsStandard>
            <button type="button">avant</button>
          </AppShell>
        </ToastProvider>
      </QueryClientProvider>
    );
    for (const c of ['/app/messages', ...Array.from({ length: 8 }, (_, i) => `/app/leases/${i + 1}`), '/app']) {
      chemin.valeur = c;
      rerender(withIntl(arbre()));
    }
    // Le plafond de 8 tient, et la section des baux n'en occupe qu'une place.
    expect(lirePagesRecentes(1)).toEqual(['/app', '/app/leases/8', '/app/messages', '/app/payments']);
    const u = userEvent.setup();
    await u.keyboard('{Control>}k{/Control}');
    const groupe = within(await screen.findByRole('listbox')).getByRole('group', { name: 'Récents' });
    expect(within(groupe).getAllByRole('option').map((o) => o.textContent)).toEqual(['Mon bail', 'Messagerie', 'Paiements']);
  });

  it('revue I5 — fermée par un CHOIX, la palette ne rend pas le focus : la recherche de biens ne rouvre pas son panneau', async () => {
    const u = userEvent.setup();
    monter();
    const recherche = within(document.querySelector('header')!).getAllByRole('combobox')[0]!;
    await u.click(recherche);
    await u.keyboard('{Escape}');
    expect(recherche).toHaveFocus();
    expect(recherche).not.toHaveAttribute('aria-expanded', 'true');
    await u.keyboard('{Control>}k{/Control}');
    const dialogue = await screen.findByRole('dialog', { name: NOM });
    const champ = within(dialogue).getByRole('combobox');
    await waitFor(() => expect(champ).toHaveFocus());
    await u.type(champ, 'paiements');
    await u.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
    expect(recherche).not.toHaveFocus();
    expect(recherche).not.toHaveAttribute('aria-expanded', 'true');
  });

  it('revue I5 — fermée par Échap après un choix précédent, elle rend de nouveau le focus', async () => {
    const u = userEvent.setup();
    monter();
    const avant = screen.getByRole('button', { name: 'avant' });
    avant.focus();
    await u.keyboard('{Control>}k{/Control}');
    let dialogue = await screen.findByRole('dialog', { name: NOM });
    await waitFor(() => expect(within(dialogue).getByRole('combobox')).toHaveFocus());
    await u.type(within(dialogue).getByRole('combobox'), 'paiements');
    await u.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
    avant.focus();
    await u.keyboard('{Control>}k{/Control}');
    dialogue = await screen.findByRole('dialog', { name: NOM });
    await waitFor(() => expect(within(dialogue).getByRole('combobox')).toHaveFocus());
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: NOM })).toBeNull());
    expect(avant).toHaveFocus();
  });

  it('revue M2 — sous macOS : Ctrl K dans un champ n’est pas annulé et n’ouvre rien ; le bouton annonce ⌘K', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(UA_MAC);
    monter();
    const bouton = screen.getByRole('button', { name: NOM });
    await waitFor(() => expect(bouton).toHaveAttribute('aria-keyshortcuts', 'Meta+K'));
    expect(bouton).toHaveTextContent('⌘');
    const champ = document.createElement('input');
    document.body.appendChild(champ);
    champ.focus();
    expect(fireEvent.keyDown(champ, { key: 'k', ctrlKey: true })).toBe(true);
    expect(screen.queryByRole('dialog', { name: NOM })).toBeNull();
    champ.remove();
  });
});

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence », AC10) — la coque passe les modules masqués à
 * TOUS les lecteurs du menu : la barre latérale ET la palette (`contexteDuMenu`). Monté en entier : une
 * coque qui ne les passerait qu'à la barre laisserait la palette proposer ce que l'agence a retiré.
 */
describe('TCK-2483 — la coque passe les modules masqués à la barre et à la palette', () => {
  const AGENT: UserRole[] = ['customer', 'agent'];
  const liensCommissions = () => document.querySelectorAll('nav a[href="/app/commissions"]');

  async function chercherDansLaPalette(texte: string) {
    const u = userEvent.setup();
    await u.keyboard('{Control>}k{/Control}');
    const dialogue = await screen.findByRole('dialog', { name: NOM });
    await u.type(within(dialogue).getByRole('combobox'), texte);
    return within(dialogue)
      .queryAllByRole('option')
      .map((o) => o.textContent ?? '');
  }

  it('témoin : sans module masqué, l’agent a « Commissions » dans la barre et dans la palette', async () => {
    monter(AGENT);
    expect(liensCommissions()).toHaveLength(1);
    expect(await chercherDansLaPalette('commissions')).toContain('Commissions');
  });

  it('l’agence masque `commissions` : ni la barre ni la palette ne la proposent', async () => {
    monter(AGENT, ['commissions']);
    expect(liensCommissions()).toHaveLength(0);
    expect(await chercherDansLaPalette('commissions')).not.toContain('Commissions');
  });
});
