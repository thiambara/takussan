---
id: TCK-2724
title: "Dans le contexte d'un fil, l'étape et le référent de la fiche suivent la lecture de la fiche, comme le téléphone"
status: todo
phase: P1
family: back
estimate: S
wave: 87
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2630]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#18-conversation-"
    - "docs/models-spec.md#7-customer"
tags: [back, messagerie, crm, confidentialite, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'agent qui ouvre un fil avec un client voit son nom ; il ne voit l'étape du pipeline et le référent de la fiche que s'il
peut ouvrir cette fiche dans le CRM — la colonne du fil ne montre pas plus que le CRM.

## Contexte

Suivi de TCK-2630. `GET /api/conversations/{conversation}/context` (`ConversationContextResource`, décisions dans
`ConversationThreadContext`) rend, au personnel de l'agence du fil, `customer {id, full_name, stage, phone,
assigned_agent {id, name}}`. Seul `phone` suit `CustomerPolicy::view` (`customerPhoneShown`) ; **`stage` et
`assigned_agent` sont rendus à tout le personnel**, lettre du ticket d'origine. Un agent qui ne lit pas la fiche dans le
CRM (fiche d'un collègue, sans lecture de toutes les fiches) en lit donc l'étape et le référent par la messagerie. Aucun
composant du front ne lit encore `stage` ni `assigned_agent` de ce contexte (relevé `grep` du 2026-11-11).

## Décision

**Recommandation de session, à confirmer par le porteur ; si refusée → `obsolete`.**

- **a) (recommandé)** `stage` et `assigned_agent` sous `CustomerPolicy::view`, comme `phone` ; `id` et `full_name`
  restent au personnel (l'agent garde le nom de son interlocuteur).
- b) statu quo (lettre de TCK-2630).

## Contrat de données

- `customer.stage` et `customer.assigned_agent` : `null` quand le lecteur ne passe pas `CustomerPolicy::view` sur la
  fiche ; inchangés sinon. Les clés restent présentes (même forme que `phone`).

## Contraintes strictes (métier)

- Un seul prédicat pour les trois champs (le jugement de `phone` aujourd'hui), relu sur la fiche, pas sur le profil actif
  seul.
- Le client, le bailleur et le prestataire ne voient toujours **pas** la clé `customer` (inchangé).

## Delta à produire

- [ ] `ConversationThreadContext` : le prédicat de `phone` renommé pour ce qu'il juge (lecture de la fiche) et appliqué à
      `stage` et `assigned_agent`.
- [ ] `ConversationContextResource` : les trois champs sous ce prédicat.
- [ ] Tests : extension du test de contexte de TCK-2630.

## Critères d'acceptation

- [ ] AC1 — Fiche F de l'agence A, référent l'agent A2, étape `qualified` ; l'agent A1 (sans lecture de F dans le CRM :
      `GET /api/customers/F` → 403) ouvre un fil avec ce client : `customer.full_name` présent, `stage`, `phone` et
      `assigned_agent` nuls.
- [ ] AC2 — L'agent A2 (référent) et l'admin de A : `stage = qualified`, `assigned_agent.id = A2`, `phone` présent.
- [ ] AC3 — Sur une fiche qui a un téléphone, une étape et un référent, pour chaque lecteur du personnel, `phone`,
      `stage` et `assigned_agent` sont tous trois nuls ou tous trois rendus (un même prédicat).

## Hors périmètre

- Le bloc `lease` (`tenant_name`) et le bloc `maintenance` du contexte.
- L'écran de la colonne de contexte.

## Notes d'implémentation

_(à remplir par implementing-specs)_
