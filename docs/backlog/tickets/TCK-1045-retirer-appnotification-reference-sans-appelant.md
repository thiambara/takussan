---
id: TCK-1045
title: "Retirer `AppNotification::reference()`, méthode sans appelant, et l'écrire dans la spec (P11.11, option a)"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  models:
    - docs/models-spec.md#12-appnotification
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md
tags: [api, notifications, code-mort, models-spec, pistes]
---

## Contexte

La piste **P11.11** relève que le lien `referenceable_*` d'une `AppNotification` a deux formes
(alias court ou nom de classe), un lecteur de repli (`NotificationTarget::fromReferenceable()`) et
une méthode morte, `AppNotification::reference()`, qui ne connaît que cinq alias et n'a aucun
appelant. Le porteur a choisi l'option **(a)** le 2026-10-20 : retirer la seule partie morte.

L'implémenteur l'avait reclassée en « chemin fermé » : la spec décrit la méthode (§12 et Règle 3),
et `docs/models-spec.md` lui est fermé. Le code et la spec partent donc ensemble, en session.

## Objectif utilisateur

Qui lit le modèle ou la spec ne cherche plus à résoudre le lien d'une notification par une méthode
que rien n'appelle et qui ignore la moitié des types écrits.

## Delta à produire

- `takussan-api/app/Models/AppNotification.php` : retirer `reference()`.
- `docs/models-spec.md` §12 et Règle 3 : dire que la méthode est retirée, et que la cible se lit par
  `target` ou se déduit par `NotificationTarget::fromReferenceable()`.

## Critères d'acceptation

- [x] `grep -rn "reference()" takussan-api/app takussan-api/routes takussan-api/database` ne trouve
      plus de définition ni d'appel sur `AppNotification`.
- [x] `docs/models-spec.md` ne décrit plus `reference()` comme une méthode existante.
- [x] Les tests des notifications restent verts.
- [x] P11.11 passe à `fait · TCK-1045`.

## Hors périmètre

- Les options (b) (unifier `referenceable_type` sur l'alias court) et (c) (cesser d'écrire le lien,
  migration) : non retenues.

## Notes d'implémentation

- Aucun appelant avant retrait : `grep -rn "reference()" app routes resources database tests` et
  `grep -rnE -- "->reference\b"` ne trouvent rien qui vise `AppNotification` (relevé du 2026-10-20).
- Les classes du `$map` sont du même espace de noms : aucun `use` à retirer.
- Pas d'ablation : on retire du code sans appelant, il n'y a pas de comportement à éprouver. La
  preuve est l'absence d'appelant, et la suite des notifications verte après le retrait.
