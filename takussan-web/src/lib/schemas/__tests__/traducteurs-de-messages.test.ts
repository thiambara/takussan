import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import {
  msgValidation,
  traduireChampsErreurs,
  traduireIssuesValidation,
  traduireMessageValidation,
  type Traducteur,
} from '../messages';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE — et pourquoi il ne se contente pas de tester trois fonctions
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le lot J de TCK-292 a converti `src/lib/schemas/*` au patron « le schéma porte une CLÉ, le rendu
 * la résout ». Le patron est le bon. **Son inventaire ne l'était pas** : il s'était fait par
 * `grep -rn zodResolver src`, une commande structurellement aveugle au consommateur qui appelle
 * `safeParse()` et rend le message directement.
 *
 * Prix mesuré : **18 messages de validation affichés à l'utilisateur sous forme de clé brute**
 * (`validation.tag.nameRequired` au lieu de « Le libellé est requis. »), dans trois écrans. **Aucun
 * test ne parcourait ces chemins** — la CI était verte, `tsc --noEmit` aussi, `npm run lint` aussi.
 * Et deux `zodResolver` nus, que ce même grep aurait dû voir, avaient été manqués par-dessus.
 *
 * Un test par cas corrigé ne suffit donc pas : il verrouille les trois écrans d'hier, pas le
 * quatrième de demain. Ce fichier porte les quatre contrôles qui verrouillent la FAMILLE :
 *
 *   1. les traducteurs eux-mêmes, sur les trois formes réellement observées ;
 *   2. le RECENSEMENT des consommateurs (`describe('recensement…')`) — un consommateur neuf qui ne
 *      traduit pas fait rougir ce fichier, sans que personne n'ait à refaire un grep ;
 *   3. la MACHINERIE de ce recensement (`describe('la machinerie…')`), fixée sur des contenus
 *      synthétiques — parce que le point 2 passe au vert aussi bien quand le dépôt est sain que
 *      quand la garde est aveugle, et que c'est ainsi que sa première version a survécu à cinq
 *      contournements ;
 *   4. la COMPLÉTUDE du dictionnaire — une clé de schéma sans entrée `fr`/`en`/`wo` rendrait, elle
 *      aussi, la clé brute, par un tout autre chemin.
 */

/** Faux traducteur : rend la clé encadrée, pour qu'un message NON traduit se distingue à l'œil. */
const tFactice: Traducteur = (cle, valeurs) =>
  valeurs === undefined ? `«${cle}»` : `«${cle}|${JSON.stringify(valeurs)}»`;

describe('traduireMessageValidation', () => {
  it('résout une clé de schéma', () => {
    expect(traduireMessageValidation(msgValidation('tag.nameRequired'), tFactice))
      .toBe('«validation.tag.nameRequired»');
  });

  it('transmet les paramètres ICU au traducteur', () => {
    expect(traduireMessageValidation(msgValidation('message.bodyTooLong', { max: 4000 }), tFactice))
      .toBe('«validation.message.bodyTooLong|{"max":4000}»');
  });

  it('laisse INTACT un libellé déjà rédigé — un 422 de Laravel ne se retraduit pas', () => {
    expect(traduireMessageValidation('Le nom est déjà pris.', tFactice)).toBe('Le nom est déjà pris.');
  });

  it('laisse intacte une chaîne qui commence par « validation » sans être une clé de ce module', () => {
    // Le préfixe est `validation.` avec son point : « validationRequise » n'en est pas une.
    expect(traduireMessageValidation('validationRequise', tFactice)).toBe('validationRequise');
  });

  it('rend `undefined` pour `undefined` — `issues[0]?.message` sur un tableau vide', () => {
    expect(traduireMessageValidation(undefined, tFactice)).toBeUndefined();
  });
});

