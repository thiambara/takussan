import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import { TIMEZONE, type Locale } from '@/i18n/config';

/**
 * TCK-432 — **le titre de `/properties` ne peut pas être un chemin de dictionnaire.**
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE, ET COMMENT IL A ÉTÉ TROUVÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `titreEtDescription` traduit la valeur de `?type=` **prise brute dans l'URL**. Rien ne la valide
 * en amont : `filtresCanoniques` ne fait que la LIRE. Mesuré le 2026-08-28 sur le serveur de
 * développement, avant correctif :
 *
 * ```
 * $ curl -s '…/fr/properties?type=nimportequoi' | grep -o '<title>[^<]*'
 * <title>property.types.nimportequoi — Takussan
 * ```
 *
 * Le défaut est arrivé avec TCK-433 et n'y vivait que dans l'onglet. TCK-432 fait dériver le
 * `<h1>` de la même fonction : il l'aurait affiché **en grand**, en Bricolage 34 px.
 *
 * ⚠️ **Ce fichier existe parce qu'une ABLATION l'a exigé.** Le correctif avait d'abord été posé
 * sans test : l'ablation du garde-fou laissait les 27 tests des deux fichiers voisins au vert.
 * *Un correctif qu'aucune ablation ne fait rougir n'est pas gardé — il est seulement présent.*
 */

let localeCourante: Locale = 'fr';

const DICTIONNAIRES: Record<Locale, Record<string, unknown>> = {
  fr: fr as Record<string, unknown>,
  en: en as Record<string, unknown>,
  wo: wo as Record<string, unknown>,
};

/** Même deep-merge qu'en production (`src/i18n/request.ts`) : `fr` sert de repli sous les autres. */
function fusionne(base: Record<string, unknown>, surcharge: Record<string, unknown>) {
  const sortie = { ...base };
  for (const [cle, valeur] of Object.entries(surcharge)) {
    const existant = sortie[cle];
    sortie[cle] =
      valeur && typeof valeur === 'object' && !Array.isArray(valeur) &&
      existant && typeof existant === 'object' && !Array.isArray(existant)
        ? fusionne(existant as Record<string, unknown>, valeur as Record<string, unknown>)
        : valeur;
  }
  return sortie;
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace?: string) =>
    createTranslator({
      locale: localeCourante,
      messages: (localeCourante === 'fr'
        ? DICTIONNAIRES.fr
        : fusionne(DICTIONNAIRES.fr, DICTIONNAIRES[localeCourante])) as never,
      namespace: namespace as never,
      timeZone: TIMEZONE,
    }),
}));

const { titreEtDescription } = await import('@/lib/titre-de-la-liste');

const titre = (requete: string) => titreEtDescription(new URLSearchParams(requete));

beforeEach(() => {
  localeCourante = 'fr';
});

describe('TCK-432 — une valeur de `type` inconnue ne fabrique pas un titre illisible', () => {
  it('retombe sur le sujet générique du dictionnaire', async () => {
    const { title } = await titre('type=nimportequoi');

    expect(title).toBe(fr.meta.propertiesFiltered.subjectAny);
  });

  it('n’expose JAMAIS un chemin de dictionnaire, ni dans le titre ni dans la description', async () => {
    // ⚠ L'assertion porte sur le MOTIF, pas sur une chaîne : « property.types.nimportequoi » est
    // une valeur d'exemple, et un test qui la citerait passerait à côté de `property.types.<autre>`.
    const { title, description } = await titre('type=nimportequoi');

    expect(title).not.toMatch(/property\.types\./);
    expect(description).not.toMatch(/property\.types\./);
  });

  it('compose quand même le reste de la requête autour du sujet générique', async () => {
    const { title } = await titre('type=nimportequoi&contract_type=rent&city=Dakar');

    expect(title).not.toMatch(/property\.types\./);
    expect(title).toContain('Dakar');
  });

  it('dans les trois langues', async () => {
    for (const locale of ['fr', 'en', 'wo'] as const) {
      localeCourante = locale;
      const { title } = await titre('type=nimportequoi');

      expect(title).toBe((DICTIONNAIRES[locale] as typeof fr).meta.propertiesFiltered.subjectAny);
    }
  });
});

describe('TCK-432 — le cas nominal n’a pas bougé (TCK-433 · AC3)', () => {
  it('un type connu se dit avec son libellé', async () => {
    expect((await titre('type=villa')).title).toBe(fr.property.types.villa);
  });

  it('la page nue garde le titre générique de `meta.properties`', async () => {
    expect((await titre('')).title).toBe(fr.meta.properties.title);
  });

  it('les gabarits ICU composent contrat et ville', async () => {
    expect((await titre('type=villa&contract_type=rent&city=Dakar')).title).toBe(
      'Villa à louer à Dakar',
    );
  });
});
