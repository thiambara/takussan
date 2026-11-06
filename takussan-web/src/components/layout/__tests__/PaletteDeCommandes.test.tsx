/**
 * TCK-2482 — la palette montée seule, ouverte : rôles ARIA, clavier, AC2 (« loyer » chez le locataire),
 * AC3 (« Plus » trouvé, l'inaccessible jamais), AC4 (« Passer à : … » bascule, puis la palette suit le
 * persona que la coque rend), AC5 (axe). L'ouverture par ⌘K / Ctrl K et le retour du focus sont éprouvés
 * dans la coque (`AppShell.palette.test.tsx`).
 */
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { cheminLocalise } from '@/i18n/routing';
import { retenirPage } from '@/lib/navigation/pages-recentes';
import type { MyProfilesResponse, Profile, ProfileType } from '@/types/profile';
import type { User, UserRole } from '@/types/user';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  SEUIL_NON_TEXTUEL,
  contraste,
  fondHerite,
  litUtilitaireDeCouleur,
  resoudreCouleur,
} from '@/test/contraste-wcag';
import { PaletteDeCommandes } from '../PaletteDeCommandes';

const etat = vi.hoisted(() => ({
  push: vi.fn(),
  mutate: vi.fn(),
  nonLus: 0,
  /** Chaque appel de `useUnreadCount` : la règle de sondage se lit sur `enabled` (A13). */
  appelsNonLus: [] as { enabled?: boolean }[],
  profils: undefined as MyProfilesResponse | undefined,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: etat.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 3, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({
  useUnreadCount: (o: { enabled?: boolean } = {}) => {
    etat.appelsNonLus.push(o);
    return o.enabled ? etat.nonLus : 0;
  },
}));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: etat.profils, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: etat.mutate, isPending: false }),
}));

const AGENCE = { id: 3, name: 'Agence Teranga', slug: 'agence-teranga', kind: 'standard' as const };
const profil = (type: ProfileType, n: number): Profile => ({
  id: `${type}:${n}`, type, numeric_id: n, agency_id: 3, agency: AGENCE, status: 'active', created_at: null,
});
const utilisateur = (roles: UserRole[]): User =>
  ({ id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles, agency_id: 3 }) as unknown as User;

const fermer = vi.fn();
function ui(roles: UserRole[], typeProfilActif: ProfileType | null = null, ouverte = true) {
  return withIntl(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaletteDeCommandes
        ouverte={ouverte}
        onOuverteChange={fermer}
        contexteDuMenu={{ user: utilisateur(roles), agencyIsStandard: true, typeProfilActif }}
      />
    </QueryClientProvider>,
  );
}
const LOCATAIRE: UserRole[] = ['customer', 'tenant'];
const noms = (racine: HTMLElement) => within(racine).queryAllByRole('option').map((o) => o.textContent ?? '');

beforeEach(() => {
  etat.push.mockReset();
  etat.mutate.mockReset();
  fermer.mockReset();
  etat.nonLus = 0;
  etat.appelsNonLus = [];
  etat.profils = undefined;
  window.localStorage.clear();
});

