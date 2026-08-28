import { describe, expect, it } from 'vitest';

import {
  CLES_CANONIQUES_PROFILS,
  CLES_DINDEX_DE_PROFILS,
  CLES_ECARTEES_PROFILS,
  cheminCanoniqueDesProfils,
  pageDemandee,
  versParametresDeProfils,
  villeDemandee,
} from '../canonique-profils';
import { alternatesPubliques } from '../alternates';

/**
 * La règle de canonique des index de profils — TCK-436, dans la continuité de TCK-433.
 */
describe('la partition des clés est TOTALE', () => {
  it('chaque clé lue est soit canonique, soit écartée — jamais ni l’une ni l’autre', () => {
    // C'est le contrôle qui empêche qu'une clé ajoutée à `CLES_DINDEX_DE_PROFILS` échappe à la
    // décision : elle rejoindrait `CLES_ECARTEES_PROFILS` par dérivation, et si quelqu'un
    // l'ajoutait aux deux listes, l'égalité ci-dessous rougirait.
    expect([...CLES_CANONIQUES_PROFILS, ...CLES_ECARTEES_PROFILS].sort()).toEqual(
      [...CLES_DINDEX_DE_PROFILS].sort(),
    );
    expect(CLES_CANONIQUES_PROFILS.filter((c) => CLES_ECARTEES_PROFILS.includes(c))).toEqual([]);
  });

  it('`city` garde son URL, `q` et `page` se replient', () => {
    expect(CLES_CANONIQUES_PROFILS).toEqual(['city']);
    expect([...CLES_ECARTEES_PROFILS].sort()).toEqual(['page', 'q']);
  });
});

describe('cheminCanoniqueDesProfils', () => {
  // `villeCertifiee` = ce que `verdictDeFacette()` a validé auprès de l'API. `null` = « replie ».
  const cas: readonly [string, string, string | null, string][] = [
    ['/agencies', '', null, '/agencies'],
    ['/agencies', 'city=Dakar', 'Dakar', '/agencies?city=Dakar'],
    ['/agents', 'page=3', null, '/agents'],
    ['/agents', 'q=awa', null, '/agents'],
    ['/agents', 'city=Thi%C3%A8s&q=awa&page=4', 'Thiès', '/agents?city=Thi%C3%A8s'],
    // Une valeur vide ou blanche ne fabrique pas une URL de facette.
    ['/agencies', 'city=', null, '/agencies'],
    ['/agencies', 'city=%20%20', null, '/agencies'],
    // Une clé inconnue est ignorée : sans quoi n'importe quel paramètre de campagne
    // (`?utm_source=…`) produirait sa propre canonique.
    ['/agencies', 'utm_source=news&city=Dakar', 'Dakar', '/agencies?city=Dakar'],
  ];

  it.each(cas)('%s + « %s » (certifiée: %s) → %s', (base, query, certifiee, attendu) => {
    expect(cheminCanoniqueDesProfils(base, new URLSearchParams(query), certifiee)).toBe(attendu);
  });

  it('une ville DEMANDÉE mais NON certifiée ne survit pas — l’espace d’URL reste borné', () => {
    // Le défaut mesuré par la revue adverse : `?city=<chaîne inventée>` produisait une canonique
    // portant cette chaîne, sur une page index/follow. La ville ne vient plus de `params`.
    expect(
      cheminCanoniqueDesProfils('/agencies', new URLSearchParams('city=Zzzinventee'), null),
    ).toBe('/agencies');
  });

  it('c’est la graphie CERTIFIÉE qui entre, pas celle demandée — une seule canonique par facette', () => {
    // Le filtre serveur compare sans tenir compte de la casse : `?city=dakar` rend du contenu.
    // Recopier la graphie demandée produirait deux canoniques pour une seule page.
    expect(
      cheminCanoniqueDesProfils('/agents', new URLSearchParams('city=dakar'), 'Dakar'),
    ).toBe('/agents?city=Dakar');
  });

  it('rend un chemin que `alternatesPubliques` accepte — canonique ET hreflang du même chemin', () => {
    // Le point que TCK-433 paie cher : deux signaux contradictoires font ignorer le groupe entier.
    // On vérifie donc que le chemin canonique traverse réellement la chaîne des alternates.
    const chemin = cheminCanoniqueDesProfils('/agents', new URLSearchParams('city=Dakar&page=9'), 'Dakar');
    const alternates = alternatesPubliques(chemin, 'fr');

    expect(String(alternates.canonical)).toContain('/fr/agents?city=Dakar');
    expect(String(alternates.canonical)).not.toContain('page=');
    const langues = alternates.languages as Record<string, string> | undefined;
    for (const langue of ['fr', 'en', 'wo', 'x-default']) {
      expect(String(langues?.[langue])).toContain('/agents?city=Dakar');
      expect(String(langues?.[langue])).not.toContain('page=');
    }
  });
});

describe('villeDemandee', () => {
  it.each([
    ['city=Dakar', 'Dakar'],
    ['city=%20Dakar%20', 'Dakar'],
    ['city=', undefined],
    ['city=%20%20', undefined],
    ['', undefined],
  ] as const)('« %s » → %s', (query, attendu) => {
    expect(villeDemandee(new URLSearchParams(query))).toBe(attendu);
  });
});

describe('versParametresDeProfils et pageDemandee', () => {
  it('un paramètre répété garde la PREMIÈRE valeur', () => {
    const params = versParametresDeProfils({ city: ['Dakar', 'Thiès'] });
    expect(params.get('city')).toBe('Dakar');
  });

  it('ignore les valeurs absentes', () => {
    expect(versParametresDeProfils({ city: undefined }).has('city')).toBe(false);
  });

  const pages: readonly [string, number][] = [
    ['', 1],
    ['page=1', 1],
    ['page=7', 7],
    // Une valeur illisible n'est pas une erreur : c'est la page 1. Un `NaN` transmis à l'API
    // produirait un 422 sur une URL qu'un explorateur peut fabriquer.
    ['page=abc', 1],
    ['page=0', 1],
    ['page=-3', 1],
  ];

  it.each(pages)('« %s » → page %i', (query, attendu) => {
    expect(pageDemandee(new URLSearchParams(query))).toBe(attendu);
  });
});
