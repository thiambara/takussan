/**
 * TCK-1734 (P168.03) — un `next/navigation` de test dont `router.replace` change vraiment la
 * requête que lit `useSearchParams`, et refait le rendu : une liste dont la vue vit dans l'URL se
 * teste alors comme un utilisateur la parcourt (« Suivant », puis un filtre).
 *
 * ```ts
 * vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
 * beforeEach(() => navigationDeTest.reinitialiser('status=draft'));
 * ```
 */
import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

let requete = '';
const abonnes = new Set<() => void>();

function changer(href: string) {
  requete = href.replace(/^[^?]*\??/, '');
  abonnes.forEach((f) => f());
}

export const navigationDeTest = {
  replace: vi.fn((href: string, options?: unknown) => {
    void options;
    changer(href);
  }),
  push: vi.fn((href: string, options?: unknown) => {
    void options;
    changer(href);
  }),
  /** La requête courante, sans `?`. */
  requete: () => requete,
  reinitialiser(depart = '') {
    requete = depart;
    navigationDeTest.replace.mockClear();
    navigationDeTest.push.mockClear();
  },
};

const routeur = {
  replace: (href: string, options?: unknown) => navigationDeTest.replace(href, options),
  push: (href: string, options?: unknown) => navigationDeTest.push(href, options),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const moduleNavigation = {
  useRouter: () => routeur,
  usePathname: () => '/',
  useSearchParams: () => {
    const q = useSyncExternalStore(
      (f) => {
        abonnes.add(f);
        return () => abonnes.delete(f);
      },
      () => requete,
      () => requete,
    );
    return new URLSearchParams(q);
  },
};
