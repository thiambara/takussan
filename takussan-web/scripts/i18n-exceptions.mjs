/**
 * Les EXCEPTIONS ÉCRITES du cliquet de texte en dur (TCK-292, 2026-08-22).
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE — ce qu'un cliquet ne sait pas dire
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `check-i18n.mjs` portait UN dispositif face au texte en dur : un cliquet par fichier
 * (`i18n-baseline.json`). Un cliquet dit « pas plus qu'hier ». **Il ne dit jamais « et voici
 * pourquoi ces onze-là sont légitimes ».** Les deux populations — la dette qu'on tolère et le
 * faux positif qui ne partira jamais — y étaient mélangées dans un seul nombre, et un lecteur ne
 * pouvait pas les distinguer :
 *
 *   · `console.error('[BFF] Failed to load draft.')` ne sera JAMAIS traduit : il ne s'affiche pas.
 *   · `'Thiès'` ne sera JAMAIS traduit : c'est le nom d'une ville.
 *   · `'Users fetch failed'` DEVAIT l'être — et il s'affichait, en toutes lettres, au super-admin.
 *
 * Les trois comptaient pareil. C'est ce qui rendait le critère « le compte du lot est à zéro »
 * inatteignable : on ne peut pas résorber un faux positif, on ne peut que l'excuser — et il n'y
 * avait aucun moyen de le faire. *Un fichier de dette qui ne distingue pas la dette du bruit
 * n'apprend rien à qui le lit ; il apprend seulement à ne plus le lire.*
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE MÉCANISME GARANTIT — ET CE QU'IL NE GARANTIT PAS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 1. **Une exception désigne un SITE, pas un fichier.** `{ fichier, litteral }` ou
 *    `{ fichier, motif }`. Il n'existe volontairement AUCUNE forme « tout ce fichier est
 *    excusé » : ce serait la baseline sous un autre nom, avec en plus l'autorité d'une
 *    justification écrite.
 *
 * 2. **Une exception qui ne correspond plus à aucun site fait ROUGIR** (contrôle C de
 *    `check-i18n.mjs`). Une autorisation qui survit à son motif est le mécanisme exact par lequel
 *    une liste d'exemptions devient une passoire — c'est la leçon de
 *    `scripts/check-resource-date-format.mjs`, dont ce fichier reprend le patron.
 *
 *    Corollaire utile : cette règle est aussi le REFUS DE VACUITÉ du scanner. Si `i18n-scan.mjs`
 *    devenait aveugle, les 75 entrées ci-dessous cesseraient toutes de correspondre, et la garde
 *    crierait — au lieu de passer au vert en n'ayant plus rien à trouver (ardoise D-15, D-18, D-44).
 *
 * 3. **La famille est un champ CLOS.** Les cinq valeurs ci-dessous sont les seules acceptées, et
 *    elles restent distinctes : mélanger `NOM-PROPRE` et `TECHNIQUE` reviendrait à effacer le
 *    raisonnement qui a produit le classement.
 *
 * 4. **Ce que la garde NE vérifie PAS : que la raison soit VRAIE.** Elle vérifie qu'il y en a une,
 *    qu'elle est substantielle et que le site existe. Le classement, lui, est un jugement humain —
 *    et TCK-292 a payé cher l'hypothèse « ça ressemble à du technique donc ça ne s'affiche pas » :
 *    cinq littéraux rangés d'office dans « ce n'est pas du travail de traduction » s'affichaient
 *    en réalité à l'écran. **Chaque entrée ci-dessous a été suivie jusqu'à son rendu avant d'être
 *    écrite**, et sa raison dit par quel chemin.
 */

/** Les cinq familles. Champ CLOS : `check-i18n.mjs` rougit sur toute autre valeur. */
export const FAMILLES = Object.freeze([
  /** Le littéral n'atteint jamais un écran : journal, comparaison de chaîne, identifiant. */
  'TECHNIQUE',
  /** Un nom propre — marque, ville, quartier, format de fichier, endonyme de langue. */
  'NOM-PROPRE',
  /** Du balisage (SVG, HTML) transporté dans une chaîne, pas de la prose. */
  'BALISAGE',
  /** Un piège à robots, délibérément invisible aux humains. */
  'HONEYPOT',
  /** La page de démonstration du design system — un POC, pas une surface produit. */
  'PLAYGROUND',
]);

