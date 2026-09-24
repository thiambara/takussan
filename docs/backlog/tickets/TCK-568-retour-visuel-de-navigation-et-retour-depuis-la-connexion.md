---
id: TCK-568
title: "Un clic sur un lien ne montrait rien jusqu'à la page suivante ; la connexion n'offrait aucun retour vers la page quittée"
status: doing
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#21-authentification--comptes
  models: []
tags: [front, mobile, navigation, auth, a11y, ux, retour-testeur]
---

## Objectif utilisateur

Un visiteur qui clique une carte de bien, une page de résultats ou une fiche d'agent voit tout de
suite que son clic est pris en compte. Un visiteur arrivé sur la page de connexion depuis sa
recherche peut y revenir d'un geste, filtres compris, sans passer par l'accueil — et ce retour ne
rouvre jamais la console d'un compte qu'on vient de fermer.

## Contexte

Retour testeur du 2026-09-23, deux points.

**W1 — liste de recherche, bureau** (capture : liste « Biro », 1400 px). *« Peut-on avoir une
couleur un peu plus différente pour le hover ? On a l'impression qu'on n'a pas cliqué puisque le
loader se trouve en bas. »* La couleur de survol relève d'un autre ticket du lot (TCK-561) ; celui-ci
traite le seul retour visuel du clic.

- **La capture est celle de la PRODUCTION** (`www.takussan.com`, servie depuis `master`) : onglet
  actif « Biro » souligné `border-gray-900`, « Butik » sous le pointeur en `hover:border-gray-400`
  — les classes que `curl -m 20 https://www.takussan.com/properties?type=office` rend encore
  (relevé de la revue du 2026-09-23). Le testeur parle donc de la **bande de catégories** : le
  clic sur un onglet ne changeait rien près de l'onglet, le seul chargement visible était celui de
  la liste, plus bas.
- **Ce cas est déjà traité sur `dev` et `preview`** par cfe92ba8 (2026-09-16, « chargement
  visible ») : les boutons de catégorie naviguent dans une transition qui pose `BarreDeChargement`
  au bord de la barre. Re-mesuré sur l'arbre local le 2026-09-23 à 1366 px : clic sur
  « Commerce » depuis `/fr/properties?type=office`, barre de 1366 px à 131 px du haut **9 ms**
  après le clic, URL changée en 407 ms. Rien à refaire ici ; la production l'aura à la promotion.
  (La version précédente de ce ticket attribuait le « loader en bas » à l'indicateur de
  développement de Next : c'était faux.)
- **Ce que cfe92ba8 ne couvrait pas : les LIENS.** Une navigation du routeur de Next laisse la
  page courante IMMOBILE jusqu'à l'arrivée de la suivante, sauf là où un `loading.tsx` la remplace.
  Les fiches publiques n'en ont pas et ne doivent pas en avoir : une frontière de suspension y
  ferait partir le 404 d'une fiche inexistante en 200
  (`[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts`). Mesuré au navigateur
  local (1366 px) : clic sur une carte de `/fr/properties?type=office`, rien ne bouge jusqu'au
  changement d'URL, 0,8 à 2,4 s (plus de 40 s à la première compilation d'une page).
- **Régression relevée par la revue, corrigée** : la première version de l'indicateur partait aussi
  sur les liens vers les route handlers `/api/…` servis en pièce jointe (export de données,
  `DataExportsPanel.tsx` ; reçu de paiement, `BookingDetail.tsx` ; contrat de bail,
  `LeaseDetail.tsx`) — l'URL ne changeant jamais, la barre et le pointeur « progression » restaient
  15 s.

**M2 — page de connexion, mobile** (capture : Safari iOS ouvert depuis WhatsApp, logo
« Takussan » entouré). *« Pas de possibilité de retour sur ma page de recherche. »*

- Confirmé par le code : sur mobile, la seule issue de `/auth/login` était le logo, qui mène à
  l'ACCUEIL (`(auth)/layout.tsx`, bannière mobile) — la recherche en cours perdue.
