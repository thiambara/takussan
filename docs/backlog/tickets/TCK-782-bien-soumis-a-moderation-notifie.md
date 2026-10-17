---
id: TCK-782
title: "Les admins de l'agence sont prévenus quand un bien passe en pending_review"
status: done
phase: P2
family: applicatif
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve"
tags: [back, front, notifications, moderation, pistes]
---

## Contexte

Réf : **P15.10** du fichier de pistes, `validé` (critère accordé : V7, notification et texte
neufs). Quand l'agence exige la modération (TCK-597), un bien qui passe en `pending_review` —
création, publication, resoumission après refus — n'est signalé à personne : `NotificationCode`
n'a que `property.approved` et `property.rejected`, alors que les avis ont `review.to_moderate`.
L'admin ne découvre une soumission qu'en ouvrant la file.

## Décision du porteur

prévenir les admins quand un dossier passe en pending_review

## Delta à produire

- [x] `NotificationCode::PropertySubmittedForReview` (`property.submitted_for_review`), type
      `system`, paramètre `property`, sans interrupteur de préférence (comme `property.approved`
      et `property.rejected`), sans canal mobile.
- [x] Textes `codes.property.submitted_for_review` (API : `title`, `body`, `sms`) et
      `notifications.codes.property.submitted_for_review` (front : `title`, `body`), fr et en ;
      en `wo`, le texte français tel quel.
- [x] Cible `property_moderation` → `/app/agency/moderation/properties`.
- [x] `PropertyObserver` : au passage en `pending_review` (à la création comme à la mise à jour),
      chaque admin actif de l'agence du bien est notifié, sauf l'auteur du geste.

## Critères d'acceptation

- [x] AC1 — Publier un bien dans une agence à modération obligatoire notifie ses admins actifs,
      avec le titre du bien et la cible de la file de modération.
- [x] AC2 — La resoumission d'un bien refusé notifie de même.
- [x] AC3 — Un bien qui reste en `pending_review` (une modification pendant l'attente) ne notifie
      pas une seconde fois ; un admin d'une autre agence, un admin suspendu et l'auteur du geste ne
      reçoivent rien.

## Hors périmètre

- La file de la plateforme (super-admin) : elle se consulte, comme pour les avis (TCK-597).
- Un interrupteur de préférence dédié.

## Hypothèses (mode sans humain)

- « dossier » s'entend du bien soumis à modération : c'est le seul `pending_review` que cite la
  piste (`PropertyModerationService`, `NotificationCode` des biens).
- Pas d'interrupteur : les deux autres codes de modération des biens n'en ont pas.

## Notes d'implémentation

- Ablation : `PropertyObserver` remis à `pre-dev` → les 3 tests de
  `PropertySubmittedForReviewNotificationTest` rouges ; remis → verts, et 79 tests voisins verts
  (observer, modération, notifications, parité des langues).
- Piège : un bien créé directement en `pending_review` (modération à la création) est une entrée
  dans la file, donc prévenue par `created()` ; seule une mise à jour qui ne change pas le statut
  ne l'est pas.
