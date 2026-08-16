---
id: TCK-292
title: "i18n — le reste du parc : 409 fichiers, 3 542 libellés, en 12 lots"
status: todo
phase: P2
family: front
estimate: XL
wave: null
created: 2026-08-15
updated: 2026-08-15
depends_on: [TCK-286]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models: []
tags: [front, i18n, qualite, dette]
---

## Objectif utilisateur

Qu'un utilisateur qui choisit l'anglais ou le wolof obtienne réellement l'anglais ou le wolof
**au-delà de la coquille et du tunnel d'authentification** — sur les écrans où il passe son temps :
la recherche publique, son tableau de bord, ses réservations, ses baux, ses paiements.

## Contrat de données

Aucun endpoint neuf. Le travail consiste à déplacer du texte du code vers
`src/messages/{fr,en,wo}.json` et à le résoudre par `useTranslations` (client) ou
`getTranslations` (serveur).

**Le périmètre est mesuré, pas estimé.** `takussan-web/scripts/i18n-baseline.json` porte le compte
**par fichier**, produit par AST (`node scripts/check-i18n.mjs --report`). Au 2026-08-15, après le
lot 1 de TCK-286 : **409 fichiers, 3 542 occurrences**, réparties ainsi :

| Lot | Surface | Fichiers | Occurrences |
|---|---|---:|---:|
| A | Console super-admin (`components/admin/super`, `components/super-admin`, `app/(super-admin)`) | 52 | 610 |
| B | Surface publique (`app/(public)`, `components/{property,property-form,search,compare,favorites,map,home,agents,agency,contact,share,reviews}`) | 60 | 407 |
| C | Tableau de bord + portefeuille (`app/(dashboard)/app`, `components/property-dashboard`) | 53 | 392 |
| D | Admin agence (`app/(dashboard)/admin`, `components/admin*`, `owners`, `service-providers`) | 37 | 354 |
| E | CRM & profil (`components/{customer*,pipeline,profile}`) | 27 | 308 |
| F | Réservations · visites · calendrier | 16 | 244 |
| G | Locatif : baux, états des lieux | 15 | 220 |
| H | Finances : paiements, facturation | 19 | 247 |
| I | Documents, médias, maintenance | 20 | 233 |
| J | Schémas zod (`lib/schemas`) | 15 | 183 |
| K | Server actions (`app/actions`) | 19 | 86 |
| L | Résidu : reporting, onboarding, messagerie, hooks, `ui/`, route handlers, playground | 76 | 258 |

Les douze lots sont disjoints et couvrent exactement les 409 fichiers / 3 542 occurrences.

Les chiffres se reprennent à la source, jamais à la main :
`cd takussan-web && node scripts/check-i18n.mjs --report`.

## Direction UX / Artistique

Aucune. Ce ticket ne change **aucun rendu** : il change d'où vient le texte. Un libellé qui change
de formulation en passant au dictionnaire est un bug de ce ticket, pas une amélioration.

## Contraintes strictes (métier)

**Les trois langues partent ensemble.** `src/i18n/request.ts:95-101` deep-merge `fr` sous toute
locale ≠ `fr` : une clé sans traduction anglaise s'affiche **en français**, sans erreur, sans
avertissement, sans test rouge. Brancher une clé sans son anglais transforme un anglais complet en
anglais troué, en silence. La garde `check-i18n.mjs` refuse déjà toute clé `fr` sans `en`
(plafond 0) ; elle ne peut pas refuser la même chose sur `wo`, dont le plafond est un cliquet
(88 clés manquantes préexistantes au 2026-08-15) — **c'est au ticket de tenir le wolof, pas à la
garde**.

