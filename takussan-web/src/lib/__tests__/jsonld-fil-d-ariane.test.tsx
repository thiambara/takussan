import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PropertyBreadcrumb } from '@/app/[locale]/(public)/properties/[slug]/components/PropertyBreadcrumb';
import { origineSite } from '@/lib/alternates';
import { jsonLdFilDAriane, maillonsDeFiche } from '@/lib/fil-d-ariane';
import { hrefDuQuartier } from '@/lib/fil-d-ariane-quartier';
import { scriptJsonLd } from '@/lib/jsonld';
import {
  type DomainesDeFacette,
  cheminCanoniqueDeLaListe,
  domainesStatiques,
} from '@/lib/canonique';
import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { PropertyDetail } from '@/types/property';

/**
 * TCK-435 · AC1 — **le fil BALISÉ a les mêmes maillons, dans le même ordre, que le fil AFFICHÉ.**
 *
 * L'AC est explicite sur ce qui ne suffirait pas : *« un test qui vérifie seulement la présence
 * d'un `BreadcrumbList` cocherait la case avec un fil faux : il doit comparer les deux »*. Ce
 * fichier REND donc le composant et confronte le DOM au JSON.
 *
 * ⚠ La comparaison n'est pas tautologique du seul fait que les deux appellent `maillonsDeFiche` :
 * ce qu'elle éprouve, c'est le trajet entre la liste de maillons et ce que chacun des deux
 * consommateurs en FAIT — le composant peut en cacher un, en ajouter un, les réordonner ; le
 * balisage peut en omettre l'`item`, décaler les `position`, ou perdre le préfixe de langue.
 */

function bien(overrides: Partial<PropertyDetail> = {}): PropertyDetail {
  return {
    id: 1,
    reference_number: 'TK-2026-ABC',
    title: 'Villa Almadies',
    slug: 'villa-almadies',
    price: 120_000_000,
    currency: 'XOF',
    type: 'villa',
    contract_type: 'rent',
    rent_period: 'month',
    status: 'available',
    visibility: 'public',
    bedrooms: 4,
    bathrooms: 3,
    area: 220,
    furnished: true,
    featured: false,
    main_photo_url: null,
    published_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    type_label: 'Villa',
    contract_type_label: 'Location',
    rent_period_label: 'Mois',
    status_label: 'Disponible',
    title_type: null,
    title_type_label: null,
    condition_label: null,
    floor_number: null,
    total_floors: null,
    year_built: 2020,
    parking_spaces: 2,
    views_count: 0,
    favorites_count: 0,
    average_rating: null,
    reviews_count: 0,
    description: null,
    location: {
      street: null,
      quarter: 'Ngor',
      city: 'Dakar',
      region: 'Dakar',
      country: 'SN',
      postal_code: null,
      latitude: null,
      longitude: null,
    },
    ...overrides,
  } as PropertyDetail;
}

type ListItem = { '@type': string; position: number; name: string; item?: string };

function balise(p: PropertyDetail, locale: 'fr' | 'en' | 'wo' = 'fr', hrefQuartier?: string) {
  // Le traducteur SERVEUR est une fonction `(cle) => string` ; le dictionnaire réel est chargé
  // pour que les libellés comparés soient ceux que l'écran rend.
  const t = (cle: string) => {
    const valeur = cle
      .split('.')
      .reduce<unknown>(
        (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined),
        (fr as { property: { detail: Record<string, unknown> } }).property.detail,
      );
    return typeof valeur === 'string' ? valeur : cle;
  };
  return jsonLdFilDAriane(maillonsDeFiche(p, t, hrefQuartier), locale).itemListElement as ListItem[];
}

