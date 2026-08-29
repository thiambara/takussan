#!/usr/bin/env node
/**
 * Garde : **le chemin d'un vocabulaire d'enum de bien ne se compose pas à la main.**
 *
 * `takussan-web/src/components/property-form/options.ts` tient `PROPERTY_ENUM_NAMESPACES` et le
 * dit en une ligne : *« Où vit le libellé de chaque enum. Ne jamais recopier ces chaînes à la main
 * ailleurs. »* La forme juste tient en deux lignes chez l'appelant :
 *
 * ```tsx
 * const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);   // le traducteur EST borné
 * <span>{enumLabel(tType, propertyTypeValues, bien.type)}</span>  // la clé est la VALEUR, nue
 * ```
 *
 * Ce que cette garde refuse, c'est le contournement qui n'en a pas l'air : un traducteur borné
 * PLUS HAUT, et le reste du chemin recomposé dans un gabarit.
 *
 * ```tsx
 * ❌ const t = useTranslations('property');
 *    t(`types.${bien.type}`)        // « property » + « types. » = property.types, à la main
 * ```
 *
 * Les deux moitiés sont anodines séparément — c'est bien pourquoi ni le typage ni le lint ne
 * voient rien, et pourquoi une relecture qui a lieu attrape ça une fois sur trois.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF — ce que son absence a coûté
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-464 (parcours de publication guidé) a dû faire respecter cette règle **trois fois à la
 * main, sur trois tâches différentes** — trois fois la même remarque de revue, trois fois un
 * aller-retour. C'est le signal qui a motivé TCK-466 : *une règle qu'une revue doit rappeler à
 * chaque tâche n'est pas une règle, c'est une habitude, et une habitude ne survit pas à la
 * fusion.*
 *
 * Et la garde n'a pas eu à attendre une récidive pour servir. Posée le 2026-08-29, elle a nommé
 * un contournement **vivant** que personne n'avait vu :
 *
 * ```
 * ✗ src/components/property/PropertyCard.tsx:187  t=`property` → property.types
 *     {t.has(`types.${property.type}`) ? t(`types.${property.type}`) : property.type}
 * ```
 *
 * La carte de bien — le composant le plus rendu du site public — recopiait `property.types` en
 * deux morceaux, sur un traducteur borné à `property`. Corrigé dans le même geste
 * (`PROPERTY_ENUM_NAMESPACES.type` + `enumLabel`, repli sur la valeur brute reconduit).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LA TABLE EST LUE, JAMAIS RECOPIÉE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * {@link lireTable} lit `PROPERTY_ENUM_NAMESPACES` **dans son fichier**, à chaque exécution. Une
 * garde qui porterait sa propre copie des dix chemins recréerait exactement l'inventaire parallèle
 * qu'elle existe pour interdire — et ce dépôt a déjà payé ce motif ailleurs (J-07 du journal des
 * corrections : l'INDEX du backlog était faux sur 80 % de ses entrées, pour l'avoir tenu à la
 * main). Corollaire utile : **une entrée ajoutée à la table est gardée le jour même**, sans que
 * ce fichier bouge.
 *
 * Corollaire moins agréable, et il vaut d'être écrit : **ce qui n'est pas dans la table n'est pas
 * gardé.** `property.rentPeriodsShort` et `property.rentPeriods` sont deux vocabulaires d'enum
 * réels que `PROPERTY_ENUM_NAMESPACES` n'enregistre pas ; `t(`rentPeriodsShort.${p}`)` passe donc
 * ici sans un mot. La garde applique la table, elle ne la complète pas.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * PORTÉE — ⚠ CECI EST UN PLANCHER, PAS UNE PREUVE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * *Une garde qui se lit comme une garantie est pire qu'une garde absente* : elle transforme un
 * travail de revue en case cochée. Ce que celle-ci NE voit PAS, mesuré et non supposé :
 *
 * T1 · **LE CONTOURNEMENT SANS INTERPOLATION.** Une clé écrite en dur pour UNE valeur, dans une
 *      condition — `if (bien.type === 'villa') return t('types.villa')` — ne porte aucun `${}` et
 *      ne matchera jamais. C'est le faux négatif principal, il est assumé, et il reste un travail
 *      de revue. Cibler « toute chaîne contenant `types.` » rendrait la garde inutilisable :
 *      `property.detail`, `property.cards` et `property.dashboard.*` en sont pleins de formes
 *      légitimes.
 *
 * T2 · **L'ESPACE DE NOMS RECOPIÉ TEL QUEL.** `useTranslations('property.types')` écrit en toutes
 *      lettres au lieu de `PROPERTY_ENUM_NAMESPACES.type` est, à la lettre, « recopier ces chaînes
 *      à la main » — et cette garde le laisse passer. Ce n'est pas un oubli : **15 fichiers le
 *      font aujourd'hui** (mesuré le 2026-08-29 : `Navbar`, `SearchToolbar`, `FilterSidebar`,
 *      `SaveSearchButton`, `SavedSearchesList`, `ContractTypeChip`, `PropertyMap`,
 *      `BookingSummary`, `titre-de-la-liste`…). Les refuser demanderait de les corriger d'abord,
 *      sur cinq répertoires qui n'appartiennent pas à ce ticket. Le jour où ils seront migrés,
 *      c'est un contrôle de dix lignes à ajouter ici — et il aura des dents parce que la table
 *      est déjà lue.
 *
 * T3 · **LE GABARIT QUI COMMENCE PAR L'INTERPOLATION.** `t(`${espace}.${valeur}`)`, avec
 *      `const espace = 'types'` plus haut, n'est pas suivi. La garde ne lit que le premier morceau
 *      LITTÉRAL du gabarit, et il n'y en a pas. Choix délibéré : suivre une variable demanderait
 *      un analyseur, et la forme `${a}.b` est par ailleurs la forme LÉGITIME de tout le dépôt
 *      (`t(`${action}.dialogTitle`)`, `t(`${copyKey}.submit`)` — 14 occurrences).
 *
 * T4 · **LE TRADUCTEUR QUI N'EST PAS UNE `const`.** Un traducteur reçu en paramètre, rangé dans un
 *      objet (`const tr = { types: useTranslations('property.types') }`, forme réelle de
 *      `SearchToolbar` et `SavedSearchesList`) ou produit par une fabrique n'est pas résolu : son
 *      espace de noms est inconnu, donc aucune composition n'est jugée. Faux négatif, jamais faux
 *      positif — l'approximation se trompe toujours du même côté.
 *
 * T5 · Elle ne juge pas du RÉSULTAT. Un chemin composé correctement vers une clé qui n'existe dans
 *      aucun dictionnaire reste vert ici : c'est le travail des dictionnaires.
 *
 * T6 · Le périmètre est `takussan-web/src`, tests exclus. Un contournement écrit dans un test ne
 *      rend rien à l'écran ; il n'a pas à faire rougir la CI.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI EMPÊCHE CETTE GARDE D'ÊTRE DÉSARMÉE EN SILENCE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un défaut mesuré ailleurs dans ce lot : **retirer le corpus d'épreuve PUIS la branche de garde
 * rend `exit 0` sans que rien ne bronche.** Trois verrous, et ils se tiennent :
 *
 *   V1 · {@link lireTable} ÉCHOUE DUR si le bloc `PROPERTY_ENUM_NAMESPACES` est introuvable ou
 *        vide. Une garde qui passe parce qu'elle ne trouve plus sa cible est pire qu'aucune garde.
 *   V2 · La moitié « doit rougir » du corpus est **DÉRIVÉE de la table** : une entrée = un cas.
 *        {@link autoEpreuve} compte ce qu'elle a RÉELLEMENT éprouvé — jamais la longueur du
 *        tableau — et exige les trois inégalités : `rouges >= TABLE.size`, `rouges` = tous les cas
 *        rouges déclarés, `verts` = tous les cas verts déclarés. La première version portait sur
 *        `casRouges.length`, et **l'ablation l'a prise en défaut le 2026-08-29** : neutraliser les
 *        deux boucles (`for (const cas of [])`) puis démonter la branche de garde rendait `exit 0`,
 *        le tableau étant resté plein. Le même contrôle est **rejoué dans le flux principal**
 *        (V2 bis), hors du corps d'`autoEpreuve` : il faut saboter deux endroits, pas un.
 *   V3 · {@link TEMOINS} : trois fichiers du dépôt dont on sait ce que la garde doit y voir. Ils
 *        attrapent le périmètre qui se vide (répertoire renommé, marche interrompue) et la
 *        résolution des traducteurs qui cesse de résoudre — les deux façons dont un scan rend
 *        « 0 défaut » en n'ayant rien lu.
 *
 * BORNE APPLIQUÉE = BORNE DÉCLARÉE : **zéro occurrence**, sur tout `takussan-web/src` hors tests.
 * Pas de cliquet, pas de plafond, pas de fichier exempté — le dépôt est à zéro depuis la
 * correction de `PropertyCard.tsx`, et il n'y a donc rien à tolérer. *Une borne déclarée qui ne
 * décrit pas la borne appliquée est une garde qui se raconte une histoire.*
 *
 * Usage : `node scripts/check-enum-namespaces.mjs [--report]`
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const WEB = join(RACINE, 'takussan-web');
const SRC = join(WEB, 'src');
const OPTIONS = join(SRC, 'components/property-form/options.ts');

const EXT = /\.(ts|tsx)$/;
const EST_TEST = /(__tests__|\.test\.|\.spec\.|[\\/]test[\\/])/;

/**
 * Témoins du périmètre et de la résolution. Chacun est une chose que la garde DOIT voir dans
 * l'état actuel du dépôt ; leur absence signe un scan qui n'a rien lu, pas un dépôt propre.
 *
 * ⚠ Un témoin n'est pas une exception ni une liste de règles : c'est un capteur. Si l'un de ces
 * fichiers est renommé, cette garde échoue en le nommant — c'est le comportement voulu, il vaut
 * mieux une minute de mise à jour qu'un vert qui ne mesure rien.
 */
