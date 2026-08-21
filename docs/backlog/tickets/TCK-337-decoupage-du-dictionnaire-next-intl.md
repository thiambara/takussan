---
id: TCK-337
title: "Le dictionnaire next-intl est inliné en entier dans chaque page"
status: done
phase: P3
family: technique
estimate: L
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
tags: [front, i18n, performance, dette]
---

## Objectif utilisateur

Une page ne fait pas télécharger la traduction de tout le produit pour afficher une liste de biens.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md). Mesures acquises le
2026-08-21, à ne pas reprendre : **60 espaces de noms, ~207 ko minifiés / ~60 ko gzip.**

**Le fichier que l'audit désignait n'est pas le fautif.** Le point d'entrée est
`src/app/layout.tsx` (`getMessages()` puis `<NextIntlClientProvider messages={messages}>`),
pas `src/i18n/request.ts`.

⚠️ **Et l'endroit où ce poids se paie n'est pas celui qu'on croit — corrigé le 2026-08-21.** Le
dictionnaire pèse **ZÉRO dans le bundle JS**. Il vit dans la **charge RSC du document**, servie
`no-store` : il est donc **repayé à chaque chargement de page**, jamais mis en cache, et il
n'apparaît sur aucune ligne du récapitulatif de `next build`. Mesuré sur les octets réellement
servis :

| document | total gzip | dont dictionnaire | part |
|---|---|---|---|
| `/properties` | 76 182 o | 63 039 o | **83,1 %** |
| accueil | — | — | **87,8 %** |

*Une mesure prise sur le bundle aurait conclu « il n'y a rien à gagner » et fermé le ticket.*

## Contraintes strictes (métier)

- **Les providers next-intl imbriqués REMPLACENT au lieu de fusionner.** Vérifié au code
  (`node_modules/use-intl/dist/esm/production/react.js` : `messages: void 0 === i ? w?.messages : i`).
  Un provider posé sur `/properties` perdrait les espaces de la chrome montée au-dessus.
  ⚠️ **Le corollaire est plus dangereux que l'énoncé** : un provider imbriqué écrit **sans** prop
  `messages` hérite du parent **en silence** — il ne rougit nulle part et rend des
  `MISSING_MESSAGE` là où le parent est plus pauvre que l'enfant.
  ⚠️ `locale`, `timeZone` et `onError`, eux, **s'héritent** (même ligne : `f||w?.onError`).
- ~~Le sous-ensemble n'est pas décidable statiquement~~ — **FAUX, mesuré le 2026-08-21.** Aucune
  des 128 clés interpolées n'ouvre un espace de premier niveau. Les sites de namespace calculé
  (`PROPERTY_ENUM_NAMESPACES.status`, la prop `i18nNamespace` de `KycUploader`) se replient sur des
  `const … as const`. Le seul angle mort réel est celui des traducteurs RACINE
  (`useTranslations()` sans argument), et il se réduit à **deux noms**, `errors` et `validation`,
  dont les clés sont fabriquées par concaténation (`PREFIXE_VALIDATION`, `CLE_I18N_ERREUR_API`).
  *Laisser cette phrase dans le ticket autorisait l'implémenteur à renoncer à la garde,
  c'est-à-dire à livrer la version dangereuse.*
- **Une clé manquante ne casse ni le build, ni le lint, ni `tsc`, ni les ~810 tests** : elle
  produit un `MISSING_MESSAGE`, et `getMessageFallback` **peint le chemin de clé à l'écran**.
  C'est le mode de défaillance qui rend ce ticket dangereux — et il a une conséquence directe sur
  les critères d'acceptation, ci-dessous.

## Delta à produire

- [x] Mesurer le **document** servi, pas le bundle
- [x] ~~Évaluer `next-intl/extractor`~~ — **prescription rejetée, mesurée le 2026-08-21.** Le module
      existe en 4.13.6, mais c'est un flux d'**extraction vers catalogues** : il ne découpe rien par
      route. **Aucune API next-intl ne découpe par route.** La table doit donc être dérivée par ce
      dépôt.
- [x] **Grain : le GROUPE DE ROUTES, pas la page.** Mesuré : 75 896 → 31 834 o gzip sur
      `/properties` pour **5 éditions**, soit **92 %** du gain que 113 éditions par page
      rapporteraient (28 217 o). Descendre à la page ne se justifie que par une mesure.
- [x] Décider — et documenter — comment un espace de noms oublié devient une erreur

