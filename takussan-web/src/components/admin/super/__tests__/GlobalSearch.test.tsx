import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes } from '@/test/habilitations';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  SEUIL_NON_TEXTUEL,
  composer,
  contraste,
  fmt,
  fondHerite,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versHex,
  versRvb,
} from '@/test/contraste-wcag';
import { withIntl } from '@/test/intl';
import { GlobalSearch } from '../GlobalSearch';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const SUPPORT: PlatformAbilities = {
  level: 'support',
  abilities: ['platform.console.access', 'platform.users.view', 'platform.search.global'],
};
const VIEWER: PlatformAbilities = { level: 'viewer', abilities: ['platform.console.access'] };

const HITS = [
  { type: 'user', id: 4, label: 'Fatou Diop', sublabel: 'fatou@example.test', agency: null, url: '/super-admin/users/4' },
  { type: 'agency', id: 2, label: 'Fatou Immo', sublabel: 'fatou-immo', agency: null, url: '/super-admin/agencies/2' },
  { type: 'user', id: 9, label: 'Fatou Sarr', sublabel: 'sarr@example.test', agency: null, url: '/super-admin/users/9' },
  { type: 'lease', id: 7, label: 'BAIL-7', sublabel: null, agency: { id: 2, name: 'Fatou Immo' }, url: null },
];

function rendre(gestes: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<GlobalSearch />, gestes)}</QueryClientProvider>));
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push.mockReset();
  fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: HITS })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** TCK-600 (sous-partie 8) — recherche globale au clavier depuis toute page de la console. */
describe('<GlobalSearch>', () => {
  it('absente sous le niveau support : ni bouton, ni raccourci', async () => {
    rendre(VIEWER);
    expect(screen.queryByRole('button', { name: /Rechercher/ })).toBeNull();
    await userEvent.setup().keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Ctrl+K ouvre ; à deux caractères, aucun appel (TCK-1447 : le seuil du texte libre)', async () => {
    rendre(SUPPORT);
    const u = userEvent.setup();
    await u.keyboard('{Control>}k{/Control}');
    const champ = await screen.findByRole('combobox');
    await u.type(champ, 'Ba');
    expect(screen.getByText('Au moins 3 caractères.')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();

    await u.type(champ, 'i');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/super-admin/search?q=Bai');
  });

  it('classe par type, se parcourt aux flèches et ouvre à Entrée', async () => {
    rendre(SUPPORT);
    const u = userEvent.setup();
    await u.keyboard('{Meta>}k{/Meta}');
    await u.type(await screen.findByRole('combobox'), 'fatou');

    const liste = await screen.findByRole('listbox');
    await waitFor(() => expect(within(liste).getAllByRole('option')).toHaveLength(4));
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/super-admin/search?q=fatou');
    // Les deux utilisateurs ensemble, sous leur type, avant les agences : l'ordre de l'API par groupe.
    expect(within(liste).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Utilisateurs',
      'Agences',
      'Baux',
    ]);
    expect(within(liste).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Fatou Diopfatou@example.test',
      'Fatou Sarrsarr@example.test',
      'Fatou Immofatou-immo',
      'BAIL-7Fatou Immo',
    ]);

    await u.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(push).toHaveBeenCalledWith('/super-admin/agencies/2');
  });

  it('un résultat sans écran ne navigue pas', async () => {
    rendre(SUPPORT);
    const u = userEvent.setup();
    await u.keyboard('{Control>}k{/Control}');
    await u.type(await screen.findByRole('combobox'), 'fatou');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));

    await u.keyboard('{ArrowUp}{Enter}');
    expect(push).not.toHaveBeenCalled();
  });

  it('chaque type que le service émet a un libellé traduit', () => {
    const php = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..',
        'takussan-api', 'app', 'Services', 'Admin', 'AdminGlobalSearchService.php'),
      'utf8',
    );
    const types = [...new Set([...php.matchAll(/->hit\('([a-z_]+)'/g)].map((m) => m[1]))];
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((type) => !(type in fr.superAdmin.globalSearch.types))).toEqual([]);
  });
});

