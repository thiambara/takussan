---
id: TCK-2761
title: "Fiche client, la veille de la visite : l'adresse du bien, « Itinéraire » et la trace du SMS de confirmation ; une recherche déduite d'une demande se dit telle"
status: todo
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2589]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, front, crm, customers, visits, audit-ux, app]
---

## Objectif utilisateur

La veille d'une visite, l'agent qui ouvre la fiche sait où il va, sans quitter la fiche, et sait que le client a été prévenu. Il sait aussi si ce que le client « cherche » vient de lui ou a été déduit de sa demande.

## Contrat de données

Ce ticket est le suivi du groupe 1 de la décision a-3 de TCK-2589 (team-lead, 2026-11-12 : « exclu avec un ticket de suivi »). La maquette de référence est `?p=app-fil-commercial&a=a`, écran « La fiche, la veille » (a-3), et sa fiche de fidélité `docs/qa/audit-ux-2026-11/fidelite/TCK-2589.json`.

Relevé du 2026-11-12 :

- `GET /api/customers/{id}` sert `upcoming_visits[]` avec `id`, `property_id`, `status`, `scheduled_at`, `preferred_window` et `manage`. Il ne sert ni l'adresse du bien, ni ses coordonnées, ni la trace d'un SMS de confirmation.
- La fiche ne garde aucune trace de la provenance de ses critères de recherche. On ne sait pas s'ils ont été saisis ou déduits du bien d'une demande (création depuis une demande, TCK-2590).
- Une entrée de contact du fil porte `channel`, `on` et `causer`, jamais un contenu. Le texte d'un échange WhatsApp n'existe pas dans Takussan : il est **hors de ce ticket, pour de bon**.

À servir (décisions à prendre à l'ouverture du ticket) :

- Sur `upcoming_visits[]`, l'adresse lisible du bien et ses coordonnées, aux seuls lecteurs qui lisent déjà la visite. Cela concerne la ligne « Rue OU-48 » et le geste « Itinéraire ».
- La trace de l'envoi du SMS de confirmation (« confirmée, SMS envoyé »), si le produit l'enregistre. Sinon, la phrase s'arrête à « confirmée ».
- Un marqueur posé quand la recherche de la fiche a été déduite d'une demande. Il est effacé dès que quelqu'un modifie la recherche. C'est la phrase « Déduit du bien de sa demande, à confirmer avec lui. ».

## Contraintes strictes (métier)

- Rien de plus que ce que le lecteur lit déjà de la visite et du bien. Le bailleur auteur d'une fiche ne lit pas les visites de la fiche (TCK-2589), et ne reçoit donc rien de ceci.
- Les sparse fieldsets sont gardés, et ces champs ne partent que demandés.

## Delta à produire

- API : les champs ci-dessus, avec leurs tests de forme et de portée.
- Front : dans « Prochaine action » de la fiche, la ligne d'adresse, « Itinéraire » (lien de carte vers les coordonnées) et la mention du SMS. Dans CHERCHE, la phrase « déduit ». Toutes les clés en fr et en, et wo = fr.

## Critères d'acceptation

- AC1 — Une visite confirmée à venir montre l'adresse du bien, et « Itinéraire » ouvre la carte sur ses coordonnées. Sans coordonnées, il n'y a pas de geste.
- AC2 — « SMS envoyé » ne se dit que si l'envoi est tracé.
- AC3 — Une recherche déduite d'une demande se dit telle, et cesse de l'être dès la première modification.
- AC4 — Le bailleur auteur ne reçoit aucun de ces champs (test API).

## Hors périmètre

- Le texte cité d'une réponse WhatsApp : l'échange se fait hors de Takussan.
- « demain », « confirmée » et « Rappeler la visite » : groupe 2 de la décision a-3, faits dans TCK-2589.

## Notes d'implémentation

_(à remplir par implementing-specs)_
