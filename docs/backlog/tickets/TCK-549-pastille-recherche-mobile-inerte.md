---
id: TCK-549
title: "Sur mobile, la pastille « Où cherchez-vous ? » ne permet pas d'écrire : elle relance la recherche courante et renvoie en page 1"
status: todo
phase: P1
family: bug
estimate: M
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, mobile, navbar, recherche, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur tape sur la barre de recherche du haut et **écrit** un lieu ou un mot-clé,
depuis n'importe quelle page publique, sans perdre ce qu'il était en train de consulter.

## Contexte

Audit UI/UX mobile de `/fr/properties` du 2026-09-22 (constats N1, N2, N4), mesuré à 390 × 844 et
360 × 740, Chrome en émulation mobile + tactile.

- **N1** — la pastille mobile de `Navbar` est un `<button>` dont le `onClick` est `handleSearch` :
  elle ne fait apparaître aucun champ. Mesuré sur `/fr/properties?contract_type=rent&q=Dakar&page=2` :
  un tap laisse le focus sur le bouton et navigue vers `?contract_type=rent&q=Dakar` — **la page 2
  est perdue**, sans que rien ne l'annonce.
- **N2** — la pastille n'affiche jamais la recherche en cours : avec `q=Dakar`, elle montre le texte
  d'invite, lui-même tronqué (« Où cherche… » à 390 px, « Où che… » à 360 px).
