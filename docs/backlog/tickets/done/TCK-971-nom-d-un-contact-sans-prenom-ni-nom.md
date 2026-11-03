---
id: TCK-971
title: "Le sélecteur de participants nomme un compte sans prénom ni nom par la règle de TCK-815"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: [TCK-815]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-compte-ouvert-par-téléphone-apparaît-sans-nom-en-tête-du-sélecteur-et-aucune-recherche-ne-le-trouve"
tags: [back, messaging, pistes]
---

## Objectif utilisateur

Dans le sélecteur de participants d'un groupe, un correspondant qui n'a pas encore posé de prénom
ni de nom (compte ouvert par téléphone) apparaît sous un nom lisible, et non comme une ligne vide.

## Contexte

Réf : **P51.03** du fichier de pistes, `retenu · autonome` (A1).

`PhoneLoginService::createAccount()` crée le compte avec `first_name = ''` et `last_name = ''`.
`MessagingContactResource` rendait `name` par `full_name`, donc `''`, et le tri par `first_name`
place ce compte en tête de liste. TCK-815 a déjà écrit la règle du nom d'un compte montré à un autre
compte, `User::nameWithoutContact()` : prénom et nom, puis `username`, puis « — », jamais l'e-mail.

Mesuré avant correctif (test de garde, base de test PostgreSQL) : correspondant sans prénom ni nom,
`username = pseudo_seul` → `"name": ""`.

## Hypothèses (mode sans humain)

- Le front demande `fields[users]=id,first_name,last_name` (`useMessagingContacts`) : `username`
  n'est donc pas chargé, et le repli rendrait « — » au lieu de l'identifiant. Le contrôleur ajoute
  `users.username` au SELECT quand `fields[users]` le restreint ; la colonne ne sort que par `name`.
  La liste blanche des `fields` demandables ne change pas (`fields[users]=username` reste 400).
- Un compte ouvert par téléphone n'a pas de `username` : il s'affiche « — ».

## Delta à produire

- [x] `MessagingContactResource` : `name` par `nameWithoutContact()`.
- [x] `MessagingContactController::contacts()` : `users.username` chargé quand le SELECT est restreint.
- [x] Test : `MessagingContactsTest::test_un_compte_sans_nom_est_rendu_par_son_identifiant_puis_un_tiret`.

## Critères d'acceptation

- [x] AC1 — un correspondant sans prénom ni nom, avec `username`, est rendu sous son `username`,
  avec et sans `fields[users]=id,first_name,last_name`.
- [x] AC2 — sans `username`, il est rendu « — ».
- [x] AC3 — la ressource ne rend toujours que `id`, `name`, `avatar_url`, ni e-mail ni téléphone.

## Reste à faire

- Que `filter[search]` porte aussi sur `username` reste un choix (la `Piste` le laisse ouvert, et
  `test_la_recherche_ne_porte_que_sur_le_nom` épingle aujourd'hui l'inverse) : un compte sans nom
  ne se trouve toujours qu'en parcourant la liste.

## Hors périmètre

- Côté front, la pastille de `ParticipantPicker` prend les initiales du nom rendu (« — » ou
  l'identifiant) : non relu au navigateur.
- Le tri par `first_name` place toujours les comptes sans prénom en tête de liste.

## Notes d'implémentation

- Ablation : `full_name` remis dans la ressource → rouge (`''` au lieu de `pseudo_seul`) ; ajout de
  `users.username` retiré du contrôleur → rouge dans la forme du front seulement (`—` au lieu de
  `pseudo_seul`) ; remis → vert.
- `addSelect()` n'est appelé que si spatie a posé un SELECT : sans `fields`, la requête lit déjà
  `users.*`.