const TEMOINS = [
  {
    fichier: 'src/components/property-form/PropertyWizard.tsx',
    // Le parcours de publication borne son traducteur PAR LA TABLE : c'est la forme juste, et
    // c'est ce que la résolution doit savoir reconnaître.
    attendu: 'un traducteur borné par PROPERTY_ENUM_NAMESPACES',
    verifie: (t) => [...t.values()].some((v) => v.parLaTable),
  },
  {
    fichier: 'src/components/property/PropertyCard.tsx',
    // Le fichier où vivait le contournement. Il déclare toujours `useTranslations('property')` —
    // le traducteur large qui rendait la composition possible.
    attendu: "un traducteur borné à l'espace littéral `property`",
    verifie: (t) => [...t.values()].some((v) => v.espace === 'property'),
  },
  {
    fichier: 'src/components/reporting/GrowthChart.tsx',
    // Un gabarit interpolé PARFAITEMENT légitime (`metrics.${metric}`) : si la détection des
    // appels cesse de détecter, ce témoin le dit avant que le compte à zéro ne mente.
    attendu: 'au moins un appel interpolé examiné',
    verifie: (_t, appels) => appels > 0,
  },
];

/* ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Blanchit les commentaires en préservant les POSITIONS (donc les numéros de ligne) et le contenu
 * des chaînes.
 *
 * ⚠ Caractère par caractère, et non par expression régulière : un `//` DANS une chaîne n'ouvre pas
 * un commentaire. C'est le défaut que `check-locale-figee.mjs` a payé de son côté. Et le
 * dépouillement des commentaires n'est pas cosmétique ici : le docblock d'`options.ts` CITE la
 * forme fautive, comme le fait celui-ci — une garde qui lit les commentaires rougit sur la
 * documentation de sa propre règle, et sera désarmée avant d'avoir rien attrapé.
 */
