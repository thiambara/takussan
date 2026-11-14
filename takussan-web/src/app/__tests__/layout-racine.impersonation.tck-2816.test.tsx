// @vitest-environment node

import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2816 (AC5) — le layout racine dit l'impersonation à `AuthProvider` par un BOOLÉEN.
 *
 * Sous impersonation, la variable `impersonation` du layout porte la valeur du cookie, c'est-à-dire
 * le jeton de la cible : elle ne doit rejoindre ni les propriétés sérialisées vers le client ni le
 * rendu (TCK-600, invariant d'ADR-0055). Le test rejoue celui d'AC4 de TCK-2802 sur le layout racine :
 * les deux cookies portent des sentinelles, cherchées dans toute chaîne atteignable depuis l'arbre
 * rendu et dans son HTML statique.
 */

const JETON_IMPERSONATION = 'sentinelle-jeton-impersonation-2816';
const JETON_OPERATEUR = 'sentinelle-jeton-operateur-2816';

let biscuits: Record<string, string> = {};
const agent = { id: 7, first_name: 'Moussa', roles: ['agent'] };

vi.mock('next/font/local', () => ({ default: () => ({ variable: 'f' }) }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (nom: string) => (nom in biscuits ? { name: nom, value: biscuits[nom] } : undefined),
    has: (nom: string) => nom in biscuits,
  })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/messages',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'fr'),
  getTranslations: vi.fn(async () => (cle: string) => cle),
}));
vi.mock('@/i18n/messages', () => ({ messagesPour: vi.fn(async () => ({})) }));
vi.mock('@/lib/utilisateur-du-rendu', () => ({ utilisateurDuRendu: vi.fn(async () => agent) }));

const { default: RootLayout } = await import('../layout');
const { AuthProvider } = await import('@/context/AuthContext');
const { IMPERSONATION_COOKIE } = await import('@/lib/impersonation');
const { AUTH_COOKIE_NAME } = await import('@/lib/constants');

beforeEach(() => {
  biscuits = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

function trouver(noeud: ReactNode, type: unknown): ReactElement | null {
  if (Array.isArray(noeud)) {
    for (const enfant of noeud) {
      const trouve = trouver(enfant, type);
      if (trouve) return trouve;
    }
    return null;
  }
  if (!isValidElement(noeud)) return null;
  if (noeud.type === type) return noeud;
  return trouver((noeud.props as { children?: ReactNode }).children, type);
}

/** Toutes les chaînes atteignables depuis les props de l'arbre que rend le layout. */
function chainesDesProps(noeud: unknown, vus = new Set<unknown>(), chaines: string[] = []): string[] {
  if (noeud === null || noeud === undefined) return chaines;
  if (typeof noeud === 'string') {
    chaines.push(noeud);
    return chaines;
  }
  if (typeof noeud !== 'object' || vus.has(noeud)) return chaines;
  vus.add(noeud);
  if (isValidElement(noeud)) {
    chainesDesProps(noeud.props, vus, chaines);
    return chaines;
  }
  for (const valeur of Object.values(noeud as Record<string, unknown>)) chainesDesProps(valeur, vus, chaines);
  return chaines;
}

describe('layout racine — l’impersonation dite à AuthProvider (TCK-2816)', () => {
  it('AC5 — sous impersonation : un booléen vrai, aucun jeton dans les props ni dans le rendu', async () => {
    biscuits = { [IMPERSONATION_COOKIE]: JETON_IMPERSONATION, [AUTH_COOKIE_NAME]: JETON_OPERATEUR };
    const rendu = await RootLayout({ children: <main>contenu</main> });

    const fournisseur = trouver(rendu, AuthProvider);
    expect(fournisseur).not.toBeNull();
    const props = fournisseur?.props as Record<string, unknown>;
    expect(props.impersonation).toBe(true);
    expect(props.initialToken).toBeNull();
    expect(props.initialUser).toEqual(agent);

    const chaines = chainesDesProps(rendu);
    expect(chaines.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(rendu as ReactElement);
    expect(html).toContain('contenu');
    for (const jeton of [JETON_IMPERSONATION, JETON_OPERATEUR]) {
      expect(chaines.some((chaine) => chaine.includes(jeton))).toBe(false);
      expect(html).not.toContain(jeton);
    }
  });

  it('hors impersonation : le signal est faux, le jeton de la session suit son chemin habituel', async () => {
    biscuits = { [AUTH_COOKIE_NAME]: JETON_OPERATEUR };
    const rendu = await RootLayout({ children: null });

    const props = trouver(rendu, AuthProvider)?.props as Record<string, unknown>;
    expect(props.impersonation).toBe(false);
    expect(props.initialToken).toBe(JETON_OPERATEUR);
  });
});
