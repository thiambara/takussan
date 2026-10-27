---
id: TCK-2395
title: "Radar lot 5 : démarchage par l'API WhatsApp Cloud sur un numéro dédié, réponses reçues par webhook et preuve par identifiant de message"
status: todo
phase: P3
family: back
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2388]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#54-whatsappcontact-"
tags: [api, radar, whatsapp, webhook, adr-0077]
---

## Objectif utilisateur

Le démarchage passe à l'échelle : les messages partent sans geste manuel, les réponses arrivent
seules, et l'accord est prouvé par l'identifiant du message.

## Contexte

Lot 5 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots), canal « automatisé »
d'ADR-0077 § 5. L'envoi par l'API Cloud existe (`CloudApiWhatsappDriver`, TCK-282), pas la
réception (le modèle `WhatsappContact` l'annonce « future »).

## Contraintes strictes (métier)

- **Numéro Meta distinct de celui des notifications**, configuré à part ; aucun chemin de code ne
  peut envoyer un message du Radar par le numéro des notifications.
- Modèle de message validé par Meta, clauses fixes identiques à la v1 manuelle.
- Webhook entrant signé, journalisé avant traitement (journal des webhooks existant).

## Delta à produire

- [ ] Second numéro et son pilote ; webhook des messages entrants.
- [ ] Classement de la réponse par `radar.verification_accord` (texte) ; preuve `provider_message_id`.
- [ ] Confirmation humaine conservée tant que le taux d'acceptation de l'usage n'a pas été mesuré.

## Critères d'acceptation

- [ ] AC1 — Un message du Radar ne peut pas partir par le numéro des notifications (test).
- [ ] AC2 — Une réponse « OUI » reçue par le webhook crée une preuve à confirmer, avec l'identifiant
      du message.

## Hors périmètre

- Le démarchage manuel, qui reste disponible.

## Notes d'implémentation

_(à remplir par implementing-specs)_
