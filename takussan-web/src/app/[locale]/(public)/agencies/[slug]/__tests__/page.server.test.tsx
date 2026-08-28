import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { AgencyDto, ResultatFicheAgence } from '@/lib/queries/public-agency';

import Page, { generateMetadata } from '../page';

/**
 * La fiche d'agence — **l'introuvable n'est pas l'indisponible** (TCK-438, AC1 et AC2).
 *
 * ## Le défaut, observé et non supposé
 *
 * `agencies/[slug]/page.tsx` faisait `try { … } catch { return null }` puis `notFound()` sur ce
 * `null`. Toute panne devenait donc « cette agence n'existe pas », **gravé dans le code HTTP**.
 *
 * Ce n'est pas resté théorique : le 2026-08-27, pendant la campagne de mesure de ce ticket, le
 * serveur d'API local s'est arrêté de lui-même. `/fr/agencies/dakar-immo` — une agence qui existe,
 * que l'API sert en 200 quand elle tourne — a rendu **404**, et une sonde posée dans le `catch` a
 * nommé le vrai coupable :
 *
 * ```
 * [SONDE-G9] [TypeError: fetch failed] { [cause]: connect ECONNREFUSED 127.0.0.1:8002 }
 * ```
 *
 * À la même seconde, la fiche de bien voisine rendait 200 « momentanément indisponible » : TCK-335
 * avait corrigé le défaut sur une fiche sur trois, et les deux autres l'ont porté jusqu'ici.
 *
 * ## Ce que ces tests ne peuvent pas faire, et qui le fait à leur place
 *
 * Le harnais du dépôt est vitest/jsdom : **aucun test ne peut lire un code HTTP**. Ces tests
 * gardent donc la DÉCISION (`notFound()` appelé, ou non, et sur quelle panne) ; le fait que cette
 * décision produise bien un 404 et non un soft-404 en 200 dépend d'une propriété structurelle du
 * routeur, gardée par `[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts` et
 * mesurée au `curl` — les deux relevés sont dans son docblock.
 */

const getAgencyMock = vi.fn<() => Promise<ResultatFicheAgence>>();
const notFoundMock = vi.fn(() => {
  // `notFound()` de Next ne rend pas : il lève. Le mock fait pareil, sinon le composant
  // continuerait après l'appel et le test verrait un arbre que la production ne produit jamais.
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next-intl/server', async () => {
  const fr = (await import('@/messages/fr.json')).default as Record<string, unknown>;
  const resous = (chemin: string): string => {
    const valeur = chemin.split('.').reduce<unknown>(
      (noeud, cle) =>
        noeud && typeof noeud === 'object' ? (noeud as Record<string, unknown>)[cle] : undefined,
      fr,
    );
    return typeof valeur === 'string' ? valeur : chemin;
  };
  return {
    getLocale: async () => 'fr',
    getTranslations: async (espace?: string) =>
      (cle: string, params?: Record<string, string | number>) => {
        const gabarit = resous(espace ? `${espace}.${cle}` : cle);
        if (!params) return gabarit;
        return gabarit.replace(/\{(\w+)\}/g, (_, nom: string) =>
          nom in params ? String(params[nom]) : `{${nom}}`,
        );
      },
  };
});

vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }));
vi.mock('@/lib/queries/public-agency', () => ({ getAgency: () => getAgencyMock() }));

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock('@/components/public/profile/PortfolioTabs', () => ({
  PortfolioTabs: () => <div data-testid="portefeuille" />,
}));
vi.mock('@/components/public/profile/ContactSheet', () => ({
  ContactSheet: () => <div data-testid="contact" />,
}));
vi.mock('@/components/public/profile/TeamStrip', () => ({
  TeamStrip: () => <div data-testid="equipe" />,
}));
vi.mock('@/components/public/profile/StatsBar', () => ({ StatsBar: () => <div /> }));
vi.mock('@/components/public/profile/ReviewsSection', () => ({
  ReviewsSection: () => <div data-testid="avis" />,
}));

function agence(overrides: Partial<AgencyDto> = {}): AgencyDto {
  return {
    id: 3,
    slug: 'dakar-immo',
    name: 'Dakar Immo',
    description: 'Agence généraliste à Dakar.',
    license_number: 'SN-2026-0042',
    email: 'contact@dakar-immo.sn',
    phone: '+221 33 000 00 00',
    city: 'Dakar',
    logo_url: null,
    agents: [],
    portfolio_count: 12,
    portfolio_total: 12,
    portfolio: [],
    stats: { rent_count: 7, sale_count: 5, cities: 2, agents: 4 },
    ...overrides,
  };
}

const params = () => Promise.resolve({ slug: 'dakar-immo' });

describe("fiche d'agence — l'introuvable et l'indisponible", () => {
  beforeEach(() => {
    getAgencyMock.mockReset();
    notFoundMock.mockClear();
  });

  it('AC1 — un 404 amont produit un `notFound()`, dans la page ET dans les métadonnées', async () => {
    getAgencyMock.mockResolvedValue({ etat: 'introuvable' });

    await expect(Page({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);

    // ⚠ L'appel dans `generateMetadata` n'est pas une redondance décorative : il est attendu AVANT
    // que la coque ne parte, là où celui du corps de page dépend de ce que rien n'ait été écrit.
    // C'est la forme dont TCK-335 a mesuré, par ablation, qu'elle valait 404 contre 200.
    await expect(generateMetadata({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(2);
  });

  it("AC2 — une API injoignable rend l'indisponibilité, JAMAIS « agence introuvable »", async () => {
    getAgencyMock.mockResolvedValue({ etat: 'indisponible' });

    render(await Page({ params: params() }));

    expect(screen.getByText('Agence momentanément indisponible')).toBeInTheDocument();
    expect(screen.queryByText('Agence introuvable')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // La panne n'accuse pas l'agence : aucun `notFound()`, donc aucun 404.
    expect(notFoundMock).not.toHaveBeenCalled();
    // L'écran appartient au site : il garde sa chrome et son chemin de retour.
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it("AC2 — l'indisponibilité se retire de l'index (`robots: { index: false }`)", async () => {
    getAgencyMock.mockResolvedValue({ etat: 'indisponible' });

    const meta = await generateMetadata({ params: params() });

    expect(meta.robots).toEqual({ index: false });
    expect(meta.title).toBe('Agence momentanément indisponible');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("l'agence trouvée est rendue par le serveur, sans état d'erreur", async () => {
    getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: agence() });

    render(await Page({ params: params() }));

    expect(screen.getByRole('heading', { level: 1, name: 'Dakar Immo' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("les métadonnées d'une agence trouvée ne se retirent PAS de l'index", async () => {
    // Non-vacuité : sans cette assertion, un `robots: { index: false }` posé sur TOUS les cas
    // ferait passer le test d'AC2 tout en désindexant le catalogue entier.
    getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: agence() });

    const meta = await generateMetadata({ params: params() });

    expect(meta.robots).toBeUndefined();
    expect(meta.title).toContain('Dakar Immo');
  });
});
