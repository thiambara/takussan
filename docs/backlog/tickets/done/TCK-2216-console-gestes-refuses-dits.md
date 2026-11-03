---
id: TCK-2216
title: "Six gestes de la console plateforme disent leur refus"
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-228--mutations-lancées-par-mutate-sans-onerror-et-dont-lécran-ne-lit-pas-lerreur"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, console, erreurs, pistes]
---

## Contexte

Réf : **P228.04** du fichier de pistes, `retenu · autonome` (A1 : ADR-0019 et le motif
`messageErreur(err)` en `role="alert"`, déjà en place dans les dialogues voisins des mêmes
fichiers).

Six `useMutation` de `components/admin/super/` n'avaient qu'un `onSuccess`, et l'écran ne lisait
pas leur erreur : la suppression et le test d'une règle d'alerte, la désactivation d'une annonce,
la bascule de session d'un drapeau, le test d'une intégration et l'annulation d'une maintenance.
Un refus (step-up fermé compris) remettait le bouton au repos sans rien dire.

## Hypothèses retenues

- L'erreur se lit de l'état de la mutation (`isError`, `error`) : elle s'efface d'elle-même au
  nouvel essai.
- La suppression d'une règle passe l'erreur à `ConfirmActionDialog` (prop `error`, déjà
  prévue) ; fermer la modale remet la mutation à zéro, pour ne pas montrer le refus d'une règle à
  la suivante.
- L'annulation de maintenance se dit sous son bouton, et non dans la ligne d'erreur de la
  programmation, qui est dans l'autre colonne.
- Aucun texte neuf : le message de l'API, ou le repli générique `errors.api.unknown`.

## Delta à produire

- [x] `alerts.tsx`, `announcements.tsx`, `feature-flags.tsx`, `integrations.tsx`,
      `maintenance.tsx` : un `role="alert"` par geste, qui lit l'erreur de sa mutation.
- [x] Test vitest `gestes-refuses.p228-04.test.tsx` (un cas par geste).

## Critères d'acceptation

- [x] AC1 — Chacun des six gestes, rejeté par l'API, affiche le message dans un `role="alert"`.

## Hors périmètre

- Un affichage commun des erreurs de mutation de la console (l'autre voie de la `Piste`).

## Notes d'implémentation

- Ablation : les cinq composants de `pre-dev` → 6/6 rouges (« Unable to find role="alert" ») ;
  correctif remis → 6/6 verts, et les huit fichiers de test voisins (alertes, annonces, drapeaux,
  intégrations, maintenance, step-up, `ConfirmActionDialog`) verts : 42 tests en tout.
- Le test a été écrit après le correctif dans ce passage ; son rouge a été constaté sur les
  composants de `pre-dev` (ablation ci-dessus).
