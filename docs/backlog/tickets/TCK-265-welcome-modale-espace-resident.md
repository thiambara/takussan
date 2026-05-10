---
id: TCK-265
title: "Welcome modale \"Espace résident\" sur transition Lease.signed"
status: done
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

**Backend**

- `App\Events\Lease\LeaseActivated` (`ShouldDispatchAfterCommit`) — dispatché depuis `LeaseService::activate()` après le `refresh()`. Pas de redéfinition de l'API ; `LeaseController::activate` continue d'appeler `$leases->activate($lease)`.
- `App\Listeners\Lease\SendTenantWelcomeNotification` (`ShouldQueue`) — wired via `Event::listen` dans `AppServiceProvider`. Idempotence portée par la colonne `tenant_welcomed_at` (timestamp nullable, ajoutée par migration `2026_05_10_190000_add_tenant_welcomed_at_to_leases_table.php`). Choix de la colonne plutôt que d'un lookup `AppNotification` typed `tenant_welcome` : 1 PK lookup vs requête sur une table beaucoup plus large, et lecture déjà prévue par le listener.
- Si le `Customer` n'a pas de `user_id` (locataire pas encore inscrit), le listener stamp quand même `tenant_welcomed_at` pour ne pas retenter à chaque `LeaseActivated`. Le welcome reste best-effort.
- `App\Notifications\TenantWelcomeNotification` — channels `mail`+`database` via `PreferenceResolver` (defaults : on/on). Pas d'ajout à `PreferenceResolver::EVENTS` (welcome one-shot, pas de toggle utile dans la matrice de préférences). Localisations FR/EN/WO sous `notifications.tenant_welcome.*`.
- Activity log : `activity()->causedBy($tenantUser)->performedOn($lease)->withProperties(['lease_id' => $lease->id])->log('tenant_welcomed')`.

**Frontend**

- Hook `useTenantWelcomeOnce` — fan-out `Promise.all` sur `/api/leases?filter[status]=active&fields[leases]=id&per_page=50` + `/api/me/welcome-seen`, queue de baux non vus, modale jouée séquentiellement. La clé welcome est `tenant-welcome-{lease_id}` (une par bail).
- Composant `<TenantWelcomeWizard>` monté dans `AppShell` à côté du `<CustomerWelcomeWizard>` (TCK-253), gated `isCustomer(user.roles)` (les "customers" de la plateforme couvrent les tenants — voir `lib/roles`). Les deux wizards utilisent des clés disjointes, pas de conflit.
- Slides FR/EN/WO sous `tenant.welcome.slides[0..2].(title|body)` dans `messages/{fr,en,wo}.json`.

**Tests**

- Backend : `tests/Feature/Tenant/TenantWelcomeNotificationTest.php` (5 cas — event dispatch, listener envoi, idempotence, activity log, sans user lié).
- Frontend : `src/hooks/__tests__/useTenantWelcomeOnce.test.tsx` (5 cas — anonyme, ouverte si non vu, pas ouverte si vu, queue multi-bail séquentielle, POST une seule fois sur dismissals répétés).

**Fichiers touchés**

- Backend : `app/Events/Lease/LeaseActivated.php` (new), `app/Listeners/Lease/SendTenantWelcomeNotification.php` (new), `app/Notifications/TenantWelcomeNotification.php` (new), `app/Models/Lease.php` (fillable + casts), `app/Services/Model/LeaseService.php` (dispatch event), `app/Providers/AppServiceProvider.php` (wiring), `database/migrations/2026_05_10_190000_add_tenant_welcomed_at_to_leases_table.php` (new), `lang/{fr,en,wo}/notifications.php` (new `tenant_welcome` block), `tests/Feature/Tenant/TenantWelcomeNotificationTest.php` (new).
- Frontend : `src/hooks/useTenantWelcomeOnce.ts` (new), `src/components/tenant/TenantWelcomeWizard.tsx` (new), `src/components/layout/AppShell.tsx` (mount), `src/messages/{fr,en,wo}.json` (new `tenant.welcome` namespace), `src/hooks/__tests__/useTenantWelcomeOnce.test.tsx` (new).
