---
id: TCK-771
title: "Les six échecs de notification avalés (prospects, visites, groupes) se journalisent sous forme sûre"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [back, notifications, observabilite, journal, pistes]
---

## Contexte

Réf : **P14.09** du fichier de pistes, `validé` (critère accordé : V3). Six `catch (\Throwable) {}`
avalaient sans trace l'échec d'une notification : `ContactLeadService` (attribution, demande de
contact, accusé de réception), `VisitNotifier` (vers l'agence, vers le visiteur) et
`GroupConversationService` (invitation à un groupe). Un agent non prévenu d'une demande du site
public ne laissait rien au journal.

## Décision du porteur

report par SafeExceptionContext dans les six catch, jamais getMessage

## Delta à produire

- [x] Les six `catch` écrivent un `Log::warning` : un libellé fixe, l'identifiant de l'objet
      (piste, visite et code de notification, conversation) et `SafeExceptionContext::of($e)`.
- [x] Le caractère non bloquant ne change pas : rien ne remonte à l'appelant.

## Critères d'acceptation

- [x] AC1 — Pour chacun des six chemins, un envoi qui lève « refus SMTP pour <adresse> » laisse
      une ligne de journal qui porte la classe de l'exception et ne contient pas l'adresse.
- [x] AC2 — L'action appelante aboutit (attribution, piste créée, participant ajouté).

## Hypothèses (mode sans humain)

- « report » est lu comme « journaliser » : `report($e)` passerait par le gestionnaire
  d'exceptions, qui écrit `getMessage()`. La forme suivie est celle du dépôt
  (`Log::warning('[Service] …', [...] + SafeExceptionContext::of($e))`), au niveau `warning` : la
  requête a abouti.

## Notes d'implémentation

- Ablation : les trois fichiers d'`app/` remis à `pre-dev` → 5 rouges sur 5 ; correctif remis →
  5 verts, et `SystemMessagesTest`, `PropertyVisitVerificationAdverseTest`,
  `PlafondSmsDeVisiteTest` verts (41 tests).
- `GroupConversationService` passe par `$user->notify()` : le test lève depuis le
  `Dispatcher` des notifications, et non depuis `NotificationService`.
