---
id: TCK-2568
title: "En-têtes de page au téléphone : la barre du site seulement où la maquette la montre"
status: done
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2493]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, navigation, mobile, adr-0091, audit-ux]
---

## Objectif utilisateur

Au téléphone, chaque écran du site public ouvre sur ce que sa maquette montre : la barre du site
(marque, recherche) sur l'accueil et les pages légales ; ailleurs, l'en-tête de la page — un retour,
un titre, une action — ou rien que la photo. Demande du porteur, mot pour mot : « n'oublies pas de
respecter le design mobile en ce qui concerne l'entete de page, car ya plein de page dont dans le
maquette on a pas de nav-bar, et on le doit respecter comme c'est defini ».

## Contrat de données

Aucun. Règle de navigation : [ADR-0091](../../../adr/0091-la-navigation-mobile-du-site-public-suit-le-profil.md),
amendement du 2026-11-09. Inventaire écran → route → attendu → constaté :
[`docs/qa/audit-ux-2026-11/entetes-mobiles.md`](../../../qa/audit-ux-2026-11/entetes-mobiles.md).

## Direction UX / Artistique

- Maquettes de référence (non versionnées) : toutes les pages de `/fr/playground/maquettes`, approche
  retenue de chacune (TCK-2493 → TCK-2524).
- Deux formes d'en-tête : la rangée collante de 56 px (retour, titre, action) et les boutons ronds
  posés sur la photo (fiche d'un bien, d'une agence).
- Le bureau ne change pas (ADR-0091 § 5).

## Contraintes strictes (métier)

- Une seule règle, lue par la barre ET par sa cale : `enTeteAuTelephone(chemin)`.
- Une page neuve, absente de la règle, garde la barre du site (défaut sûr).
- Une route ne quitte la barre qu'avec son en-tête : ses pages ET ses 404 doivent porter le leur le
  jour où elle bascule dans la règle (revue du 2026-11-09).
- Une page d'erreur servie sous le chemin d'une page sans barre n'ouvre jamais sur un haut vide : la
  barre du site (bien retiré, avec sa barre d'onglets) ou la barre de marque (404, erreur, panne).
- Le retour revient à la page précédente du site, sinon à un repli sûr ; c'est un vrai lien. Un nouvel
  onglet ouvert depuis le site n'a rien derrière lui : le repli.

## Delta à produire

- [x] `enTeteAuTelephone` à côté de `porteLaBarrePublique` (`porteLaBarreDuSiteAuTelephone`, sans
  appelant de production, supprimée après la revue).
- [x] `Navbar` et `NavbarSpacer` : masquées / à zéro sous `lg` là où la règle le dit ; surcharge
  `auTelephone` (`barre-du-site`, `marque`).
- [x] Liste : la marque cède sa place à un retour au téléphone, la recherche reste.
- [x] Composant `EnTeteDePage` (+ `BoutonRetourDePage`) partagé.
- [x] Posé sur la fiche d'un bien (retour sur la photo), le comparateur (« ← N biens · N places
  libres ») et la réservation d'un bien au mois ou à vendre (« ← Retour au bien »).
- [x] Bien retiré : barre du site et barre d'onglets (`<BarreDOngletsPublique presente />`) ; 404 de
  la fiche, erreur du groupe, panne de l'API : barre de marque.
- [x] Amendement d'ADR-0091 et sa ligne dans `docs/adr/README.md`.
- [x] Tests de la règle, route par route, de la barre, et des branchements des pages serveur
  (fiche, réservation, `error.tsx`) ; vérifiés par ablation.
- [ ] Annuaire, fiche d'agence, fiche d'agent : **basculent avec la vague 3** (TCK-2521 → TCK-2523),
  qui remet `agencies` et `agents` dans `PREMIERS_SEGMENTS_A_EN_TETE_DE_PAGE` en même temps que leurs
  pages et leurs 404 portent leur en-tête (décision de la session, revue du 2026-11-09).

## Critères d'acceptation

