/**
 * TCK-2568 — le BRANCHEMENT de la surcharge `auTelephone` dans les pages serveur de la fiche.
 *
 * La règle d'après le chemin (`enTeteAuTelephone`) ôte la barre du site à `/properties/<slug>` au
 * téléphone : la fiche servie a son retour sur la photo. Mais trois états vivent sous ce même chemin
 * sans photo ni retour — le bien retiré, la panne de l'API, la fiche inconnue. Chacun doit déclarer
 * son haut, à la barre ET à sa cale (sinon les deux divergent). La mécanique de la surcharge est
 * gardée par `Navbar.en-tete-au-telephone.test.tsx` ; ce fichier garde que les pages l'appellent.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { PropertyDetail } from '@/types/property';
import type { EtatPublicDuBien, ResultatFichePublique } from '@/lib/queries/public-property';
import { withIntl } from '@/test/intl';

const getPropertyMock = vi.fn<() => Promise<ResultatFichePublique>>();
const getEtatDuBienMock = vi.fn<() => Promise<EtatPublicDuBien | null>>();

vi.mock('next-intl/server', async () => {
  const fr = (await import('@/messages/fr.json')).default as Record<string, unknown>;
  const resous = (chemin: string): string => {
    const valeur = chemin.split('.').reduce<unknown>(
      (noeud, cle) => (noeud && typeof noeud === 'object' ? (noeud as Record<string, unknown>)[cle] : undefined),
      fr,
    );
    return typeof valeur === 'string' ? valeur : chemin;
  };
  return {
    getLocale: async () => 'fr',
    getTranslations: async (espace?: string) => (cle: string) => resous(espace ? `${espace}.${cle}` : cle),
  };
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => '/fr/properties/villa',
}));

vi.mock('@/lib/queries/public-property', () => ({
  getProperty: () => getPropertyMock(),
  getEtatDuBien: () => getEtatDuBienMock(),
  getBiensSimilaires: async () => null,
}));
vi.mock('@/components/property/PropertyCard', () => ({ PropertyCard: () => <article /> }));
vi.mock('@/components/shared/LienLocalise', () => ({
  LienLocalise: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={`/fr${href}`}>{children}</a>,
}));
vi.mock('../components/CompteurDeVue', () => ({ CompteurDeVue: () => null }));
vi.mock('../PropertyDetailContent', () => ({
  PropertyDetailContent: ({ property }: { property: PropertyDetail }) => <h1>{property.title}</h1>,
}));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer /> }));
// La barre et sa cale rendent la surcharge qu'elles reçoivent : c'est elle qu'on juge.
vi.mock('@/components/home/Navbar', () => ({
  Navbar: ({ auTelephone }: { auTelephone?: string }) => <nav data-testid="navbar" data-au-telephone={auTelephone ?? 'selon-le-chemin'} />,
}));
vi.mock('@/components/navigation-publique/BarreDOngletsPublique', () => ({
  BarreDOngletsPublique: ({ presente }: { presente?: boolean }) => <div data-testid="barre-onglets" data-presente={String(presente === true)} />,
}));
vi.mock('@/components/home/NavbarSpacer', () => ({
  NavbarSpacer: ({ auTelephone }: { auTelephone?: string } = {}) => (
    <div data-testid="cale" data-au-telephone={auTelephone ?? 'selon-le-chemin'} />
  ),
}));

const { default: Page } = await import('../page');
const { default: NotFound } = await import('../not-found');

const params = () => Promise.resolve({ slug: 'villa' });

function surcharges(): [string | null, string | null] {
  return [
    screen.getByTestId('navbar').getAttribute('data-au-telephone'),
    screen.getByTestId('cale').getAttribute('data-au-telephone'),
  ];
}

const bien = { id: 7, slug: 'villa', title: 'Villa', location: { city: null, quarter: null } } as unknown as PropertyDetail;

describe('fiche — le haut de l’écran au téléphone, branché par la page (TCK-2568)', () => {
  beforeEach(() => {
    getPropertyMock.mockReset();
    getEtatDuBienMock.mockReset();
    getEtatDuBienMock.mockResolvedValue(null);
  });

  it('la fiche servie suit le chemin (pas de barre au téléphone : son retour est sur la photo)', async () => {
    getPropertyMock.mockResolvedValue({ etat: 'trouve', bien });
    render(await Page({ params: params() }));
    expect(surcharges()).toEqual(['selon-le-chemin', 'selon-le-chemin']);
  });

  it('un bien retiré garde la barre du site — sur la barre ET sur la cale', async () => {
    getPropertyMock.mockResolvedValue({ etat: 'introuvable' });
    getEtatDuBienMock.mockResolvedValue({
      state: 'rented',
      contract_type: 'rent',
      type: 'apartment',
      location: { city: 'Dakar', quarter: 'Mermoz' },
      similar: [],
    } as EtatPublicDuBien);
    render(await Page({ params: params() }));
    expect(screen.getByRole('heading', { level: 1, name: 'Ce bien a été loué' })).toBeInTheDocument();
    expect(surcharges()).toEqual(['barre-du-site', 'barre-du-site']);
    // Et la barre d'onglets, que le chemin d'une fiche n'a pas : la page la déclare.
    expect(screen.getByTestId('barre-onglets').getAttribute('data-presente')).toBe('true');
  });

  it('la fiche servie ne monte pas de barre d’onglets (sa barre d’actions tient le bas)', async () => {
    getPropertyMock.mockResolvedValue({ etat: 'trouve', bien });
    render(await Page({ params: params() }));
    expect(screen.queryByTestId('barre-onglets')).toBeNull();
  });

  it('une fiche indisponible (panne de l’API) ouvre sur la barre de marque, comme « Erreur serveur »', async () => {
    getPropertyMock.mockResolvedValue({ etat: 'indisponible' });
    render(await Page({ params: params() }));
    expect(surcharges()).toEqual(['marque', 'marque']);
    expect(screen.queryByTestId('barre-onglets')).toBeNull();
  });

  it('la fiche inconnue (404) ouvre sur la barre de marque', () => {
    render(withIntl(<NotFound />));
    expect(surcharges()).toEqual(['marque', 'marque']);
  });
});
