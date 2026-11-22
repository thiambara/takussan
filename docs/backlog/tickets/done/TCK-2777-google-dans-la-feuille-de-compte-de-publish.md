---
id: TCK-2777
title: "« Continuer avec Google » dans la feuille de compte de /publish"
status: done
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2601]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models: []
tags: [front, publish, sans-compte, oauth, google, feuille-de-compte, suite-de-tck-2601]
---

## Objectif utilisateur

Un visiteur sans compte a rempli son annonce sur `/publish`. À la dernière étape, il peut entrer par Google au lieu
du numéro, et il retrouve au retour son annonce prête à publier, sans rien ressaisir.

## Contrat de données

**Origine.** Relevé al du 2026-11-13 (TCK-2601, défaut appliqué) : « Continuer avec Google » dans la feuille de
compte de /publish devient un ticket de suivi. team-lead l'a demandé le même jour. Le brouillon est celui de
terrain-9, relu sur l'arbre.

**Constat (fidélité de TCK-2601, relu le 2026-11-13).**

- La maquette retenue (`app-entree-publier`, approche a, écrans 6 « Le compte, à la publication » et 7, gelée le
  2026-11-11) et TCK-2601 (§ Téléphone, § Bureau) dessinent un « Continuer avec Google » discret sous « Recevoir un
  code », **seulement si le fournisseur est configuré** (commentaire de `BoutonGoogle` dans
  `app-entree-publier-kit.tsx`).
- La feuille livrée (`src/components/publication/FeuilleSansCompte.tsx`) ne le porte pas : aucune occurrence de
  Google ni d'OAuth. C'est l'écart « parcours » de la fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2601.json`.
- Ce n'est pas une ligne à ajouter. Monter `AutresVoies` (`src/components/auth/AutresVoies.tsx`) dans la feuille
  enverrait chez le fournisseur un visiteur dont l'annonce n'existe que dans ce navigateur (IndexedDB, ADR-0093).