## Critères d'acceptation

⚠️ **Les deux critères d'origine étaient des cases, pas des critères, et le premier était
dangereux.** « Le poids JS d'une page est mesuré avant et après » est **coché par le pire correctif
possible** : `messages={{}}` donne le meilleur chiffre du lot et ne fait rougir ni ESLint, ni `tsc`,
ni les ~810 tests. Un critère qu'une régression silencieuse satisfait mieux que le correctif n'est
pas un critère.

Et « aucun `MISSING_MESSAGE` sur un parcours complet des trois locales » n'est pas automatisable :
il n'existe aucun parcours exhaustif de 113 pages × 3 locales, et un parcours partiel vert ne dit
rien des chemins rares — qui sont précisément là où ce défaut vit.

Ils sont donc remplacés par ce que le correctif **prouve réellement** :

- [x] **AC1 — le poids du DOCUMENT baisse, mesuré sur un build de production**, avant et après, sur
      au moins `/properties` et l'accueil. (Nécessaire, pas suffisant : cf. AC2 et AC3.)
- [x] **AC2 — un espace de noms absent LÈVE hors production.** `onError` sur `MISSING_MESSAGE` lève
      en développement et sous vitest, journalise en production. Prouvé par ablation : sans lui,
      trois cas de `decoupage-du-dictionnaire.test.tsx` passent au vert, dont celui qui monte
      `messages={{}}`. C'est ce qui rend AC1 falsifiable.
- [x] **AC3 — le sous-ensemble servi par chaque frontière est DÉRIVÉ du graphe d'imports, et la CI
      casse s'il déborde.** `scripts/check-i18n-namespaces.mjs` marche le graphe (`@/…`, relatif,
      `import()`) depuis les fichiers du routeur et compare **dans les deux sens** à
      `src/i18n/namespaces.json` : un espace atteignable et non déclaré casse (un écran manquerait
      un libellé), un espace déclaré et plus atteignable casse aussi (des octets payés pour rien).
- [x] **AC4 — un provider écrit sans `messages`, ou avec le sous-ensemble d'une AUTRE frontière,
      casse la CI.** La garde exige `messagesPour('<identifiant exact de la frontière>')` dans
      chaque `layout.tsx` frontière, et interdit `getMessages()` hors de `src/i18n/messages.ts`.
- [x] **AC5 — un cliquet sur la PART du dictionnaire servie par frontière**, en points de
      pourcentage du dictionnaire complet gzippé (et non en octets : un plafond en octets rougirait
      à chaque traduction ajoutée, ce qui apprend à le relever sans regarder).

## Hors périmètre

- Le contenu des traductions.
- Le découpage par PAGE : mesuré à +8 % de gain pour 22× plus d'éditions.

## Notes d'implémentation

**Frontière = un `layout.tsx` du routeur.** Neuf frontières, chacune servant l'ensemble **CUMULÉ**
de ses parents — c'est ce qui neutralise le piège du remplacement sans demander à personne de se
souvenir d'écrire une union. La table est générée, jamais éditée à la main :
`node scripts/check-i18n-namespaces.mjs --update`.

`src/app/publish/layout.tsx` a été **créé** : sans frontière propre, `/publish` relevait du provider
racine, et ses trois espaces (`publishRedirect`, `profile`, `ui`) étaient servis à **toutes** les
pages du produit — le socle passait de 8,0 % à 13,4 % du dictionnaire pour une page de transit.

`(auth)/layout.tsx` a été **coupé en deux** : un layout `async` qui attend `messagesPour`, et un
composant synchrone qui rend le panneau visuel. `useTranslations` de next-intl 4 n'est appelable
dans un composant serveur **qu'à la condition qu'il ne soit pas `async`** — les fusionner rendrait
le layout muet, sans erreur de type.

**Ce que la garde a trouvé et qu'une table écrite à la main aurait raté** : la console super-admin
adresse `property.*` par `PROPERTY_ENUM_NAMESPACES.status`, sans le moindre littéral
`useTranslations('property…')`. Sans le repli de constantes, `property` sort du sous-ensemble et
l'écran des filtres affiche ses libellés en chemin de clé. Ablation faite, elle rougit.

**Ce que la garde NE prouve pas** : qu'aucun `MISSING_MESSAGE` ne survient. Elle prouve que le
sous-ensemble déclaré couvre ce que le graphe d'imports peut atteindre. C'est pour le reste
qu'existe `surErreurIntl`.