function neutraliser(src) {
  const out = src.split('');
  const blanchir = (a, b) => {
    for (let k = a; k < b && k < out.length; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i + 2;
      while (j < src.length && src[j] !== '\n') j += 1;
      blanchir(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = i + 2;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
      blanchir(i, Math.min(j + 2, src.length));
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        if (c !== '`' && src[j] === '\n') break; // chaîne non terminée : on ne mange pas le reste
        j += 1;
      }
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * V1 — la table, LUE dans `options.ts`. Rend `Map<chemin, nomDeLEntree>`.
 *
 * Échoue dur plutôt que de rendre une table vide : c'est la différence entre « rien à reprocher »
 * et « je n'ai rien regardé ».
 */
function lireTable() {
  let brut;
  try {
    brut = readFileSync(OPTIONS, 'utf8');
  } catch {
    throw new Error(
      `PROPERTY_ENUM_NAMESPACES introuvable : ${relative(RACINE, OPTIONS)} ne se lit pas.\n` +
        "  Si le fichier a déménagé, corrige `OPTIONS` dans scripts/check-enum-namespaces.mjs.\n" +
        '  Cette garde ne peut pas juger sans sa table, et elle ne la recopiera pas.',
    );
  }
  const bloc = /PROPERTY_ENUM_NAMESPACES\s*=\s*\{([\s\S]*?)\}\s*as const/.exec(neutraliser(brut));
  if (!bloc) {
    throw new Error(
      `PROPERTY_ENUM_NAMESPACES ne se laisse plus lire dans ${relative(RACINE, OPTIONS)}.\n` +
        '  La garde attend `export const PROPERTY_ENUM_NAMESPACES = { … } as const;`.',
    );
  }
  const table = new Map();
  for (const m of bloc[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*'([^']+)'/g)) table.set(m[2], m[1]);
  if (table.size === 0) {
    throw new Error('PROPERTY_ENUM_NAMESPACES est vide : la garde n’aurait plus rien à appliquer.');
  }
  return table;
}

/**
 * Les déclarations de traducteur. On ne suit que la forme `const|let|var X = …` : c'est 100 % des
 * traducteurs du dépôt sauf ceux de T4, et suivre le reste demanderait un analyseur.
 *
 * Quatre écritures, parce que les quatre existent dans le dépôt :
 *   `useTranslations('ns')` · `useTranslations()` (racine) ·
 *   `await getTranslations('ns')` · `getTranslations({ namespace: 'ns' })` ·
 *   `useTranslations(PROPERTY_ENUM_NAMESPACES.x)` — la forme JUSTE, résolue elle aussi (témoin V3).
 */
const DECLARATION =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*(?:(['"])([^'"]*)\2|\{[^}]*?namespace\s*:\s*(['"])([^'"]*)\4|(PROPERTY_ENUM_NAMESPACES\.([A-Za-z_$][\w$]*))|(\)))/g;

/**
 * L'appel qui compose : un traducteur, un gabarit, un premier morceau LITTÉRAL terminé par un
 * point, puis une interpolation. `t(`types.${v}`)`, `t(`funnel.stages.${s}`)`.
 *
 * Le groupe 2 est optionnel et couvre `t.has(…)` / `t.rich(…)` / `t.markup(…)` : `t.has` était la
 * moitié du contournement de `PropertyCard`, et l'ignorer aurait laissé passer la ligne même que
 * cette garde a été écrite pour attraper.
 */
const APPEL_COMPOSE =
  /\b([A-Za-z_$][\w$]*)(?:\.(has|rich|markup))?\(\s*`([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\.\$\{/g;

/** Tous les appels interpolés, composés ou non — sert au témoin de détection. */
const APPEL_INTERPOLE = /\b([A-Za-z_$][\w$]*)(?:\.(?:has|rich|markup))?\(\s*`[^`]*\$\{/g;

/** Les traducteurs d'un fichier : `Map<identifiant, { espace, parLaTable }>`. */
function traducteursDe(texte, table) {
  const out = new Map();
  DECLARATION.lastIndex = 0;
  for (const m of texte.matchAll(DECLARATION)) {
    if (m[6]) {
      // `PROPERTY_ENUM_NAMESPACES.x` — on résout par la table, pas par le nom de la propriété.
      const chemin = [...table].find(([, nom]) => nom === m[7])?.[0];
      if (chemin !== undefined) out.set(m[1], { espace: chemin, parLaTable: true });
      continue;
    }
    const espace = m[3] ?? m[5] ?? (m[8] ? '' : undefined);
    if (espace === undefined) continue;
    out.set(m[1], { espace, parLaTable: false });
  }
  return out;
}

/**
 * Les compositions fautives d'un texte déjà neutralisé.
 *
 * Rend `{ defauts, appels }` — `appels` est le nombre d'appels interpolés EXAMINÉS, qu'ils soient
 * fautifs ou non. C'est ce second chiffre qui rend visible un scan qui ne scanne plus.
 */
function compositionsDe(texte, table) {
  const traducteurs = traducteursDe(texte, table);
  const defauts = [];
  let appels = 0;

  APPEL_INTERPOLE.lastIndex = 0;
  for (const m of texte.matchAll(APPEL_INTERPOLE)) if (traducteurs.has(m[1])) appels += 1;

  APPEL_COMPOSE.lastIndex = 0;
  for (const m of texte.matchAll(APPEL_COMPOSE)) {
    const traducteur = traducteurs.get(m[1]);
    if (!traducteur) continue;
    const segments = m[3].split('.');
    for (let i = 1; i <= segments.length; i += 1) {
      const compose = segments.slice(0, i).join('.');
      const chemin = traducteur.espace ? `${traducteur.espace}.${compose}` : compose;
      if (!table.has(chemin)) continue;
      defauts.push({
        ligne: texte.slice(0, m.index).split('\n').length,
        traducteur: m[1],
        espace: traducteur.espace,
        compose,
        chemin,
        entree: table.get(chemin),
      });
      break;
    }
  }
  return { defauts, traducteurs, appels };
}

/* ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * V2 — l'auto-épreuve. Elle tourne À CHAQUE EXÉCUTION, avant le scan, et jette plutôt que
 * d'avertir.
 *
 * La moitié « doit rougir » est DÉRIVÉE de la table : un cas par entrée, fabriqué en coupant le
 * chemin à son dernier point. Il n'y a donc aucune liste de chemins à tenir à la main ici, et
 * l'inégalité de la fin (`rouges >= table.size`) rend impossible de retirer la dérivation sans
 * faire tomber la garde.
 *
 * La moitié « doit passer » est écrite à la main, et c'est normal : ce sont des formes réelles du
 * dépôt qu'aucune table ne peut engendrer.
 *
 * Rend le compte des deux moitiés — il est imprimé, parce qu'un corpus dont personne ne voit la
 * taille est un corpus qu'on peut vider.
 */
function autoEpreuve(table) {
  const casRouges = [];

  // — DÉRIVÉS : pour chaque entrée, la composition exacte qu'elle interdit.
  for (const chemin of table.keys()) {
    const point = chemin.lastIndexOf('.');
    const base = chemin.slice(0, point);
    const queue = chemin.slice(point + 1);
    casRouges.push({
      quoi: `dérivé de la table — ${chemin}`,
      code: `const t = useTranslations('${base}');\nconst l = t(\`${queue}.\${v}\`);`,
    });
  }

  // — ÉCRITS : les formes que la dérivation ne produit pas, et qui ont chacune une raison.
  const [premier] = [...table.keys()];
  const pointPremier = premier.lastIndexOf('.');
  const basePremier = premier.slice(0, pointPremier);
  const queuePremier = premier.slice(pointPremier + 1);
  casRouges.push(
    {
      quoi: '`t.has(…)` — la moitié du contournement de PropertyCard',
      code: `const t = useTranslations('${basePremier}');\nif (t.has(\`${queuePremier}.\${v}\`)) return null;`,
    },
    {
      quoi: 'la suite du gabarit après l’interpolation ne blanchit rien',
      code: `const t = useTranslations('${basePremier}');\nconst l = t(\`${queuePremier}.\${v}.label\`);`,
    },
    {
      quoi: 'traducteur à la RACINE (`useTranslations()`), chemin complet dans le gabarit',
      code: `const t = useTranslations();\nconst l = t(\`${premier}.\${v}\`);`,
    },
    {
      quoi: '`getTranslations` côté serveur',
      code: `const t = await getTranslations('${basePremier}');\nconst l = t(\`${queuePremier}.\${v}\`);`,
    },
    {
      quoi: '`getTranslations({ locale, namespace })`',
      code: `const t = await getTranslations({ locale, namespace: '${basePremier}' });\nconst l = t(\`${queuePremier}.\${v}\`);`,
    },
    {
      quoi: 'traducteur nommé autrement que `t`',
      code: `const tBidule = useTranslations('${basePremier}');\nconst l = tBidule(\`${queuePremier}.\${v}\`);`,
    },
  );

  const casVerts = [
    {
      quoi: 'LA FORME JUSTE — traducteur borné par la table, clé nue',
      code: 'const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);\nconst l = tType(bien.type);',
    },
    {
      quoi: 'une clé dynamique légitime (`GrowthChart`)',
      code: "const t = useTranslations('reporting');\nconst l = t(`metrics.${metric}`);",
    },
    {
      quoi: 'un sous-espace dispatché (`PropertyReservationDialog`)',
      code: "const t = useTranslations('property.reservation');\nconst l = t(`${action}.dialogTitle`);",
    },
    {
      quoi: 'un vocabulaire d’enum ABSENT de la table (cf. le corollaire du docblock)',
      code: "const t = useTranslations('property');\nconst l = t(`rentPeriodsShort.${p}`);",
    },
    {
      quoi: 'un identifiant qui n’est pas un traducteur',
      code: "const t = useTranslations('property');\nconst u = url(`types.${x}`);",
    },
    {
      quoi: 'la forme fautive CITÉE DANS UN COMMENTAIRE (ce fichier et options.ts en sont pleins)',
      code: "const t = useTranslations('property');\n// ne jamais écrire t(`types.${v}`)\nconst l = t('cards.title');",
    },
    {
      quoi: 'la forme fautive dans un commentaire de BLOC',
      code: "const t = useTranslations('property');\n/* t(`types.${v}`) */\nconst l = t('cards.title');",
    },
    {
      quoi: 'un espace voisin dont la table n’a que le PRÉFIXE',
      code: "const t = useTranslations('property');\nconst l = t(`typesLegacy.${v}`);",
    },
    {
      quoi: 'un traducteur non résolu (T4) — faux négatif assumé, jamais faux positif',
      code: 'const l = tr.types(`types.${v}`);',
    },
  ];

  // ⚠ On compte ce qui a été RÉELLEMENT ÉPROUVÉ, jamais `casRouges.length`. La différence n'est
  //   pas théorique : elle a été mesurée le 2026-08-29 sur la première version de ce fichier.
  //   Neutraliser les DEUX boucles (`for (const cas of [])`) puis démonter la branche de garde
  //   rendait `exit 0` — l'inégalité portait sur la taille du tableau, que personne n'avait
  //   touchée. *Un corpus qu'on ne parcourt pas est un corpus vide, quelle que soit sa longueur.*
  let rouges = 0;
  let verts = 0;

  for (const cas of casRouges) {
    const { defauts } = compositionsDe(neutraliser(cas.code), table);
    if (defauts.length === 0) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — la garde n’attrape plus : ${cas.quoi}\n${cas.code}`);
    }
    rouges += 1;
  }
  for (const cas of casVerts) {
    const { defauts } = compositionsDe(neutraliser(cas.code), table);
    if (defauts.length > 0) {
      throw new Error(
        `AUTO-ÉPREUVE ÉCHOUÉE — la garde refuse à tort : ${cas.quoi}\n${cas.code}\n` +
          `  → ${defauts.map((d) => d.chemin).join(', ')}`,
      );
    }
    verts += 1;
  }

  // V2 — les trois inégalités. La première interdit de vider la dérivation, les deux autres
  // interdisent de court-circuiter les boucles qui l'exercent.
  if (rouges < table.size) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — ${rouges} cas rouges éprouvés pour ${table.size} entrées de table.\n` +
        '  La moitié « doit rougir » du corpus DOIT être dérivée de la table, une entrée = un cas.',
    );
  }
  if (rouges !== casRouges.length || verts !== casVerts.length) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — ${rouges}/${casRouges.length} cas rouges et ${verts}/${casVerts.length} cas verts\n` +
        '  ont été réellement exécutés. Le corpus est déclaré plus grand qu’il n’est éprouvé.',
    );
  }

  return { rouges, verts };
}

/* ──────────────────────────────────────────────────────────────────────────────────────────── */

function fichiers(racine) {
  const out = [];
  const marche = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) marche(p);
      else if (EXT.test(p) && !EST_TEST.test(p)) out.push(p);
    }
  };
  marche(racine);
  return out;
}

const table = lireTable();
const corpus = autoEpreuve(table);
// V2 bis — {@link autoEpreuve} peut être court-circuitée dans son propre corps ; ce contrôle-ci
// vit dehors. Une garde dont un seul geste suffit à faire taire l'auto-épreuve n'en a pas.
if (!(corpus.rouges >= table.size && corpus.verts > 0)) {
  console.error(
    `✗ AUTO-ÉPREUVE MUETTE — ${corpus.rouges} formes attrapées (minimum ${table.size}), ${corpus.verts} laissées passer.`,
  );
  console.error('  La garde n’a pas été éprouvée : son verdict sur le dépôt ne vaut rien.');
  process.exit(1);
}

const cibles = fichiers(SRC).filter((f) => f !== OPTIONS);
if (cibles.length === 0) {
  console.error(`✗ aucun fichier scanné sous ${relative(RACINE, SRC)} — la garde n’a rien mesuré.`);
  process.exit(1);
}

const defauts = [];
let appelsExamines = 0;
let traducteursResolus = 0;
const vus = new Map();

for (const f of cibles) {
  const texte = neutraliser(readFileSync(f, 'utf8'));
  const r = compositionsDe(texte, table);
  appelsExamines += r.appels;
  traducteursResolus += r.traducteurs.size;
  vus.set(relative(WEB, f).split('\\').join('/'), r);
  for (const d of r.defauts) defauts.push({ fichier: relative(WEB, f), ...d });
}

// V3 — les témoins. Un scan qui rend 0 sans avoir rien lu échoue ici, pas à la revue.
for (const temoin of TEMOINS) {
  const r = vus.get(temoin.fichier);
  if (!r) {
    console.error(`✗ TÉMOIN PERDU — ${temoin.fichier} n’a pas été scanné.`);
    console.error(`  Attendu : ${temoin.attendu}.`);
    console.error('  Soit le périmètre s’est vidé, soit le fichier a été renommé. Dans les deux');
    console.error('  cas la garde ne mesure plus ce qu’elle dit mesurer : corrige `TEMOINS`.');
    process.exit(1);
  }
  if (!temoin.verifie(r.traducteurs, r.appels)) {
    console.error(`✗ TÉMOIN MUET — ${temoin.fichier} : ${temoin.attendu} — plus rien n’y est vu.`);
    console.error('  La résolution des traducteurs ou la détection des appels a cessé de');
    console.error('  fonctionner. Un « 0 défaut » dans cet état ne prouve rien.');
    process.exit(1);
  }
}

if (defauts.length > 0) {
  console.error(`✗ ${defauts.length} chemin(s) de vocabulaire d’enum composé(s) à la main.`);
  for (const d of defauts) {
    console.error(
      `  ${d.fichier}:${d.ligne}  ${d.traducteur}=\`${d.espace || '(racine)'}\` + \`${d.compose}.\${…}\` → ${d.chemin}  (PROPERTY_ENUM_NAMESPACES.${d.entree})`,
    );
  }
  console.error('');
  console.error('  La forme juste — le traducteur est borné PAR LA TABLE, la clé est la valeur nue :');
  console.error("    const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);");
  console.error('    enumLabel(tType, propertyTypeValues, bien.type)   // repli sur la valeur brute');
  console.error('');
  console.error('  ⚠ Ne « corrige » pas en recopiant le chemin ailleurs : c’est le même défaut, plus');
  console.error('    loin. La table vit dans src/components/property-form/options.ts.');
  process.exit(1);
}

console.log(
  `✓ vocabulaires d’enum : 0 chemin composé à la main sur ${cibles.length} fichiers de takussan-web/src.`,
);
console.log(
  `  Table LUE dans ${relative(RACINE, OPTIONS)} : ${table.size} entrées — aucune n’est recopiée ici.`,
);
console.log(
  `  Corpus d’épreuve : ${corpus.rouges} formes attrapées (dont ${table.size} dérivées de la table), ${corpus.verts} formes légitimes laissées passer.`,
);
console.log(
  `  Scan : ${traducteursResolus} traducteurs résolus, ${appelsExamines} appels interpolés examinés, ${TEMOINS.length} témoins vérifiés.`,
);
console.log(
  '  ⚠ PLANCHER, pas preuve : une clé d’enum écrite en dur SANS interpolation reste invisible ici',
);
console.log('    (T1 du docblock). Elle reste un travail de revue.');

if (process.argv.includes('--report')) {
  const parEspace = new Map();
  for (const r of vus.values()) {
    for (const t of r.traducteurs.values()) {
      if (!t.parLaTable) continue;
      parEspace.set(t.espace, (parEspace.get(t.espace) ?? 0) + 1);
    }
  }
  console.log('\n  — traducteurs bornés PAR LA TABLE (la forme juste), par entrée —');
  if (parEspace.size === 0) console.log('    aucun');
  for (const [chemin, n] of [...parEspace].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${chemin} (PROPERTY_ENUM_NAMESPACES.${table.get(chemin)}) — ${n}`);
  }
  const jamaisUtilisees = [...table].filter(([chemin]) => !parEspace.has(chemin));
  if (jamaisUtilisees.length > 0) {
    console.log('\n  — entrées de la table qu’aucun traducteur n’emprunte (T2 : elles peuvent être');
    console.log('    atteintes par un espace de noms recopié en toutes lettres) —');
    for (const [chemin, nom] of jamaisUtilisees) console.log(`    ${chemin} (.${nom})`);
  }
}
