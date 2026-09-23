import { describe, expect, it } from 'vitest';
import type { PropertyMapFeature } from '@/lib/queries/properties';
import {
  RAYON_DE_REGROUPEMENT_PX,
  ZOOM_MAX_DE_LA_CARTE,
  biensDeLaGrappe,
  elementsDeCarte,
  indexerLesBiens,
  zoomQuiSepare,
} from '../regroupement';

/**
 * TCK-553 — M1 : 129 étiquettes de prix empilées sans regroupement, 573 paires qui se chevauchent
 * à 390 × 844 (relevé du ticket). Ce fichier garde la moitié du défaut qui se teste sans Leaflet :
 * CE QUE la carte doit poser pour un jeu de points, une emprise et un zoom.
 */

function bien(id: number, lat: number, lng: number): PropertyMapFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id,
      slug: `bien-${id}`,
      title: `Bien ${id}`,
      price: 150000 + id,
      currency: 'XOF',
      type: 'apartment',
      contract_type: 'rent',
      thumbnail: null,
    },
  };
}

/** Générateur déterministe : un test aléatoire qui rougit doit rougir à chaque exécution. */
function pseudoAleatoire(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Un nuage de `n` biens dans un carré de `cote` degrés autour de Dakar. */
function nuage(n: number, cote: number, graine = 42): PropertyMapFeature[] {
  const alea = pseudoAleatoire(graine);
  return Array.from({ length: n }, (_, i) =>
    bien(i + 1, 14.69 + (alea() - 0.5) * cote, -17.45 + (alea() - 0.5) * cote),
  );
}

/** L'emprise du Sénégal entier — tout est dedans. */
const SENEGAL: [number, number, number, number] = [-18, 12, -11, 17];

/** La projection de Leaflet (EPSG:3857, tuiles de 256 px), en pixels au zoom `z`. */
function versPixels(lat: number, lng: number, z: number) {
  const echelle = 256 * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (echelle * (lng + 180)) / 360,
    y: echelle * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
  };
}

/** La boîte d'une étiquette de prix — `iconSize: [60, 28]`, ancrée en bas au centre (TCK-162). */
const LARGEUR_ETIQUETTE = 60;
const HAUTEUR_ETIQUETTE = 28;

