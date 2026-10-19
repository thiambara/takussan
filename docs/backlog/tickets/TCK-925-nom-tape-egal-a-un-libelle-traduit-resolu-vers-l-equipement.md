---
id: TCK-925
title: "Un nom d'équipement tapé égal à un libellé traduit désigne l'équipement"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-16"
tags: [front, i18n, pistes]
---

## Contexte

Réf : **P30.06** du fichier de pistes, `validé` (V7 et V8 accordés). Dernier des quatre tickets
de la piste (TCK-922 à TCK-925).

Re-mesuré avant correctif : la combobox (`combobox.tsx`, `optionsAffichees`) ne propose pas
« Ajouter » pour un nom égal **à la casse près** au libellé affiché. Mais un nom égal **au repli
près** (tirets, accents, apostrophes) l'obtient : en anglais, « tumble-dryer » à côté de « Tumble
dryer », en français, « securite 24/7 » à côté de « Sécurité 24/7 ». Le nom partait alors en
`tag_names`, et le serveur, qui ne replie que sur les noms français à la casse près
(`TagProposals`), en faisait une proposition en attente, doublon d'un équipement du catalogue.

## Décision du porteur

validé — les quatre correctifs, un ticket chacun : étiquettes CRM traduites par slug, options retriées sur le libellé affiché, otherTagNames par le même traducteur, nom tapé égal à un libellé traduit résolu vers l'équipement ; en wo, le texte français tel quel (wolof en pause depuis le 2026-10-16)

## Objectif utilisateur

Un annonceur qui tape le nom d'un équipement existant, dans sa langue, rattache cet équipement au
lieu d'en proposer un doublon.

## Delta à produire

- [x] `ChampEquipements`, à la création : un nom égal, par `replierPourRecherche`, au libellé
  affiché d'une option rattache son identifiant (`tag_ids`) au lieu de partir en `tag_names`.

## Critères d'acceptation

- [x] AC1 — En anglais, « tumble-dryer » ajouté rattache « Sèche-linge » (`tag_ids`), rien en
  `tag_names`.
- [x] AC2 — En français, « securite 24/7 » rattache « Sécurité 24/7 ».
- [x] AC3 — Un nom qui n'est le libellé d'aucun équipement reste une proposition.

## Hypothèses

- « Au repli près » est lu comme le repli de la recherche dans la liste (`replierPourRecherche` :
  casse, accents, tirets, apostrophes), celui qui fait déjà trouver « Médina » par « medina ». La
  règle de la combobox générique (« Liberte 4 » n'est pas « Liberté 4 », pour les quartiers) n'est
  pas touchée : le correctif vit dans `ChampEquipements`.
- La ligne garde son texte « Ajouter « tumble-dryer » », la puce rendue est celle de l'équipement.
- Un nom proche sans être égal (« Pool » pour « Swimming pool ») reste une proposition : la
  décision vise l'égalité.

## Notes d'implémentation

- **Reproduction** : `property-form/__tests__/ChampEquipements.nom-traduit.tck-925.test.tsx` → 2
  rouges sur 3 (`tag_ids` vide).
- **Ablation** : `ChampEquipements.tsx` d'avant → 2 rouges ; remis → 3 verts, et 114 verts sous
  `ChampEquipements*`, `ui/` et TCK-923.