/**
 * Longueur minimale d'une raison, en caractères.
 *
 * Le seuil est arbitraire et il ne prétend pas mesurer la qualité — il rend seulement coûteuse
 * l'exception posée par réflexe. *On ne peut pas écrire « parce que » en quarante caractères sans
 * avoir regardé le site.*
 */
export const LONGUEUR_MIN_RAISON = 40;

// ── Les raisons partagées ────────────────────────────────────────────────────────────────────────
//
// Plusieurs sites ont EXACTEMENT la même raison — huit `console.error` du BFF, par exemple. La
// recopier huit fois ne la rendrait pas plus vraie ; elle la rendrait plus difficile à corriger le
// jour où elle cesse de l'être. Chaque constante est nommée d'après ce qu'elle affirme.

const R_CONSOLE_BFF =
  "Argument de `console.error`, jamais rendu. Les route handlers de `src/app/api/**` émettent un "
  + "CODE au client (`{ code: 'server_error' }`) — ADR-0019 — et gardent la prose pour le journal "
  + "du serveur, où elle sert au diagnostic. Vérifié ligne par ligne le 2026-08-22 : les huit "
  + "occurrences `[BFF] …` sont toutes le premier argument d'un `console.error`.";

const R_CONSOLE_BOUNDARY =
  "Argument de `console.error` dans un `useEffect` d'`error.tsx`. Le préfixe `[root]` / "
  + "`[dashboard]` sert à savoir QUELLE frontière d'erreur a rattrapé — c'est du diagnostic. Ce "
  + "que l'utilisateur voit, juste en dessous, passe par `useTranslations('errors.boundary')`.";

const R_POC_PLAYGROUND =
  "Page de démonstration du design system « Ancrage Local Contemporain » (`/playground`), et non "
  + "une surface produit : elle sert à comparer sept palettes et trois typographies au runtime. "
  + "Traduire un POC fige dans le dictionnaire des libellés qui n'ont pas de propriétaire produit, "
  + "et laisse croire qu'un écran de plus est internationalisé. ⚠ La route reste publiquement "
  + "ATTEIGNABLE — c'est assumé : `docs/design-guidelines.md` et TCK-129 en font un outil de dev à "
  + "conserver. Elle n'est plus INDEXABLE depuis TCK-431 : `page.tsx` déclare `robots: { index: "
  + "false }`, ce qui était le vrai défaut. L'énoncé précédent concluait à la suppression du POC ; "
  + "la documentation qui fait autorité disait l'inverse.";

const R_JETON_SCHEMA_ORG =
  "Valeur normative de `query-input` dans une `SearchAction` de schema.org : la chaîne EST le "
  + "vocabulaire, au même titre que `@type` ou `https://schema.org`. Elle n'est pas rendue, elle est "
  + "sérialisée dans un `<script type=\"application/ld+json\">` et lue par un moteur — traduire "
  + "`required name=search_term_string` rendrait la déclaration invalide, donc ignorée. Suivi "
  + "jusqu'à sa sortie : `jsonLdSiteWeb` n'a aucun autre consommateur que `DonneesStructurees`.";

const R_JOURNAL_DOMAINE =
  "Argument de `console.error`, jamais rendu : il s'écrit dans le journal du serveur quand le "
  + "DOMAINE des villes est inconnaissable, et son lecteur est l'exploitant. Le message est la "
  + "seule trace d'une dégradation volontaire — toute facette de ville se replie alors sur la page "
  + "nue —, et c'est justement ce qui interdit de le traduire : rendu dans la langue du visiteur, "
  + "il ne serait plus lisible par celui qui doit agir. Suivi jusqu'à sa sortie : `villesDuCatalogue` "
  + "n'a qu'un appelant, la `generateMetadata` de la liste, qui n'en affiche rien.";

const R_ERREUR_SITEMAP =
  "Fragment d'un message d'`Error` levée pendant la GÉNÉRATION de `/sitemap.xml`, `/robots.txt` ou "
  + "des `hreflang` (TCK-431). Il s'écrit dans le journal de build et son lecteur est le "
  + "développeur, pas le visiteur : le traduire le rendrait dans la langue de quelqu'un qui n'est "
  + "pas là, et le ferait dépendre du dictionnaire qu'une panne d'i18n aurait justement cassé. "
  + "Chacun de ces messages NOMME la variable d'environnement à corriger — c'est sa raison d'être.";

