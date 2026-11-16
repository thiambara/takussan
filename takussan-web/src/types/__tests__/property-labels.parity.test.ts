import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESPACES_DES_LIBELLES_DE_BIEN, type ChampLibelleDeBien } from '@/lib/biens/libelles-de-bien';
import {
  conditionValues,
  contractTypeValues,
  propertyStatusFilterValues,
  propertyTypeValues,
  rentPeriodValues,
  titleTypeValues,
} from '@/lib/enums/property';

/**
 * TCK-351 — UNE seule source pour le texte affiché d'un bien : le dictionnaire du front.
 *
 * ## D'où vient cette garde
 *
 * Jusqu'au 2026-11-16, `PropertyResource` émettait six libellés traduits côté serveur
 * (`type_label`, `contract_type_label`, `rent_period_label`, `status_label`, `title_type_label`,
 * `condition_label`) depuis `takussan-api/lang/<locale>/properties.php`, pendant que les cartes, les
 * filtres et le formulaire rendaient `property.*` de next-intl. Deux tables dans le même parcours, et
 * 44 divergences mesurées le 2026-08-22 — dont `status.pending`, « Réservé » sur la fiche et « En
 * attente » sur la carte : deux ÉTATS différents pour le même bien. Cette garde était alors un
 * cliquet de 44 divergences nommées (`DIVERGENCES_CONNUES`).
 *
 * Le porteur a tranché le 2026-11-16 pour l'option (a) — le principe n° 5 : **le front possède le
 * texte affiché**. L'API n'émet plus que les codes, et le front les traduit par
 * `@/lib/biens/libelles-de-bien`. La liste des divergences n'a donc plus d'objet : il n'y a plus
 * qu'une table à l'écran. Ce qui peut encore casser, et que cette garde tient :
 *
 *   1. qu'un `*_label` de bien REVIENNE — côté API dans `PropertyResource`, ou côté front relu par un
 *      composant (une réponse d'API ancienne, un champ rétabli « pour aller plus vite ») : la seconde
 *      source renaîtrait sans bruit ;
 *   2. qu'un code émis par l'API n'ait PAS sa clé dans le dictionnaire : le front le rendrait brut
 *      (`enumLabel` replie sur le code), ce que la seconde source masquait jusqu'ici.
 *
 * ⚠ `web-ci.yml` déclenche sur `PropertyResource.php` et les six fichiers d'enum lus ici : les deux
 * côtés qu'une garde compare doivent la réveiller, sinon elle dort quand le back bouge seul.
 */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SRC = join(RACINE, 'takussan-web', 'src');
const LOCALES = ['fr', 'en', 'wo'] as const;

const LIBELLES_RETIRES = [
  'type_label',
  'contract_type_label',
  'rent_period_label',
  'status_label',
  'title_type_label',
  'condition_label',
] as const;

/**
 * Les fichiers du front qui lisent l'un de ces six noms SUR UNE AUTRE RESSOURCE que le bien, avec
 * leur raison. Vide au 2026-11-16 : `RoleDelegationResource` et `BankStatementResource` émettent bien
 * un `status_label`, mais aucun écran ne le lit. Une entrée ajoutée ici doit nommer la ressource ; une
 * entrée qui ne lit plus rien fait rougir la garde (cliquet dans les deux sens).
 */
const LECTURES_HORS_BIEN = new Map<string, string>([]);

/** Le champ de l'API → l'enum PHP qui en porte les cas, et la liste du front qui les connaît. */
const ENUMS: Record<ChampLibelleDeBien, { php: string; front: readonly string[] }> = {
  type: { php: 'PropertyType', front: propertyTypeValues },
  contract_type: { php: 'ContractType', front: contractTypeValues },
  rent_period: { php: 'RentPeriod', front: rentPeriodValues },
  status: { php: 'PropertyStatus', front: propertyStatusFilterValues },
  title_type: { php: 'TitleType', front: titleTypeValues },
  condition: { php: 'PropertyCondition', front: conditionValues },
};

function casDeLEnum(nom: string): string[] {
  const source = readFileSync(join(RACINE, 'takussan-api', 'app', 'Models', 'Enums', `${nom}.php`), 'utf8');
  return [...source.matchAll(/^\s*case\s+\w+\s*=\s*'([^']+)'\s*;/gm)].map((m) => m[1]);
}

function sousArbre(locale: string, espace: string): Record<string, unknown> {
  const dictionnaire = JSON.parse(readFileSync(join(SRC, 'messages', `${locale}.json`), 'utf8')) as Record<string, unknown>;
  return espace.split('.').reduce<Record<string, unknown>>(
    (noeud, cle) => ((noeud?.[cle] ?? {}) as Record<string, unknown>),
    dictionnaire,
  );
}

