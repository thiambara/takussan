/**
 * Les messages de validation des schémas zod portent une CLÉ, jamais un libellé (TCK-292, lot J).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE DÉTOUR PLUTÔT QUE `useTranslations` DANS LE SCHÉMA
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/lib/schemas/*` est importé par des **server actions** ET par des **composants client**.
 * Ni `useTranslations` (hook React) ni `getTranslations` (asynchrone, adossé à `next/headers`) n'y
 * est appelable : le premier casse côté serveur, le second n'est pas appelable au moment où le
 * schéma se construit — c'est-à-dire à l'évaluation du module, hors de toute requête.
 *
 * Le schéma porte donc un **identifiant**, et la résolution se fait au dernier moment, là où une
 * locale existe : dans `useApiForm` (`src/hooks/useApiForm.ts`), qui enveloppe le résolveur zod et
 * traduit l'arbre d'erreurs avant que react-hook-form ne le rende. C'est le patron posé par
 * TCK-286 pour les tables de navigation — *la donnée transporte la clé, le rendu la résout* —
 * appliqué ici parce qu'il n'y a pas d'autre issue.
 *
 * ⚠️ **Un schéma dont le consommateur ne traduit pas rend la CLÉ BRUTE à l'utilisateur.** Le
 * chemin react-hook-form est couvert par `useResolveurValidation(schema)`, à substituer à
 * `zodResolver(schema)`. Mais **ce n'est pas le seul chemin de rendu**, et une version antérieure
 * de ce commentaire l'a affirmé — « c'est la seule façon de se tromper avec ce module, et elle se
 * voit à l'œil nu ». Les deux moitiés étaient fausses ; le prix a été de **18 messages rendus en
 * clé brute** dans trois écrans qui appellent `safeParse()` et rendent le message directement,
 * plus **deux `zodResolver` nus** que l'inventaire du lot J aurait pourtant dû voir.
 *
 * L'inventaire complet des formes, et les fonctions qui les traduisent, sont EN BAS de ce fichier.
 * Le recensement ne se refait plus à la main : `__tests__/traducteurs-de-messages.test.ts`
 * parcourt `src/` et rougit sur tout consommateur qui ne traduit pas. Ce qu'il suit est l'IMPORT
 * — un fichier qui importe à l'exécution quoi que ce soit de `src/lib/schemas/`, par alias ou par
 * chemin relatif, et qui valide — et non la forme du nom de la variable validée : cette
 * heuristique-là a été mesurée aveugle à cinq écritures ordinaires du même défaut. Ses angles
 * morts sont écrits dans son propre en-tête, et il ne promet rien de plus.
 */

/**
 * Préfixe qui distingue une CLÉ d'un libellé déjà rédigé.
 *
 * Il compte : le résolveur traduit un message **si et seulement si** il commence par ce préfixe.
 * Tout ce qui vient d'ailleurs — les 422 de Laravel reposés sur les champs par
 * `mapValidationErrorsToForm`, le message d'un schéma non converti — traverse intact.
 */
export const PREFIXE_VALIDATION = 'validation.';

/**
 * Séparateur entre la clé et ses paramètres ICU. Caractère de contrôle U+0001 : il ne peut
 * apparaître ni dans un libellé ni dans un chemin de clé, donc le découpage est sans ambiguïté.
 */
const SEPARATEUR_VALEURS = '\u0001';

/** Paramètres ICU d'un message — le `{max}` de « Message trop long ({max} caractères max). ». */
export type ValeursMessage = Record<string, string | number>;

/**
 * Fabrique le message porté par un schéma zod.
 *
 * ```ts
 * z.string().min(1, msgValidation('common.emailRequired'))
 * z.string().max(4000, msgValidation('message.bodyTooLong', { max: 4000 }))
 * ```
 *
 * `chemin` est relatif à `validation.` dans `src/messages/{fr,en,wo}.json`.
 */
export function msgValidation(chemin: string, valeurs?: ValeursMessage): string {
  const cle = PREFIXE_VALIDATION + chemin;
  return valeurs === undefined ? cle : `${cle}${SEPARATEUR_VALEURS}${JSON.stringify(valeurs)}`;
}

/**
 * L'inverse de {@link msgValidation}. Rend `null` pour tout ce qui n'est PAS une clé de ce
 * module — un libellé rédigé, un message d'erreur du serveur, `undefined`.
 */
export function decodeMsgValidation(
  message: unknown,
): { cle: string; valeurs?: ValeursMessage } | null {
  if (typeof message !== 'string' || !message.startsWith(PREFIXE_VALIDATION)) return null;
  const coupure = message.indexOf(SEPARATEUR_VALEURS);
  if (coupure === -1) return { cle: message };
  const cle = message.slice(0, coupure);
  try {
    return { cle, valeurs: JSON.parse(message.slice(coupure + 1)) as ValeursMessage };
  } catch {
    // Un payload illisible ne doit pas faire disparaître le message : on rend la clé seule, que le
    // dictionnaire sait traduire. Le paramètre manquant se verra à l'écran, le message ne se
    // perdra pas.
    return { cle };
  }
}

