/**
 * ADR-0135 (TCK-2991) — les PROFILS DE CLAVIER. Aucun champ ne règle son clavier à la main : il prend un profil.
 *
 * Un profil fixe ce que le téléphone ouvre et ce qu'il fait de la frappe : le type, le clavier (`inputMode`), la
 * touche Entrée, la saisie automatique, la correction, la majuscule. L'appelant peut encore surcharger
 * `autoComplete` (un prénom : `given-name`) et `enterKeyHint` (le dernier champ : `done`) ; jamais le reste, que
 * `scripts/check-champs.mjs` refuse à côté d'un profil.
 *
 * Les profils numériques restent des champs TEXTE : `type="number"` ouvre le clavier complet sur iPhone, change la
 * valeur à la molette et refuse les séparateurs. La conversion passe par le schéma (`z.coerce.number()`).
 */
import type { InputHTMLAttributes } from 'react';

type Attributs = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'enterKeyHint' | 'autoComplete' | 'autoCorrect' | 'autoCapitalize' | 'spellCheck'
>;

export const PROFILS = {
  /** Recherche libre ou lieu à chercher : ni prédiction, ni majuscule forcée, touche « Rechercher ». */
  recherche: {
    type: 'search',
    inputMode: 'search',
    enterKeyHint: 'search',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  /** Un lieu saisi (quartier, ville, adresse) : majuscule aux mots, pas de correction. */
  lieu: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'words',
    spellCheck: false,
  },
  /** Le nom d'une personne ou d'une agence : majuscule aux mots, la saisie automatique propose le sien. */
  nom: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'next',
    autoComplete: 'name',
    autoCorrect: 'off',
    autoCapitalize: 'words',
    spellCheck: false,
  },
  /** Un repère, un libellé court, un nom propre qui n'est pas une personne. */
  mots: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'words',
    spellCheck: false,
  },
  /**
   * Un identifiant technique (slug, identifiant de modèle ou d'intégration, contact « courriel ou téléphone ») :
   * ni majuscule, ni correction — le téléphone n'a rien à y deviner.
   */
  identifiant: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  /** Une référence ou un code en capitales (NINEA, référence de paiement, code de plan, expéditeur SMS) : sans correction. */
  reference: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'characters',
    spellCheck: false,
  },
  /** La phrase qu'on recopie pour confirmer un geste grave (« SUPPRIMER ») : en capitales, sans correction. */
  confirmation: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'done',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'characters',
    spellCheck: false,
  },
  /** Une phrase sur une ligne (titre d'annonce, objet) : correction gardée, majuscule de phrase. */
  phrase: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'on',
    autoCapitalize: 'sentences',
    spellCheck: true,
  },
  /** Surface, quantité, étage : pavé numérique seul. */
  entier: {
    type: 'text',
    inputMode: 'numeric',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
  },
  /** Pourcentage, mesure à virgule : pavé numérique avec la virgule. */
  decimal: {
    type: 'text',
    inputMode: 'decimal',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
  },
  /**
   * Latitude, longitude : un nombre SIGNÉ à virgule. Le pavé décimal d'iOS n'a pas de signe moins, et la longitude
   * du Sénégal est négative (−17,4) : le clavier complet, sa rangée de chiffres porte « − » et « , ».
   */
  coordonnee: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  /** Montant XOF : pavé numérique, jamais de décimales (le franc CFA n'en a pas). */
  montant: {
    type: 'text',
    inputMode: 'numeric',
    enterKeyHint: 'next',
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
  },
  /** Téléphone : clavier téléphonique, la saisie automatique propose le numéro. */
  telephone: {
    type: 'tel',
    inputMode: 'tel',
    enterKeyHint: 'next',
    autoComplete: 'tel-national',
    autoCorrect: 'off',
    spellCheck: false,
  },
  courriel: {
    type: 'email',
    inputMode: 'email',
    enterKeyHint: 'next',
    autoComplete: 'email',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  url: {
    type: 'url',
    inputMode: 'url',
    enterKeyHint: 'next',
    autoComplete: 'url',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  /** Code reçu par SMS ou d'une application d'authentification : iOS le propose au-dessus du clavier. */
  code: {
    type: 'text',
    inputMode: 'numeric',
    enterKeyHint: 'done',
    autoComplete: 'one-time-code',
    autoCorrect: 'off',
    spellCheck: false,
  },
  'mot-de-passe': {
    type: 'password',
    enterKeyHint: 'done',
    autoComplete: 'current-password',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  'nouveau-mot-de-passe': {
    type: 'password',
    enterKeyHint: 'next',
    autoComplete: 'new-password',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  /** Zone de texte (description, note, motif) : correction et majuscule de phrase, Entrée va à la ligne. */
  'texte-long': {
    enterKeyHint: 'enter',
    autoComplete: 'off',
    autoCorrect: 'on',
    autoCapitalize: 'sentences',
    spellCheck: true,
  },
  /** Une zone où l'on colle des liens, un par ligne : clavier d'URL, ni majuscule, ni correction. */
  liens: {
    inputMode: 'url',
    enterKeyHint: 'enter',
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  },
  /** Le composeur de la messagerie : Entrée affiche « Envoyer ». */
  message: {
    enterKeyHint: 'send',
    autoComplete: 'off',
    autoCorrect: 'on',
    autoCapitalize: 'sentences',
    spellCheck: true,
  },
} as const satisfies Record<string, Attributs>;

export type NomDuProfil = keyof typeof PROFILS;

/** Les profils qui n'ont pas de placeholder (ADR-0135 § 3) : un exemple de mot de passe n'a pas de sens. */
export const PROFILS_SANS_PLACEHOLDER: ReadonlySet<NomDuProfil> = new Set(['mot-de-passe', 'nouveau-mot-de-passe']);

/** Les attributs d'un profil, et son nom en `data-profil` — pour un `<input>` ou un `<textarea>` natif. */
export function profil<N extends NomDuProfil>(nom: N): (typeof PROFILS)[N] & { readonly 'data-profil': N } {
  return { ...PROFILS[nom], 'data-profil': nom };
}

/**
 * ADR-0135 — une saisie numérique lue en nombre : « 1 500 » → 1500, « 150,000 » (l'anglais) → 150000, « 12,5 » →
 * 12.5 ; vide ou illisible : la chaîne telle quelle, que le schéma juge. Une virgule ou un point suivi d'EXACTEMENT
 * trois chiffres sépare les milliers ; sinon c'est la virgule décimale. Pas pour une coordonnée ni un coût à trois
 * décimales (« 14,692 » s'y lirait 14692) : ceux-là ont leur propre lecture.
 */
export function lireNombre(saisie: string): number | string {
  const nettoyee = saisie
    .replace(/[\s\u202f\u00a0]/g, '')
    .replace(/[.,](?=\d{3}(?:[.,]|$))/g, '')
    .replace(',', '.');
  if (nettoyee === '') return saisie;
  const nombre = Number(nettoyee);
  return Number.isNaN(nombre) ? saisie : nombre;
}
