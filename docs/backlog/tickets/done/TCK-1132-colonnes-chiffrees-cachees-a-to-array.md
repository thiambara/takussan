---
id: TCK-1132
title: "Une colonne chiffrée ne sort pas en clair par `toArray()` (`AgencyUpgradeRequest`, `DocumentShareLink`)"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
    - "docs/models-spec.md#29-documentsharelink-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-84--valeurs-chiffrées-par-adr-0044-recopiées-en-clair-ailleurs"
tags: [back, privacy, chiffrement, pistes]
---

## Contexte

Réf : **P84.02** du fichier de pistes, `retenu · autonome` (A1 et A5 : ADR-0044 § 1 écrit déjà
qu'une donnée chiffrée « ne sort jamais en clair ni dans une réponse par défaut »).

`AgencyUpgradeRequest` caste `ninea` et `rib_pro` en `encrypted` sans `$hidden`, et
`DocumentShareLink` cache `token_hash` mais pas `token`, chiffré lui aussi : tout `toArray()` les
rend en clair. Aucune réponse d'aujourd'hui ne sérialise ces modèles bruts (les ressources lisent
les attributs un à un) ; le défaut attend un `include`, un `$paginator->items()` ou un export.

## Objectif utilisateur

Le NINEA, le RIB professionnel et le jeton d'un lien de partage ne sortent jamais en clair d'une
sérialisation par défaut, quel que soit le chemin qui la déclenche demain.

## Delta à produire

- [x] `AgencyUpgradeRequest::$hidden = ['ninea', 'rib_pro']`.
- [x] `token` ajouté au `$hidden` de `DocumentShareLink`.
- [x] Garde `tests/Feature/Privacy/EncryptedColumnsAreHiddenTest.php` : toute colonne castée
      `encrypted*` d'un modèle de `app/Models` est dans `$hidden` (ou hors d'un `$visible`
      déclaré), sauf exception motivée.

## Critères d'acceptation

- [x] AC1 — `(new AgencyUpgradeRequest([...]))->toArray()` ne porte ni `ninea` ni `rib_pro`.
- [x] AC2 — `(new DocumentShareLink(['token' => …]))->toArray()` ne porte pas `token`, et
      `$link->token` reste lisible.
- [x] AC3 — la garde rougit sur toute colonne chiffrée non cachée, et sur une exception qui ne
      nomme plus une colonne chiffrée.
- [x] AC4 — les tests des ressources et contrôleurs de ces deux modèles restent verts (réponses
      inchangées).

## Hors périmètre

- `archive_path` de `DataExport` et `ReportExport` : exceptions motivées de la garde (un chemin de
  disque privé, lu par les seuls contrôleurs de téléchargement, absent de `DataExportResource`).
- La recopie du NINEA en clair dans `agencies.ninea` (P84.01, à valider : V3).

## Notes d'implémentation

- Hypothèse (mode sans humain) : `archive_path` n'est pas une donnée d'ADR-0044, comme la `Piste`
  le propose ; il reste une exception écrite dans la garde, que le porteur peut retirer.
- Ablation : les deux modèles rendus à `3c6c8301f` → 3 rouges sur 4 (la garde nomme exactement
  `DocumentShareLink::$token`, `AgencyUpgradeRequest::$ninea` et `::$rib_pro`, et les deux tests
  de `toArray()`) ; correctif remis → 4/4.
