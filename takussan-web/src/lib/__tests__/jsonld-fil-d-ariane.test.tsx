import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PropertyBreadcrumb } from '@/app/[locale]/(public)/properties/[slug]/components/PropertyBreadcrumb';
import { ORIGINE_SITE } from '@/lib/alternates';
import { jsonLdFilDAriane, maillonsDeFiche } from '@/lib/fil-d-ariane';
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

function balise(p: PropertyDetail, locale: 'fr' | 'en' | 'wo' = 'fr') {
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
  return jsonLdFilDAriane(maillonsDeFiche(p, t), locale).itemListElement as ListItem[];
}

describe('AC1 — le fil balisé ⇔ le fil affiché', () => {
  it('mêmes libellés, dans le même ordre', () => {
    const p = bien();
    render(withIntl(<PropertyBreadcrumb property={p} />));

    const affiches = [...screen.getByRole('navigation').querySelectorAll('a, span.text-stone-700')]
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

    expect(items).toEqual(hrefs.map((h) => `${ORIGINE_SITE}${h}`));
    // Et ces href-là portent bien la langue : `LienLocalise` la pose au rendu.
    for (const href of hrefs) expect(href, href!).toMatch(/^\/fr(\/|\?|$)/);
  });

  it('le QUARTIER est un libellé des deux côtés — ni `<a>`, ni `item`', () => {
    /*
     * ⚠ Il pointait `/properties?location=<quartier>`, or `location` est l'une des dix-sept clés
     * ÉCARTÉES par TCK-433 : cette URL rend `<link rel="canonical" href="…/properties">`. Le
     * balisage affirmait donc un `item` que la page pointée désavoue aussitôt — deux tickets du
     * même lot qui se contredisaient.
     */
    const p = bien();
    render(withIntl(<PropertyBreadcrumb property={p} />));

    const nav = screen.getByRole('navigation');
    expect([...nav.querySelectorAll('a')].map((a) => a.textContent?.trim())).not.toContain('Ngor');
    expect(nav.textContent).toContain('Ngor');
    expect(nav.innerHTML).not.toContain('location=');

    const dernier = balise(p).at(-1)!;
    expect(dernier.name).toBe('Ngor');
    expect(dernier).not.toHaveProperty('item');
    expect(JSON.stringify(balise(p))).not.toContain('location=');
  });

  it('TOUT `item` du fil est une URL CANONIQUE d’elle-même', () => {
    // L'invariant que le retrait du lien de quartier rend vrai — et le seul qui interdise
    // qu'un maillon futur pointe de nouveau une URL non canonique.
    const p = bien();
    const domaines: DomainesDeFacette = {
      ...domainesStatiques(),
      // La ville vient du bien, qui est public : elle appartient au domaine par construction.
      villes: new Map([[p.location.city!.toLocaleLowerCase('fr'), p.location.city!]]),
    };

    for (const item of balise(p).map((i) => i.item).filter(Boolean) as string[]) {
      const chemin = item.slice(ORIGINE_SITE.length).replace(/^\/(fr|en|wo)/, '');
      if (chemin === '' || chemin === '/') continue; // l'accueil n'est pas une page de liste
      const [, requete = ''] = chemin.split('?');
      expect(
        `/properties?${requete}`.replace(/\?$/, ''),
        `le maillon « ${item} » n'est pas canonique de lui-même`,
      ).toBe(cheminCanoniqueDeLaListe(new URLSearchParams(requete), domaines));
    }
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
    expect(balise(p)[1]!.item).toBe(`${ORIGINE_SITE}/fr/properties?contract_type=sale`);
  });

  it('les `position` commencent à 1 et se suivent, maillon non cliquable compris', () => {
    expect(balise(bien()).map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(balise(bien()).map((i) => i.name)).toEqual(['Accueil', 'Louer', 'Dakar', 'Ngor']);
  });

  it('la langue de l’URL suit celle de la page', () => {
    expect(balise(bien(), 'wo')[0]!.item).toBe(`${ORIGINE_SITE}/wo`);
    expect(balise(bien(), 'en')[2]!.item).toBe(`${ORIGINE_SITE}/en/properties?city=Dakar`);
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