- [x] AC1 — À 390 × 844, chaque route du tableau de l'inventaire ouvre sur l'en-tête attendu (relevé
  au navigateur), **hors annuaire et fiches d'agence et d'agent**, sortis du périmètre par la session
  (ils basculent avec TCK-2521 → TCK-2523 et gardent d'ici là la barre du site, relevée : nav 69).
  *Relevé du 2026-11-09 après la revue, colonne « Après » et § « Corrections de la revue ». Deux états
  ne se provoquent pas d'une URL et sont prouvés par test seulement : `error.tsx` (test qui monte le
  vrai fichier et la vraie `Navbar` sous cinq chemins) et la panne de l'API (branchement). Écarts
  relevés hors du haut de l'écran, laissés à leurs tickets : la barre de l'accueil fait 69 px et sa
  pastille dit « Chercher » (maquette : 56 px, « Où cherches-tu ? » — TCK-2495) ; le titre de la
  réservation au mois est un `h2` (`EmptyState` du tunnel, périmètre réservation).*
- [x] AC2 — À 1440 × 900, la barre du site est présente sur ces mêmes routes, à la même hauteur
  qu'avant. *`nav 75` / cale 75 hors découverte (dont la réservation au mois, le bien retiré, sans
  barre d'onglets), 127 / 136 sur la liste ; aucun `EnTeteDePage` visible.*
- [x] AC3 — Aucun défilement horizontal à 360 px. *`scrollWidth` 360 sur la liste, la fiche, le
  comparateur, la réservation au mois, les favoris, le compte connecté.*
- [x] AC4 — Une règle mutée fait rougir un test. *42 mutations au total (19 + 10 + 13), toutes rouges, restaurées par
  `cp` et prouvées par md5 ; dont les 13 de la revue (`scratchpad/entetes/ablation4.py`) : `error.tsx`
  sans la marque, `/bookings` sans surcharge, `sur-photo` sans `lg:hidden`, référent d'une autre
  origine accepté, nouvel onglet non vérifié, `agencies`/`agents` remis avant la vague 3, surcharge
  `presente` ignorée, bien retiré sans barre d'onglets, panne en barre du site.*

## Hors périmètre

- Le contenu des en-têtes propres aux pages refaites par leurs tickets (liste, favoris, réservation, annuaire).
- Les pages par lien : leur coque (TCK-2505) porte déjà son en-tête, à toutes les tailles.

## Notes d'implémentation

Mesures du 2026-11-09 (branche `feat/audit-ux-vague-2`, `next dev` chargé, Chrome par CDP, 390 × 844) —
tableau complet : [`entetes-mobiles.md`](../../../qa/audit-ux-2026-11/entetes-mobiles.md).

- **Barre du site au téléphone, d'après les maquettes retenues** : l'accueil et les pages légales
  seulement. La liste garde la barre avec un retour à la place de la marque (son en-tête de maquette
  est « ← [la recherche en vigueur] », que la pastille porte déjà). Tout le reste a son propre haut.
- **Défaut sûr** : la règle liste les pages SANS barre ; une page neuve la garde. La sélection
  partagée `/favorites/shared` n'a pas d'écran de maquette : barre gardée (on y arrive de WhatsApp).
- **Le chemin ne suffit pas toujours** : bien retiré, fiche introuvable, panne de l'API, l'état
  « au mois » ou « sans bien » de `/bookings` vivent sous le chemin d'une page sans barre. Surcharge
  `auTelephone="barre-du-site"`, à passer à la `Navbar` ET à `NavbarSpacer` (sinon cale et barre
  divergent). Posée sur la fiche (`page.tsx`, `not-found.tsx`), `error.tsx`, et la coque de
  `/bookings` hors tunnel (relevé : « Ce bien se loue au mois » restait sans rien en haut).
- **`sticky top-[69px]`** supposait la barre : l'en-tête des colonnes du comparateur passe à `top-14`
  sous l'`EnTeteDePage` (relevé après défilement : en-tête 0 + 56, colonnes à 56). Le test du
  comparateur qui lisait la cale par regex lit désormais la hauteur d'`EnTeteDePage`.