const R_JOURNAL_RENDU_PUBLIC =
  "Argument de `console.error` dans un module de requête SERVEUR du catalogue public (TCK-432). "
  + "Il ne peut pas atteindre un écran : la fonction qui l'émet rend `null` à l'appelant, et c'est "
  + "ce `null` — pas cette phrase — que la page traduit en comportement (le composant client "
  + "reprend son cycle nominal et affiche, lui, un libellé de dictionnaire). Le lecteur de cette "
  + "ligne est le développeur qui cherche pourquoi l'accueil est vide, jamais le visiteur. La "
  + "traduire la rendrait dans la langue du visiteur à un lecteur qui n'est pas là, et la ferait "
  + "dépendre du dictionnaire — que la panne journalisée pourrait justement avoir cassé.";

const R_ZONE_SENEGAL =
  "Toponyme sénégalais dans une liste de suggestions de zones d'intervention. Un nom de ville ou "
  + "de quartier ne se traduit pas : la valeur saisie part telle quelle vers l'API et sert de "
  + "critère de recherche — la traduire casserait l'appariement.";

const R_MOTIF_DATE_FNS =
  "Motif de format `date-fns`, pas un libellé : `d`, `MMMM` et `yyyy` sont des jetons de la "
  + "bibliothèque. C'est `{ locale: … }` qui porte la langue, et il suit désormais la locale "
  + "active (`localeDateFns`, TCK-292 2026-08-22). Traduire le MOTIF produirait une date illisible.";

const R_MARQUE_TAKUSSAN =
  "La marque, employée comme exemple de valeur à saisir. Un nom de marque ne se traduit pas, et "
  + "ce placeholder montre en plus la CONTRAINTE du champ — 11 caractères, majuscules, l'`alpha "
  + "sender ID` que les opérateurs SMS acceptent.";

const R_FAVORIS_POC =
  R_POC_PLAYGROUND
  + " Ici, les deux libellés d'un `aria-label` de bouton favori, dupliqués dans les quatre "
  + "variantes de carte du POC.";

// ── L'inventaire ─────────────────────────────────────────────────────────────────────────────────

/**
 * Chaque entrée : `{ fichier, litteral | motif, famille, raison }`.
 *
 * `litteral` se compare à l'EXTRAIT rendu par `compteFichier` — normalisé (blancs compactés) et
 * tronqué à 60 caractères. C'est délibéré : la comparaison porte sur ce que la garde a réellement
 * vu, jamais sur ce qu'on croit que le fichier contient.
 *
 * Aucun numéro de ligne. Il dérive au premier ajout au-dessus, et une exception qui « glisse » en
 * silence d'un site à l'autre serait pire que pas d'exception du tout.
 */
