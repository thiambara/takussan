// @vitest-environment node
/**
 * TCK-2568 — le haut de `/bookings` au téléphone, BRANCHÉ par la page.
 *
 * La règle du chemin ôte la barre du site à `/bookings` (le tunnel porte son en-tête). La page doit
 * encore dire, état par état, ce qui la remplace :
 * - le tunnel (séjour court) : rien de plus, il a son en-tête ;
 * - le bien au mois ou à vendre : l'en-tête de la maquette (réservation A, « Bien au mois ») — un
 *   seul retour « Retour au bien », vers SA fiche ; pas de barre du site ;
 * - sans bien (aucun slug, slug inconnu) : la barre du site, sa seule issue.
 *
 * Revue du 2026-11-09 : la surcharge retirée, `(public)/bookings` restait vert (11/11).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr',
  getTranslations: async (espace?: string) => (cle: string) => `${espace}.${cle}`,
}));
vi.mock('@/components/home/Navbar', () => ({
  Navbar: ({ auTelephone }: { auTelephone?: string }) => <nav data-au-telephone={auTelephone ?? 'selon-le-chemin'} />,
}));
vi.mock('@/components/home/NavbarSpacer', () => ({
  NavbarSpacer: ({ auTelephone }: { auTelephone?: string } = {}) => <div data-cale data-au-telephone={auTelephone ?? 'selon-le-chemin'} />,
}));
vi.mock('@/components/navigation-publique/EnTeteDePage', () => ({
  EnTeteDePage: ({ retour }: { retour?: { repli: string; libelle?: string } | null }) => (
    <header data-en-tete-de-page data-repli={retour?.repli} data-libelle={retour?.libelle} />
  ),
}));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer /> }));
vi.mock('@/components/bookings/BookingTunnel', () => ({ BookingTunnel: () => <div data-tunnel /> }));
vi.mock('@/components/shared/LienLocalise', () => ({
  LienLocalise: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { default: BookingPage } = await import('../page');

afterEach(() => {
  vi.restoreAllMocks();
});

function bien(champs: Record<string, unknown>) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: { slug: 'appartement-mermoz-abc123', ...champs } }), { status: 200 }),
  );
}

async function rendre(params: Record<string, string>) {
  return renderToStaticMarkup(await BookingPage({ searchParams: Promise.resolve(params) }));
}

function attribut(html: string, balise: string, nom: string): string | undefined {
  const element = new RegExp(`<${balise}\\b[^>]*>`).exec(html)?.[0];
  return element ? new RegExp(`${nom}="([^"]*)"`).exec(element)?.[1] : undefined;
}

const haut = (html: string) => ({
  nav: attribut(html, 'nav', 'data-au-telephone'),
  cale: attribut(html, 'div data-cale', 'data-au-telephone'),
  enTete: html.includes('data-en-tete-de-page')
    ? [html, attribut(html, 'header', 'data-repli'), attribut(html, 'header', 'data-libelle')]
    : null,
});

describe('/bookings — le haut de l’écran au téléphone, état par état (TCK-2568)', () => {
  it.each([
    ['au mois', { contract_type: 'rent', rent_period: 'monthly' }],
    ['à vendre', { contract_type: 'sale', rent_period: null }],
  ])('bien %s : « Retour au bien » vers sa fiche, pas de barre du site', async (_nom, champs) => {
    bien(champs);
    const h = haut(await rendre({ property: 'appartement-mermoz-abc123' }));
    expect(h.nav).toBe('selon-le-chemin');
    expect(h.cale).toBe('selon-le-chemin');
    expect(h.enTete?.[1]).toBe('/properties/appartement-mermoz-abc123');
    expect(h.enTete?.[2]).toBe('bookings.tunnel.backToProperty');
  });

  it('séjour court : le tunnel tient l’écran, sans second en-tête', async () => {
    bien({ contract_type: 'rent', rent_period: 'daily' });
    const html = await rendre({ property: 'appartement-mermoz-abc123' });
    expect(html).toContain('data-tunnel');
    expect(haut(html).nav).toBe('selon-le-chemin');
    expect(html).not.toContain('data-en-tete-de-page');
  });

  it.each([
    ['aucun bien demandé', {}],
    ['un slug hors forme', { property: '..' }],
  ])('%s : la barre du site, sur la barre ET la cale', async (_nom, params) => {
    const html = await rendre(params as Record<string, string>);
    expect(haut(html).nav).toBe('barre-du-site');
    expect(haut(html).cale).toBe('barre-du-site');
    expect(html).not.toContain('data-en-tete-de-page');
  });
});