- « Après connexion, revient-on à la page d'origine ? » — **non, avant ce ticket.** `/auth/login`
  suit bien `?redirect=` (les dialogues de visite, de réservation et de signalement d'une fiche le
  posent). Mais les deux liens « Connexion » de la barre publique (`components/home/Navbar.tsx`,
  bureau et menu mobile) étaient nus : se connecter depuis une recherche menait à `/app`.
  **Branché à l'intégration du lot** : les deux liens passent par `hrefConnexion(chemin + requête)`
  (`Navbar.connexion-retour.test.tsx`, rouge sans le branchement). Mesuré au navigateur à 390 × 844,
  menu mobile : `/fr/properties?contract_type=sale&type=office` → « Connexion » →
  `/auth/login?redirect=%2Ffr%2Fproperties%3Fcontract_type%3Dsale%26type%3Doffice` → connexion
  `owner1` → retour sur `/fr/properties?contract_type=sale&type=office`.
- **Deux régressions relevées par la revue du premier jet, corrigées :**
  1. *Après une déconnexion, « Retour » rouvrait la console.* `/app` → `/app/messages` →
     Déconnexion (`router.replace` vers `/auth/login`) : l'entrée précédente est `/app`,
     `navigation.canGoBack` est vrai, et `router.back()` réaffichait « Bonjour Astou » depuis le
     cache du routeur, `/api/auth/me` à 401. La règle reprise de `BoutonRetour` — « une page du
     site précède » — ne suffit pas ici : il faut « une page du site PUBLIC précède ».
  2. *Sur `/auth/register`, de 1024 à 1180 px de large, « Retour » chevauchait le titre* : le
     formulaire, plus haut que la fenêtre, commence au rembourrage du panneau (40 px) quand le
     retour, posé en absolu à 32 px, en occupe 44 (« Dellu » imprimé sur « Sos sa kont »).
- Le repli sans historique lisible menait à l'accueil — le cas exact du testeur (arrivé depuis
  WhatsApp : `document.referrer` vide, et le lien « Connexion » ne porte pas de `?redirect=`).
- **Troisième défaut, relevé par la deuxième revue : le retour était hors de l'écran dans le
  parcours même du testeur.** Recherche défilée, puis « Connexion » : `/auth/login` s'ouvrait
  défilée à son maximum. Reproduit au navigateur local avant correctif — liste défilée à 600 px,
  puis `router.push('/auth/login')` à 320 × 640 : `scrollY` 82, « Retour » à `top` −70 ; même
  chose par le menu mobile. Les mesures « à 320 px » du premier jet étaient toutes prises sur un
  chargement neuf (`scrollY` 0). La cause est une règle de Next 16, pas un oubli du dépôt : le
  gestionnaire de défilement du routeur (`InnerScrollHandlerNew`, `appNewScrollHandler` actif par
  défaut) court des segments les plus profonds vers les plus hauts, et le premier dont le haut est
  déjà visible clôt la navigation. La page de connexion commence sous la bannière (`mt-[22vh]`) :
  la fenêtre ramenée de 600 à 82 px par le navigateur laisse son premier élément à 83 px, visible
  — aucun `scrollTo`, aucun `scrollIntoView` n'est émis (journalisés). Le retour et le logo, au-dessus,
  dans le layout, restent dehors.

## Ce qui change

- `components/shared/IndicateurDeNavigation.tsx`, monté une fois dans le layout racine : au clic
  d'un lien interne qui navigue (ni ⌘-clic, ni ancre, ni page courante, ni lien externe, ni
  téléchargement, ni contrôle qui arrête l'événement, **ni ressource** — `/api/…` ou fichier
  d'extension connue, jugée sur la liste fermée `EXTENSIONS_DE_FICHIERS` parce qu'un slug peut
  porter un point), `BarreDeChargement` paraît en haut de l'écran après 100 ms et le pointeur passe
  en `progress` ; les deux partent quand l'URL change, au retour du navigateur, à la restauration
  depuis le cache arrière-avant, et au plus tard à 15 s.