describe('AC1 — le fil balisé ⇔ le fil affiché', () => {
  it('mêmes libellés, dans le même ordre', () => {
    const p = bien();
    render(withIntl(<PropertyBreadcrumb property={p} />));

    // Le dernier maillon se lit par `aria-current`, et non plus par sa couleur : la classe
    // `text-stone-700` est passée aux jetons à la revue design du 2026-09-16.
    const affiches = [...screen.getByRole('navigation').querySelectorAll('a, [aria-current="page"]')]
      .map((n) => n.textContent?.trim())
      .filter(Boolean);

    expect(balise(p).map((i) => i.name)).toEqual(affiches);
    expect(affiches).toEqual(['Accueil', 'Louer', 'Dakar', 'Ngor']);
  });

  it('mêmes cibles : chaque `item` est l’URL absolue du lien affiché', () => {
    const p = bien();
    render(withIntl(<PropertyBreadcrumb property={p} />));

    const hrefs = [...screen.getByRole('navigation').querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    );
    // Les maillons CLIQUABLES seulement : depuis le 2026-08-28, le quartier est un simple
    // libellé des deux côtés — il n'a ni `<a>` ni `item`. L'égalité porte donc sur la même
    // sous-liste de part et d'autre, ce qui est exactement ce que l'AC1 demande.
    const items = balise(p)
      .map((i) => i.item)
      .filter((i): i is string => i !== undefined);

    expect(items).toEqual(hrefs.map((h) => `${origineSite()}${h}`));
    // Et ces href-là portent bien la langue : `LienLocalise` la pose au rendu.
    for (const href of hrefs) expect(href, href!).toMatch(/^\/fr(\/|\?|$)/);
  });

  /**
   * TCK-839 (P35.01) — le quartier redevient cliquable, mais SEULEMENT vers sa page canonique.
   *
   * Le retrait du 2026-08-28 tenait à ce que `location` était une clé écartée : `?location=…`
   * rendait la canonique de `/properties`. TCK-598 l'a fait entrer dans `CLES_CANONIQUES` : un
   * quartier qui atteint `SEUIL_QUARTIER_INDEXABLE` biens dans SA ville a sa page, que le sitemap
   * annonce. Le lien se pose donc pour ce quartier-là, et pour lui seul.
   */
  function domainesAvecQuartiers(quartiers: ReadonlyMap<string, string> | null): DomainesDeFacette {
    return {
      ...domainesStatiques(),
      villes: new Map([['dakar', 'Dakar']]),
      quartiers,
    };
  }

  it('un quartier HORS du domaine indexable de sa ville reste un libellé des deux côtés', () => {
    const p = bien();
    const href = hrefDuQuartier(p, domainesAvecQuartiers(new Map([['mermoz', 'Mermoz']])));
    expect(href).toBeUndefined();
    render(withIntl(<PropertyBreadcrumb property={p} hrefQuartier={href} />));

    const nav = screen.getByRole('navigation');
    expect([...nav.querySelectorAll('a')].map((a) => a.textContent?.trim())).not.toContain('Ngor');
    expect(nav.textContent).toContain('Ngor');
    expect(nav.innerHTML).not.toContain('location=');

    const dernier = balise(p, 'fr', href).at(-1)!;
    expect(dernier.name).toBe('Ngor');
    expect(dernier).not.toHaveProperty('item');
  });

  it('domaine inconnaissable, ou bien sans ville : aucun lien de quartier', () => {
    expect(hrefDuQuartier(bien(), domainesAvecQuartiers(null))).toBeUndefined();
    expect(hrefDuQuartier(bien(), { ...domainesStatiques(), villes: null, quartiers: new Map([['ngor', 'Ngor']]) })).toBeUndefined();
    expect(
      hrefDuQuartier(bien({ location: { ...bien().location, city: null } }), domainesAvecQuartiers(new Map([['ngor', 'Ngor']]))),
    ).toBeUndefined();
  });

  it('un quartier INDEXABLE est cliquable vers sa canonique, à l’écran comme au balisage', () => {
    // La graphie du bien n'est pas celle du catalogue : le lien prend la canonique.
    const p = bien({ location: { ...bien().location, city: 'dakar', quarter: 'NGOR' } });
    const domaines = domainesAvecQuartiers(new Map([['ngor', 'Ngor']]));
    const href = hrefDuQuartier(p, domaines);
    expect(href).toBe('/properties?city=Dakar&location=Ngor');

    render(withIntl(<PropertyBreadcrumb property={p} hrefQuartier={href} />));
    const lien = [...screen.getByRole('navigation').querySelectorAll('a')].at(-1)!;
    expect(lien.textContent?.trim()).toBe('NGOR');
    expect(lien.getAttribute('href')).toBe('/fr/properties?city=Dakar&location=Ngor');

    const dernier = balise(p, 'fr', href).at(-1)!;
    expect(dernier.item).toBe(`${origineSite()}/fr/properties?city=Dakar&location=Ngor`);
    // Canonique d'elle-même : la page pointée ne la désavoue pas.
    expect(cheminCanoniqueDeLaListe(new URLSearchParams(href!.split('?')[1]), domaines)).toBe(href);
  });

  it('le fil suit la ville et le quartier réellement rendus', () => {
    // Le maillon de quartier disparaît de l'écran quand `quarter` est nul ; il doit disparaître
    // du balisage au même moment, sans laisser de trou dans les `position`.
    const p = bien({ location: { ...bien().location, quarter: null } });
    render(withIntl(<PropertyBreadcrumb property={p} />));

    const affiches = [...screen.getByRole('navigation').querySelectorAll('a')].map((a) =>
      a.textContent?.trim(),
    );
    const items = balise(p);

    expect(items.map((i) => i.name)).toEqual(affiches);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(JSON.stringify(items)).not.toContain('null');
  });

  it('un bien à vendre change le second maillon des DEUX côtés', () => {
    const p = bien({ contract_type: 'sale' });
    render(withIntl(<PropertyBreadcrumb property={p} />));

    expect(screen.getByText('Acheter')).toBeTruthy();
    expect(balise(p)[1]!.name).toBe('Acheter');
    expect(balise(p)[1]!.item).toBe(`${origineSite()}/fr/properties?contract_type=sale`);
  });

  it('les `position` commencent à 1 et se suivent, maillon non cliquable compris', () => {
    expect(balise(bien()).map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(balise(bien()).map((i) => i.name)).toEqual(['Accueil', 'Louer', 'Dakar', 'Ngor']);
  });

  it('la langue de l’URL suit celle de la page', () => {
    expect(balise(bien(), 'wo')[0]!.item).toBe(`${origineSite()}/wo`);
    expect(balise(bien(), 'en')[2]!.item).toBe(`${origineSite()}/en/properties?city=Dakar`);
  });

  it('aucune URL relative — un `item` relatif serait résolu contre le document', () => {
    const items = balise(bien()).map((i) => i.item).filter((i) => i !== undefined);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item, item).toMatch(/^https:\/\//);
    }
  });

  it('le tout reste du JSON valide après échappement', () => {
    const rendu = scriptJsonLd({
      '@type': 'BreadcrumbList',
      itemListElement: balise(bien({ location: { ...bien().location, city: 'Da</script>kar' } })),
    });
    expect(rendu).not.toContain('</script>');
    expect(() => JSON.parse(rendu)).not.toThrow();
  });
});