describe('traduireIssuesValidation', () => {
  it('traduit chaque message et PRÉSERVE le reste de l’issue', () => {
    const issues = [
      { code: 'too_small', path: ['name'], message: msgValidation('tag.nameRequired') },
      { code: 'custom', path: ['color'], message: 'déjà rédigé' },
    ] as const;
    expect(traduireIssuesValidation(issues, tFactice)).toEqual([
      { code: 'too_small', path: ['name'], message: '«validation.tag.nameRequired»' },
      { code: 'custom', path: ['color'], message: 'déjà rédigé' },
    ]);
  });

  it('ne mute pas le tableau d’entrée', () => {
    const issues = [{ message: msgValidation('tag.nameRequired') }];
    traduireIssuesValidation(issues, tFactice);
    expect(issues[0].message).toBe('validation.tag.nameRequired');
  });
});

describe('traduireChampsErreurs', () => {
  it('traduit TOUS les messages de TOUS les champs, pas seulement le premier', () => {
    expect(traduireChampsErreurs(
      {
        key: [msgValidation('setting.keyTooLong'), msgValidation('setting.keyPattern')],
        provider: [msgValidation('setting.providerRequired')],
      },
      tFactice,
    )).toEqual({
      key: ['«validation.setting.keyTooLong»', '«validation.setting.keyPattern»'],
      provider: ['«validation.setting.providerRequired»'],
    });
  });

  it('conserve les entrées `undefined` — l’appelant peut fusionner avec les erreurs d’un 422', () => {
    expect(traduireChampsErreurs({ name: undefined }, tFactice)).toEqual({ name: undefined });
  });

  it('ne mute pas l’objet d’entrée', () => {
    const champs = { name: [msgValidation('tag.nameRequired')] };
    traduireChampsErreurs(champs, tFactice);
    expect(champs.name[0]).toBe('validation.tag.nameRequired');
  });
});

/* ──────────────────────────────────────────────────────────────────────────────────────────────
 * RECENSEMENT — le contrôle qui aurait attrapé la famille entière
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ CE QUE CE RECENSEMENT SUIT, ET POURQUOI CE N'EST PLUS UN NOM DE VARIABLE.
 *
 * Sa première version reconnaissait un consommateur à la FORME DU NOM de la variable validée —
 * `/\b(\w*[Ss]chema)\s*\.\s*(safeParse|parse|…)/` — et à la présence de la chaîne `@/lib/schemas`
 * quelque part dans le fichier. Un vérificateur l'a mise à l'épreuve par mutation, sur un composant
 * fautif écrit exprès : la garde rougissait bien sur la forme canonique, et **restait verte sur
 * cinq variantes du MÊME défaut** (mesuré le 2026-08-20, `Mutant.tsx` déposé dans `src/`) :
 *
 *   a. `import { tagFormSchema as formulaireDeTag }` puis `formulaireDeTag.safeParse(v)`
 *      — l'identifiant ne contient plus « schema ».
 *   b. `from '../../lib/schemas/tag'` au lieu de `@/lib/schemas/tag` — la chaîne cherchée
 *      n'apparaît nulle part, alors que c'est le MÊME module.
 *   c. `tagFormSchema.pick({ name: true }).safeParse(v)` — le jeton qui précède `.safeParse`
 *      est `)`, pas un identifiant.
 *   d. `const s = tagFormSchema; s.safeParse(v)` — une liaison locale d'une lettre.
 *   e. un schéma bâti DANS le composant à partir de `msgValidation` et nommé `formulaire`
 *      — il porte les mêmes clés, et rend donc la même clé brute.
 *
 * Aucune de ces cinq formes n'est exotique : ce sont des écritures ordinaires. Une garde qui les
 * laisse passer ne garde pas « presque tout », elle garde *le seul cas qu'on avait déjà trouvé*.
 *
 * D'où la propriété suivie désormais : **l'IMPORT**. Un fichier qui importe à l'exécution quoi que
 * ce soit de `src/lib/schemas/` — par l'alias `@/` OU par un chemin relatif, les deux étant résolus
 * en chemin absolu et comparés au dossier — et qui exécute une validation zod, doit traduire.
 * *Un nom d'identifiant est une convention ; un import est une dépendance.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT EXACTEMENT — ET CE QU'IL NE FAIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le grain est LE FICHIER, pas l'expression : l'import dit que le fichier touche aux schémas, et
 * tout appel `.parse` / `.safeParse` qui s'y trouve compte — sauf si la racine du récepteur est un
 * global documenté ci-dessous. Ce choix est délibérément GROSSIER et il crie plutôt qu'il ne se
 * tait : un fichier qui importerait un schéma et appellerait `Date.parse()` sans jamais valider
 * serait dénoncé à tort. Le prix d'un faux positif est une ligne à ajouter dans
 * {@link RACINES_HORS_ZOD}, sous mesure ; le prix d'un faux négatif a été de 18 messages en clé
 * brute devant l'utilisateur.
 *
 * Trois angles morts subsistent, et ils sont écrits ici parce qu'un docblock qui promet plus que
 * son code est exactement la faute d'origine :
 *
 *   · un schéma atteint par RÉ-EXPORT (`@/lib/foo` qui republie `tagFormSchema`) : le fichier
 *     n'importe alors rien de `lib/schemas`, et il n'est pas vu ;
 *   · un schéma reçu en PARAMÈTRE ou en prop, validé dans un fichier qui n'importe rien ;
 *   · « traduit » signifie qu'un traducteur est APPELÉ dans le fichier, pas que le message rendu
 *     à l'écran est bien celui qui passe par lui. Un fichier peut traduire un message et en rendre
 *     un autre nu. C'est la raison d'être de `attendAucuneCleBrute` (`src/test/cles-brutes.ts`),
 *     qui, elle, regarde le DOM effectivement rendu.
 */