- Le retour (`/auth/oauth/{provider}/callback`) ouvre une session et mène à `/app`, sauf si une intention a été
  mémorisée (`memoriserIntentionOAuth`, `src/components/auth/intention-oauth.ts`, en `sessionStorage` de
  l'onglet, TCK-589).
- La suite sans compte (créer l'espace personnel, verser le brouillon, publier) vit dans la feuille, et rien ne la
  rouvre au retour.

**Endpoints consommés (existants) :** `oauthProviders()` (la liste des fournisseurs et leur `configured`), la
redirection et le retour OAuth, puis les écritures de la reprise connectée de TCK-2601.

## Direction UX / Artistique

Discret, secondaire au numéro, comme dans la maquette a-6. Au téléphone, une ligne de 44 px centrée sous « Recevoir
un code ». Au bureau, à côté du geste, dans le panneau de compte de la colonne de l'assistant. Rien ne change pour
qui n'a pas Google configuré.

## Contraintes strictes (métier)

- Le bouton n'apparaît que si `oauthProviders()` rend Google `configured`. Un échec de chargement le **retire**
  sans message, comme à la porte d'entrée (`AutresVoies`, TCK-2604).
- Rien ne quitte le navigateur avant le départ : le brouillon reste en IndexedDB, sans numéro ni nom (ADR-0093).
- Au retour, l'annonce n'est publiée que par un geste de la personne (« Publier mon annonce »). Le retour seul
  n'écrit rien.
- Un compte Google sans numéro de téléphone reste soumis à ce que la publication exige : numéro, prénom, nom,
  WhatsApp (`FeuilleDePublication`, TCK-633).
- La destination mémorisée passe par `destinationInterne` : jamais une URL externe.

## Delta à produire

- [x] `FeuilleSansCompte` : à l'étape du numéro, « Continuer avec Google » sous « Recevoir un code », désactivé
  pendant une écriture.
- [x] Avant le départ, mémoriser l'intention `/publish` et la reprise de la feuille par `memoriserIntentionOAuth`.
- [x] Au retour sur `/publish` avec une session, la reprise connectée existante (brouillon local versé au brouillon
  serveur, TCK-2601 r1) mène à l'étape 6. Elle rouvre la feuille de publication connectée, qui ne demande que ce qui
  manque au compte.
- [x] Échec chez le fournisseur : retour sur `/publish`, avec l'annonce intacte et un message qui propose le numéro.

## Critères d'acceptation

- [x] AC1 — Avec le fournisseur configuré, le bouton est dans la feuille au téléphone et dans le panneau au bureau.
  Non configuré, ou après un échec de chargement, il est absent, sans texte.
  *Preuve : `src/components/property-form/__tests__/PropertyWizard.google.tck-2777.test.tsx`, describe AC1 (téléphone, bureau, non configuré, liste en échec, brouillon en mémoire).*
- [x] AC2 — Après un aller-retour Google réussi, l'annonce est à l'étape 6 et la feuille connectée est ouverte. Rien
  n'est publié avant le geste. Une fois l'annonce publiée, le brouillon local s'efface.
  *Preuve : même fichier, describe AC2 (brouillon à l'étape 3 → étape 6, feuille connectée qui demande le numéro, ni
  espace ni création ; au geste, publication puis `clear()` du brouillon local).*
- [x] AC3 — Après un aller-retour annulé ou refusé, on est sur `/publish`, avec l'annonce et ses photos intactes et
  la feuille rouverte au numéro.
  *Preuve : même fichier, AC4 « annulé » et « refusé par l'API » (→ `/publish?reprise=echec`) et AC3 (feuille au
  numéro, message, brouillon ni effacé ni réécrit).*
- [x] AC4 — Tests : présence selon `configured`, intention mémorisée avant le départ, reprise au retour. Une ablation
  de la mémorisation rend le test du retour rouge.
  *Preuve : le test du retour enchaîne le clic réel et la vraie page de rappel ; ablation de
  `memoriserIntentionOAuth` → 2 rouges ; ablation de la liste blanche d'échec → 10 rouges ; ablation de l'écriture du
  brouillon avant le départ → 1 rouge ; ablation du passage unique de la page de rappel (Strict Mode) → 4 rouges ;
  ablation du branchement de `/publish` (`PublierSansCompte.google.tck-2777.test.tsx`) → 4 rouges.*
- [x] AC5 — Fidélité : la ligne « Continuer avec Google » des écrans a-6 (téléphone, 1440, 1280) n'est plus absente
  du produit, avec un fournisseur configuré en local.
  *Preuve (2026-11-14, Google `configured` en local, relevés à 390 et 1280 seulement, ADR-0106) : a-6 téléphone
  14·11·6·20,48 % → 15·13·3·9,33 % ; a-6 bureau 1280 8·19·4·15,73 % → 13·17·1·11,31 %. La ligne est appariée aux
  deux largeurs ; écart restant : son encre, opaque (règle du dépôt) au lieu de `/80`.*

## Hors périmètre

- Les autres fournisseurs OAuth.
- La porte d'entrée et `/login`, qui ont déjà `AutresVoies` (TCK-2604).

## Notes d'implémentation

- `src/lib/publication/reprise-oauth.ts` : la destination mémorisée est la constante `/publish?reprise=compte`.
  L'échec chez le fournisseur ne revient sur `/publish` que par une **liste blanche de chemins exacts**
  (`retourApresEchecOAuth`). La fonction rend une constante, jamais la chaîne du stockage. Tout autre départ garde
  `/auth/login?error=…`. Le succès passe toujours par `destinationInterne`, puis par `/onboarding/intention`.
- La page de rappel (`auth/oauth/[provider]/callback`) passe ses trois sorties en échec (sans `code`, rappel refusé,
  second facteur annulé) par cette liste blanche.
- `ContinuerAvecGoogle` écrit d'abord l'annonce dans ce navigateur (`save` à l'étape courante, puis `flush`). Il
  demande ensuite le départ, mémorise l'intention et navigue. La feuille reste figée pendant le départ.
- Le bouton est absent quand le brouillon n'est gardé qu'en mémoire (quota, stockage refusé), parce que l'annonce
  ne survivrait pas à la navigation.
- Au retour, `PublierSansCompte` lit `?reprise=` par `useSyncExternalStore` : `/publish` n'est pas sous `Suspense`.
  L'assistant tranche pendant le rendu, après la reprise du brouillon : étape 6, puis la feuille connectée (session
  ouverte) ou la feuille sans compte au numéro avec le message (échec). Le paramètre est ensuite retiré par
  `history.replaceState`, et un rechargement ne rouvre rien.
- La page de rappel ne traite le rappel qu'une fois. Sous le Strict Mode, le second passage de l'effet ne trouvait
  plus l'intention, et un retour d'échec finissait sur la connexion.
- Revenu par « Précédent » depuis chez Google (cache d'historique), la feuille n'est plus figée (`pageshow`).
- Les contacts sur place ne survivent pas à l'aller-retour : ils ne sont jamais écrits au brouillon (ADR-0093 § 6).
- Un compte qui a déjà tout ce que la publication exige retrouve une feuille connectée réduite à « Publier mon
  annonce ».

- 2026-11-14 : clôturé — livré (2602 : 2bffff54c, ae010f5c4 ; 2777 : ebc494478), AC prouvés ; AC de fidélité tenus par la fiche (écarts acceptés).
