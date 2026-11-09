import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { expect } from 'vitest';

import { estPageDeLien, porteLaBarrePublique } from '@/lib/navigation/barre-publique';
import { withIntl } from '@/test/intl';

/**
 * TCK-2505 / 2512 / 2514 (AC4) — l'assertion commune des tests de PAGE par lien : la page rendue elle-même (pas un
 * composant que le test envelopperait) vit dans la coque de lien NUE.
 *
 * Le test qui l'appelle remplace `Navbar`, `NavbarSpacer` et `Footer` de `@/components/home/*` par des témoins
 * (`data-testid="temoin-…"`) : une page qui les remonterait les montrerait ici, quel que soit leur contenu. Le dock du
 * comparateur et la barre d'onglets sont montés par la coque `(public)`, pas par la page : ils se jugent sur le chemin
 * (`estPageDeLien`, `porteLaBarrePublique`), que ces deux composants lisent.
 */
export function assertCoqueDeLienNue(page: ReactElement, chemin: string) {
  const { container } = render(withIntl(page));

  expect(container.querySelector('[data-coque-lien]')).not.toBeNull();
  expect(screen.queryByTestId('temoin-navbar')).toBeNull();
  expect(screen.queryByTestId('temoin-navbar-spacer')).toBeNull();
  expect(screen.queryByTestId('temoin-footer')).toBeNull();
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.queryByRole('search')).toBeNull();
  expect(screen.queryByRole('searchbox')).toBeNull();
  const hrefs = screen.queryAllByRole('link').map((a) => a.getAttribute('href') ?? '');
  expect(hrefs.filter((h) => /favorites|compare/.test(h))).toEqual([]);
  expect(estPageDeLien(chemin)).toBe(true);
  expect(porteLaBarrePublique(chemin)).toBe(false);
}

/** Un `layout.tsx` de segment, serveur (`async`) ou non. */
export type LayoutDeSegment = (props: { readonly children: ReactNode }) => ReactElement | Promise<ReactElement>;

const RACINE_PUBLIQUE = path.resolve(process.cwd(), 'src/app/[locale]/(public)');

/**
 * La page ENVELOPPÉE dans les `layout.tsx` de ses segments, du plus proche au plus lointain, jusqu'à `(public)` exclu
 * (contre-vérification du 2026-11-09) : une Navbar posée dans un layout de lien se verrait aussi.
 *
 * `dossier` est le dossier de la page relatif à `(public)` (`'pay/[token]'`), `layouts` les layouts importés par le
 * test, clés relatives à `(public)` (`'pay/layout.tsx'`). La liste est confrontée au DISQUE : un layout ajouté plus tard
 * dans un de ces segments fait rougir le test tant qu'il n'y est pas passé, il ne peut pas être oublié.
 *
 * `(public)/layout.tsx` n'en fait pas partie : c'est la coque publique, qui monte la Navbar, le dock et la barre
 * d'onglets selon le chemin — d'où `estPageDeLien` et `porteLaBarrePublique` dans `assertCoqueDeLienNue`.
 */
export async function pageDansSesLayouts(
  dossier: string,
  page: ReactElement,
  layouts: Readonly<Record<string, LayoutDeSegment>>,
): Promise<ReactElement> {
  const surLeDisque: string[] = [];
  for (let d = dossier; d !== '.' && d !== ''; d = path.posix.dirname(d)) {
    if (existsSync(path.join(RACINE_PUBLIQUE, d, 'layout.tsx'))) surLeDisque.push(`${d}/layout.tsx`);
  }
  expect(Object.keys(layouts).sort(), `layouts de ${dossier} sur le disque`).toEqual([...surLeDisque].sort());

  let rendu = page;
  for (const fichier of surLeDisque) rendu = await layouts[fichier]({ children: rendu });
  return rendu;
}

/** Les témoins des trois pièces de la marketplace, pour `vi.mock`. */
export const TEMOINS_MARKETPLACE = {
  Navbar: () => <div data-testid="temoin-navbar" />,
  NavbarSpacer: () => <div data-testid="temoin-navbar-spacer" />,
  Footer: () => <div data-testid="temoin-footer" />,
};
