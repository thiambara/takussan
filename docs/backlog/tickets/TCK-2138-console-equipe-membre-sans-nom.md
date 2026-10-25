---
id: TCK-2138
title: "La console Équipe nomme un membre sans nom par un assembleur de nom affichable commun"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-220--noms-de-comptes-rendus-par-le-front-sans-repli-face-aux-comptes-créés-par-téléphone"
tags: [front, equipe, identite, pistes]
---

## Contexte

Réf : **P220.04** du fichier de pistes, `validé (délégué)` (V7 accordé). Un compte créé par
téléphone naît à noms `''` et sans e-mail ; la console Équipe composait `first_name` + `last_name`
sans repli : ligne réduite à la pastille `·`, lien `mailto:null`, `aria-label` des actions, titre
du tiroir, confirmation de suspension, passation et délégations à trou.

## Décision du porteur (déléguée)

> un seul assembleur de nom affichable sous `src/lib` : prénom et nom, sinon e-mail, sinon numéro, sinon `#<id>`, avec les seuls champs que chaque écran charge déjà (aucun champ de contact neuf demandé à l'API), employé par le tableau d'équipe (cellule, initiales, `aria-label` des actions), le tiroir du membre, la confirmation de suspension, l'assistant de passation, la révocation et la liste des délégations ; colonne e-mail à `—` et sans lien quand l'e-mail est nul ; le numéro n'apparaît que comme repli du nom, sans colonne neuve

## Objectif utilisateur

L'administrateur d'agence reconnaît chaque membre de son équipe, même celui dont le compte n'a ni
nom ni e-mail.

## Contrat de données

Aucun changement d'API ni de requête : `ADMIN_USERS_FIELDS` demande déjà `email` et `phone`.

## Delta à produire

- [x] `nomAffichable(user, repli?)` dans `src/lib/identite.ts`, à côté de `libelleDe()` (TCK-623),
  dont il prend l'ordre nom → e-mail → numéro, et finit par `#<id>`.
- [x] Tableau d'équipe : cellule de nom, initiales (`initialesDe`), `aria-label` des actions ;
  colonne e-mail à `—` sans lien quand l'e-mail est nul.
- [x] Tiroir du membre (titre, initiales), confirmation de suspension, assistant de passation,
  révocation et liste des délégations par `nomAffichable`.
- [x] `AdminAgencyUserRow.email` typé `string | null`.
- [x] Tests : `equipe-membre-sans-nom.p220-04.test.tsx`, un cas de `HandoverWizard.test`, un de
  `RoleDelegationsSection.test`, et `nomAffichable` dans `identite.test`.

## Critères d'acceptation

- [x] AC1 — un membre sans nom ni e-mail s'affiche sous son numéro lisible, et ses actions
  s'annoncent « Actions pour +221 77 000 06 22 ».
- [x] AC2 — sans e-mail, la colonne e-mail montre `—` et aucun lien `mailto:`.
- [x] AC3 — sans numéro non plus, le membre s'affiche `#<id>` (tableau, suspension).
- [x] AC4 — un délégué ou un partant sans nom mais avec e-mail est nommé par son e-mail dans la
  passation, la liste des délégations et la révocation.
- [x] AC5 — un membre nommé garde son nom et son lien `mailto:`.

## Hors périmètre

- Une colonne de numéro dans le tableau (exclue par la décision).
- La délégation sans `user` chargé garde son libellé traduit « Membre #{id} ».
- Le sous-titre du tiroir (`SheetDescription`) reste l'e-mail, vide quand il est nul.

## Notes d'implémentation

- Hypothèse : les sites qui ne chargent que `first_name`/`last_name` (délégations,
  passation) passent ce qu'ils ont ; l'e-mail de la délégation est déjà exposé par la ressource,
  celui du partant vient de la ligne du tableau.
- Ablation : les six composants remis à leur version d'avant (assembleur gardé) → les sept cas
  neufs rougissent ; remis, verts.