- `components/auth/RetourAuth.tsx` dans `(auth)/layout.tsx`, sur `/auth/login`, `/auth/register`
  et `/auth/forgot-password` : « Retour » suit l'historique **seulement si l'entrée précédente est
  une page du site public** (Navigation API : `entries()[currentEntry.index - 1]`). Sinon — et
  toujours sans Navigation API, `document.referrer` ne décrivant que le chargement du document — un
  vrai lien vers : la destination `?redirect=` si elle est publique, la dernière page publique vue
  dans l'onglet, l'accueil. Sur la bannière mobile, blanc sur un voile `bg-scrim/40` ; le logo passe
  à droite. Au bureau, le panneau du formulaire commence à 96 px (`lg:pt-24`), sous le retour.
- `components/auth/ArriveeEnHaut.tsx`, monté dans `(auth)/layout.tsx` : à chaque arrivée sur un
  écran de `(auth)` (changement de chemin), le document remonte à son SOMMET, sans animation et
  avant la première peinture (`useLayoutEffect`) — sauf quand l'URL vise une ancre. Un écran de
  connexion n'a pas de position de lecture à préserver ; il a une issue à montrer.
- `components/auth/MemoireDeLaPagePublique.tsx` (layout racine) et `page-publique-memorisee.ts` :
  la dernière page du site public vue dans l'onglet, chemin ET filtres, en `sessionStorage` —
  filtrée à l'écriture et REFILTRÉE à la lecture (`destinationPublique`), chaque accès gardé.
- `/auth/login` filtre `?redirect=` par `destinationInterne`, le filtre partagé (la copie locale
  laissait passer `/\evil.tld`).
- `components/auth/lien-connexion.ts` : `destinationPublique` (branchée) et `hrefConnexion`, le
  lien de connexion qui emporte la page courante — **pas encore appelé** (cf. hors périmètre).

## Critères d'acceptation

- [x] Clic sur une carte de la liste à 1366 px : une barre de 3 px paraît en haut de l'écran avant
      l'arrivée de la fiche, le pointeur est `progress` à 200 ms et `auto` après — mesuré au
      navigateur local le 2026-09-23 ; à 320 px, barre 320 × 3.
- [x] Carte → fiche → retour du navigateur : aucune barre sur la liste, ni tout de suite ni 3 s
      après (le premier jet la faisait renaître jusqu'au plafond de 15 s — mesuré, corrigé).
- [x] Aucune barre pour un clic qui ne navigue pas (favori, comparateur, ⌘-clic, clic molette,
      page courante avec ou sans langue, ancre, nouvel onglet, lien externe, téléchargement —
      dont un `<a download>` vers une URL `blob:` de même origine, que seul l'attribut `download`
      exclut —, route handler `/api/…`, fichier `.pdf` sans `download`) — `IndicateurDeNavigation.test.tsx` ;
      au navigateur local à 1366 px, `/api/data-exports/12/download`, `/api/booking-payments/7/receipt`
      et `/fr/brochure.pdf` : 0 barre, pointeur `auto` ; `/fr/agents` : barre 1366 × 3, `progress`.
- [x] Un slug à point (`/fr/agents/owner.agency4`) et un chemin qui commence par « api » sans en
      être (`/apiculteurs`) gardent leur barre.
- [x] La bande de catégories montre sa barre dès le clic (cfe92ba8, re-mesuré : 9 ms à 1366 px).
- [x] À 320 px, `/auth/login` montre « Retour » (85 × 44 px, en haut à gauche, 0 px de défilement
      horizontal) sur un chargement neuf ; un clic depuis `/fr/properties?type=office&contract_type=rent` y revient,
      filtres compris ; à 1366 px, par l'historique, défilement compris (`traverse`, `scrollY`
      900 → 900) — mesuré au navigateur local.
