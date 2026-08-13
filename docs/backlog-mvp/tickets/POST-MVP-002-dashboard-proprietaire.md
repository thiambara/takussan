---
id: POST-MVP-002
title: "Dashboard propriétaire simple"
status: obsolete
slice: "Post-MVP Phase 1"
estimate: 2 weekends
created: 2026-04-16
depends_on: [POST-MVP-001]
blocks: [POST-MVP-003]
tags: [front, dashboard, post-mvp]
---

## Objectif utilisateur

Un propriétaire peut gérer ses annonces, voir les statistiques et répondre aux demandes de contact.

## Prérequis

**Déclencheur** : 20+ propriétaires différents contactés via WhatsApp

## Contrat de données

- CRUD complet des annonces du propriétaire
- Statistiques : vues, contacts, conversion
- Messagerie interne simple
- Notifications nouveaux contacts

## Contraintes strictes

- **Simple mais puissant** : interface minimaliste
- **Mobile-first** : gestion depuis téléphone
- **Temps réel** : stats actualisées instantanément
- **Pas de spam** : validation propriétaire

## Delta à produire

### Backend (Laravel)
- [ ] Model `Owner` (hérite de User)
- [ ] Policy : propriétaire ne voit que ses annonces
- [ ] DashboardController : stats, listings, messages
- [ ] Notification system pour nouveaux contacts
- [ ] Message interne basique

### Frontend (Next.js)
- [ ] Dashboard layout propriétaire
- [ ] Page : mes annonces (CRUD)
- [ ] Page : statistiques
- [ ] Page : messages
- [ ] Composant : quick stats

### Features
- [ ] Éditer/supprimer ses annonces
- [ ] Voir statistiques par annonce
- [ **] Répondre aux demandes contact
- [ ] Mettre une annonce en avant (payant)
- [ ] Dupliquer une annonce

## Critères d'acceptation

- [ ] Propriétaire gère 10+ annonces facilement
- [ ] Stats sont compréhensibles et utiles
- [ ] Réponse aux contacts < 24h
- [ ] Interface mobile fluide

## KPI à tracker

- **Adoption propriétaires** : > 50% des contactés créent un compte
- **Listings/propriétaire** : moyenne > 2 annonces
- **Response time** : < 24h moyen

## Hors périmètre

- Gestion multi-agences
- CRM avancé
- Automatisation pricing
- Gestion locataires
