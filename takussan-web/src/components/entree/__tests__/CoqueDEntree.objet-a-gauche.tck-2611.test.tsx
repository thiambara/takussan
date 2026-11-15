/**
 * TCK-2611 (AC4) — l'objet à GAUCHE au bureau large (maquette `app-entree-invitation`, `DeuxColonnes`) :
 * dès 1280, l'agence qui invite à gauche, le formulaire de 400 px à droite, dans 1080 px ; sous 1280,
 * l'objet n'est pas rendu (la page dit l'agence dans sa colonne) — aucun panneau à côté du contenu.
 * Sans `objetAGauche`, rien ne change pour les pages de TCK-2598.
 *
 * jsdom n'applique pas Tailwind : `afficheA` rejoue les utilitaires d'affichage. La mesure au navigateur
 * est dans la fiche de fidélité.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { afficheA } from '@/test/affiche-a';

import { CoqueDEntree, DeclarerEntree, type LibellesDeLaCoque } from '../CoqueDEntree';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/invitations/accept',
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

function monter(objetAGauche: boolean) {
  return render(
    <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/', forme: 'retour-au-site' }}>
      <DeclarerEntree objet={<p>Dakar Immo — agence vérifiée</p>} objetAGauche={objetAGauche} />
      <form aria-label="invitation">
        <input aria-label="prénom" />
      </form>
    </CoqueDEntree>,
  );
}

describe('CoqueDEntree — objetAGauche', () => {
  it('à 1280 : l’objet AVANT la colonne (à gauche), la colonne de 400 px, dans 1080 px', () => {
    monter(true);
    const objet = screen.getByText('Dakar Immo — agence vérifiée').closest('[data-objet-de-l-intention]')!;
    const colonne = screen.getByRole('form', { name: 'invitation' }).parentElement!;

    expect(afficheA(objet, 1280)).toBe(true);
    expect(objet.compareDocumentPosition(colonne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(colonne.className).toMatch(/(^|\s)xl:w-\[25rem\](\s|$)/);
    expect(colonne.parentElement!.className).toMatch(/(^|\s)xl:max-w-\[67\.5rem\](\s|$)/);
  });

  it.each([390, 1024])('à %i : l’objet n’est pas rendu, la colonne garde ses 480 px', (largeur) => {
    monter(true);
    const objet = screen.getByText('Dakar Immo — agence vérifiée').closest('[data-objet-de-l-intention]')!;
    expect(afficheA(objet, largeur)).toBe(false);
    expect(screen.getByRole('form', { name: 'invitation' }).parentElement!.className).toMatch(/(^|\s)max-w-\[30rem\](\s|$)/);
  });

  it('sans l’option : l’objet reste APRÈS la colonne (TCK-2598), visible dès 1024', () => {
    monter(false);
    const objet = screen.getByText('Dakar Immo — agence vérifiée').closest('[data-objet-de-l-intention]')!;
    const colonne = screen.getByRole('form', { name: 'invitation' }).parentElement!;
    expect(colonne.compareDocumentPosition(objet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(afficheA(objet, 1024)).toBe(true);
    expect(colonne.className).toMatch(/(^|\s)xl:w-\[30rem\](\s|$)/);
  });
});