describe('<PaletteDeCommandes> — TCK-2482', () => {
  it('rôles ARIA : un dialogue nommé, un combobox focalisé qui contrôle une listbox de groupes nommés', async () => {
    render(ui(LOCATAIRE));
    const dialogue = await screen.findByRole('dialog', { name: 'Aller à une page ou changer d’espace' });
    const champ = within(dialogue).getByRole('combobox', { name: 'Rechercher une page, une action ou un espace' });
    await waitFor(() => expect(champ).toHaveFocus());
    const liste = within(dialogue).getByRole('listbox');
    expect(champ).toHaveAttribute('aria-controls', liste.id);
    expect(champ).toHaveAttribute('aria-expanded', 'true');
    expect(champ).toHaveAttribute('aria-autocomplete', 'list');
    const groupes = within(liste).getAllByRole('group').map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent);
    expect(groupes).toEqual(['Actions', 'Aller à']);
    const premiere = within(liste).getAllByRole('option')[0]!;
    expect(premiere).toHaveAttribute('aria-selected', 'true');
    expect(champ).toHaveAttribute('aria-activedescendant', premiere.id);
  });

  it('AC2 — chez un locataire, « loyer » propose Paiements en premier ; Entrée y mène', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    await u.type(await screen.findByRole('combobox'), 'loyer');
    const liste = screen.getByRole('listbox');
    expect(noms(liste)[0]).toBe('Payer mon loyer');
    expect(noms(within(liste).getByRole('group', { name: 'Aller à' }))[0]).toBe('Paiements');
    await u.keyboard('{Enter}');
    expect(etat.push).toHaveBeenCalledWith('/app/payments');
    expect(fermer).toHaveBeenCalledWith(false);
  });

  it('AC3 — « Mes avis », rangé sous « Plus », est trouvé ; « Équipe », fermée au locataire, jamais', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const champ = await screen.findByRole('combobox');
    await u.type(champ, 'avis');
    expect(noms(screen.getByRole('listbox'))).toContain('Mes avis');
    await u.clear(champ);
    await u.type(champ, 'equipe');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('Aucun résultat pour « equipe »')).toBeInTheDocument();
    expect(champ).toHaveAttribute('aria-expanded', 'false');
  });

  it('sans les accents : « etats » trouve « États des lieux »', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    await u.type(await screen.findByRole('combobox'), 'etats');
    expect(noms(screen.getByRole('listbox'))).toEqual(['États des lieux']);
  });

  it('clavier : les flèches déplacent l’option active (et bouclent), Entrée ouvre celle-là', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const champ = await screen.findByRole('combobox');
    // Base UI pose le focus initial après le montage : le clavier vise le champ, pas `body`.
    await waitFor(() => expect(champ).toHaveFocus());
    const options = screen.getAllByRole('option');
    await u.keyboard('{ArrowDown}');
    expect(champ).toHaveAttribute('aria-activedescendant', options[1]!.id);
    await u.keyboard('{ArrowUp}{ArrowUp}');
    expect(champ).toHaveAttribute('aria-activedescendant', options.at(-1)!.id);
    await u.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(etat.push).toHaveBeenCalledTimes(1);
    expect(etat.push.mock.calls[0]![0]).toBe('/app');
  });

  it('clavier : Fin va à la dernière option, Début à la première', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const champ = await screen.findByRole('combobox');
    // Base UI pose le focus initial après le montage : le clavier vise le champ, pas `body`.
    await waitFor(() => expect(champ).toHaveFocus());
    const options = screen.getAllByRole('option');
    await u.keyboard('{End}');
    expect(champ).toHaveAttribute('aria-activedescendant', options.at(-1)!.id);
    expect(options.at(-1)).toHaveAttribute('aria-selected', 'true');
    await u.keyboard('{Home}');
    expect(champ).toHaveAttribute('aria-activedescendant', options[0]!.id);
  });

  it('revue M1 — l’option active est retenue par sa clé : une pastille qui arrive palette ouverte ne déplace pas la cible d’Entrée', async () => {
    const u = userEvent.setup();
    const { rerender } = render(ui(LOCATAIRE));
    const champ = await screen.findByRole('combobox');
    await waitFor(() => expect(champ).toHaveFocus());
    const active = () => document.getElementById(champ.getAttribute('aria-activedescendant') ?? '')?.textContent;
    await u.keyboard('{ArrowDown}');
    expect(active()).toBe('Tableau de bord');
    // Le sondage des non-lus rend 3 pendant que la palette est ouverte : « À traiter » s'insère AVANT.
    etat.nonLus = 3;
    rerender(ui(LOCATAIRE));
    expect(screen.getByRole('option', { name: '3 messages non lus' })).toBeInTheDocument();
    expect(active()).toBe('Tableau de bord');
    await u.keyboard('{Enter}');
    expect(etat.push).toHaveBeenCalledTimes(1);
    expect(etat.push).toHaveBeenCalledWith('/app');
  });

  it('revue M1 — l’option active qui disparaît (compteur retombé à 0) rend la main à la première', async () => {
    etat.nonLus = 3;
    const u = userEvent.setup();
    const { rerender } = render(ui(LOCATAIRE));
    const champ = await screen.findByRole('combobox');
    await waitFor(() => expect(champ).toHaveFocus());
    const options = screen.getAllByRole('option');
    const pastille = screen.getByRole('option', { name: '3 messages non lus' });
    const rang = options.indexOf(pastille);
    for (let i = 0; i < rang; i++) await u.keyboard('{ArrowDown}');
    expect(champ).toHaveAttribute('aria-activedescendant', pastille.id);
    etat.nonLus = 0;
    rerender(ui(LOCATAIRE));
    expect(screen.queryByRole('option', { name: '3 messages non lus' })).toBeNull();
    const premiere = screen.getAllByRole('option')[0]!;
    expect(champ).toHaveAttribute('aria-activedescendant', premiere.id);
    expect(premiere).toHaveAttribute('aria-selected', 'true');
  });

  it('Échap ferme la palette (sans rien ouvrir)', async () => {
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    await screen.findByRole('combobox');
    await u.keyboard('{Escape}');
    expect(fermer).toHaveBeenCalledWith(false);
    expect(etat.push).not.toHaveBeenCalled();
  });

  it('« À traiter » : 3 messages non lus chez le locataire → la messagerie', async () => {
    etat.nonLus = 3;
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const groupe = within(await screen.findByRole('listbox')).getByRole('group', { name: 'À traiter' });
    await u.click(within(groupe).getByRole('option', { name: '3 messages non lus' }));
    expect(etat.push).toHaveBeenCalledWith('/app/messages');
  });

  it('A13 — palette fermée : rien n’est monté, aucun compteur n’est sondé', () => {
    etat.nonLus = 3;
    render(ui(LOCATAIRE, null, false));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(etat.appelsNonLus.some((o) => o.enabled)).toBe(false);
  });

  it('« Récents » sur un champ vide : résolus sur le menu, l’inaccessible et la page courante absents ; disparaissent à la frappe', async () => {
    for (const chemin of ['/app/agency/team', '/app', '/app/leases/4', '/app/payments']) retenirPage(1, chemin);
    const u = userEvent.setup();
    render(ui(LOCATAIRE));
    const groupe = within(await screen.findByRole('listbox')).getByRole('group', { name: 'Récents' });
    expect(noms(groupe)).toEqual(['Paiements', 'Mon bail']);
    await u.type(screen.getByRole('combobox'), 'pai');
    expect(within(screen.getByRole('listbox')).queryByRole('group', { name: 'Récents' })).toBeNull();
  });

  it('une destination du site public s’ouvre dans la langue courante (« Chercher un bien » du client)', async () => {
    const u = userEvent.setup();
    render(ui(['customer']));
    await u.type(await screen.findByRole('combobox'), 'chercher');
    await u.keyboard('{Enter}');
    expect(etat.push).toHaveBeenCalledWith(cheminLocalise('/properties', 'fr'));
  });

  it('AC4 — « Passer à : … » bascule le profil actif ; la coque rendue sous le nouveau profil, la palette suit', async () => {
    etat.profils = { data: [profil('agent', 5), profil('owner', 7)], meta: { active_profile_id: 'agent:5', count: 2 } };
    const roles: UserRole[] = ['customer', 'agent', 'owner'];
    const u = userEvent.setup();
    const { rerender } = render(ui(roles, 'agent'));
    const champ = await screen.findByRole('combobox');

    // Persona agent : « Commissions » est à lui, sans précision ; son propre espace n'est pas proposé.
    await u.type(champ, 'commissions');
    expect(noms(screen.getByRole('listbox'))).toEqual(['Commissions']);
    await u.clear(champ);
    await u.type(champ, 'passer');
    expect(noms(screen.getByRole('listbox'))).toEqual(['Passer à : Propriétaire · Agence Teranga']);

    await u.keyboard('{Enter}');
    expect(etat.mutate).toHaveBeenCalledWith('owner:7');
    expect(fermer).toHaveBeenCalledWith(false);

    // `router.refresh()` rend la coque avec le cookie neuf (R3) : on la rend telle quelle.
    etat.profils = { ...etat.profils, meta: { active_profile_id: 'owner:7', count: 2 } };
    rerender(ui(roles, 'owner'));
    await u.clear(champ);
    await u.type(champ, 'commissions');
    expect(noms(screen.getByRole('listbox'))).toEqual(['CommissionsAussi agent']);
    await u.clear(champ);
    await u.type(champ, 'passer');
    expect(noms(screen.getByRole('listbox'))).toEqual(['Passer à : Agent · Agence Teranga']);
  });

  it('revue I4 — « profil » (ce qu’on tape pour « Mon profil », hors palette par A5) ne propose aucune bascule', async () => {
    etat.profils = { data: [profil('agent', 5), profil('owner', 7)], meta: { active_profile_id: 'agent:5', count: 2 } };
    const u = userEvent.setup();
    render(ui(['customer', 'agent', 'owner'], 'agent'));
    const champ = await screen.findByRole('combobox');
    await u.type(champ, 'profil');
    const liste = screen.queryByRole('listbox');
    expect(liste ? noms(liste).filter((n) => n.startsWith('Passer à')) : []).toEqual([]);
    await u.keyboard('{Enter}');
    expect(etat.mutate).not.toHaveBeenCalled();
  });

  it('AC5 — axe : aucune violation, champ vide (cinq groupes possibles) et sans résultat', async () => {
    etat.nonLus = 2;
    etat.profils = { data: [profil('agent', 5), profil('owner', 7)], meta: { active_profile_id: 'agent:5', count: 2 } };
    retenirPage(1, '/app/messages');
    const u = userEvent.setup();
    render(ui(['customer', 'agent', 'owner'], 'agent'));
    const dialogue = await screen.findByRole('dialog');
    expect((await axe.run(dialogue)).violations).toEqual([]);
    await u.type(screen.getByRole('combobox'), 'zzzz');
    expect((await axe.run(dialogue)).violations).toEqual([]);
  });
});

