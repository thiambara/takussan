---
id: TCK-1505
title: "Le courriel du résumé de notifications attend avant de réessayer"
status: done
phase: P2
family: api
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#12-appnotification-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-111--jobs-à-statut-de-suivi-sans-failed"
tags: [api, notifications, mail, queue, pistes]
---

## Contexte

Réf : **P111.04** du fichier de pistes, `validé (délégué)`.

`NotificationDigestMail` est `ShouldQueue` : `BuildUserDigestJob` ne fait que le mettre en file,
et l'envoi réel se fait dans `SendQueuedMailable`, sans `backoff`. Le worker (`--tries=3`) épuise
ses trois essais en quelques secondes sur une panne brève du fournisseur, et le résumé est perdu,
`digested_at` étant déjà posé.

## Décision du porteur (déléguée)

validé (délégué) — `backoff` = `[60, 300, 900]` sur `NotificationDigestMail` (la valeur de TCK-800 pour `CodedNotification`), le nombre d'essais restant celui du worker, et `digested_at` toujours posé à la mise en file comme aujourd'hui ; reste : poser `digested_at` après l'envoi réel ou le retirer dans un `failed()`, qui revient sur le choix écrit l. 69-70 de ne jamais renvoyer un résumé

## Reste à faire

poser `digested_at` après l'envoi réel ou le retirer dans un `failed()`, qui revient sur le choix écrit l. 69-70 de ne jamais renvoyer un résumé

## Objectif utilisateur

Une panne brève du fournisseur de courriel retarde le résumé au lieu de le perdre.

## Contrat de données

Aucun changement.

## Contraintes strictes (métier)

- Le nombre d'essais reste celui du worker ; `digested_at` reste posé à la mise en file.

## Delta à produire

- [x] `NotificationDigestMail::backoff()` rend `[60, 300, 900]`.
- [x] Test : le `SendQueuedMailable` mis en file par `BuildUserDigestJob` porte ce délai.

## Critères d'acceptation

- [x] AC1 — le job d'envoi du résumé rend `[60, 300, 900]` à `backoff()`.
- [x] AC2 — `digested_at` est toujours posé à la mise en file.

## Hors périmètre

- Le reste ci-dessus, au porteur.

## Notes d'implémentation

- `SendQueuedMailable::backoff()` lit la méthode `backoff()` du Mailable : c'est le job en file
  qu'on éprouve (`Queue::fake()`), pas le Mailable seul.
- Avant correctif, le job est bien en file et `backoff()` y rend `null` (vérifié avant d'écrire
  le correctif).
- Ablation : méthode renommée → le test neuf rouge ; remise → `NotificationDigestMailTest` 19/19.
