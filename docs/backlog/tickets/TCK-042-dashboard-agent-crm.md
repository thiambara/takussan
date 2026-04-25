---
id: TCK-042
title: "Dashboard Agent — CRM"
status: done
phase: P0
family: front
estimate: M
created: 2026-04-15
updated: 2026-04-25
depends_on: [TCK-054, TCK-055, TCK-056, TCK-057, TCK-020]
blocks: []
spec_refs:
  features: [docs/features.md#16-crm--relation-client]
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#9-usercustomerrelationship
tags: [front, dashboard, agent, crm, customers]
---

## Objectif utilisateur

Un agent gère ses contacts clients, leurs informations et l'historique de ses interactions.

## Contrat de données

- `GET /api/customers` — liste (scopé par agent)
- `POST /api/customers` — création
- `GET /api/customers/{customer}` — fiche
- `PUT /api/customers/{customer}` — édition
- `POST /api/customers/{customer}/notes` — ajout note horodatée
- `POST /api/customers/{customer}/documents` — upload pièce d'identité
- `GET /api/customers/{customer}/relationships` — relations agent↔client

## Direction UX / Artistique

- **Liste clients** : tableau avec tri, recherche rapide. L'IA choisit si Kanban (pipeline CRM : lead → prospect → qualified → negotiating → converted) ou vue tabulaire.
- **Fiche client** : informations + onglets (historique, documents, notes, biens associés).
- **Notes** : timeline chronologique, style activité/réseau social.
- **Ajout client** : formulaire simple ou modal.
- **Pipeline stage** : si Kanban, cartes drag & drop entre colonnes.

## Contraintes strictes (métier)

- Un agent ne voit que les clients qu'il gère (ou tous si `agency_admin`/`super_admin`)
- Les notes sont horodatées et signées par l'agent connecté (non modifiables après création)
- Un Customer peut exister sans compte User (prospect CRM)
- Maximum 10MB par document uploadé, types autorisés : images, PDF

## Delta à produire

- [ ] Section CRM dans le dashboard (entrée navigation)
- [ ] Liste clients avec recherche et tri
- [ ] Fiche client avec onglets
- [ ] Formulaire ajout/édition client
- [ ] Timeline de notes
- [ ] Upload documents client

## Critères d'acceptation

- [ ] Un agent voit uniquement les clients qu'il gère
- [ ] Il peut créer un client (avec ou sans compte User)
- [ ] Les notes sont horodatées et non modifiables après création
- [ ] L'upload de documents fonctionne

## Hors périmètre

- Campagnes email/SMS (→ P3 futur)
- Pipeline de prospects avancé (→ P2)
