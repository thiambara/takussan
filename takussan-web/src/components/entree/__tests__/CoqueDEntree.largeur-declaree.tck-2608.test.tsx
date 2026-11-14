/**
 * TCK-2608 — la largeur déclarée par un écran (`DeclarerEntree largeur=…`) l'emporte sur celle du
 * layout : l'orientation est UN composant client à trois écrans, dont les colonnes diffèrent
 * (maquette `app-entree-orientation`).
 *  · `portes` (a-1) : 480 px au téléphone, 880 dès `lg` ;
 *  · `volets` (a-2 à a-4) : 480 px au téléphone, 560 dès `lg` ; avec un objet, l'objet DESSOUS
 *    (même 560) jusqu'à 1280, la colonne de 560 à côté dès `xl`.
 * Sans déclaration, la largeur du layout reste celle qui sert (connexion, oubli, invitation).
 *
 * jsdom n'applique pas Tailwind : les classes se lisent ; la mesure au navigateur est dans la fiche.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { afficheA } from '@/test/affiche-a';

import { CoqueDEntree, DeclarerEntree, type LargeurDeColonne, type LibellesDeLaCoque } from '../CoqueDEntree';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/onboarding/intention',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const C = frMessages.coqueDEntree;
const LIBELLES: LibellesDeLaCoque = { marque: 'Takussan', retourAuSite: C.retourAuSite, fermer: C.fermer, quitter: C.quitter, avancement: C.avancement, sortie: C.sortie };
const classe = (nom: string) => new RegExp(`(^|\\s)${nom.replace(/[[\].]/g, '\\$&')}(\\s|$)`);

function monter({ declaree, duLayout, objet }: { declaree?: LargeurDeColonne; duLayout?: 'etroite' | 'large' | 'assistant'; objet?: boolean }) {
  render(
    <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }} largeur={duLayout}>
      <DeclarerEntree largeur={declaree} objet={objet ? <p>Ce que vous aurez</p> : undefined} />
      <form aria-label="orientation">
        <input aria-label="nom" />
      </form>
    </CoqueDEntree>,
  );
  return screen.getByRole('form', { name: 'orientation' }).parentElement!;
}

describe('CoqueDEntree — largeur déclarée par l’écran (TCK-2608)', () => {
  it('portes : 480 px au téléphone, 880 dès lg — et l’emporte sur la largeur du layout', () => {
    const colonne = monter({ declaree: 'portes', duLayout: 'etroite' });
    expect(colonne.className).toMatch(classe('max-w-[30rem]'));
    expect(colonne.className).toMatch(classe('lg:max-w-[55rem]'));
    expect(colonne.className).not.toMatch(classe('max-w-4xl'));
  });

  it('volets sans objet : 480 px au téléphone, 560 dès lg, le haut de la page à 14', () => {
    const colonne = monter({ declaree: 'volets' });
    expect(colonne.className).toMatch(classe('max-w-[30rem]'));
    expect(colonne.className).toMatch(classe('lg:max-w-[35rem]'));
    expect(colonne.closest('main')!.className).toMatch(classe('lg:pt-14'));
  });

  it('volets avec objet : la colonne de 560 à côté dès xl ; l’objet dessous de lg à xl, à 560 lui aussi', () => {
    const colonne = monter({ declaree: 'volets', objet: true });
    const objet = screen.getByText('Ce que vous aurez').closest('[data-objet-de-l-intention]')!;
    expect(colonne.className).toMatch(classe('xl:w-[35rem]'));
    expect(colonne.className).not.toMatch(classe('xl:w-[30rem]'));
    expect(colonne.compareDocumentPosition(objet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(afficheA(objet, 390)).toBe(false);
    expect(afficheA(objet, 1024)).toBe(true);
    expect(objet.className).toMatch(classe('lg:max-w-[35rem]'));
  });

  it.each([
    ['etroite', 'max-w-[30rem]'],
    ['large', 'max-w-4xl'],
    ['assistant', 'lg:max-w-[40rem]'],
  ] as const)('sans déclaration, la largeur du layout « %s » sert, inchangée', (duLayout, attendue) => {
    const colonne = monter({ duLayout });
    expect(colonne.className).toMatch(classe(attendue));
    expect(colonne.className).not.toMatch(/55rem|35rem/);
    expect(colonne.closest('main')!.className).not.toMatch(classe('lg:pt-14'));
  });

  it('sans déclaration, avec un objet : la colonne de 480 à côté dès xl, l’objet sans 560 (TCK-2598)', () => {
    const colonne = monter({ objet: true });
    const objet = screen.getByText('Ce que vous aurez').closest('[data-objet-de-l-intention]')!;
    expect(colonne.className).toMatch(classe('xl:w-[30rem]'));
    expect(objet.className).not.toMatch(classe('lg:max-w-[35rem]'));
  });
});
