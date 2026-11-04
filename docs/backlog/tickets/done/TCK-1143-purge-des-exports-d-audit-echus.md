---
id: TCK-1143
title: "Les exports du journal d'activité sont purgés à l'échéance de leur lien, et leur notification ne range plus l'URL signée"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1054]
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-63--url-signées-et-liens-de-téléchargement-rangés-ou-envoyés--durée-lecteurs-liens-morts"
tags: [back, audit, exports, rgpd, pistes]
---

## Objectif utilisateur

Le journal d'activité qu'un admin d'agence ou le super-admin a exporté ne reste pas sur le disque
au-delà du lien qui le sert, et l'URL signée ne se retrouve pas dans la cloche.

## Contexte

Réf : **P63.04** du fichier de pistes, `validé` (critère V3 accordé).

Mesuré avant correctif (`pre-dev` cdef5c26f) : `grep -rn "exports/" app routes config` → deux
écrivains (`ExportActivityLogJob`, `CrossTenantAuditController::export()`), aucun effaceur ;
`ActivityLogExportReadyNotification::toArray()` rangeait `download_url` alors que `via()` ne rend
que `mail`.

## Décision du porteur

> les trois : retirer `download_url` de `toArray()`, lier le lien au demandeur (P63.01), purger les fichiers d'export d'audit à l'échéance du lien (porteur, 2026-10-20)

- **Retirer `download_url`** : `toArray()` garde `filename` et `row_count`.
- **Lier le lien au demandeur (P63.01)** : déjà fait par TCK-1054 (`user`, `file` et `name` signés
  ensemble, fichier cherché dans le seul dossier du demandeur signé). Rien de neuf ici.
- **Purger à l'échéance du lien** : la piste renvoyait au « job de purge que retiendra
  l'angle 77 » ; ce job (P77.02) est revenu au porteur, la purge des exports d'audit est donc un
  job à part, `PurgeExpiredActivityLogExports`.

## Hypothèses (mode sans humain)

- Les exports d'audit n'ont pas de ligne en base : leur âge se lit à la date de modification du
  fichier. Le seuil est le lien le plus long, 24 h (`ExportActivityLogJob`) ; le lien de la
  console vit 1 h, il est donc couvert.
- Cadence horaire, `withoutOverlapping(60)` : un fichier vit ainsi 25 h au plus.
- La purge suit le disque des écrivains (le disque par défaut). Le passage au disque `local` est
  P77.04.

## Delta à produire

- [x] `ActivityLogExportController::LINK_TTL_HOURS` et `STORAGE_ROOT`, lus par le job d'export et
  par la purge.
- [x] Job `App\Jobs\Audit\PurgeExpiredActivityLogExports`, planifié chaque heure dans
  `routes/console.php`.
- [x] `ActivityLogExportReadyNotification::toArray()` sans `download_url`.
- [x] Test `tests/Feature/Audit/ExportsDAuditEchusTest.php`.

## Critères d'acceptation

- [x] AC1 — un export d'audit de plus de 24 h est supprimé, un export récent reste.
- [x] AC2 — `toArray()` rend `filename` et `row_count`, sans URL.

## Hors périmètre

- La purge des exports de rapport (P77.02, au porteur).

## Notes d'implémentation

- Ablation : notification rendue à `cdef5c26f` et corps de `handle()` vidé → 2 rouges ; remis →
  2 verts.
- `travel()` ne change pas la date de modification d'un fichier du disque factice : le test pose
  l'âge par `touch()`.
