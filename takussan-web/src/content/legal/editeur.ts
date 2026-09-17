/**
 * L'identité de l'éditeur et des hébergeurs, citée par les trois documents juridiques (TCK-531).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * UN SEUL ENDROIT POUR LES FAITS QUE SEUL LE PORTEUR CONNAÎT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les mentions légales, les CGU et la politique de confidentialité citent toutes l'éditeur. Écrits
 * trois fois, ces faits divergeraient. Ils sont donc ici, et les textes les interpolent.
 *
 * ⚠ Une valeur entre crochets — `[⚠ à compléter : …]` — est une information que le code ne peut pas
 * connaître (forme sociale, RCCM, NINEA, adresse). Elle s'affiche TELLE QUELLE sur la page, et c'est
 * voulu : une mention légale manquante doit se voir, pas se deviner.
 * `src/content/legal/__tests__/textes.test.ts` garde leur forme.
 *
 * Les hébergeurs sont RELEVÉS, pas supposés : `docs/infra/hebergement.md` et ADR-0028 (API et
 * front conteneurisés sur un VPS Contabo sous Dokploy, sauvegardes sur Cloudflare R2, trafic web
 * derrière Cloudflare) ; `docs/infra/frontend-deploiement.md` (site public servi par Vercel jusqu'à
 * la phase F du plan). À relire à chaque changement d'hébergement.
 */

/** L'ouverture d'un marqueur « à compléter ». Neutre : le libellé est écrit dans chaque gabarit. */
export const A_COMPLETER = '[⚠';

export const EDITEUR = {
  /** Le nom commercial, celui que voit le public. */
  marque: 'Takussan',
  /** Dénomination sociale, ou nom et prénom de l'entrepreneur individuel. */
  denomination: `${A_COMPLETER} à compléter : dénomination sociale]`,
  /** SUARL, SARL, SAS, SA (Acte uniforme OHADA sur les sociétés commerciales) ou entreprise individuelle. */
  formeJuridique: `${A_COMPLETER} à compléter : forme juridique et capital social]`,
  rccm: `${A_COMPLETER} à compléter : numéro RCCM]`,
  ninea: `${A_COMPLETER} à compléter : NINEA]`,
  siege: `${A_COMPLETER} à compléter : adresse du siège social], Dakar, Sénégal`,
  telephone: `${A_COMPLETER} à compléter : téléphone]`,
  /** Directeur ou directrice de la publication — une personne physique. */
  directeurPublication: `${A_COMPLETER} à compléter : nom du directeur de la publication]`,
  site: 'www.takussan.com',
  courriels: {
    contact: 'contact@takussan.com',
    donnees: 'privacy@takussan.com',
    juridique: 'legal@takussan.com',
  },
} as const;

/**
 * Noms et adresses postales seulement : le pays et le rôle de chaque hébergeur dépendent de la
 * langue, ils s'écrivent dans chaque texte.
 */
export const HEBERGEURS = {
  serveurs: {
    nom: 'Contabo GmbH',
    adresse: 'Aschauer Straße 32a, 81549 München',
  },
  siteVercel: {
    nom: 'Vercel Inc.',
    adresse: '440 N Barranca Avenue #4133, Covina, CA 91723',
  },
  reseau: {
    nom: 'Cloudflare, Inc.',
    adresse: '101 Townsend Street, San Francisco, CA 94107',
  },
} as const;

/** La date de la version en vigueur des trois documents — à changer à chaque révision. */
export const VERSION_DOCUMENTS = {
  date: '17 septembre 2026',
  dateEn: 'September 17, 2026',
} as const;