/**
 * Revue I2 — l'option active est le SEUL repère de ce qu'Entrée va ouvrir (le focus DOM reste au champ,
 * `aria-activedescendant` désigne l'option) : son fond se distingue de la surface du dialogue à 3:1
 * au moins (WCAG 1.4.11), et tout ce qu'elle porte s'y lit (4,5:1 le texte, 3:1 l'icône), en clair
 * comme en sombre. `bg-muted` sur `--popover` faisait 1,18:1. Mesuré sur les classes RENDUES, résolues
 * par les jetons du design system (`src/test/contraste-wcag.ts`) — pas sur le nom d'une classe.
 */
describe('<PaletteDeCommandes> — l’option active se voit (revue I2)', () => {
  /** Le fond propre (sans variante) d'un élément ; `null` s'il n'en pose pas. */
  const fondPropre = (el: Element, jetons: Readonly<Record<string, string>>) => {
    const u = Array.from(el.classList)
      .map((c) => litUtilitaireDeCouleur(c, 'bg'))
      .find((x) => x !== null && x.variante === '' && x.jeton !== 'transparent');
    return u ? resoudreCouleur(u.jeton, jetons) : null;
  };
  /** L'encre effective : la première classe `text-<jeton>` sans variante, de l'élément vers ses ancêtres. */
  const encre = (el: Element | null, jetons: Readonly<Record<string, string>>): string => {
    if (!el) return resoudreCouleur('foreground', jetons);
    const u = Array.from(el.classList)
      .map((c) => litUtilitaireDeCouleur(c, 'text'))
      .find((x) => x !== null && x.variante === '');
    return u ? resoudreCouleur(u.jeton, jetons) : encre(el.parentElement, jetons);
  };

  it.each([
    ['clair', JETONS_CLAIR],
    ['sombre', JETONS_SOMBRE],
  ] as const)('%s : fond ≥ 3:1 sur le dialogue, libellé et précision ≥ 4,5:1, icône ≥ 3:1', async (_theme, jetons) => {
    etat.profils = { data: [profil('agent', 5), profil('owner', 7)], meta: { active_profile_id: 'owner:7', count: 2 } };
    const u = userEvent.setup();
    render(ui(['customer', 'agent', 'owner'], 'owner'));
    const champ = await screen.findByRole('combobox');
    await u.type(champ, 'commissions');
    const active = document.getElementById(champ.getAttribute('aria-activedescendant') ?? '');
    expect(active).not.toBeNull();
    // L'option porte une précision (« Aussi agent ») : elle se mesure aussi.
    expect(active!.textContent).toBe('CommissionsAussi agent');

    const fond = fondPropre(active!, jetons);
    expect(fond, 'l’option active ne peint aucun fond').not.toBeNull();
    const surface = fondHerite(active!, jetons).hex;
    expect(contraste(fond!, surface)).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);

    const textes = Array.from(active!.querySelectorAll('span'));
    expect(textes).toHaveLength(2);
    for (const t of textes) expect(contraste(encre(t, jetons), fond!)).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    const icone = active!.querySelector('svg');
    expect(contraste(encre(icone, jetons), fond!)).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
  });
});
