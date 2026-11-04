---
id: TCK-1007
title: "Les contacts de la messagerie se trient en ordre alphabétique (`COLLATE \"und-x-icu\"`)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-tri-alphabétique-des-contacts-suit-lordre-des-octets--minuscules-et-initiales-accentuées-passent-après-z"
tags: [back, messaging, pistes]
---

## Objectif utilisateur

Le sélecteur de participants range « awa » et « Élodie » à leur place alphabétique, et non après
« Zeynab ».

## Contexte

Réf : **P51.05** du fichier de pistes, `validé` (critère V7 accordé ; ADR-0025 amendé le
2026-10-19 pour le tri des noms).

`MessagingContactController` triait par `ORDER BY first_name, last_name, id` sous une base en
`--locale=C`. Mesuré avant correctif, par le test de garde ci-dessous : « Binta Sarr »,
« Zeynab Sow », « awa ba », « Élodie Faye », « Omar Écoute » ne sortent pas dans l'ordre
alphabétique.

## Décision du porteur

> trier les contacts en `COLLATE "und-x-icu"` par une classe de tri sous `app/Sorts/` (comme `MaintenancePrioritySort`), pour le défaut et pour `sort=first_name` et `last_name` ; test avec une minuscule et une initiale accentuée ; ADR-0025 amendé le 2026-10-19 pour les autres listes de noms, qui suivent quand on les touche (porteur, 2026-10-19, sur la recommandation du délégué)

## Hypothèses (mode sans humain)

- Le départage final par `id` reste un tri nu : ce n'est pas un nom.
- Aucun index de tri n'est posé : ADR-0025 n'en pose que par mesure.

## Delta à produire

- [x] `App\Sorts\CollatedNameSort` : `ORDER BY <colonne> COLLATE "und-x-icu"`, colonne contrôlée.
- [x] `MessagingContactController` : `first_name` et `last_name` par cette classe, au défaut et sur
  demande.
- [x] Test : `MessagingContactsTest::test_le_tri_des_noms_suit_l_ordre_alphabetique_et_non_celui_des_octets`.

## Critères d'acceptation

- [x] AC1 — sans `sort`, et avec `sort=first_name`, les contacts sortent en ordre alphabétique,
  minuscule et initiale accentuée comprises ; `sort=-first_name` rend l'ordre inverse.
- [x] AC2 — `sort=last_name` trie les noms de famille de même.

## Hors périmètre

- Les autres listes de noms du dépôt : elles suivent quand on les touche (ADR-0025, amendement).

## Notes d'implémentation

- Ablation : `COLLATE "und-x-icu"` retiré de `CollatedNameSort` → 1 rouge (ordre des octets) ;
  remis → 26 verts.