const RACINE_SRC = path.resolve(__dirname, '../../..');

/** Le dossier suivi : tout import qui résout ici — alias ou relatif — met son fichier sous garde. */
const DOSSIER_DES_SCHEMAS = path.join(RACINE_SRC, 'lib/schemas');

/** Le seul fichier autorisé à monter `zodResolver` : celui qui l'enveloppe. */
const ENVELOPPE_DU_RESOLVEUR = 'hooks/useApiForm.ts';

/** D'où vient `zodResolver`. Suivi À L'IMPORT, donc insensible à `zodResolver as resolveur`. */
const MODULE_DU_RESOLVEUR = '@hookform/resolvers/zod';

/** Un consommateur est « traduit » s'il APPELLE l'une de ces fonctions. Une seule suffit. */
const TRADUCTEURS = [
  'traduireMessageValidation',
  'traduireIssuesValidation',
  'traduireChampsErreurs',
  'traduireErreursValidation',
  'useResolveurValidation',
] as const;

/**
 * Le traducteur doit être APPELÉ — les parenthèses comptent.
 *
 * Sans elles, un simple `import { traduireMessageValidation }` jamais utilisé suffisait à faire
 * passer un fichier fautif : mesuré, la garde restait verte sur un mutant qui importait le
 * traducteur et rendait quand même `parsed.error.issues[0]?.message` nu.
 */
const APPEL_DE_TRADUCTEUR = new RegExp(`\\b(?:${TRADUCTEURS.join('|')})\\s*\\(`);

/**
 * Les récepteurs de `.parse(` qui ne sont PAS des schémas zod.
 *
 * La liste est courte parce qu'elle est MESURÉE, pas imaginée : au 2026-08-20, les seules racines
 * de `.parse` / `.safeParse` dans `src/` sont `JSON` (8 occurrences) et trois schémas zod. Toute
 * autre racine est donc suspecte par défaut — c'est le sens de la garde.
 */
const RACINES_HORS_ZOD = new Set(['JSON']);

interface Fichier {
  readonly relatif: string;
  readonly contenu: string;
}

