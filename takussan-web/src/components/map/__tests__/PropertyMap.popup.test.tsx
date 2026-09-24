import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import L from 'leaflet';
import { withIntl } from '@/test/intl';
import { formatPrice } from '@/lib/utils';
import type { PropertyMapFeature, PropertyMapResponse } from '@/lib/queries/properties';

/**
 * TCK-562 (W2) — un aperçu ouvert sur la carte ne se referme pas tout seul.
 *
 * Retour testeur du 2026-09-23 : « quand tu cliques sur un point ça ouvre un petit popup de
 * détails mais il se referme automatiquement ». Le correctif du 2026-09-16 (`keepPreviousData`,
 * `usePropertyMapQuery`) avait fermé une première cause : les marqueurs démontés pendant le
 * rechargement. Le regroupement de TCK-553 en ouvre deux autres, et toutes deux passent par le
 * même chemin : ouvrir un aperçu DÉPLACE la vue (`autoPan` de Leaflet) → nouvelles bornes →
 * nouvelle réponse de `/map` → nouvel index → le marqueur qui porte l'aperçu est démonté, et
 * Leaflet ferme l'aperçu d'un marqueur retiré.
 *
 *   1. Une grappe ouverte en LISTE change de clé : `supercluster` numérote ses grappes à partir du
 *      NOMBRE de points indexés (`(i << 5) + (zoom + 1) + numPoints`). Un seul bien de plus dans
 *      la nouvelle réponse, et la clé React `grappe-<id>` n'est plus la même.
 *   2. Un bien isolé est ABSORBÉ par une grappe quand la nouvelle réponse apporte un voisin qui
 *      était juste hors de la vue — et c'est précisément le cas d'un bien au bord, celui dont
 *      l'aperçu fait bouger la carte.
 *
 * Ici, le « rechargement » est simulé en changeant la réponse et en re-rendant : c'est ce que fait
 * `usePropertyMapQuery` quand la nouvelle réponse arrive.
 */

let reponse: PropertyMapResponse | undefined;
vi.mock('@/lib/queries/properties', async () => {
  const reel = await vi.importActual<typeof import('@/lib/queries/properties')>('@/lib/queries/properties');
  return {
    ...reel,
    usePropertyMapQuery: () => ({ data: reponse, isFetching: false }),
  };
});

import { PropertyMap } from '../PropertyMap';

function bien(id: number, lat: number, lng: number): PropertyMapFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id,
      slug: `bien-${id}`,
      title: `Bien ${id}`,
      price: 250000 + id,
      currency: 'XOF',
      type: 'apartment',
      contract_type: 'rent',
      thumbnail: null,
    },
  };
}

function collection(features: PropertyMapFeature[]): PropertyMapResponse {
  return {
    type: 'FeatureCollection',
    features,
    meta: { limit: 500, returned: features.length, truncated: false },
  };
}

