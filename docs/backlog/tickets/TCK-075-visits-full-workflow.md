---
id: TCK-075
title: "Visites — Planification complète (types, feedback, rappels)"
status: todo
phase: P2
family: applicatif
estimate: L
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-026, TCK-022, TCK-057, TCK-054]
blocks: [TCK-072]
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#12-propertyvisit
tags: [visits, scheduling, reminders, front, back]
---

## Contexte

La spec §1.3 P2 décrit un système de visites complet : « Planification de visites : en personne, virtuelle, en autonomie ou hybride ; agent accompagnateur, durée estimée, feedback post-visite » + « Rappels automatiques avant visite ». Le modèle `PropertyVisit` existe avec les enums `VisitType` et `VisitStatus`, un `PropertyVisitController` est présent (vérifié par l'audit), mais l'audit backend le signale comme « CRUD complet manque » et il n'y a aucune UI frontend.

Ticket full-stack : complétion backend (si besoin) + UI de planification et de suivi.

## Objectif utilisateur

Un locataire doit pouvoir demander une visite sur un bien (choix du type, créneau souhaité). Un agent doit pouvoir accepter/refuser, assigner un accompagnateur, définir la durée. Après la visite, les deux parties peuvent laisser un feedback. Des rappels automatiques partent 24h et 1h avant.

## Contrat de données

### Endpoints (vérifier/compléter TCK-026)

- `GET /api/property-visits` — liste (filter[property_id], filter[status], filter[type], filter[date_from], filter[date_to])
- `POST /api/property-visits` — demande de visite (property_id, scheduled_at, type, duration_min, notes)
- `PATCH /api/property-visits/{id}` — changer statut, assigner agent, modifier créneau
- `POST /api/property-visits/{id}/feedback` — body `{ role: 'customer'|'agent', rating?, comment }`
- `DELETE /api/property-visits/{id}` — annulation

### Jobs & notifications

- Job scheduled `SendVisitReminders` — tourne toutes les 5 minutes, envoie reminder 24h + 1h avant les visites `confirmed`.
- Notification `VisitReminderNotification` avec channel email + in-app (respecte préférences TCK-070).
- Notification `VisitRequestedNotification` pour l'agent, `VisitConfirmedNotification` pour le customer.

### Frontend

- Formulaire "Demander une visite" sur la fiche bien publique `(public)/properties/[slug]` — champs date/heure + type + notes.
- Liste `/app/visits` (agent + customer) avec filtres et actions selon rôle.
- Formulaire feedback post-visite (visible uniquement si `status=completed`).

## Direction UX / Artistique

Flow simple et confiant, à la Doctolib rdv / Cal.com booking. Sélection du créneau via calendrier compact (pas de modal popup lourde). Types de visite présentés avec icône et description courte. Feedback post-visite en 2 champs (rating + commentaire optionnel). Rappels email sobres, un seul CTA.

## Contraintes strictes (métier)

- Types supportés : `in_person`, `virtual` (Zoom/Meet lien), `self_guided` (code accès), `hybrid`.
- Statuts : `requested` → `confirmed` → `completed` OU `cancelled`. `no_show` si ni customer ni agent n'ont marqué comme completed dans les 24h suivant l'heure prévue.
- Un customer ne peut pas demander plus de 3 visites actives (`requested` + `confirmed`) simultanément par bien.
- Un agent ne peut pas confirmer deux visites qui se chevauchent temporellement sur le même bien.
- Le feedback n'est accessible que 24h après `completed` (permet un délai de réflexion) — configurable.
- Les rappels respectent les préférences notifications utilisateur (TCK-070).

## Delta à produire

### Backend

- [ ] Vérifier + compléter `PropertyVisitController` (endpoints listés)
- [ ] FormRequests + Policies (un customer peut demander ; un agent collaborateur du bien peut gérer)
- [ ] Service `App\Services\Visit\VisitSchedulingService` (validation overlap, quota par customer)
- [ ] Job `SendVisitReminders` + notification classes
- [ ] Commande artisan + schedule dans `Console\Kernel` (toutes les 5 min)
- [ ] Tests Feature : create/confirm/cancel/complete flow, overlap prevention, reminder dispatch

### Frontend

- [ ] Bouton "Demander une visite" sur `(public)/properties/[slug]`
- [ ] Modal ou page dédiée formulaire demande
- [ ] Page `/app/visits` avec liste filtrable + onglets "À venir" / "Passées"
- [ ] Détail visite avec actions contextuelles (confirmer, annuler, marquer completed, feedback)
- [ ] Entry nav sidebar (agent + customer)
- [ ] Tests Vitest : rendu formulaire demande, flow confirmation, feedback

## Critères d'acceptation

- [ ] AC1 — Un customer peut demander une visite "en personne" sur un bien ; un agent reçoit une notification et peut confirmer
- [ ] AC2 — Un agent ne peut pas confirmer 2 visites qui se chevauchent sur le même bien (422 explicite)
- [ ] AC3 — Une visite confirmée déclenche un rappel email + in-app 24h avant et 1h avant
- [ ] AC4 — Après `completed`, customer et agent peuvent laisser un feedback distinct
- [ ] AC5 — Un customer avec 3 visites actives sur un même bien voit sa 4e demande refusée
- [ ] AC6 — La page `/app/visits` affiche correctement les listes selon le rôle (customer voit ses demandes, agent voit les siennes à gérer)
- [ ] AC7 — `php artisan test --filter=VisitTest` + `npm run test` verts, Pint clean

## Hors périmètre

- Génération automatique du lien Zoom/Meet pour visites virtuelles (P3 — intégration externe)
- Code d'accès dynamique pour visites `self_guided` (P3 — serrure connectée)
- Paiement de visite (spec §1.3 parle de visite payante — P2/P3, pas ici)
- Calendrier unifié (→ TCK-072, qui consomme ces données)

## Notes d'implémentation

_(Rempli à l'implémentation)_