function fichiersDuFront(dossier: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === '__tests__' || nom === 'messages' || nom === 'node_modules') continue;
      fichiersDuFront(chemin, acc);
    } else if (/\.(ts|tsx)$/.test(nom) && !/\.(test|spec)\.tsx?$/.test(nom)) {
      acc.push(chemin);
    }
  }
  return acc;
}

/** Le code seul : un commentaire qui RACONTE l'histoire d'un `type_label` n'en lit aucun. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/**
 * Une LECTURE ou une DÉCLARATION de champ — `p.status_label`, `p?.type_label`, `p['condition_label']`,
 * `title_type_label: string` —, jamais une chaîne : `t('status_label')` est une clé de dictionnaire
 * (`MaintenanceList`), pas un champ de l'API.
 */
const NOMS = LIBELLES_RETIRES.join('|');
const MOTIF = new RegExp(`(?:\\?\\.|\\.)\\s*(${NOMS})\\b|\\[\\s*['"](${NOMS})['"]\\s*\\]|^\\s*(${NOMS})\\??\\s*:`, 'gm');
const nomLu = (m: RegExpMatchArray) => m[1] ?? m[2] ?? m[3];

function lecturesDuFront(): Map<string, string[]> {
  const trouvees = new Map<string, string[]>();
  for (const fichier of fichiersDuFront(SRC)) {
    const noms = [...sansCommentaires(readFileSync(fichier, 'utf8')).matchAll(MOTIF)].map(nomLu);
    if (noms.length > 0) trouvees.set(relative(SRC, fichier), [...new Set(noms)]);
  }
  return trouvees;
}

describe('TCK-351 — le front possède le texte affiché d’un bien', () => {
  it('l’API n’émet plus aucun des six libellés de bien', () => {
    const ressource = readFileSync(
      join(RACINE, 'takussan-api', 'app', 'Http', 'Resources', 'PropertyResource.php'),
      'utf8',
    );
    const emis = LIBELLES_RETIRES.filter((cle) => new RegExp(`'${cle}'\\s*=>`).test(ressource));
    expect(emis, 'PropertyResource émet de nouveau un libellé : le front possède le texte affiché').toEqual([]);
  });

  it('aucun fichier du front ne relit un libellé de bien venu de l’API', () => {
    const lectures = lecturesDuFront();
    const fautives = [...lectures].filter(([fichier]) => !LECTURES_HORS_BIEN.has(fichier));
    expect(
      fautives,
      'traduire le CODE par `libelleDeBien` (@/lib/biens/libelles-de-bien), jamais relire un `*_label`',
    ).toEqual([]);
    const perimees = [...LECTURES_HORS_BIEN.keys()].filter((fichier) => !lectures.has(fichier));
    expect(perimees, 'entrée de LECTURES_HORS_BIEN qui ne lit plus rien : la retirer').toEqual([]);
  });

  it('le balayage voit vraiment quelque chose', () => {
    // La vacuité qui ressemble le plus à un succès : un dossier mal visé, zéro fichier lu, et le
    // contrôle ci-dessus vert sur un ensemble vide. Puis le motif lui-même, éprouvé sur du code.
    expect(fichiersDuFront(SRC).length).toBeGreaterThan(500);
    const code = sansCommentaires(
      "// type_label raconté\nconst x = property.status_label ?? t('condition_label');\ny = p?.['type_label'];\n  rent_period_label?: string;",
    );
    expect([...code.matchAll(MOTIF)].map(nomLu)).toEqual(['status_label', 'type_label', 'rent_period_label']);
  });

  it.each(Object.entries(ENUMS))(
    '%s — chaque cas de l’enum de l’API a sa clé dans fr, en et wo, et le front le connaît',
    (champ, { php, front }) => {
      const cas = casDeLEnum(php);
      expect(cas.length, `aucun cas lu dans ${php}.php`).toBeGreaterThan(1);
      // Inconnu de la liste du front, le code sortirait brut même avec sa clé (`enumLabel`).
      expect(cas.filter((c) => !front.includes(c)), `cas de ${php} absents de la liste du front`).toEqual([]);
      const espace = ESPACES_DES_LIBELLES_DE_BIEN[champ as ChampLibelleDeBien];
      for (const locale of LOCALES) {
        const table = sousArbre(locale, espace);
        const manquants = cas.filter((c) => typeof table[c] !== 'string' || table[c] === '');
        expect(manquants, `${espace} (${locale}) : clés manquantes`).toEqual([]);
      }
    },
  );
});
