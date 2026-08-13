---
id: POST-MVP-004
title: "Booking de visites"
status: obsolete
slice: "Post-MVP Phase 2"
estimate: 2 weekends
created: 2026-04-16
depends_on: [POST-MVP-003]
blocks: [POST-MVP-005]
tags: [front, booking, post-mvp]
---

## Objectif utilisateur

Un seeker peut réserver une visite directement depuis l'annonce, et le propriétaire peut gérer son calendrier.

## Prérequis

**Déclencheur** : > 50 demandes de visite/semaine via chat

## Contrat de données

- Créneaux disponibles propriétaire
- Réservation visite avec confirmation
- Calendrier intégré
- Rappels automatiques

## Contraintes strictes

- **Simple** : pas de complexité excessive
- **Mobile** : réservation en 3 clics
- **Fiable** : pas de double réservation
- **Flexible** : annulation/reprogrammation facile

## Delta à produire

### Backend (Laravel)
- [ ] Models : VisitSlot, VisitBooking
- [ ] CalendarController : disponibilités, réservations
- [ ] Validation : pas de double booking
- [ ] Notification system : rappels SMS/email
- [ ] Google Calendar sync (optionnel)

### Frontend (Next.js)
- [ ] Calendrier disponibilités propriétaire
- [ ] Interface réservation seeker
- [ ] Page "mes visites" (côtés)
- [ ] Integration chat (proposer visite)
- [ ] Notifications rappels

### Features
- [ ] Créneaux 30min/1h
- [ ] Jours disponibles personnalisables
- [ ] Confirmation visite
- [ ] Annulation 24h avant
- [ ] Feedback post-visite

## Critères d'acceptation

- [ ] Réservation en < 30 secondes
- [ ] Pas de double réservations
- [ ] Rappels fiables (24h et 1h avant)
- [ ] Annulation simple

## KPI à tracker

- **Conversion vue → réservation** : > 10%
- **Show-up rate** : > 80% (présents aux visites)
- **Booking efficiency** : < 5 minutes/visite gérée

## Hors périmètre

- Paiement en ligne
- Visites virtuelles
- Signatures électroniques
- Gestion clés