/**
 * TCK-2484 — l'option active est le SEUL repère de ce qu'Entrée va ouvrir : le focus DOM reste au
 * champ (`aria-activedescendant`), aucun anneau ne la désigne. Son fond se distingue donc de la
 * surface du dialogue à 3:1 au moins (WCAG 1.4.11) et tout ce qu'elle porte s'y lit à 4,5:1 (1.4.3),
 * en clair comme en sombre. `bg-muted` sur `--popover` faisait 1,18:1 (relevé de la revue de
 * TCK-2482, suite (a)) ; le correctif est celui de la palette (revue I2) : le surlignage du `Combobox`
 * du dépôt, `bg-accent` et son encre appariée. Mesuré sur les classes RENDUES, résolues par les
 * jetons du design system (`src/test/contraste-wcag.ts`) — pas sur le nom d'une classe.
 */
describe('<GlobalSearch> — l’option active se voit (TCK-2484)', () => {
  /** Un résultat qui porte TOUT ce qu'une option peut porter : libellé, sous-libellé, agence. */
  const COMPLET = {
    type: 'lease',
    id: 8,
    label: 'BAIL-8',
    sublabel: 'Fatou Diop',
    agency: { id: 2, name: 'Fatou Immo' },
    url: '/super-admin/leases/8',
  };

  /** Le fond propre (sans variante) d'un élément, composé sur `dessous` ; `null` s'il n'en pose pas. */
  const fondPropre = (el: Element, dessous: string, jetons: Readonly<Record<string, string>>) => {
    const u = Array.from(el.classList)
      .map((c) => litUtilitaireDeCouleur(c, 'bg'))
      .find((x) => x !== null && x.variante === '' && x.jeton !== 'transparent');
    return u ? versHex(composer(versRvb(resoudreCouleur(u.jeton, jetons)), versRvb(dessous), u.alpha)) : null;
  };
  /** L'encre effective, composée sur `fond` : la première `text-<jeton>` sans variante, de l'élément vers ses ancêtres. */
  const encre = (el: Element | null, fond: string, jetons: Readonly<Record<string, string>>): string => {
    if (!el) return resoudreCouleur('foreground', jetons);
    const u = Array.from(el.classList)
      .map((c) => litUtilitaireDeCouleur(c, 'text'))
      .find((x) => x !== null && x.variante === '');
    return u
      ? versHex(composer(versRvb(resoudreCouleur(u.jeton, jetons)), versRvb(fond), u.alpha))
      : encre(el.parentElement, fond, jetons);
  };

  it.each([
    ['clair', JETONS_CLAIR],
    ['sombre', JETONS_SOMBRE],
  ] as const)('%s : fond ≥ 3:1 sur le dialogue, libellé, sous-libellé et agence ≥ 4,5:1', async (_theme, jetons) => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: [COMPLET, HITS[0]] })));
    rendre(SUPPORT);
    const u = userEvent.setup();
    await u.keyboard('{Control>}k{/Control}');
    const champ = await screen.findByRole('combobox');
    await u.type(champ, 'fatou');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    const active = document.getElementById(champ.getAttribute('aria-activedescendant') ?? '');
    expect(active).not.toBeNull();
    expect(active!.getAttribute('aria-selected')).toBe('true');
    // L'option mesurée porte les trois textes : rien de ce qu'elle affiche n'échappe à la mesure.
    expect(active!.textContent).toBe('BAIL-8Fatou DiopFatou Immo');

    const surface = fondHerite(active!, jetons).hex;
    const fond = fondPropre(active!, surface, jetons);
    expect(fond, 'l’option active ne peint aucun fond').not.toBeNull();
    expect(
      contraste(fond!, surface),
      `fond actif ${fond} sur la surface ${surface} : ${fmt(contraste(fond!, surface))}`,
    ).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);

    const textes = Array.from(active!.querySelectorAll('span')).filter((s) => s.children.length === 0);
    expect(textes.map((s) => s.textContent)).toEqual(['BAIL-8', 'Fatou Diop', 'Fatou Immo']);
    for (const t of textes) {
      const ratio = contraste(encre(t, fond!, jetons), fond!);
      expect(ratio, `« ${t.textContent} » : ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    }

    // Témoin : l'option INACTIVE ne peint pas de fond, elle reste sur la surface du dialogue.
    const inactive = screen.getAllByRole('option').find((o) => o !== active)!;
    expect(fondPropre(inactive, surface, jetons)).toBeNull();
  });
});
