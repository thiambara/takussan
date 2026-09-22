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

- [ ] Pastille mobile : un tap ouvre une surface de saisie avec autocomplétion, focus dans le champ,
      pré-remplie avec `q` quand on est sur `/properties`.
- [ ] Pastille mobile : état résumé quand une recherche est active, libellé court sinon.
- [ ] Menu mobile : retrait du bloc « champ + Acheter/Louer + Rechercher » — **après** que la
      saisie de la pastille existe (la recherche texte ne doit jamais disparaître du mobile).
- [ ] Tests : ouverture/fermeture sans effet sur l'URL ; validation qui écrit `q` ; résumé affiché
      sous `q` actif.

## Critères d'acceptation

- [ ] AC1 — à 360 × 740, sur `/fr/properties?q=Dakar&page=2`, un tap sur la pastille met le focus
      dans un champ **texte** dont la valeur est `Dakar` ; fermer sans valider laisse l'URL
      strictement identique (`page=2` compris).
- [ ] AC2 — saisir « Almadies » et valider mène à `/fr/properties?…q=Almadies…` sans `page`, et les
      autres filtres présents avant la saisie sont conservés.
- [ ] AC3 — sous `q=Dakar&contract_type=rent`, la pastille au repos affiche « Dakar » et la
      transaction, et **pas** le texte d'invite.
- [ ] AC4 — sans recherche active, le libellé de la pastille n'est tronqué ni en `fr`, ni en `en`,
      ni en `wo` à 360 px (`scrollWidth <= clientWidth` sur son texte).
- [ ] AC5 — le menu mobile ouvert ne contient plus aucun `aria-pressed` « Acheter/Louer » ; il n'y a
      donc plus deux états contradictoires pour la même transaction.

## Hors périmètre

- La modalité du menu (voile, verrou de défilement, focus) → TCK-551.
- Le sélecteur de langue mobile → TCK-550.
- Toute évolution de l'autocomplétion elle-même (vague 61).

## Notes d'implémentation

_(à remplir par implementing-specs)_
