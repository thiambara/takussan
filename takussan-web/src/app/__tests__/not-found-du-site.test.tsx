import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import NotFound from '../not-found';

/**
 * Le 404 du site (TCK-438, AC4).
 *
 * ## Ce que ce fichier NE garde pas, et pourquoi il faut le dire
 *
 * Il ne garde pas que cet écran soit celui qu'une URL inconnue atteint : sous jsdom, aucun routeur
 * ne tourne. Cette moitié-là a été mesurée à la main, `next dev` 16.3.1, serveur neuf, un marqueur
 * distinct par emplacement candidat — le relevé complet est dans le docblock de `../not-found.tsx`.
 * Son résultat tient en une ligne : **une URL qui ne correspond à aucune route ne descend dans
 * aucun segment**, donc ni `[locale]/(public)/not-found.tsx` ni `[locale]/not-found.tsx` n'auraient
 * jamais été vus. C'est ce qui fixe l'emplacement racine, et c'est aussi pourquoi le test ci-dessous
 * importe `../not-found` et pas un autre.
 *
 * Ce qu'il garde, en revanche, est ce que l'AC4 énonce et qu'aucune mesure manuelle ne reverra à
 * chaque commit : l'écran appartient au site, il dit ce qui s'est passé, et il rend la main.
 */
describe('404 du site', () => {
  it("annonce l'erreur dans un <h1> et rend un chemin de retour vers le catalogue", () => {
    render(withIntl(<NotFound />));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Cette page n'existe pas");

    const versCatalogue = screen.getByRole('link', { name: 'Voir les annonces' });
    // ⚠ `/fr/properties` et non `/properties` : sur la surface publique la langue est un segment
    // d'URL (ADR-0026), et `LienLocalise` la pose. Un lien nu partirait en 307 par le proxy — donc
    // fonctionnerait, ce qui est exactement pourquoi l'assertion porte sur le chemin final.
    expect(versCatalogue).toHaveAttribute('href', '/fr/properties');

    expect(screen.getByRole('link', { name: "Retour à l'accueil" })).toHaveAttribute('href', '/fr');
  });

  it('porte la chrome du site — un en-tête de marque et un pied de page', () => {
    render(withIntl(<NotFound />));

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Takussan' })).toBeInTheDocument();
  });

  it('rend dans la langue active, et pas seulement en français', () => {
    // Non-vacuité de l'AC4 « dans la langue active » : sans ce cas, un écran écrit en dur en
    // français passerait les deux tests précédents.
    render(withIntl(<NotFound />, 'en'));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This page does not exist');
    expect(screen.getByRole('link', { name: 'Browse listings' })).toHaveAttribute(
      'href',
      '/en/properties',
    );
  });
});