- **Le retour** de l'en-tête appelle `window.history.back()` et non `router.back()` : rendue hors
  routeur (tests de la fiche sans mock de `next/navigation`), la fiche levait « invariant expected
  app router to be mounted ». Le routeur de Next écoute `popstate`.
- **Cible tactile** : les boutons ronds de la maquette sur photo font 40 px ; ceux du site 44 (TCK-560).
- **Fiche** : seul le retour est sur la photo ; partager et favori restent sous le titre
  (`PropertyHeader`, fichier de l'agent visite) — la maquette les met aussi sur la photo.
- **Mutation équivalente relevée** : afficher le retour de la liste sur toute page sans barre
  restait vert (la barre y est masquée) — gardé depuis par « la barre n'en porte pas un second ».
- **Vague 3** (annuaire, fiches d'agence et d'agent) : consignes écrites — états d'erreur à barre
  forcée, `OngletsDeFiche` collant à `top-0` sous `lg`, `h1` « Professionnels » à 8 px du haut.
- **Barre de marque** (complément, demande de la session) : `auTelephone="marque"` — logo seul (nom
  compris dès 360 px), pastille masquée, rangée `max-lg:h-14`, cale `h-[57px]` ; relevé à 390 : `nav`
  57 = cale 57 ; à 1440 : `nav` 75, inchangé. Posée sur `properties/[slug]/not-found.tsx` et
  `(public)/error.tsx`. Branchement des pages serveur gardé par
  `properties/[slug]/__tests__/en-tete-au-telephone.branchement.test.tsx` (servie → chemin, retiré et
  indisponible → barre du site, inconnue → marque). Mutation d'abord verte : masquer la pastille sur
  TOUTE page qui n'est pas `barre-du-site` (la liste perdait sa recherche) — gardée depuis.

### Corrections de la revue adverse (2026-11-09)

Revue refusée (`scratchpad/vague2/revue-entetes.json`) ; décisions de la session, toutes appliquées :

- **Annuaire hors de la règle** jusqu'à la vague 3. La règle avait ôté la barre à `/agencies` et
  `/agents` sans rien à la place : 404 sans haut, onglets collants à 69 px, titre à 8 px, fiche d'agent
  sans « ← · Partager ». Relevé après : `/fr/agencies`, `/fr/agents` nav 69, `h1` 81, barre d'onglets.
- **Réservation au mois ou à vendre** : `EnTeteDePage` « Retour au bien » → `/properties/<slug>`, sans
  barre du site (maquette `MobileAAuMois`). Relevé : nav masquée, cale 0, en-tête 0 + 56. Sans bien ou
  slug inconnu : barre du site gardée (aucun écran de maquette, aucune fiche vers laquelle revenir).
- **Retour dans un nouvel onglet sans Navigation API** : `peutRevenirSurLeSite` exige aussi
  `history.length ≥ 2`. Relevé : `window.open('/fr/compare?ids=857,854')`, historique 1, référent du
  site, `navigation` retirée → le clic mène à `/fr/properties`. Corrige aussi `BoutonRetour`.
- **Bien retiré** : la page monte `<BarreDOngletsPublique presente />` (surcharge déclarée, comme pour
  le haut) ; celle du layout suit le chemin et reste absente — une seule barre. Relevé : 784 + 60.
- **Panne de l'API** sur la fiche : barre de marque, comme l'écran « Erreur serveur ».
- **`/fr/account` connecté** (`customer@agency1.demo.takussan.sn`) : pas de nav, initiales à 24, `h1`
  « Bonjour Demo » à 26 — l'`EnTeteMoi` de la maquette (`pt-6`). Conforme sans changement.
- **Deux tests voisins** reçoivent un mock d'une ligne (composants clients désormais montés par la
  page) : `bookings/__tests__/page.server.test.tsx` (`EnTeteDePage`) et
  `properties/[slug]/__tests__/page.server.test.tsx` (`BarreDOngletsPublique`).