**Un lot se termine à zéro sur ses fichiers.** 18 fichiers du parc importent déjà next-intl ET
portent du texte en dur (jusqu'à 34 occurrences dans `admin-agency/AgencyConfigForm.tsx`) : la
conversion à moitié faite est le mode d'échec dominant de ce chantier. Le cliquet par fichier le
rend visible ; le respecter est le contrat.

**Trois surfaces ont un patron imposé, sous peine de casser le build :**

- **Lot J (zod)** — `src/lib/schemas/*` est importé par des server actions ET par des composants
  client. Ni `useTranslations` ni `getTranslations` n'y est appelable. Le schéma doit porter une
  **clé** de message, résolue à l'affichage dans `src/hooks/useApiForm.ts`.
  ⚠ `src/lib/__tests__/agent-fr-regressions.test.ts` importe `MAINTENANCE_PRIORITY_LABEL` et
  `statusFilterLabel` et assert sur les valeurs françaises exactes : convertir ces tables casse ce
  test, qui existe pour de bonnes raisons.
- **Lot K (server actions)** — modules serveur : `getTranslations()` de `next-intl/server` est la
  bonne primitive, et la seule.
- **Données hors composant** (tables de libellés, `NAV_GROUPS`, listes d'items) — la donnée
  transporte la **clé**, le rendu la résout. Patron posé par TCK-286 dans
  `src/components/layout/AppSidebar.tsx` et `src/data/navigation.ts`.

**Le harnais de test existe : ne pas le réinventer.** `src/test/intl.tsx` expose `withIntl(ui)`
pour les composants client et `mockTraductionsServeur()` pour les composants serveur. Les rendus
qui passent `messages={{}}` rendent la CLÉ et non le libellé : tout `getByText('…')` casse à la
conversion. 7 fichiers de test mockent `next-intl` en entier et devront exposer `useTranslations`.

## Delta à produire

- [ ] Traiter les lots **dans l'ordre B → C → D → E → F → G → H → I → J → K → A → L** : la valeur
      décroît avec la visibilité, et A (super-admin) a un public interne.
- [ ] Chaque lot : les trois dictionnaires complets, `node scripts/check-i18n.mjs --update` pour
      resserrer le cliquet, et le compte des fichiers du lot **à zéro**.
- [ ] Résorber les **88 clés wolof manquantes** restantes (`node scripts/check-i18n.mjs --report`
      les liste), et baisser `PLAFONDS_PARITE.wo` jusqu'à 0.
- [ ] Trancher la divergence `nav.categories.*` ↔ `property.types.*` : deux vocabulaires pour le
      même enum backend, qui divergent sur `shop` (« Commerce » / « Boutique ») et `resort`
      (« Complexe » / « Resort »). TCK-286 a conservé les deux pour ne rien changer à l'écran ;
      choisir lequel gagne est une décision produit, puis supprimer l'autre.
- [ ] Supprimer `src/components/layout/{Footer,Header,Navigation,Sidebar}.tsx` — **aucun importeur
      dans tout `src`**, 13 occurrences de texte en dur dont 7 libellés de navigation en doublon
      exact d'`AppSidebar`. Les traduire créerait deux tables de navigation dont une invisible.
- [ ] Décider du sort de `src/components/playground/` (7 fichiers, 26 occurrences — page de
      démonstration) et des route handlers `src/app/api/**` (15 fichiers, 31 occurrences — messages
      JSON techniques, probablement à requalifier hors périmètre plutôt qu'à traduire).
- [ ] Étendre la garde si le besoin s'en fait sentir : elle ne voit **pas** les gabarits interpolés
      (`` `Bonjour ${nom}` ``) ni les props de composants maison hors `ATTRS_AFFICHAGE`. Son total
      est un plancher, jamais un inventaire — le vrai reste est supérieur à 3 542.

## Critères d'acceptation

- [ ] AC1 — pour chaque lot livré, `node scripts/check-i18n.mjs` sort en **0** et la baseline ne
      contient plus aucun fichier de ce lot.
- [ ] AC2 — `en` reste à **0 clé manquante** (la garde le tient déjà), et `PLAFONDS_PARITE.wo` a
      strictement baissé à chaque lot qui touche un sous-arbre concerné.
- [ ] AC3 — aucun libellé affiché n'a changé de formulation : un test de rendu existant qui
      assertait un texte français continue de passer **sans modification de son assertion**.
- [ ] AC4 — `npx tsc --noEmit`, `npm run lint`, `npm run test` et `npm run build` verts.

## Hors périmètre

- **Le texte produit par l'API.** Le principe n°5 du `CLAUDE.md` racine dit que « l'API émet des
  codes et des données », mais la part de libellés qui arrivent déjà rédigés de `takussan-api/`
  (messages de validation Laravel, libellés d'enums, notifications, gabarits d'e-mail et de PDF)
  **n'a pas été mesurée**. Si l'API renvoie des phrases françaises, traduire le front ne suffira
  pas : ce sera un ticket backend, pas celui-ci.
- **La qualité linguistique du wolof existant.** On établit que 92 % de ses valeurs diffèrent du
  français ; on n'établit pas qu'elles sont justes. Une relecture par un locuteur est un autre
  travail.
- **Le basculement FR→EN→WO vérifié au navigateur.** Tout ce qui précède est mesuré sur le code
  source, pas sur le rendu.

## Notes d'implémentation

_(Rempli pendant le travail.)_
