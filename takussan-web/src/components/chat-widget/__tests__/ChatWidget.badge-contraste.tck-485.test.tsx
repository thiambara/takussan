/**
 * TCK-485 — la pastille des non-lus se lit dans les DEUX thèmes.
 *
 * Elle posait `text-white` sur `bg-destructive` plein : 6,94:1 en clair, **2,45:1 en sombre**
 * (`#ffffff` sur `#ff7f7d`). L'encre n'y est pas le jeton, elle est POSÉE dessus — c'est le sens
 * inverse de TCK-480, et rendre le jeton plus clair (ce qui sert l'encre `text-destructive` en
 * sombre) dégrade le blanc posé sur lui. D'où une encre qui suit le thème : `text-background`,
 * la convention des sept autres `bg-destructive` pleins du dépôt (6,61:1 / 7,17:1).
 *
 * La mesure part des classes RENDUES (le DOM), résolues contre les jetons de chaque thème
 * (`src/test/contraste-wcag.ts`). Le widget n'est monté sous aucune portée `.dark` aujourd'hui
 * (`src/test/portees-sombres.ts`), mais il l'est sous `html.dark` dès que l'utilisateur choisit le
 * thème sombre : le couple sombre est donc exigé, pas déduit d'une portée.
 *
 * Le couple inverse est aussi tenu, pour tout le source, par `scripts/check-destructive-contrast.mjs`
 * (contrôle C).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import frMessages from '@/messages/fr.json';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versHex,
  versRvb,
} from '@/test/contraste-wcag';

import { CorpsDuWidget as ChatWidget } from '../CorpsDuWidget';

const usePathnameMock = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock('../useUnreadCount', () => ({
  useUnreadCount: () => 7,
}));

vi.mock('@/components/messages/ConversationList', () => ({
  ConversationList: () => <div data-testid="conv-list" />,
}));
vi.mock('@/components/messages/ChatView', () => ({
  ChatView: () => <div data-testid="chat-view" />,
}));
vi.mock('@/components/messages/PropertyDraftChatView', () => ({
  PropertyDraftChatView: () => <div data-testid="chat-draft" />,
}));
vi.mock('@/context/ChatDraftContext', () => ({
  useChatDraft: () => ({ cible: null, ouvrirChatBien: vi.fn(), consommerCible: vi.fn() }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

/** La couleur de l'utilitaire SANS variante (`bg-*` / `text-*` au repos), composée si `/NN`. */
function couleurAuRepos(
  element: HTMLElement,
  prefixe: 'bg' | 'text',
  jetons: Readonly<Record<string, string>>,
  dessous?: string,
): string {
  const lus = [...element.classList]
    .map((c) => litUtilitaireDeCouleur(c, prefixe))
    .filter((u): u is NonNullable<typeof u> => u !== null && u.variante === '');
  expect(lus, `un seul ${prefixe}-* de couleur au repos sur « ${element.className} »`).toHaveLength(1);
  const { jeton, alpha } = lus[0]!;
  const hex = resoudreCouleur(jeton, jetons);
  if (alpha === 1) return hex;
  return versHex(composer(versRvb(hex), versRvb(dessous ?? resoudreCouleur('background', jetons)), alpha));
}

describe('<ChatWidget> — la pastille des non-lus se lit (TCK-485)', () => {
  beforeEach(() => {
    // Hors de /app et du site public : les DEUX lanceurs, donc les deux pastilles, sont rendus.
    usePathnameMock.mockReturnValue('/properties/villa-saly');
  });

  it.each([
    ['du lanceur de bureau', 'chat-widget-badge'],
    ['du bouton flottant mobile', 'chat-widget-mobile-badge'],
  ])('le chiffre de la pastille %s atteint 4,5:1 en clair ET en sombre', (_quoi, testId) => {
    render(wrap(<ChatWidget />));
    const pastille = screen.getByTestId(testId);

    for (const [theme, jetons] of [
      ['clair', JETONS_CLAIR],
      ['sombre', JETONS_SOMBRE],
    ] as const) {
      const fond = couleurAuRepos(pastille, 'bg', jetons);
      const encre = couleurAuRepos(pastille, 'text', jetons, fond);
      const r = contraste(encre, fond);
      expect(
        r,
        `[${theme}] ${encre} sur ${fond} — ${fmt(r)} (seuil ${SEUIL_AA_TEXTE}) : « ${pastille.className} »`,
      ).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    }
  });
});
