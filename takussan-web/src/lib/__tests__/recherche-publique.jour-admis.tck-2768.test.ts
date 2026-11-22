import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { filtersToCriteria } from '@/components/favorites/SaveSearchButton';
import { ANNEE_MAX_DE_L_API, ANNEE_MIN_DE_L_API, estUnJourDeLApi } from '@/lib/jour-de-l-api';
import { parametresDeRecherche } from '@/lib/recherche-publique';
import { SEARCH_FILTER_KEYS } from '@/types/search';

/**
 * TCK-2768 — l'API refuse désormais (422) un `available_from` qui n'est pas un jour `AAAA-MM-JJ` réel, d'une année de
 * 1970 au plafond de `JourIso`. Une recherche partagée ou sauvegardée qui en porte un ne doit pas finir en « 0 bien
 * trouvé » (TCK-335) : le front l'écarte avant l'appel, et avant d'enregistrer une recherche, comme s'il était absent.
 * La forme seule ne suffit pas : « 2026-02-30 » a la bonne forme et l'API le refuse.
 */
const REFUSES = ['12/11/2026', '2026-02-30', '1960-01-01', '2200-01-01', '99999-01-01', '2026-11-12T10:00:00Z', '2026-1-05'];

describe('TCK-2768 — un available_from que l’API refuserait n’est jamais envoyé', () => {
  it('la règle du front est celle de JourIso : forme, jour réel, années 1970 à 2199', () => {
    for (const jour of ['2026-11-12', '2028-02-29', '1970-01-01', '2199-12-31']) expect(estUnJourDeLApi(jour), jour).toBe(true);
    for (const valeur of REFUSES) expect(estUnJourDeLApi(valeur), valeur).toBe(false);
  });

  it('la requête de recherche écarte la valeur refusée et garde les autres critères', () => {
    for (const valeur of REFUSES) {
      const params = parametresDeRecherche(new URLSearchParams({ available_from: valeur, city: 'dakar' }));
      expect(params.has('available_from'), valeur).toBe(false);
      expect(params.get('city')).toBe('dakar');
    }
    expect(parametresDeRecherche(new URLSearchParams({ available_from: '2026-11-12' })).get('available_from')).toBe('2026-11-12');
  });

  it('le critère enregistré avec une recherche écarte la même valeur', () => {
    const lire = (valeur: string) => SEARCH_FILTER_KEYS.available_from.lire(new URLSearchParams({ available_from: valeur }));

    for (const valeur of REFUSES) {
      expect(lire(valeur), valeur).toBeUndefined();
      expect(filtersToCriteria({ available_from: lire(valeur) })).not.toHaveProperty('available_from');
    }
    expect(filtersToCriteria({ available_from: lire('2026-11-12') })).toEqual({ available_from: '2026-11-12' });
  });

  it('les bornes du front sont celles de JourIso (PHP), lues à la source', () => {
    const regles = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'takussan-api', 'app', 'Rules');
    const constante = (fichier: string, nom: string) => {
      const m = new RegExp(`const ${nom} = (\\w+(?:::\\w+)?);`).exec(readFileSync(join(regles, fichier), 'utf8'));
      if (!m) throw new Error(`${nom} introuvable dans ${fichier}`);
      return m[1];
    };

    expect(constante('JourIso.php', 'ANNEE_MIN')).toBe('InstantIso::ANNEE_MIN');
    expect(Number(constante('InstantIso.php', 'ANNEE_MIN'))).toBe(ANNEE_MIN_DE_L_API);
    expect(Number(constante('JourIso.php', 'ANNEE_MAX'))).toBe(ANNEE_MAX_DE_L_API);
  });
});