- **N4** — la seule saisie texte disponible sur mobile vit dans le menu burger, qui propose en plus
  **deux** « Acheter / Louer » contradictoires : sur `contract_type=rent`, le lien « Louer » porte
  `aria-current="page"` et, juste au-dessus, la bascule « Louer » porte `aria-pressed="false"` (état
  local jamais relu depuis l'URL).

## Contrat de données

Aucun endpoint nouveau. La saisie consomme la même autocomplétion que la barre de bureau
(`GET /api/search/suggest`, déjà consommé par `SearchAutocomplete`), et écrit l'URL de
`/properties` par le même chemin que la barre de bureau (`q`, `contract_type`, `type`).

## Direction UX / Artistique

- Le geste attendu est celui des applications immobilières et de voyage : **un tap = un écran de
  saisie** qui occupe l'écran, clavier ouvert, curseur dans le champ, suggestions dessous, une
  sortie évidente (retour / fermer).
- Au repos, la pastille **résume** la recherche active (le lieu d'abord, puis la transaction) ; sans
  recherche active, elle porte un libellé court qui tient à 360 px dans les trois langues.
- Une seule surface de saisie sur mobile : le menu burger redevient un menu de navigation.

## Contraintes strictes (métier)

- Ouvrir puis fermer la saisie sans valider **ne modifie pas l'URL** (ni `page`, ni aucun filtre).
- Valider une saisie depuis `/properties` conserve les filtres en cours et remet `page` à 1 —
  comportement actuel de la barre de bureau, à reproduire, pas à réinventer.
- Libellés via next-intl (`fr`/`en`/`wo`) — principe non négociable n°5.
- La barre de bureau (`lg` et plus) n'est pas modifiée.

## Delta à produire

- [x] Pastille mobile : un tap ouvre une surface de saisie avec autocomplétion, focus dans le champ,
      pré-remplie avec `q` quand on est sur `/properties`.
- [x] Pastille mobile : état résumé quand une recherche est active, libellé court sinon.
- [x] Menu mobile : retrait du bloc « champ + Acheter/Louer + Rechercher » — **après** que la
      saisie de la pastille existe (la recherche texte ne doit jamais disparaître du mobile).
- [x] Tests : ouverture/fermeture sans effet sur l'URL ; validation qui écrit `q` ; résumé affiché
      sous `q` actif.

## Critères d'acceptation

- [x] AC1 — à 360 × 740, sur `/fr/properties?q=Dakar&page=2`, un tap sur la pastille met le focus
      dans un champ **texte** dont la valeur est `Dakar` ; fermer sans valider laisse l'URL
      strictement identique (`page=2` compris).
- [x] AC2 — saisir « Almadies » et valider mène à `/fr/properties?…q=Almadies…` sans `page`, et les
      autres filtres présents avant la saisie sont conservés.
- [x] AC3 — sous `q=Dakar&contract_type=rent`, la pastille au repos affiche « Dakar » et la
      transaction, et **pas** le texte d'invite.
- [x] AC4 — sans recherche active, le libellé de la pastille n'est tronqué ni en `fr`, ni en `en`,
      ni en `wo` à 360 px (`scrollWidth <= clientWidth` sur son texte).
- [x] AC5 — le menu mobile ouvert ne contient plus aucun `aria-pressed` « Acheter/Louer » ; il n'y a
      donc plus deux états contradictoires pour la même transaction.

## Hors périmètre

- La modalité du menu (voile, verrou de défilement, focus) → TCK-551.
- Le sélecteur de langue mobile → TCK-550.
- Toute évolution de l'autocomplétion elle-même (vague 61).

## Notes d'implémentation

### Prémisses re-mesurées (2026-09-23, CDP, Chrome headless, `next dev` du worktree, API :8002)

- **N1 confirmé.** 360 × 740 et 390 × 844, `/fr/properties?contract_type=rent&q=Dakar&page=2` : la
  pastille est un `BUTTON` sans `input` ; un `click()` mène à `?contract_type=rent&q=Dakar` — `page=2`
  perdu. *Écart* : le focus relevé après coup est sur `BODY`, pas sur le bouton — `el.click()` ne
  donne pas le focus comme un tap ; le fond du constat (aucun champ) tient.
- **N2 confirmé.** Sous `q=Dakar`, la pastille montre « Où cherchez-vous ? » ; texte 131 px dans
  59 px à 360, 89 px à 390 (`scrollWidth` / `clientWidth` du `<span>`).
- **N4 confirmé.** Menu ouvert sur `?contract_type=rent` : `Acheter aria-pressed=false`,
  `Louer aria-pressed=false`, lien `Louer aria-current=page`, 1 `input`.
- Charge machine au moment des mesures : `load average` 68 / 48 / 42 sur 8 cœurs — les relevés
  attendent la disparition de `animate-pulse` / `aria-busy` avant de lire.

### Décisions

- **Surface** : `Sheet` (`@base-ui/react` Dialog) côté `top`, plein écran (`h-dvh`), déclenchée par
  `SheetTrigger` — focus contenu, Échap, retour du focus à la pastille, sans code maison. Le champ
  reçoit le focus par `initialFocus` (sinon base-ui le donnerait au bouton « Retour », premier
  focalisable).
- **Une seule autocomplétion** : c'est `SearchAutocomplete`, la même que la barre de bureau (mêmes
  URL : `q` en texte libre, `city`/`location`/`type` sur une suggestion). Seul ajout : une prop
  optionnelle `onValider`, appelée juste avant chaque `router.push` du champ, pour refermer la
  surface AU GESTE plutôt qu'à l'arrivée de la page suivante. La barre de bureau ne la passe pas.
- **Le bouton « Rechercher »** de la surface appelle `handleSearch` — le constructeur d'URL de la
  loupe de bureau ; le test vérifie qu'il produit la même URL que la touche Entrée.
- **`location` repart de `q` à l'ouverture ET à la fermeture sans validation**
  (`basculerRecherche`, une remise inconditionnelle) : une fois la surface refermée, `location` est
  un état caché que `buildSearchUrl` lit. La validation (Entrée, suggestion, « Rechercher ») ferme par
  `setRechercheOuverte` et ne passe pas par cette remise. *Le tour 1 ne remettait qu'à l'ouverture :
  voir « Refus du tour 1 » ci-dessous.*
- **Champ en 16 px** dans la surface (`[&_input]:text-base`) : sous 16 px, Safari iOS zoome au focus.
- **Libellé court** : « Chercher » / « Search » / « Seet ». Mesuré dans la police de la page, à
  360 px : la pastille laisse **59 px** au texte avec `px-4` ; « Rechercher » en mesure 74,
  « Chercher » 60,2 — tronqué d'un pixel. D'où `px-3` sur la pastille (67 px disponibles).
  TCK-551 (gouttière `px-4`, favoris à 44 px) rendra 8 px nets de plus.
- **Résumé** : deux lignes — le lieu (`q`, sinon `location`, sinon `city`) puis la transaction
  (« À louer » / « À vendre ») ; chacune tronque seule. Hors de `/properties`, la pastille reste au
  repos (même règle que `qEnVigueur`).
- Menu : seul le bloc « champ + Acheter/Louer + Rechercher » est retiré ; la rangée de catégories,
  la modalité et la langue restent à TCK-551 / TCK-550. L'état `transaction` reste, il sert au
  `Select` de bureau.

### Vérification

- Tests : `Navbar.pastille-mobile.test.tsx` (10 au tour 1, 13 après le refus) ; `SearchAutocomplete.test.tsx` (+2,
  `onValider`) ; `Navbar.recherche.test.tsx` et `Navbar.responsive.test.tsx` mis au nouveau contrat
  (la saisie mobile est dans la surface, la pastille au repos dit « Chercher »). **Ablation** : avec
  `Navbar.tsx` de `HEAD` remis en place, les 10 tests neufs rougissent.
- Navigateur, 360 × 740 `mobile:true` + tactile, `innerWidth` = 360 à chaque relevé :
  - AC1 — `/fr/properties?q=Dakar&page=2`, tap : focus sur `INPUT type=text` valeur `Dakar`, dans
    le `dialog` (0, 0, 360, 740), police 16 px ; saisie « Plateau » puis « Retour » → URL
    identique, focus rendu à la pastille ; même chose par Échap.
  - AC2 — `?q=Dakar&contract_type=rent&type=villa&page=2`, « Almadies » + Entrée →
    `/fr/properties?q=Almadies&contract_type=rent&type=villa`, surface refermée. Suggestion
    « Dakar » choisie depuis `?contract_type=rent&page=2` → `?contract_type=rent&city=Dakar`,
    surface refermée, pastille « Dakar / À louer ».
  - AC3 — `?q=Dakar&contract_type=rent` : pastille « Dakar » + « À louer », 39/39 px chacun.
  - AC4 — `/fr|en|wo/properties` : « Chercher » 60/60, « Search » 45/45, « Seet » 29/29
    (`scrollWidth`/`clientWidth`), `lang` du document vérifié.
  - AC5 — menu ouvert sur `?contract_type=rent` : 0 `aria-pressed`, 0 `input`, `Louer=page`.
  - Liste de suggestions à 360 : bornes 16 → 344, `scrollWidth` du document 360.
- Bureau 1280 × 800 `mobile:false`, **témoin avant/après** (preuve de version : présence de la
  pastille à `aria-haspopup="dialog"` dans le DOM) : colonne centrale (209, 12, 576, 110) des deux
  côtés, champ pré-rempli `Dakar`, 6 puces, Entrée → `?q=Ngor&contract_type=rent`, loupe →
  `?q=Yoff&contract_type=rent` — identiques.
- Non vérifié : l'ouverture du **clavier** sur un vrai téléphone (iOS n'ouvre le clavier que si le
  focus est donné dans le geste ; base-ui le donne juste après le montage). À vérifier sur appareil.