/**
 * Retire les lignes de COMMENTAIRE, et rien d'autre.
 *
 * ⚠️ Sans cela, ce recensement se fait berner par sa propre documentation : la première version
 * dénonçait `messages.ts`, `DepositRefundModal.tsx` et `BookingTunnel.tsx` — trois fichiers dont
 * les commentaires expliquent précisément *qu'il ne faut pas* monter `zodResolver`. Une garde qui
 * confond la prose et le code ne garde rien.
 *
 * Le découpage est délibérément GROSSIER : ne sont retirées que les lignes dont le contenu commence
 * par `//`, `/*` ou `*`. Ce sont les 100 % des commentaires réellement rencontrés ici (blocs JSDoc
 * et lignes entières). Un commentaire de FIN de ligne — `foo(); // zodResolver` — reste visible.
 *
 * ⚠️ **Ce n'est PAS toujours le bon sens de l'erreur, et une version antérieure de ce docblock
 * l'affirmait à tort** (« peut crier à tort, jamais se taire à tort »). Le sens dépend du côté où
 * tombe le commentaire retenu : côté APPEL DE VALIDATION il fait crier — c'est bien le bon sens ;
 * côté TRADUCTEUR il fait TAIRE. Mesuré le 2026-08-20 par mutation déposée dans `src/` : un
 * fichier qui valide, rend `error.issues[0]?.message` nu, et porte
 * `// traduireMessageValidation() viendra plus tard` en fin de ligne, laisse la garde VERTE 29/29.
 * Un lexeur complet corrigerait les deux côtés ; il n'est pas écrit ici, et l'angle mort est donc
 * réel — un quatrième, à lire avec les trois de l'en-tête du recensement. Un
 * lexeur complet coûterait le suivi des littéraux, des gabarits et des littéraux d'expression
 * régulière — dont ce dépôt est plein (`/^https?:\/\/[^\s]+$/`) — pour supprimer un faux positif
 * qui ne s'est jamais produit.
 */
function sansCommentaires(contenu: string): string {
  return contenu
    .split('\n')
    .filter((ligne) => !/^\s*(\/\/|\/\*|\*)/.test(ligne))
    .join('\n');
}

/**
 * Parcourt `src/` en entier. **Un seul répertoire est écarté — `__tests__` — et rien d'autre.**
 *
 * ⚠️ Une première version écartait aussi tout répertoire NOMMÉ `messages`, pour sauter les
 * dictionnaires de `src/messages/`. Elle sautait donc `src/components/messages/` par la même
 * occasion — c'est-à-dire l'un des deux fichiers que ce recensement existe pour attraper. Mesuré
 * par ablation : en remettant un `zodResolver` nu dans `ChatView.tsx`, la garde restait **verte**.
 *
 * L'exclusion était en outre INUTILE : `src/messages/` ne contient que des `.json`, que le filtre
 * d'extension ci-dessous écarte déjà. Elle ne protégeait de rien et aveuglait la garde.
 * *Une garde se prouve en la faisant échouer ; sinon on ne mesure que sa capacité à passer.*
 */
function fichiersSources(depuis = RACINE_SRC): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(depuis)) {
    const complet = path.join(depuis, entree);
    if (statSync(complet).isDirectory()) {
      if (entree === '__tests__') continue;
      sortie.push(...fichiersSources(complet));
    } else if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) {
      sortie.push(complet);
    }
  }
  return sortie;
}

/** `import … from '…'` — la clause (entre `import` et `from`) et le spécificateur. */
const DECLARATION_D_IMPORT = /\bimport\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;

/** `await import('…')` — pas de clause : le seul spécificateur suffit à mettre sous garde. */
const IMPORT_DYNAMIQUE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Résout un spécificateur d'import en chemin absolu — `null` s'il désigne un paquet npm.
 *
 * C'est ici que l'alias et le chemin relatif cessent d'être deux mondes : `@/lib/schemas/tag` et
 * `../../lib/schemas/tag` rendent la MÊME valeur, et la garde ne peut plus être contournée en
 * changeant de style d'import.
 */
