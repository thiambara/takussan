---
id: TCK-265
title: "Welcome modale \"Espace résident\" sur transition Lease.signed"
status: todo
phase: P1
family: applicatif
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-251]
blocks: [TCK-266]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
tags: [back, front, onboarding, tenant, p1]
---

## Objectif utilisateur

Un Customer qui vient de signer un bail (`Lease.status = active`) reçoit une **notification "Bienvenue chez vous"** + voit, à sa prochaine connexion, une **welcome modale** présentant son espace résident (paiements, intervention maintenance, documents).

## Contrat de données

Pas de nouvel endpoint — repose sur :

- Event `Lease.activated` (à émettre côté backend lors du passage `signed → active` ou directement à la signature)
- Listener `SendTenantWelcomeNotification` qui envoie une notification in-app + email
- Welcome modale (TCK-251) avec key `tenant-welcome-{lease_id}` — déclenchée à la première visite du dashboard customer après l'event

## Direction UX / Artistique

Notification : "🏠 Bienvenue chez vous — votre bail est actif. Voir votre espace résident."

Welcome modale 3 slides :
1. "Vos paiements" — calendrier des prochaines échéances + méthode préférée
2. "Demander une intervention" — accès rapide à la maintenance
3. "Vos documents" — bail, EDL, quittances accessibles

Skippable. Vu une fois.

## Contraintes strictes (métier)

- Event émis idempotent : si Lease passe par plusieurs transitions, ne pas redéclencher la notification.
- Welcome modale scopée par bail : si un customer a plusieurs baux, chacun déclenche sa propre welcome la première fois.
- Notification respecte les préférences canal du user (in-app forcément, email opt-out possible).
- Activity log : `tenant_welcomed` avec lease_id, user_id.

## Delta à produire

- [ ] Event : `App\Events\LeaseActivated` (émis depuis le service qui flippe le bail)
- [ ] Listener : `App\Listeners\SendTenantWelcomeNotification`
- [ ] Notification : `App\Notifications\TenantWelcomeNotification` (in-app + email + WO localisation)
- [ ] Hook frontend : déclenchement de `<WelcomeModal>` (TCK-251) sur dashboard customer si lease_id activé non vu
- [ ] Slides Tenant en i18n FR/EN/WO
- [ ] Tests backend : event émis, notification envoyée, idempotence
- [ ] Tests frontend : modale déclenchée à la 1ère visite post-activation, jamais re-déclenchée

## Critères d'acceptation

- [ ] AC1 — À l'activation d'un bail, une notification est créée pour le tenant et l'email est envoyé.
- [ ] AC2 — À la prochaine connexion du tenant, la welcome modale s'affiche une fois.
- [ ] AC3 — Skip ou completion de la modale → ne réapparaît plus pour ce bail.
- [ ] AC4 — Multiples baux → multiples welcome modales (une par bail).
- [ ] AC5 — Activity log entry.

## Hors périmètre

- Checklist de complétion EDL + premier paiement + accusé docs — TCK-266.
- Création du modèle `TenantOnboardingChecklist` — TCK-266.

## Notes d'implémentation

_(à remplir par implementing-specs)_