### Refus du tour 1 et correctif (2026-09-23)

Le vérificateur adverse a refusé le tour 1 (commit `81e76a5c`) pour un défaut **majeur**, régression
de cette branche : une saisie **abandonnée** (Échap ou « Retour ») restait dans l'état `location` de
la navbar, et la puce de catégorie du menu mobile l'écrivait ensuite en `q` — `handleCategoryClick`
passe par `buildSearchUrl`, qui lit `location`. Avant la branche, le champ mobile vivait dans le menu,
visible à côté des puces : aucun état caché. `basculerRecherche` ne remettait `location` à
`qEnVigueur` qu'à l'ouverture.

- **Reproduit AVANT correctif**, des deux façons :
  - test : deux tests neufs (abandon par « Retour » / par Échap, puis menu → puce « Appartement »)
    rouges sur le code du tour 1 — `expected 'Dakar Plateau' to be 'Dakar'` ;
  - navigateur, 390 × 844 `en`, script du vérificateur rejoué : `/en/properties?q=Ngor&type=villa&page=3`,
    saisie « Plateau », Échap (URL identique), menu → « Apartment » →
    **`/en/properties?q=Ngor+Plateau&type=apartment`**, pastille « Ngor Plateau ».
- **Correctif** : la remise `setLocation(qEnVigueur)` devient inconditionnelle dans
  `basculerRecherche` (ouverture et fermeture non validée).
- **Défaut mineur « la remise à l'ouverture n'est gardée par aucun test » (mutation M6)** : fermé par
  un troisième test — abandon par Échap, réouverture (le champ montre `Dakar`), « Rechercher » →
  `push` porte `q=Dakar`.
- **Mutations** (`Navbar.tsx` restauré, md5 `87beea45…` avant et après) :
  - remise retirée entièrement : **3 rouges** (les 3 tests neufs) ;
  - remise à l'ouverture seule (le code du tour 1) : **2 rouges** (les deux puces).
  - Limite assumée : une remise à la fermeture SEULE reste verte, parce qu'elle est équivalente en
    comportement sur mobile (rien d'autre n'écrit `location` pendant que la surface est fermée : le
    champ de bureau est `hidden lg:flex`). La remise est donc écrite en une seule ligne
    inconditionnelle, que les tests gardent entière.
- **Navigateur après correctif** (CDP, Chrome headless, `innerWidth` = largeur demandée) :
  - même scénario à 390 `en` → `/en/properties?q=Ngor&type=apartment`, pastille « Ngor » ; à 360 `fr`
    → `/fr/properties?q=Ngor&type=apartment`, pastille « Ngor ».
  - 360 `fr`, `?q=Dakar&contract_type=rent&page=2` : saisie « Plateau », « Retour » → URL identique ;
    réouverture → champ `Dakar` ; saisie « Plateau » puis « Rechercher » →
    `/fr/properties?q=Dakar+Plateau&contract_type=rent`, surface refermée : la saisie VALIDÉE part
    toujours.
  - AC1 rejoué (360 `fr`, champ au point, « Retour » → URL identique) et AC2 rejoué (360 `wo`,
    « Almadies » + Entrée → `/wo/properties?q=Almadies&contract_type=sale&bedrooms_min=2`) : inchangés.
  - Bureau 1280 × 800 : colonne (209, 12, 576, 110), champ `Dakar` 14 px, 6 puces, Entrée →
    `?q=Ngor&contract_type=rent&type=villa`, loupe → `?q=Yoff&contract_type=rent&type=villa` —
    identique au relevé du vérificateur.
- Contrôles : 4 fichiers de test touchés **41/41** ; `eslint` 0 ; `tsc --noEmit` propre ;
  `check:i18n`, `check:i18n-namespaces`, `check:classes-emises` verts ; toutes les gardes
  `scripts/check-*.mjs` vertes.