/**
 * Signature minimale d'un traducteur next-intl — tout ce dont ce module a besoin, et rien de plus,
 * pour que les fonctions ci-dessous restent testables sans monter le moindre provider.
 *
 * Elle vit ICI, et non dans `src/hooks/useApiForm.ts`, parce que ce module-ci est le seul des deux
 * à ne dépendre ni de React ni de `'use client'` : une server action peut l'importer.
 */
export type Traducteur = (cle: string, valeurs?: ValeursMessage) => string;

/* ──────────────────────────────────────────────────────────────────────────────────────────────
 * LES TROIS FORMES SOUS LESQUELLES UN MESSAGE DE SCHÉMA ARRIVE AU RENDU
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'en-tête de ce fichier a longtemps affirmé qu'il n'existait qu'UNE façon de se tromper — monter
 * `zodResolver` à la main — et que « elle se voit à l'œil nu ». **Les deux moitiés de la phrase
 * étaient fausses, et c'est cette erreur d'inventaire qui a coûté 18 messages rendus en clé brute
 * à l'utilisateur** (TCK-292, correctif du lot L) :
 *
 *   · fausse sur le NOMBRE : react-hook-form n'est pas le seul chemin de rendu. Trois composants
 *     appelaient `safeParse()` et rendaient le message **directement**, sans résolveur — donc sans
 *     jamais croiser `traduireErreursValidation`, qui ne sait lire qu'un arbre `FieldErrors`.
 *   · fausse sur la VISIBILITÉ : l'inventaire du lot J s'était fait par `grep -rn zodResolver src`,
 *     une commande **structurellement aveugle** à un consommateur qui n'importe pas `zodResolver`.
 *     Elle a d'ailleurs laissé passer deux `zodResolver` nus qu'elle aurait dû voir.
 *
 * D'où ces trois fonctions, une par forme réellement observée dans le dépôt. Elles se réduisent
 * toutes à {@link traduireMessageValidation} : il n'y a **qu'un** mécanisme, décliné en trois
 * emballages, précisément pour qu'aucun consommateur n'ait de raison d'en inventer un quatrième.
 *
 *   forme                                      qui la produit                    fonction
 *   ─────────────────────────────────────────  ────────────────────────────────  ────────────────
 *   `string`                                   `issues[0].message`, un message   traduireMessageValidation
 *   `{ message: string }[]`                    `error.issues`                    traduireIssuesValidation
 *   `Record<string, string[]>`                 `error.flatten().fieldErrors`     traduireChampsErreurs
 *   `FieldErrors` (arbre RHF)                  le résolveur zod                  traduireErreursValidation
 *                                                                                 (`useApiForm.ts`)
 *
 * La quatrième reste dans `useApiForm.ts` : elle est indissociable du résolveur qu'elle enveloppe,
 * et elle traverse `ref`, un nœud DOM — c'est-à-dire une préoccupation de react-hook-form, pas du
 * dictionnaire.
 */

/**
 * Traduit UN message porté par un schéma. C'est la brique des deux fonctions suivantes, et la
 * seule dont a besoin le consommateur qui lit `parsed.error.issues[0]?.message`.
 *
 * Tout ce qui n'est PAS une clé de ce module traverse **intact** — un libellé déjà rédigé, un
 * message 422 de Laravel, une chaîne venue d'ailleurs. C'est ce qui rend l'appel sûr à poser
 * partout : il ne peut rien abîmer qu'il ne comprenne pas.
 */
export function traduireMessageValidation(message: string, t: Traducteur): string;
export function traduireMessageValidation(
  message: string | undefined,
  t: Traducteur,
): string | undefined;
export function traduireMessageValidation(
  message: string | undefined,
  t: Traducteur,
): string | undefined {
  if (message === undefined) return undefined;
  const decode = decodeMsgValidation(message);
  return decode ? t(decode.cle, decode.valeurs) : message;
}

/**
 * Traduit les messages d'un tableau d'`issues` zod (`parsed.error.issues`), en préservant tout le
 * reste de chaque issue — `path`, `code`, et les champs propres à chaque variante.
 *
 * Le paramètre est typé structurellement (`{ message: string }`) plutôt que sur `ZodIssue` : ce
 * module n'importe pas zod, et n'a aucune raison de commencer.
 */
export function traduireIssuesValidation<I extends { readonly message: string }>(
  issues: readonly I[],
  t: Traducteur,
): I[] {
  return issues.map((issue) => ({ ...issue, message: traduireMessageValidation(issue.message, t) }));
}

/**
 * Traduit un `Record<string, string[]>` — la forme rendue par `error.flatten().fieldErrors`, celle
 * que `<FormError>` consomme dans les écrans d'administration.
 *
 * ⚠️ Les entrées `undefined` sont conservées telles quelles : `flatten()` n'énumère que les champs
 * en défaut, mais un appelant peut fusionner ce résultat avec les erreurs d'un 422, et perdre une
 * clé au passage changerait la forme de l'objet sous ses pieds.
 */
export function traduireChampsErreurs<C extends Record<string, string[] | undefined>>(
  champs: C,
  t: Traducteur,
): C {
  const sortie: Record<string, string[] | undefined> = {};
  for (const [champ, messages] of Object.entries(champs)) {
    sortie[champ] = messages?.map((message) => traduireMessageValidation(message, t));
  }
  return sortie as C;
}
