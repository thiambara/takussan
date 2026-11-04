---
id: TCK-1338
title: "Le super-admin ne rattache plus un seuil, un bien, une invitation ou une annonce à une agence supprimée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-96--règles-exists-sur-une-table-à-suppression-douce"
tags: [api, validation, super-admin, suppression-douce, pistes]
---

## Contexte

Réf : **P96.03** du fichier de pistes, `validé`.

`DELETE /api/agencies/{agency}` supprime une agence en douceur. Sept requêtes valident l'agence
choisie par `exists:agencies,id`, qui l'accepte encore : pour le super-admin, dont la valeur est
écrite telle quelle, un seuil d'alerte, une configuration d'indicateur, une intégration, un bien,
une invitation ou le ciblage d'une annonce se rattachent à une agence supprimée (mesuré par le
mesureur : seuil d'alerte → 201).

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V7.

## Choix de l'implémenteur

- La `Piste` écrit `Rule::exists('agencies', 'id')->whereNull('deleted_at')` ; retenu
  `->withoutTrashed()`, qui écrit la même condition (`DatabaseRule::withoutTrashed`, lu), comme
  TCK-1336.
- Seules les sept requêtes de l'`Où`. `ClosePlatformPayoutPeriodRequest` (lu au constat, 404 par
  `findOrFail()`) touche un reversement et n'est pas dans la piste : laissé, et figé en exception
  par la garde de P96.04.

## Delta à produire

- [x] `withoutTrashed()` sur `agency_id` de `StoreThresholdAlertRequest`, `StoreKpiConfigRequest`,
      `StoreIntegrationRequest`, `StorePropertyRequest`, `CreateInvitationRequest`, et sur
      `segment.agency_ids.*` de `StoreAnnouncementRequest` et `UpdateAnnouncementRequest`.
- [x] Test `AgenceSupprimeeNonCibleeTest`.

## Critères d'acceptation

- [x] AC1 — En super-admin, les sept chemins : agence supprimée → 422 sur le champ de l'agence,
      comme une agence absente.
- [x] AC2 — Témoin : une agence vivante ne porte aucune erreur sur ce champ.

## Hors périmètre

- Ce que devient le reste d'une agence supprimée (membres, biens, invitations ouvertes) :
  angle 129.

## Notes d'implémentation

- Le test envoie des corps incomplets : il ne regarde que l'erreur du champ de l'agence, présente
  ou absente. Avant correctif, l'annonce modifiée s'écrivait (200).
- Ablation : les sept requêtes remises à `HEAD` → 7 rouges ; patch remis → 14/14 verts.