- [x] **En arrivant d'une recherche défilée**, « Retour » est dans l'écran : liste défilée à 600 px
      puis `router.push('/auth/login')` → `scrollY` 0, retour à `top` 12, à 320 × 640, 390 × 664,
      375 × 548 et 320 × 460 (avant correctif : 82 et −70 à 320 × 640) ; par le menu mobile puis
      « Connexion » à 320 × 640 et 390 × 664 : retour 85 × 44 à (12, 12), au premier plan
      (`elementFromPoint`), 0 px de défilement horizontal, et son clic ramène à la recherche
      filtrée, `scrollY` 600 restitué ; à 1366 × 768, `scrollY` 0, retour à `top` 32 — mesuré au
      navigateur local, et `ArriveeEnHaut.test.tsx` + `layout.retour.test.tsx` partent d'une
      arrivée défilée.
- [x] Après une déconnexion (historique `/fr/properties > /auth/login > /app > /auth/login`,
      `canGoBack` vrai), « Retour » mène à `/fr/properties?type=office&contract_type=rent` par un
      `push`, jamais à `/app` ; `/api/auth/me` rend 401 — mesuré au navigateur local
      (déconnexion reproduite par `POST /api/auth/logout` + `router.replace('/auth/login')`, ce que
      fait le menu utilisateur) et `RetourAuth.test.tsx`.
- [x] Sans Navigation API, « Retour » mène à la dernière page publique de l'onglet, filtres compris
      — mesuré au navigateur local (API retirée) et `RetourAuth.test.tsx`.
- [x] `/auth/register` à 1024 × 768, 1180 × 820 et 1024 × 700 (fr, wo, en) : aucun élément sous le
      retour ; même chose à 1366 × 650 et 1440 × 800 — mesuré au navigateur local.
- [x] Contraste du « Retour » blanc sur la bannière mobile, fond mesuré sous le texte à 320 px :
      9,2:1 au médian, 6,9:1 au 90ᵉ centile le plus clair (mesure du premier jet ; non rejouée par
      la deuxième revue).
- [x] Le lien de repli ne mène jamais à `/app` ni hors du site, y compris depuis une mémoire
      falsifiée (`RetourAuth.test.tsx`, `MemoireDeLaPagePublique.test.tsx`).
- [x] `/auth/login?redirect=/\evil.tld` mène à `/app` après connexion
      (`login-retour-a-l-origine.test.tsx`).
- [x] Se connecter depuis une recherche par le lien « Connexion » de la barre ramène à la
      recherche, filtres compris — bureau et menu mobile ; l'accueil garde un lien nu
      (`Navbar.connexion-retour.test.tsx` ; parcours complet mesuré au navigateur à 390 px).
- [ ] Vérifié sur un vrai iPhone (Safari ouvert depuis WhatsApp) — non fait : toutes les mesures
      sont prises en émulation Chrome contre le serveur de développement local.

Chaque test ci-dessus a été vu rouge par ablation, puis restauré à l'identique (md5) : remise à zéro
de l'état à la navigation, règle de curseur, ligne du layout racine, écoute en phase de capture,
exclusion des ressources (et ses deux bornes : extension quelconque, préfixe `/api` sans barre),
règle « entrée précédente publique » (remplacée par `canGoBack`, puis par le référent), mémoire de
repli, filtre d'écriture de la mémoire, montage de la mémoire, `lg:pt-24`, montage de `RetourAuth`,
filtre de `?redirect=`, filtre de la destination publique ; garde `download` de l'indicateur ;
montage d'`ArriveeEnHaut`, son `scrollTo`, sa dépendance au chemin, sa garde d'ancre, son
défilement instantané.

## Hors périmètre

- La couleur de survol des cartes (W1, première moitié) : TCK-561.
- La mise en production de cfe92ba8 (bande de catégories) : elle suit la promotion vers `master`.
- `BoutonRetour` (fiches d'agent et d'agence, TCK-560) garde sa règle « une page du site précède » :
  `RetourAuth` en reprend l'apparence, pas la règle.
- Les navigations lancées par `router.push` hors d'un lien : chacune porte, ou non, sa propre
  barre dans sa transition.
