---
id: TCK-750
title: "media:cleanup garde 90 jours les médias d'un modèle supprimé en douceur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage"
tags: [back, media, retention, pistes]
---

## Contexte

Réf : **P10.04** du fichier de pistes, `validé` (critère accordé : V3). `media:cleanup` (TCK-050,
chaque nuit à 03:00) juge un média orphelin par `exists()` à travers la portée de `SoftDeletes` :
les photos d'un bien supprimé en douceur la veille, ou retiré sur signalement, sont détruites
définitivement, conversions comprises. Le délai de 24 h porte sur l'âge du média, pas sur la date
de suppression.

## Décision du porteur

médias d'un modèle supprimé en douceur purgés 90 jours après deleted_at, collections de preuve exclues

## Objectif

Un média dont le modèle est supprimé en douceur reste 90 jours après `deleted_at` ; une pièce de
preuve n'est jamais purgée avec son modèle.

## Contrat de données

Aucun. Seule la commande change.

## Contraintes strictes

- **Hypothèse** : les « collections de preuve » sont celles de TCK-596 (ADR-0042 §1), que tient
  `MediaController::isLockedEvidence()` : `signed_contract` d'un bail, `room_photos` d'un état des
  lieux sorti du brouillon. La commande en porte sa propre copie, pour ne pas changer le jugement
  de la route de suppression (qui ne voit pas les états des lieux supprimés en douceur).
- Un média dont le modèle est supprimé pour de bon, ou dont la classe n'existe plus, reste orphelin
  après 24 h, comme avant.

## Delta à produire

- [x] `MediaCleanup::isOrphan()` : `withTrashed()` pour un modèle `SoftDeletes`, purge après
  `deleted_at` + 90 jours, preuves exclues.
- [x] Tests dans `tests/Feature/Media/MediaCleanupTest.php`.

## Critères d'acceptation

- [x] AC1 — Bien supprimé en douceur il y a 89 jours : sa photo reste.
- [x] AC2 — Supprimé il y a 91 jours : sa photo est purgée.
- [x] AC3 — Bail et état des lieux signé supprimés il y a 400 jours : `signed_contract` et
  `room_photos` restent, `lease_deposit_refund` est purgé.
- [x] AC4 — Bien supprimé pour de bon : sa photo est purgée après 24 h.

## Hors périmètre

- La requête par média (une `first()` par ligne, sur tout le parc, chaque nuit), relevée par la
  `Piste` et non confiée.

## Notes d'implémentation

- Avant correctif : AC1 et AC3 rouges (0 média restant). Ablation : commande d'avant remise →
  les 2 mêmes rouges ; exclusion des preuves retirée seule → AC3 rouge. Remis : 7/7 verts.
