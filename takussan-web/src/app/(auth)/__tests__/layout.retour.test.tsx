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

    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute(
      'href',
      '/fr/properties?type=office',
    );
    // Le logo reste — il mène toujours à l'accueil, il ne tient simplement plus lieu de retour.
    expect(screen.getAllByRole('link', { name: 'Takussan' }).length).toBeGreaterThan(0);
  });

  // Revue du 2026-09-23 : de 1024 à 1180 px de large, le formulaire d'inscription est plus haut
  // que la fenêtre et commence au rembourrage du panneau — 40 px, quand le retour, posé en absolu à
  // 32 px, en occupe 44. Son libellé s'imprimait sur le titre (« Dellu » sur « Sos sa kont »).
  // jsdom ne pose aucune mise en page : l'invariant se lit sur les classes des deux éléments.
  it('au bureau, le contenu du panneau commence SOUS le retour, quelle que soit sa hauteur', async () => {
    render(withIntl(await AuthLayout({ children: <form aria-label="Connexion" /> })));

    const retour = screen.getByRole('link', { name: 'Retour' });
    const panneau = retour.parentElement!;
    // Le pas d'espacement (×4 px) de la première classe qui commence par `prefixe`. Des préfixes
    // nus et non des motifs : Tailwind scanne aussi les tests, et y lirait des classes.
    const pas = (classes: string, prefixe: string) => {
      const classe = classes.split(/\s+/).find((c) => c.startsWith(prefixe));
      return Number(classe?.slice(prefixe.length) ?? Number.NaN) * 4;
    };

    const hautDuRetour = pas(retour.className, 'lg:top-');
    const hauteurDuRetour = pas(retour.className, 'min-h-');
    const debutDuContenu = pas(panneau.className, 'lg:pt-');

    expect(hautDuRetour).toBe(32);
    expect(hauteurDuRetour).toBe(44);
    // 16 px d'air au moins entre le bas du retour et le haut du titre.
    expect(debutDuContenu).toBeGreaterThanOrEqual(hautDuRetour + hauteurDuRetour + 16);
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

    expect(screen.getByRole('link', { name: 'Retour' })).toBeInTheDocument();
    expect(defilement).toBe(0);
  });
});