function resoutLeModule(fichier: Fichier, specificateur: string): string | null {
  if (specificateur.startsWith('@/')) return path.join(RACINE_SRC, specificateur.slice(2));
  if (specificateur.startsWith('.')) {
    return path.resolve(RACINE_SRC, path.dirname(fichier.relatif), specificateur);
  }
  return null;
}

function estSousLesSchemas(chemin: string): boolean {
  const relatif = path.relative(DOSSIER_DES_SCHEMAS, chemin);
  return relatif === '' || (!relatif.startsWith('..') && !path.isAbsolute(relatif));
}

/**
 * `true` si le fichier importe à L'EXÉCUTION quelque chose de `src/lib/schemas/`.
 *
 * `import type { … }` ne compte pas : un type ne se `safeParse` pas, et le compter ferait crier la
 * garde sur les fichiers qui ne prennent du module que sa forme.
 */
function importeDesSchemas(fichier: Fichier): boolean {
  for (const [, clause, specificateur] of fichier.contenu.matchAll(DECLARATION_D_IMPORT)) {
    if (/^\s*type\b/.test(clause)) continue;
    const cible = resoutLeModule(fichier, specificateur);
    if (cible !== null && estSousLesSchemas(cible)) return true;
  }
  for (const [, specificateur] of fichier.contenu.matchAll(IMPORT_DYNAMIQUE)) {
    const cible = resoutLeModule(fichier, specificateur);
    if (cible !== null && estSousLesSchemas(cible)) return true;
  }
  return false;
}

/** `true` si le fichier importe le module d'où sort `zodResolver`, quel que soit le nom local. */
function importeLeResolveurZod(fichier: Fichier): boolean {
  for (const [, , specificateur] of fichier.contenu.matchAll(DECLARATION_D_IMPORT)) {
    if (specificateur === MODULE_DU_RESOLVEUR) return true;
  }
  return false;
}

/**
 * L'appel de validation lui-même. Ce qui le PRÉCÈDE est lu par {@link racineDuRecepteur}.
 *
 * ⚠️ `spa` n'est pas un oubli d'orthographe : c'est l'alias que zod donne lui-même à
 * `safeParseAsync`, et il EXISTE dans la version installée — mesuré le 2026-08-20,
 * `typeof z.string().spa === 'function'` sur zod 4.4.3. Sans lui, un consommateur qui écrit
 * `await tagFormSchema.spa(v)` puis rend `error.issues[0]?.message` nu passait au VERT : mutation
 * déposée dans `src/`, garde verte 29/29. La liste des verbes est donc à tenir à jour avec zod —
 * elle est le seul endroit où ce recensement peut se taire sans le dire.
 */