export const EXCEPTIONS_JUSTIFIEES = [
  // ── TECHNIQUE — le littéral n'atteint aucun écran ──────────────────────────────────────────────
  { fichier: 'src/app/api/export/[entity]/route.ts', litteral: '[BFF] export : entité inconnue', famille: 'TECHNIQUE', raison: R_CONSOLE_BFF },
  { fichier: 'src/app/api/me/active-profile/route.ts', litteral: '[BFF] Failed to switch profile.', famille: 'TECHNIQUE', raison: R_CONSOLE_BFF },
  { fichier: 'src/app/api/me/profiles/route.ts', litteral: '[BFF] Failed to load profiles.', famille: 'TECHNIQUE', raison: R_CONSOLE_BFF },
  { fichier: 'src/app/api/me/route.ts', litteral: '[BFF] Failed to update profile.', famille: 'TECHNIQUE', raison: R_CONSOLE_BFF },
  { fichier: 'src/app/api/me/welcome-seen/route.ts', motif: /^\[BFF\] Failed to (load welcome views|mark welcome as seen)\.$/, famille: 'TECHNIQUE', raison: R_CONSOLE_BFF },
  { fichier: 'src/app/api/me/wizard-drafts/[key]/route.ts', motif: /^\[BFF\] Failed to (load|save|delete) draft\.$/, famille: 'TECHNIQUE', raison: R_CONSOLE_BFF },
  { fichier: 'src/app/api/me/wizard-drafts/route.ts', litteral: '[BFF] Failed to load wizard drafts.', famille: 'TECHNIQUE', raison: R_CONSOLE_BFF },
  { fichier: 'src/app/error.tsx', litteral: '[root] erreur non rattrapée', famille: 'TECHNIQUE', raison: R_CONSOLE_BOUNDARY },
  { fichier: 'src/app/(dashboard)/error.tsx', litteral: '[dashboard] erreur non rattrapée', famille: 'TECHNIQUE', raison: R_CONSOLE_BOUNDARY },

  {
    fichier: 'src/lib/access/server-guards.ts',
    litteral: 'fetch failed',
    famille: 'TECHNIQUE',
    raison:
      "Membre droit d'une COMPARAISON (`e.message === 'fetch failed'`), pas un message émis : "
      + "c'est la chaîne exacte que Node pose sur le `TypeError` d'un `fetch` qui n'aboutit pas. "
      + "La traduire ferait échouer la reconnaissance de panne réseau — l'inverse de l'effet "
      + "recherché.",
  },
  {
    fichier: 'src/lib/alternates.ts',
    litteral: 'localisées (console, /auth, /api…) n’ont pas de version par',
    famille: 'TECHNIQUE',
    raison:
      "Message d'erreur destiné au DÉVELOPPEUR : `alternatesLangues()` le lève quand on lui "
      + "passe un chemin de surface NON localisée (`/app/…`, `/api/…`). Ce n'est pas un état que "
      + "l'utilisateur peut atteindre — c'est un appel qui n'aurait pas dû être écrit, et il "
      + "casse le rendu de la page avant qu'aucun écran n'existe. Il dit quoi corriger dans le "
      + "code, pas quoi faire à l'utilisateur.",
  },
  {
    fichier: 'src/context/AuthContext.tsx',
    litteral: 'AuthProvider is missing. Wrap the app tree in <AuthProvider>',
    famille: 'TECHNIQUE',
    raison:
      "Message d'erreur destiné au DÉVELOPPEUR : il n'est levé que si un composant appelle "
      + "`useAuth()` hors de `<AuthProvider>`, c'est-à-dire sur un défaut de câblage qui casse "
      + "l'écran avant tout rendu. Il dit quoi corriger dans le code, pas quoi faire à "
      + "l'utilisateur.",
  },
  {
    fichier: 'src/types/inventory.ts',
    motif: /^(usé|endommagé)$/,
    famille: 'TECHNIQUE',
    raison:
      "Valeurs de l'enum API `InventoryElementState` (`takussan-api/app/Models/Enums/"
      + "InventoryElementState.php:16-17` : `case Use = 'usé'`), employées comme CLÉS i18n — "
      + "`InventoryBadges.tsx:59` fait `{t(state)}` sur l'espace `inventory.elementStates`, et les "
      + "quatre clés existent dans les trois dictionnaires (vérifié le 2026-08-22 : fr « Usé », "
      + "en « Worn », wo « Màggat »). Le français de la valeur vient du BACKEND ; le corriger "
      + "serait une migration de données, pas une traduction.",
  },
  {
    fichier: 'src/components/admin-tags/TagsManager.tsx',
    motif: /^placeholder="(wifi|#2563eb)"$/,
    famille: 'TECHNIQUE',
    raison:
      "Exemples de VALEURS techniques à saisir, pas de la prose : `wifi` est un identifiant "
      + "d'icône lucide (le champ attend un nom d'icône, pas un libellé) et `#2563eb` une couleur "
      + "hexadécimale. Les deux sont identiques dans les trois langues ; les traduire les rendrait "
      + "faux.",
  },
  {
    fichier: 'src/components/onboarding/AgentOnboardingWizard.tsx',
    litteral: 'placeholder="AGT-2026-001"',
    famille: 'TECHNIQUE',
    raison:
      "Exemple du FORMAT d'un numéro de carte d'agent immobilier, pas une phrase. Le libellé et "
      + "l'aide du champ, eux, passent par `t('licenseNumberLabel')` et `t('licenseNumberHint')` "
      + "juste au-dessus et juste en dessous.",
  },
  {
    fichier: 'src/components/admin-settings/IntegrationsManager.tsx',
    litteral: 'placeholder="wave, stripe, mailgun…"',
    famille: 'TECHNIQUE',
    raison:
      "Trois IDENTIFIANTS de fournisseur, tels qu'ils sont stockés côté API (`PROVIDER_SUGGESTIONS`"
      + " en haut du fichier : `value: 'wave'`, `'stripe'`, `'mailgun'`). Le champ attend cette "
      + "valeur exacte ; la traduire produirait un identifiant que le backend ne connaît pas.",
  },
  {
    fichier: 'src/components/playground/PaletteSwitcher.tsx',
    litteral: 'pg-swatch-active pg-swatch-ripple',
    famille: 'TECHNIQUE',
    raison:
      "Deux classes CSS du POC (`playground.css`). `ressembleATailwind` ne les reconnaît pas — "
      + "leur préfixe `pg-` n'est pas dans sa liste de racines — mais ce sont bien des noms de "
      + "classe, jamais du texte.",
  },
  { fichier: 'src/components/ui/date-picker.tsx', litteral: 'd MMMM yyyy', famille: 'TECHNIQUE', raison: R_MOTIF_DATE_FNS },
  { fichier: 'src/components/ui/date-time-picker.tsx', litteral: 'd MMMM yyyy', famille: 'TECHNIQUE', raison: R_MOTIF_DATE_FNS },
  { fichier: 'src/lib/messages/formatDayLabel.ts', litteral: 'd MMMM yyyy', famille: 'TECHNIQUE', raison: R_MOTIF_DATE_FNS },

  // ── NOM-PROPRE ────────────────────────────────────────────────────────────────────────────────
  {
    fichier: 'src/components/admin-settings/IntegrationsManager.tsx',
    motif: /^(Orange Money|SMS — Orange Sénégal)$/,
    famille: 'NOM-PROPRE',
    raison:
      "Noms commerciaux de fournisseurs de paiement et de SMS, dans la table `PROVIDER_SUGGESTIONS`"
      + " qui alimente un `<datalist>`. Ils ne se traduisent pas. ⚠ La table en porte sept ; le "
      + "scanner n'en voit que DEUX (les seules à accentuer ou à former deux mots séparés d'une "
      + "espace) — le compte de cette famille est un PLANCHER, pas un inventaire.",
  },
  { fichier: 'src/components/admin-settings/IntegrationsManager.tsx', motif: /^placeholder="(TAKUSSAN|Takussan)"$/, famille: 'NOM-PROPRE', raison: R_MARQUE_TAKUSSAN },
  {
    fichier: 'src/components/admin/AuditTrail.tsx',
    motif: /^(CSV|Excel \(XLSX\))$/,
    famille: 'NOM-PROPRE',
    raison:
      "Noms de formats de fichier dans le menu d'export, associés à `handleExport('csv')` et "
      + "`handleExport('xlsx')`. « CSV » et « Excel » s'écrivent de la même façon en français, en "
      + "anglais et en wolof, et c'est le nom que l'utilisateur retrouvera dans son gestionnaire "
      + "de fichiers.",
  },
  { fichier: 'src/components/agents/ZoneMultiSelect.tsx', motif: /^(Sicap Liberté|Thiès)$/, famille: 'NOM-PROPRE', raison: R_ZONE_SENEGAL },
  { fichier: 'src/components/service-providers/InviteServiceProviderSheet.tsx', litteral: 'Thiès', famille: 'NOM-PROPRE', raison: R_ZONE_SENEGAL },
  {
    fichier: 'src/i18n/config.ts',
    litteral: 'Français',
    famille: 'NOM-PROPRE',
    raison:
      "Nom d'une LANGUE dans les tables du sélecteur de langue. Les trois occurrences sont dans "
      + "`LOCALE_LABELS` (l'endonyme, celui qu'on montre à qui ne lit pas encore l'interface) et "
      + "dans `LOCALE_DISPLAY_LABELS.fr` / `.wo`. ⚠ La colonne `.wo` est en FRANÇAIS et c'est un "
      + "vrai défaut — un wolophone lit « Français / Anglais / Wolof » au lieu du wolof. Il n'est "
      + "PAS corrigé ici (le mécanisme n'est pas en cause : c'est une valeur à écrire) et il est "
      + "consigné dans TCK-347.",
  },

  // ── BALISAGE ──────────────────────────────────────────────────────────────────────────────────
  {
    fichier: 'src/app/[locale]/(public)/properties/[slug]/components/PropertyLocationMapInner.tsx',
    motif: /^<\?xml version/,
    famille: 'BALISAGE',
    raison:
      "Un SVG complet, `encodeURIComponent`é puis servi en `data:` URI comme icône de marqueur "
      + "Leaflet. Le littéral ne contient aucun mot de prose : `version`, `encoding` et `xmlns` "
      + "sont des noms d'attribut XML. L'inliner évite les chemins d'asset par défaut de Leaflet, "
      + "que le bundler Next ne résout pas.",
  },
  {
    fichier: 'src/components/map/LocationPickerMap.tsx',
    motif: /^<div style="width:16px/,
    famille: 'BALISAGE',
    raison:
      "Le `html` d'un `L.divIcon` : une pastille de 16 px, entièrement en style inline. Aucun "
      + "mot de prose — ce que le scanner y voit sont des propriétés CSS (`background`, "
      + "`border-radius`, `box-shadow`).",
  },

  // ── HONEYPOT ──────────────────────────────────────────────────────────────────────────────────
  {
    // TCK-441 — le formulaire anonyme a été EXTRAIT de PropertyContactMessageDialog vers ce
    // composant partagé avec la fiche d'agent. Le pot de miel a suivi ; l'exception le suit aussi,
    // au lieu de rester pointée sur un site qui n'existe plus.
    fichier: 'src/components/public/AnonymousLeadDialog.tsx',
    litteral: 'Company',
    famille: 'HONEYPOT',
    raison:
      "Le `<label>` d'un champ-piège à robots, dans un `<div aria-hidden=\"true\">` positionné à "
      + "`left:-10000px` avec `tabIndex={-1}` : aucun humain ne le voit ni ne l'atteint au clavier, "
      + "y compris au lecteur d'écran. Il est en anglais EXPRÈS — c'est le nom de champ qu'un robot "
      + "de spam s'attend à remplir. Le traduire réduirait le taux de capture sans rien apporter à "
      + "personne.",
  },

  // ── TECHNIQUE — messages d'ERREUR de la génération du sitemap (TCK-431) ───────────────────────
  //
  // Ces trois fichiers n'ont AUCUN rendu : ils produisent `/sitemap.xml`, `/robots.txt` et les
  // `hreflang`. Leurs seuls littéraux de prose sont des fragments d'`Error` levées à la
  // génération — elles s'écrivent dans le journal de build, jamais dans une page. Les traduire
  // reviendrait à faire dépendre un message de panne du dictionnaire qu'on est peut-être en train
  // de casser, et à le rendre dans la langue du VISITEUR pour un lecteur qui est le développeur.
  //
  // Suivi jusqu'au rendu avant d'écrire ces entrées : les six occurrences sont toutes des
  // arguments de `new Error(...)`, et les tests d'ablation les éprouvent par `toThrow(/…/)`.
  { fichier: 'src/lib/alternates.ts', motif: /^schéma compris — par exemple/, famille: 'TECHNIQUE', raison: R_ERREUR_SITEMAP },
  { fichier: 'src/lib/alternates.ts', motif: /^que ses pages canoniques sont celles de la production/, famille: 'TECHNIQUE', raison: R_ERREUR_SITEMAP },
  { fichier: 'src/lib/sitemap.ts', motif: /^Une URL relative dans un <loc>/, famille: 'TECHNIQUE', raison: R_ERREUR_SITEMAP },
  { fichier: 'src/lib/sitemap.ts', motif: /^generateSitemaps\(\) plutôt que tronquer/, famille: 'TECHNIQUE', raison: R_ERREUR_SITEMAP },
  { fichier: 'src/lib/sitemap.ts', motif: /^muet sur ce qu'il laisse dehors\.$/, famille: 'TECHNIQUE', raison: R_ERREUR_SITEMAP },
  { fichier: 'src/lib/queries/sitemap-catalogue.ts', motif: /^sitemap peut porter/, famille: 'TECHNIQUE', raison: R_ERREUR_SITEMAP },
  { fichier: 'src/lib/queries/facettes.ts', motif: /^\[canonique\] /, famille: 'TECHNIQUE', raison: R_JOURNAL_DOMAINE },
  { fichier: 'src/lib/queries/facettes.ts', motif: /^sur la page nue plut\u00f4t que de rejeter/, famille: 'TECHNIQUE', raison: R_JOURNAL_DOMAINE },

  // ── TECHNIQUE — journal serveur des requêtes du catalogue public (TCK-432) ────────────────────
  // ⚠ Le pendant de cette ligne dans `public-search.ts` n'apparaît PAS ici, et ce n'est pas un
  // oubli : il est écrit en gabarit (`` `[liste publique] ?${requete} : ` ``), que l'analyse
  // lexicale ne compte pas comme littéral. *Deux messages de même nature, dont un seul est vu par
  // la garde* — le noter ici évite qu'on en conclue un jour que l'autre était volontairement
  // traduisible.
  { fichier: 'src/lib/queries/public-discovery.ts', litteral: '[accueil] découverte indisponible :', famille: 'TECHNIQUE', raison: R_JOURNAL_RENDU_PUBLIC },

  // ── TECHNIQUE — un JETON du vocabulaire schema.org (TCK-435) ───────────────────────────────────
  { fichier: 'src/lib/jsonld-site.ts', litteral: 'required name=search_term_string', famille: 'TECHNIQUE', raison: R_JETON_SCHEMA_ORG },

  // ── PLAYGROUND ────────────────────────────────────────────────────────────────────────────────
  // TCK-431 — le corps du POC vit dans `PlaygroundClient.tsx` : `page.tsx` est devenu un composant
  // SERVEUR qui ne porte plus que `robots: { index: false }`. Un composant client ne peut pas
  // déclarer de métadonnée, et c'était la condition du `noindex`.
  { fichier: 'src/app/[locale]/(public)/playground/PlaygroundClient.tsx', motif: /^(Takussan|POC ·|Connexion|Publier|© Takussan — POC playground|Palette|· Typo)$/, famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/app/[locale]/(public)/playground/PlaygroundClient.tsx', motif: /^title="(Pour ton prochain logement|Sélection de la semaine|Tout juste publié)"$/, famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/components/playground/PaletteSwitcher.tsx', motif: /^(Côtier|\(fond clair\)|aria-label="Palette de couleurs")$/, famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/components/playground/TypographySwitcher.tsx', motif: /^(Éditorial|aria-label="Typographie"|Aa)$/, famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/components/playground/PropertyRowLocal.tsx', motif: /^(Wide horizontal|Variante :|Tout voir|aria-label="(Précédent|Suivant)"|Pas encore de biens dans cette sélection\.)$/, famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/components/playground/PropertyCardLocal.tsx', motif: /^(En vente|En location|ch|sdb)$/, famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/components/playground/PropertyCardCompact.tsx', litteral: 'ch', famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/components/playground/PropertyCardWide.tsx', motif: /^(ch|sdb)$/, famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/components/playground/PropertyCardOverlay.tsx', litteral: 'Coup de cœur', famille: 'PLAYGROUND', raison: R_POC_PLAYGROUND },
  { fichier: 'src/components/playground/PropertyCardCompact.tsx', motif: /^(Retirer des|Ajouter aux) favoris$/, famille: 'PLAYGROUND', raison: R_FAVORIS_POC },
  { fichier: 'src/components/playground/PropertyCardLocal.tsx', motif: /^(Retirer des|Ajouter aux) favoris$/, famille: 'PLAYGROUND', raison: R_FAVORIS_POC },
  { fichier: 'src/components/playground/PropertyCardOverlay.tsx', motif: /^(Retirer des|Ajouter aux) favoris$/, famille: 'PLAYGROUND', raison: R_FAVORIS_POC },
  { fichier: 'src/components/playground/PropertyCardWide.tsx', motif: /^(Retirer des|Ajouter aux) favoris$/, famille: 'PLAYGROUND', raison: R_FAVORIS_POC },
];