describe('TCK-553 — le regroupement des biens sur la carte', () => {
  it('au-delà du seuil : un nuage dense rend MOINS d’éléments que de biens, et les grappes portent le reste', () => {
    const biens = nuage(129, 0.08);
    const index = indexerLesBiens(biens);

    const elements = elementsDeCarte(index, SENEGAL, 12);
    const grappes = elements.filter((e) => e.genre === 'grappe');
    const isoles = elements.filter((e) => e.genre === 'bien');

    expect(elements.length).toBeLessThan(biens.length);
    expect(grappes.length).toBeGreaterThan(0);
    // Aucun bien n'est perdu : ce que les grappes comptent plus les isolés, c'est tout.
    const comptes = grappes.reduce((s, g) => s + (g.genre === 'grappe' ? g.nombre : 0), 0);
    expect(comptes + isoles.length).toBe(biens.length);
  });

  it('en deçà : des biens assez éloignés restent des étiquettes de prix, sans grappe', () => {
    const biens = [bien(1, 14.6, -17.5), bien(2, 14.75, -17.3), bien(3, 14.9, -17.1)];
    const elements = elementsDeCarte(indexerLesBiens(biens), SENEGAL, 12);

    expect(elements.map((e) => e.genre)).toEqual(['bien', 'bien', 'bien']);
    expect(elements.map((e) => (e.genre === 'bien' ? e.feature.properties.id : 0)).sort()).toEqual([1, 2, 3]);
  });

  it('le seuil est une distance À L’ÉCRAN : deux biens voisins, regroupés de loin, se séparent de près', () => {
    // Deux biens à ~110 m l'un de l'autre : ensemble à l'échelle d'une ville, séparés à celle d'une rue.
    const biens = [bien(1, 14.69, -17.45), bien(2, 14.691, -17.45)];
    const index = indexerLesBiens(biens);

    expect(elementsDeCarte(index, SENEGAL, 12).map((e) => e.genre)).toEqual(['grappe']);
    expect(elementsDeCarte(index, SENEGAL, 18).map((e) => e.genre)).toEqual(['bien', 'bien']);
  });

  it('AC1 — aucune paire d’étiquettes ISOLÉES ne se chevauche, à aucun zoom', () => {
    // Le rayon doit couvrir la diagonale de la boîte : en deçà, deux isolés peuvent se toucher.
    expect(RAYON_DE_REGROUPEMENT_PX).toBeGreaterThanOrEqual(
      Math.hypot(LARGEUR_ETIQUETTE, HAUTEUR_ETIQUETTE),
    );

    const biens = [...nuage(300, 0.3, 7), ...nuage(200, 0.04, 11)];
    const index = indexerLesBiens(biens);

    // Les paires fautives sont COLLECTÉES, puis affirmées une fois : un `expect` par paire coûtait
    // un million d'appels et dépassait le plafond de 20 s sous charge.
    const fautives: string[] = [];
    for (let z = 8; z <= ZOOM_MAX_DE_LA_CARTE; z++) {
      const isoles = elementsDeCarte(index, SENEGAL, z).flatMap((e) =>
        e.genre === 'bien'
          ? [versPixels(e.feature.geometry.coordinates[1], e.feature.geometry.coordinates[0], z)]
          : [],
      );
      for (let i = 0; i < isoles.length; i++) {
        for (let j = i + 1; j < isoles.length; j++) {
          if (
            Math.abs(isoles[i].x - isoles[j].x) < LARGEUR_ETIQUETTE &&
            Math.abs(isoles[i].y - isoles[j].y) < HAUTEUR_ETIQUETTE
          ) {
            fautives.push(`zoom ${z} : ${i}×${j}`);
          }
        }
      }
    }
    expect(fautives, 'des étiquettes isolées se chevauchent').toEqual([]);
  });

  it('des biens au MÊME endroit restent une grappe au zoom maximal — que le tap ouvre en liste', () => {
    // Trois appartements d'un même immeuble : des coordonnées identiques, ce qu'aucun zoom ne sépare.
    const biens = [bien(1, 14.7, -17.46), bien(2, 14.7, -17.46), bien(3, 14.7, -17.46), bien(4, 14.8, -17.3)];
    const index = indexerLesBiens(biens);

    const elements = elementsDeCarte(index, SENEGAL, ZOOM_MAX_DE_LA_CARTE);
    const grappe = elements.find((e) => e.genre === 'grappe');
    expect(grappe).toBeDefined();
    if (grappe?.genre !== 'grappe') return;

    expect(grappe.nombre).toBe(3);
    expect(zoomQuiSepare(index, grappe.id)).toBeNull();
    expect(biensDeLaGrappe(index, grappe.id).map((f) => f.properties.id).sort()).toEqual([1, 2, 3]);
  });

  it('AC2 — le zoom d’un tap sur une grappe la SÉPARE, et ne dépasse jamais le zoom de la carte', () => {
    const biens = nuage(129, 0.08);
    const index = indexerLesBiens(biens);
    const zoomInitial = 12;

    for (const grappe of elementsDeCarte(index, SENEGAL, zoomInitial)) {
      if (grappe.genre !== 'grappe') continue;
      const cible = zoomQuiSepare(index, grappe.id);
      expect(cible, `grappe de ${grappe.nombre} : aucun zoom ne la sépare`).not.toBeNull();
      if (cible === null) continue;

      expect(cible).toBeGreaterThan(zoomInitial);
      expect(cible).toBeLessThanOrEqual(ZOOM_MAX_DE_LA_CARTE);
      // À ce zoom, la grappe n'existe plus d'un seul tenant : ses biens se répartissent en PLUSIEURS
      // éléments.
      const ids = new Set(index.getLeaves(grappe.id, Infinity).map((f) => f.properties.id));
      const apres = elementsDeCarte(index, SENEGAL, cible).filter((e) =>
        e.genre === 'bien'
          ? ids.has(e.feature.properties.id)
          : index.getLeaves(e.id, Infinity).some((f) => ids.has(f.properties.id)),
      );
      expect(apres.length, `grappe de ${grappe.nombre} au zoom ${cible}`).toBeGreaterThan(1);
    }
  });

  it('un jeu vide ne pose rien', () => {
    expect(elementsDeCarte(indexerLesBiens([]), SENEGAL, 12)).toEqual([]);
  });
});
