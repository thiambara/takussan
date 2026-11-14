/**
 * Le layout des écrans de connexion porte le retour — retour testeur du 2026-09-23 (TCK-568, M2).
 *
 * La capture du testeur (mobile, 390 px) : sur `/auth/login`, le logo était la seule issue, et il
 * menait à l'accueil. Ce test tient la moitié que `RetourAuth.test.tsx` ne peut pas voir : que le
 * layout le MONTE, et que le logo reste là à côté de lui.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/auth/login',
  useSearchParams: () => new URLSearchParams('redirect=%2Ffr%2Fproperties%3Ftype%3Doffice'),
}));

vi.mock('@/i18n/messages', async () => ({
  messagesPour: async () => (await import('@/messages/fr.json')).default,
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('@/components/auth/ReinitialiserSessionClient', () => ({
  ReinitialiserSessionClient: () => null,
}));

const { default: AuthLayout } = await import('../layout');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('(auth)/layout — une issue vers la page quittée', () => {
  it('monte un retour vers la recherche, à côté du logo', async () => {
    render(withIntl(await AuthLayout({ children: <form aria-label="Connexion" /> })));

    // TCK-2598 — deux formes, une destination : la flèche unique au téléphone, la pastille au bureau.
    const retours = screen.getAllByRole('link', { name: 'Retour au site' });
    expect(retours).toHaveLength(2);
    for (const retour of retours) expect(retour).toHaveAttribute('href', '/fr/properties?type=office');
    // Le logo reste — il mène toujours à l'accueil, il ne tient simplement plus lieu de retour.
    expect(screen.getAllByRole('link', { name: 'Takussan' }).length).toBeGreaterThan(0);
  });

  // Revue du 2026-09-23 : de 1024 à 1180 px de large, le retour posé en ABSOLU s'imprimait sur le
  // titre d'un formulaire plus haut que la fenêtre (« Dellu » sur « Sos sa kont »). TCK-2598 : le
  // retour vit dans la barre de la coque, dans le flux, au-dessus du repère du contenu — il ne peut
  // plus rien recouvrir. jsdom ne pose aucune mise en page : l'invariant se lit sur la structure.
  it('le retour est dans une barre, hors du contenu, jamais posé en absolu dessus', async () => {
    const { container } = render(withIntl(await AuthLayout({ children: <form aria-label="Connexion" /> })));

    const main = container.querySelector('main')!;
    for (const retour of screen.getAllByRole('link', { name: 'Retour au site' })) {
      expect(retour.closest('header')).not.toBeNull();
      expect(main).not.toContainElement(retour);
      expect(retour.className).not.toMatch(/(^|\s)(lg:)?absolute(\s|$)/);
    }
  });

  // Revue du 2026-09-23 : la recherche défilée, puis « Connexion » — l'écran s'ouvrait défilé à son
  // maximum (320 × 640 : `scrollY` 82, le retour à `top` −70). Next ne remonte qu'au haut de la
  // page, sous la bannière ; le layout doit ramener le document à son sommet.
  it('une arrivée depuis une page défilée s’ouvre au sommet, le retour en vue', async () => {
    let defilement = 600;
    vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
      defilement = options.top ?? defilement;
    }) as typeof window.scrollTo);

    render(withIntl(await AuthLayout({ children: <form aria-label="Connexion" /> })));

    expect(screen.getAllByRole('link', { name: 'Retour au site' }).length).toBeGreaterThan(0);
    expect(defilement).toBe(0);
  });
});