const APPEL_DE_VALIDATION = /\.\s*(?:safeParse|parse|safeParseAsync|parseAsync|spa)\s*\(/g;

/**
 * Remonte la chaîne d'accès à gauche d'un `.safeParse(` et rend l'identifiant RACINE.
 *
 * ```
 * tagFormSchema.pick({ name: true }).safeParse(v)   → 'tagFormSchema'
 * schemas.tagFormSchema.safeParse(v)                → 'schemas'
 * JSON.parse(brut)                                  → 'JSON'
 * ```
 *
 * C'est ce parcours — et non un motif sur le nom — qui traverse les combinateurs zod : `pick`,
 * `omit`, `partial`, `extend`, `superRefine`, et tout ce qui viendra après eux. Les parenthèses et
 * les crochets sont franchis à l'équilibre, ce qui rend le résultat indépendant de ce qu'ils
 * contiennent.
 *
 * Rend `null` quand le récepteur n'est pas une chaîne d'identifiants (un littéral, un gabarit).
 * L'appelant traite ce `null` comme SUSPECT : ne pas savoir n'est pas une raison de se taire.
 */
function racineDuRecepteur(contenu: string, indexDuPoint: number): string | null {
  let i = indexDuPoint - 1;
  let racine: string | null = null;
  for (;;) {
    while (i >= 0 && /\s/.test(contenu[i])) i--;
    if (i < 0) return racine;
    const caractere = contenu[i];
    if (caractere === ')' || caractere === ']') {
      const ouvrant = caractere === ')' ? '(' : '[';
      let profondeur = 0;
      for (; i >= 0; i--) {
        if (contenu[i] === caractere) profondeur++;
        else if (contenu[i] === ouvrant && --profondeur === 0) break;
      }
      if (i < 0) return racine;
      i--;
      continue;
    }
    if (/[\w$]/.test(caractere)) {
      const fin = i + 1;
      while (i >= 0 && /[\w$]/.test(contenu[i])) i--;
      racine = contenu.slice(i + 1, fin);
      let j = i;
      while (j >= 0 && /\s/.test(contenu[j])) j--;
      if (j >= 0 && contenu[j] === '.') {
        i = j - 1;
        continue;
      }
      return racine;
    }
    return racine;
  }
}

/** Les racines de tous les appels de validation du fichier — `null` compris. */
function racinesDesValidations(contenu: string): (string | null)[] {
  return [...contenu.matchAll(APPEL_DE_VALIDATION)]
    .map((m) => racineDuRecepteur(contenu, m.index ?? 0));
}

/** Importe des schémas ET valide : à ce titre, il doit traduire. */
function estConsommateurDeSchema(fichier: Fichier): boolean {
  if (!importeDesSchemas(fichier)) return false;
  return racinesDesValidations(fichier.contenu)
    .some((racine) => racine === null || !RACINES_HORS_ZOD.has(racine));
}

function traduitSesMessages(fichier: Fichier): boolean {
  return APPEL_DE_TRADUCTEUR.test(fichier.contenu);
}

describe('recensement des consommateurs de schémas (le contrôle qui manquait)', () => {
  const sources: Fichier[] = fichiersSources().map((chemin) => ({
    relatif: path.relative(RACINE_SRC, chemin).split(path.sep).join('/'),
    contenu: sansCommentaires(readFileSync(chemin, 'utf8')),
  }));

  it('trouve un nombre PLAUSIBLE de fichiers — sinon ce recensement ne garde rien', () => {
    // Une garde qui ne trouve plus sa cible rend un tableau vide et passe au vert en ne
    // vérifiant plus rien : sa sortie ressemble alors à un succès (cf. ardoise D-15, D-18, D-44).
    // Ce test-ci est le garde-fou du recensement lui-même.
    expect(sources.length).toBeGreaterThan(500);
  });

  it('voit des fichiers qui IMPORTENT `lib/schemas` — le refus de vacuité, un cran plus bas', () => {
    // Le compte de fichiers ci-dessus ne dit rien de la résolution des imports : elle pourrait être
    // cassée (alias mal reconstruit, dossier déplacé) et rendre zéro importateur sans qu'aucune
    // assertion ne bouge. Les deux vacuités sont donc refusées séparément.
    expect(sources.filter(importeDesSchemas).length).toBeGreaterThan(0);
  });

  it('AUCUN fichier ne monte `zodResolver` en direct', () => {
    // C'est le défaut que l'en-tête de `messages.ts` annonçait comme « visible à l'œil nu » —
    // et deux fichiers l'ont porté sans être vus, parce que « à l'œil nu » suppose un œil.
    // Deux critères, pas un : le NOM (qui attrape un ré-export local) et le MODULE (qui attrape
    // `import { zodResolver as resolveur }`, invisible au premier).
    const fautifs = sources
      .filter((f) => f.relatif !== ENVELOPPE_DU_RESOLVEUR)
      .filter((f) => /\bzodResolver\b/.test(f.contenu) || importeLeResolveurZod(f))
      .map((f) => f.relatif);
    expect(fautifs).toEqual([]);
  });

  it('TOUT consommateur qui valide un schéma traduit ses messages', () => {
    const consommateurs = sources.filter(estConsommateurDeSchema);
    // Le recensement doit voir quelque chose : à zéro, l'assertion suivante est vide de sens.
    expect(consommateurs.length).toBeGreaterThan(0);

    const fautifs = consommateurs.filter((f) => !traduitSesMessages(f)).map((f) => f.relatif);
    expect(fautifs).toEqual([]);
  });
});

/* ──────────────────────────────────────────────────────────────────────────────────────────────
 * LA MACHINERIE DU RECENSEMENT — chaque cas ci-dessous est une MUTATION qui passait au vert
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les tests du bloc précédent ne peuvent pas prouver que la garde VOIT : ils passent aussi bien
 * parce que le dépôt est sain que parce que la garde est aveugle — c'est précisément comment sa
 * version d'origine a survécu à cinq contournements. Les cas ci-dessous fixent donc la capacité de
 * détection elle-même, sur des contenus synthétiques, et ils sont écrits d'après des mutations
 * réellement déposées dans `src/` le 2026-08-20 : chacune rendait la garde d'origine verte.
 */

const AVEC_APPEL_NU = `
  export function Mutant({ v }: { readonly v: unknown }) {
    const parsed = SCHEMA.safeParse(v);
    return <p>{parsed.success ? null : parsed.error.issues[0]?.message}</p>;
  }
`;

function mutant(relatif: string, contenu: string): Fichier {
  return { relatif, contenu: sansCommentaires(contenu) };
}

describe('la machinerie du recensement, prouvée par mutation', () => {
  it('VOIT la forme canonique — alias `@/lib/schemas`, identifiant en « Schema »', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { tagFormSchema } from '@/lib/schemas/tag';${AVEC_APPEL_NU.replace('SCHEMA', 'tagFormSchema')}`,
    );
    expect(estConsommateurDeSchema(f)).toBe(true);
    expect(traduitSesMessages(f)).toBe(false);
  });

  it('VOIT un import RENOMMÉ — l’identifiant ne contient plus « schema » (mutation a)', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { tagFormSchema as formulaireDeTag } from '@/lib/schemas/tag';${AVEC_APPEL_NU.replace('SCHEMA', 'formulaireDeTag')}`,
    );
    expect(estConsommateurDeSchema(f)).toBe(true);
  });

  it('VOIT un import RELATIF — le même module, écrit autrement (mutation b)', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { tagFormSchema } from '../../lib/schemas/tag';${AVEC_APPEL_NU.replace('SCHEMA', 'tagFormSchema')}`,
    );
    expect(estConsommateurDeSchema(f)).toBe(true);
  });

  it('VOIT un schéma DÉRIVÉ — le jeton avant `.safeParse` est `)` (mutation c)', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { tagFormSchema } from '@/lib/schemas/tag';${AVEC_APPEL_NU.replace('SCHEMA', 'tagFormSchema.pick({ name: true })')}`,
    );
    expect(estConsommateurDeSchema(f)).toBe(true);
    const chaine = 'tagFormSchema.pick({ name: true }).safeParse(v)';
    expect(racineDuRecepteur(chaine, chaine.indexOf('.safeParse'))).toBe('tagFormSchema');
  });

  it('VOIT une liaison INDIRECTE — `const s = tagFormSchema` (mutation d)', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { tagFormSchema } from '@/lib/schemas/tag';
       const s = tagFormSchema;${AVEC_APPEL_NU.replace('SCHEMA', 's')}`,
    );
    expect(estConsommateurDeSchema(f)).toBe(true);
  });

  it('VOIT un schéma bâti SUR PLACE à partir de `msgValidation` (mutation e)', () => {
    // Il ne vient pas de `lib/schemas/`, mais il porte les mêmes clés : même clé brute à l'écran.
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { z } from 'zod';
       import { msgValidation } from '@/lib/schemas/messages';
       const formulaire = z.object({ name: z.string().min(1, msgValidation('tag.nameRequired')) });
       ${AVEC_APPEL_NU.replace('SCHEMA', 'formulaire')}`,
    );
    expect(estConsommateurDeSchema(f)).toBe(true);
  });

  it('n’accorde PAS le bénéfice d’un traducteur seulement IMPORTÉ — il doit être appelé', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { tagFormSchema } from '@/lib/schemas/tag';
       import { traduireMessageValidation } from '@/lib/schemas/messages';
       void traduireMessageValidation;${AVEC_APPEL_NU.replace('SCHEMA', 'tagFormSchema')}`,
    );
    expect(estConsommateurDeSchema(f)).toBe(true);
    expect(traduitSesMessages(f)).toBe(false);
  });

  it('accorde le bénéfice d’un traducteur APPELÉ', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { tagFormSchema } from '@/lib/schemas/tag';
       import { traduireChampsErreurs } from '@/lib/schemas/messages';
       const e = traduireChampsErreurs(parsed.error.flatten().fieldErrors, t);`,
    );
    expect(traduitSesMessages(f)).toBe(true);
  });

  it('IGNORE `JSON.parse` — un récepteur hors zod, mesuré comme le seul du dépôt', () => {
    const f = mutant(
      'lib/schemas/setting.ts',
      `import { msgValidation } from './messages';
       const valeur = JSON.parse(brut);`,
    );
    expect(importeDesSchemas(f)).toBe(true);
    expect(estConsommateurDeSchema(f)).toBe(false);
  });

  it('IGNORE un `import type` — un type ne se `safeParse` pas', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import type { TagFormValues } from '@/lib/schemas/tag';
       const d = Date.parse(x);`,
    );
    expect(importeDesSchemas(f)).toBe(false);
    expect(estConsommateurDeSchema(f)).toBe(false);
  });

  it('VOIT `zodResolver` renommé à l’import — le module, pas le nom', () => {
    const f = mutant(
      'components/admin-tags/Mutant.tsx',
      `import { zodResolver as resolveur } from '@hookform/resolvers/zod';`,
    );
    expect(importeLeResolveurZod(f)).toBe(true);
  });
});

/* ──────────────────────────────────────────────────────────────────────────────────────────────
 * COMPLÉTUDE DU DICTIONNAIRE — l'autre façon de rendre une clé brute
 * ────────────────────────────────────────────────────────────────────────────────────────────── */

describe('complétude du dictionnaire pour les clés de schéma', () => {
  const cles = (() => {
    const trouvees = new Set<string>();
    const dossier = path.join(RACINE_SRC, 'lib/schemas');
    for (const fichier of readdirSync(dossier)) {
      if (!fichier.endsWith('.ts')) continue;
      const contenu = readFileSync(path.join(dossier, fichier), 'utf8');
      for (const m of contenu.matchAll(/msgValidation\(\s*'([^']+)'/g)) trouvees.add(m[1]);
    }
    return [...trouvees].sort();
  })();

  function resous(dictionnaire: unknown, chemin: string): unknown {
    return chemin.split('.').reduce<unknown>(
      (noeud, cle) => (noeud && typeof noeud === 'object'
        ? (noeud as Record<string, unknown>)[cle]
        : undefined),
      dictionnaire,
    );
  }

  it('récolte les clés des schémas — et pas zéro', () => {
    expect(cles.length).toBeGreaterThan(100);
  });

  it.each([['fr', fr], ['en', en], ['wo', wo]] as const)(
    'toute clé de schéma a une entrée en %s',
    (_locale, dictionnaire) => {
      // Une clé absente rend la CLÉ BRUTE à l'écran, exactement comme un consommateur non traduit —
      // par un autre chemin, avec le même symptôme, et sans erreur nulle part. `en` et `wo` sont
      // couverts au même titre que `fr` : le repli deep-merge de `src/i18n/request.ts` masquerait
      // un trou anglais derrière le français, mais pas un trou dans les trois.
      const manquantes = cles.filter((cle) => typeof resous(dictionnaire, `validation.${cle}`) !== 'string');
      expect(manquantes).toEqual([]);
    },
  );
});