const descripteurs = {
  w: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  h: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
};
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 773 });
});
afterAll(() => {
  if (descripteurs.w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', descripteurs.w);
  if (descripteurs.h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', descripteurs.h);
});
beforeEach(() => {
  reponse = undefined;
});

/** Un tap sur une icône de Leaflet : Leaflet écoute le clic sur le conteneur de la carte. */
const taper = (icone: Element) => fireEvent.click(icone);

const popupOuvert = (container: HTMLElement) => container.querySelector('.leaflet-popup') as HTMLElement | null;

/** Quatre appartements d'un même immeuble, et un bien au loin. */
const IMMEUBLE = [
  bien(1, 14.7, -17.46),
  bien(2, 14.7, -17.46),
  bien(3, 14.7, -17.46),
  bien(4, 14.7, -17.46),
  bien(5, 14.75, -17.35),
];

async function ouvrirLaListe(container: HTMLElement) {
  const [bouton] = await screen.findAllByRole('button', { name: '4 biens tout proches — voir la liste' });
  taper(bouton.closest('.leaflet-marker-icon')!);
  return waitFor(() => {
    const p = popupOuvert(container);
    expect(p).not.toBeNull();
    return p!;
  });
}

async function ouvrirLeBien(container: HTMLElement, id: number) {
  const bouton = await waitFor(() => {
    const libelle = formatPrice(250000 + id, 'XOF');
    const b = [...container.querySelectorAll('.takussan-price-marker')].find(
      (m) => m.querySelector('button')?.getAttribute('aria-label') === libelle,
    );
    expect(b).toBeDefined();
    return b!;
  });
  taper(bouton);
  return waitFor(() => {
    const p = popupOuvert(container);
    expect(p).not.toBeNull();
    return p!;
  });
}

describe('TCK-562 (W2) — un aperçu ouvert survit au rechargement de la carte', () => {
  it('la LISTE d’une grappe reste ouverte quand la réponse suivante compte un bien de plus', async () => {
    reponse = collection(IMMEUBLE);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    await ouvrirLaListe(container);

    // La vue a bougé, `/map` répond pour les nouvelles bornes : les mêmes biens, plus un sixième.
    reponse = collection([...IMMEUBLE, bien(6, 14.62, -17.5)]);
    act(() => rerender(withIntl(<PropertyMap />)));

    const popup = popupOuvert(container);
    expect(popup).not.toBeNull();
    expect(within(popup!).getAllByRole('link')).toHaveLength(4);
    // La liste épinglée est RETIRÉE de l'index, pas seulement ajoutée par-dessus : sans quoi elle
    // serait posée deux fois — une fois par le regroupement, une fois par l'épingle, sous la même
    // clé `liste-1`. Posés : la liste une seule fois, et les deux biens au loin chacun une fois.
    // (Compté sur les icônes : Leaflet donne aussi `role="button"` au conteneur de chaque icône.)
    const listes = [...container.querySelectorAll('.takussan-cluster-marker')];
    expect(listes).toHaveLength(1);
    expect(listes[0].querySelector('button')?.getAttribute('aria-label')).toBe('4 biens tout proches — voir la liste');
    expect(container.querySelectorAll('.takussan-price-marker')).toHaveLength(2);
  });

  it('l’aperçu d’un bien reste ouvert quand la réponse suivante lui apporte un voisin qui le regrouperait', async () => {
    const seul = bien(10, 14.7, -17.46);
    const loin = bien(11, 14.75, -17.35);
    reponse = collection([seul, loin]);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    const avant = await ouvrirLeBien(container, 10);
    expect(within(avant).getByText('Bien 10')).toBeInTheDocument();

    // Le voisin était juste hors de la vue : l'autoPan l'y fait entrer, et le regroupement
    // l'aurait fondu avec le bien ouvert dans une grappe de 2.
    reponse = collection([seul, loin, bien(12, 14.70001, -17.46001)]);
    act(() => rerender(withIntl(<PropertyMap />)));

    const popup = popupOuvert(container);
    expect(popup).not.toBeNull();
    expect(within(popup!).getByText('Bien 10')).toBeInTheDocument();
  });

  it('l’aperçu reste ouvert même si la réponse suivante ne contient plus le bien', async () => {
    // Une réponse plafonnée (`truncated`) ou des bornes qui l'écartent : le bien affiché ne
    // disparaît pas sous le doigt tant que son aperçu est ouvert.
    const seul = bien(20, 14.7, -17.46);
    const loin = bien(21, 14.75, -17.35);
    reponse = collection([seul, loin]);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    await ouvrirLeBien(container, 20);

    reponse = collection([loin]);
    act(() => rerender(withIntl(<PropertyMap />)));

    const popup = popupOuvert(container);
    expect(popup).not.toBeNull();
    expect(within(popup!).getByText('Bien 20')).toBeInTheDocument();
  });

  it('fermé, l’aperçu rend le bien au regroupement : les comptes redeviennent justes', async () => {
    const seul = bien(30, 14.7, -17.46);
    const loin = bien(31, 14.75, -17.35);
    reponse = collection([seul, loin]);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    const popup = await ouvrirLeBien(container, 30);

    reponse = collection([seul, loin, bien(32, 14.70001, -17.46001)]);
    act(() => rerender(withIntl(<PropertyMap />)));
    // Tant que l'aperçu est ouvert : le bien 30 reste posé seul, son voisin aussi.
    expect(container.querySelectorAll('.takussan-cluster-marker')).toHaveLength(0);

    fireEvent.click(popup.querySelector('.leaflet-popup-close-button')!);

    await waitFor(() => expect(popupOuvert(container)).toBeNull());
    // Fermé : les deux voisins redeviennent UNE grappe de 2 — plus aucun bien posé en double.
    await waitFor(() => {
      const grappes = [...container.querySelectorAll('.takussan-cluster-marker')].map((g) => g.textContent?.trim());
      expect(grappes).toEqual(['2']);
    });
    expect(container.querySelectorAll('.takussan-price-marker')).toHaveLength(1);
  });

  it('un rendu qui ne change rien au bien ouvert ne relance pas le recadrage de son aperçu', async () => {
    // Mesuré au navigateur (Chrome, jeu contrôlé), code NON compilé — celui que cette suite
    // exerce ; le React Compiler du build le masque, il ne le corrige pas : le marqueur épinglé recevait
    // à CHAQUE rendu une position neuve (`[lat, lng]` littéral), donc un `setLatLng()`, qui relance
    // l'`autoPan` de l'aperçu (`_movePopup` → `_adjustPan`) et ARRÊTE l'animation en cours —
    // `moveend` → nouvelles bornes → nouveau rendu → nouveau `setLatLng`. 14 413 `panBy` et 187
    // requêtes `/map` en cinq secondes pour un seul aperçu ouvert. Le contenu de l'aperçu, neuf à
    // chaque rendu, y ajoutait un `popup.update()` (react-leaflet le rappelle quand il change).
    const seul = bien(40, 14.7, -17.46);
    const loin = bien(41, 14.75, -17.35);
    reponse = collection([seul, loin]);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    await ouvrirLeBien(container, 40);

    const proto = L.Popup.prototype as unknown as { _adjustPan: () => void };
    const recadrage = vi.spyOn(proto, '_adjustPan');
    try {
      // La réponse suivante : les MÊMES biens, en objets neufs — ce que rend chaque requête.
      reponse = collection([bien(40, 14.7, -17.46), bien(41, 14.75, -17.35)]);
      act(() => rerender(withIntl(<PropertyMap />)));
      act(() => rerender(withIntl(<PropertyMap />)));

      expect(popupOuvert(container)).not.toBeNull();
      expect(recadrage).not.toHaveBeenCalled();
    } finally {
      recadrage.mockRestore();
    }
  });

  it('un rendu qui ne change rien au bien ouvert garde son étiquette de prix — et le focus qu’elle porte', async () => {
    // react-leaflet appelle `marker.setIcon()` dès que l'icône change d'IDENTITÉ, et `setIcon`
    // réécrit le HTML de l'icône (`DivIcon.createIcon` garde le `div`, remplace son `innerHTML`) :
    // le bouton qu'un clavier ou un lecteur d'écran venait de focaliser serait détruit à chaque
    // réponse de `/map`, le focus renvoyé au `body`.
    const seul = bien(50, 14.7, -17.46);
    const loin = bien(51, 14.75, -17.35);
    reponse = collection([seul, loin]);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    await ouvrirLeBien(container, 50);

    const libelle = formatPrice(250050, 'XOF');
    const etiquette = () =>
      [...container.querySelectorAll('.takussan-price-marker')].find(
        (m) => m.querySelector('button')?.getAttribute('aria-label') === libelle,
      );
    const bouton = etiquette()!.querySelector('button')!;
    bouton.focus();
    expect(document.activeElement).toBe(bouton);

    const changementDIcone = vi.spyOn(L.Marker.prototype, 'setIcon');
    try {
      reponse = collection([bien(50, 14.7, -17.46), bien(51, 14.75, -17.35)]);
      act(() => rerender(withIntl(<PropertyMap />)));
      act(() => rerender(withIntl(<PropertyMap />)));

      expect(changementDIcone).not.toHaveBeenCalled();
      expect(etiquette()?.querySelector('button')).toBe(bouton);
      expect(document.activeElement).toBe(bouton);
    } finally {
      changementDIcone.mockRestore();
    }
  });

  it('un rendu qui ne change rien à la liste ouverte ne la redessine ni ne la recadre', async () => {
    // Même mécanisme que pour un bien, côté liste : un contenu d'aperçu neuf à chaque rendu fait
    // rappeler `popup.update()` par react-leaflet (effet sur `children`), donc `_adjustPan` — le
    // recadrage qui arrête l'animation en cours ; une icône neuve, `setIcon()`.
    reponse = collection(IMMEUBLE);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    await ouvrirLaListe(container);

    const proto = L.Popup.prototype as unknown as { update: () => void; _adjustPan: () => void };
    const redessin = vi.spyOn(proto, 'update');
    const recadrage = vi.spyOn(proto, '_adjustPan');
    const changementDIcone = vi.spyOn(L.Marker.prototype, 'setIcon');
    try {
      reponse = collection(IMMEUBLE.map((f) => bien(f.properties.id, f.geometry.coordinates[1], f.geometry.coordinates[0])));
      act(() => rerender(withIntl(<PropertyMap />)));
      act(() => rerender(withIntl(<PropertyMap />)));

      expect(popupOuvert(container)).not.toBeNull();
      expect(redessin).not.toHaveBeenCalled();
      expect(recadrage).not.toHaveBeenCalled();
      expect(changementDIcone).not.toHaveBeenCalled();
    } finally {
      redessin.mockRestore();
      recadrage.mockRestore();
      changementDIcone.mockRestore();
    }
  });

  it('fermée, la LISTE retourne au regroupement : elle suit les réponses suivantes comme toute grappe', async () => {
    // Pendant de l'AC4 côté liste. Une liste dont la fermeture ne lèverait pas l'épingle resterait
    // posée telle qu'à son ouverture jusqu'au PROCHAIN aperçu ouvert : hors des grappes d'un zoom
    // arrière, à côté d'un nouveau bien du même immeuble, et affichée après un filtre qui l'exclut.
    reponse = collection(IMMEUBLE);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    const popup = await ouvrirLaListe(container);

    // Ouverte : un cinquième appartement du même immeuble arrive, la liste épinglée n'en veut pas.
    const cinquieme = bien(7, 14.7, -17.46);
    reponse = collection([...IMMEUBLE, cinquieme]);
    act(() => rerender(withIntl(<PropertyMap />)));
    expect(within(popup).getAllByRole('link')).toHaveLength(4);

    fireEvent.click(popup.querySelector('.leaflet-popup-close-button')!);
    await waitFor(() => expect(popupOuvert(container)).toBeNull());

    // Fermée : l'immeuble redevient UNE liste de cinq — plus d'étiquette de prix posée à côté.
    await waitFor(() => {
      const listes = [...container.querySelectorAll('.takussan-cluster-marker')];
      expect(listes.map((l) => l.querySelector('button')?.getAttribute('aria-label'))).toEqual([
        '5 biens tout proches — voir la liste',
      ]);
    });
    expect(container.querySelectorAll('.takussan-price-marker')).toHaveLength(1);

    // Et un filtre qui exclut l'immeuble la retire, comme n'importe quel élément de la réponse.
    reponse = collection([bien(5, 14.75, -17.35)]);
    act(() => rerender(withIntl(<PropertyMap />)));
    expect(container.querySelectorAll('.takussan-cluster-marker')).toHaveLength(0);
    expect(container.querySelectorAll('.takussan-price-marker')).toHaveLength(1);
  });

  it('deux immeubles de même taille : deux listes distinctes, chacune ouvre la sienne, et la sienne survit au rechargement', async () => {
    // La clé d'une liste dérive de ses biens (et non de l'identifiant de `supercluster`, qui change
    // à chaque index) : l'AC1 en éprouve la STABILITÉ, celui-ci l'UNICITÉ. Deux immeubles de quatre
    // appartements dans la vue, c'est le cas ordinaire d'un quartier ; une clé qui ne dirait que la
    // taille (`liste-4`) les confondrait, et l'aperçu de l'un deviendrait inatteignable.
    const immeubleA = [1, 2, 3, 4].map((id) => bien(id, 14.7, -17.46));
    const immeubleB = [11, 12, 13, 14].map((id) => bien(id, 14.75, -17.35));
    // Le titre se cherche comme texte EXACT d'un élément : « Bien 1 » est un préfixe de « Bien 11 ».
    const porte = (p: HTMLElement, id: number) => within(p).queryByText(`Bien ${id}`) !== null;
    const contient = (p: HTMLElement, ids: number[]) => ids.every((id) => porte(p, id));

    reponse = collection([...immeubleA, ...immeubleB]);
    const { container, rerender } = render(withIntl(<PropertyMap />));
    const icones = await waitFor(() => {
      const i = [...container.querySelectorAll('.takussan-cluster-marker')];
      expect(i).toHaveLength(2);
      return i;
    });

    // Chaque icône ouvre SA liste : les deux aperçus, ensemble, couvrent les deux immeubles.
    const ouvertes: string[] = [];
    for (const icone of icones) {
      taper(icone.closest('.leaflet-marker-icon')!);
      const p = await waitFor(() => {
        const q = popupOuvert(container);
        expect(q).not.toBeNull();
        return q!;
      });
      expect(within(p).getAllByRole('link')).toHaveLength(4);
      ouvertes.push(contient(p, [1, 2, 3, 4]) ? 'A' : contient(p, [11, 12, 13, 14]) ? 'B' : '?');
      fireEvent.click(p.querySelector('.leaflet-popup-close-button')!);
      await waitFor(() => expect(popupOuvert(container)).toBeNull());
    }
    expect(ouvertes.sort()).toEqual(['A', 'B']);

    // L'aperçu de A reste celui de A quand la réponse suivante apporte un bien de plus — et B reste
    // posée à côté, à sa place.
    const iconeA = icones[ouvertes.indexOf('A')];
    const position = (i: Element) => {
      const e = i.closest('.leaflet-marker-icon') as HTMLElement;
      return `${e.style.left}|${e.style.top}|${e.style.transform}`;
    };
    const positionsAvant = new Set(icones.map(position));
    taper(iconeA.closest('.leaflet-marker-icon')!);
    await waitFor(() => expect(contient(popupOuvert(container)!, [1, 2, 3, 4])).toBe(true));

    reponse = collection([...immeubleA, ...immeubleB, bien(99, 14.62, -17.5)]);
    act(() => rerender(withIntl(<PropertyMap />)));

    const popup = popupOuvert(container);
    expect(popup).not.toBeNull();
    expect(contient(popup!, [1, 2, 3, 4])).toBe(true);
    expect(porte(popup!, 11)).toBe(false);
    const apres = [...container.querySelectorAll('.takussan-cluster-marker')];
    expect(apres).toHaveLength(2);
    expect(new Set(apres.map(position))).toEqual(positionsAvant);
  });

  /**
   * Une fermeture ne lève que SA propre épingle. Leaflet 1.9.4 ferme l'ancien aperçu AVANT d'ouvrir
   * le nouveau (`Popup.openOn` : `map.removeLayer(map._popup)` puis `popupopen`), si bien qu'avec
   * cet ordre la garde ne décide de rien. Elle existe pour que l'épingle ne dépende pas de l'ordre
   * des événements d'une bibliothèque tierce : ces deux tests livrent la fermeture de l'ancien
   * aperçu APRÈS l'ouverture du nouveau, par l'API publique de Leaflet (`Evented.fire`), sans quoi
   * la garde pourrait disparaître sans qu'aucun test ne le voie.
   */
  describe('une fermeture tardive d’un AUTRE marqueur ne lève pas l’épingle en place', () => {
    const IMMEUBLE_ET_BIEN = [...IMMEUBLE, bien(60, 14.62, -17.5)];

    function marqueursPoses() {
      const ajout = vi.spyOn(L.Marker.prototype, 'onAdd');
      const trouver = (titre: string) => {
        const m = (ajout.mock.contexts as L.Marker[]).filter(
          (c) => c.options.title === titre && (c as unknown as { _map: unknown })._map,
        );
        expect(m).toHaveLength(1);
        return m[0];
      };
      return { trouver, restaurer: () => ajout.mockRestore() };
    }

    const fermetureTardive = (marqueur: L.Marker) =>
      act(() => {
        marqueur.fire('popupclose', { popup: marqueur.getPopup() });
      });

    it('un bien ouvert après la liste reste épinglé quand la fermeture de la liste arrive en retard', async () => {
      const marqueurs = marqueursPoses();
      try {
        reponse = collection(IMMEUBLE_ET_BIEN);
        const { container, rerender } = render(withIntl(<PropertyMap />));
        await ouvrirLaListe(container);
        const liste = marqueurs.trouver('4 biens tout proches — voir la liste');
        await ouvrirLeBien(container, 60);
        await waitFor(() => expect(within(popupOuvert(container)!).getByText('Bien 60')).toBeInTheDocument());

        fermetureTardive(liste);
        // La réponse suivante ne contient plus le bien 60 : seule l'épingle le garde posé.
        reponse = collection(IMMEUBLE);
        act(() => rerender(withIntl(<PropertyMap />)));

        const popup = popupOuvert(container);
        expect(popup).not.toBeNull();
        expect(within(popup!).getByText('Bien 60')).toBeInTheDocument();
      } finally {
        marqueurs.restaurer();
      }
    });

    it('une liste ouverte après un bien reste épinglée quand la fermeture du bien arrive en retard', async () => {
      const marqueurs = marqueursPoses();
      try {
        reponse = collection(IMMEUBLE_ET_BIEN);
        const { container, rerender } = render(withIntl(<PropertyMap />));
        await ouvrirLeBien(container, 60);
        const bien60 = marqueurs.trouver(formatPrice(250060, 'XOF'));
        await ouvrirLaListe(container);
        await waitFor(() => expect(within(popupOuvert(container)!).getAllByRole('link')).toHaveLength(4));

        fermetureTardive(bien60);
        // La réponse suivante ne contient plus l'immeuble : seule l'épingle garde la liste posée.
        reponse = collection([bien(5, 14.75, -17.35), bien(60, 14.62, -17.5)]);
        act(() => rerender(withIntl(<PropertyMap />)));

        const popup = popupOuvert(container);
        expect(popup).not.toBeNull();
        expect(within(popup!).getAllByRole('link')).toHaveLength(4);
      } finally {
        marqueurs.restaurer();
      }
    });
  });
});
