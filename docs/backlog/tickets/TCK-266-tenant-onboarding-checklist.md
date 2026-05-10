---
id: TCK-266
title: "TenantOnboardingChecklist + suivi complétion EDL"
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-265]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#19-état-des-lieux--inventaires"
  models:
    - "docs/models-spec.md#50-tenantonboardingchecklist-"
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#24-inventory-"
tags: [back, front, onboarding, tenant, edl, p2]
---

## Objectif utilisateur

Le résident voit une **checklist d'arrivée** dans son espace résident : welcome vu / état des lieux d'entrée signé / premier paiement effectué / documents accusés. La complétion est trackée par un `TenantOnboardingChecklist` et l'agence est alertée si l'EDL traîne.

## Contrat de données

Modèle `TenantOnboardingChecklist` (voir spec models §50).

Endpoints :

- `GET /api/me/leases/{lease}/onboarding-checklist` — état courant de la checklist
- `POST /api/me/leases/{lease}/onboarding-checklist/{item}/complete` — marque un item comme done (welcome_seen / inventory_completed / first_payment / documents_acknowledged)
- `GET /api/agencies/{agency}/tenant-onboarding-pending` — liste des checklists incomplètes >7j (vue agent/admin)

Items mis à jour automatiquement quand possible :
- `welcome_seen_at` posé par TCK-265 quand modale skip/complete
- `inventory_completed_at` posé par event `Inventory.signed` (existant ou à émettre)
- `first_payment_at` posé par event `LeasePayment.created` (premier paiement enregistré)
- `documents_acknowledged_at` posé manuellement par le tenant

Cron :
- `tenant-onboarding:remind` (horaire) — si `inventory_completed_at` null à J+7 de la signature → notification au locataire + notification à l'agent assigné, idempotent via `reminders_sent` JSON.

## Direction UX / Artistique

Sur dashboard tenant : widget "Bienvenue" affichant 4 items avec checkmarks. Cliquer un item incomplet redirige vers l'action correspondante. Le widget disparaît à la complétion totale.

Côté agence : page `/app/leases/onboarding-pending` listant les baux récents avec checklist incomplète, surlignant ceux > 7j.

## Contraintes strictes (métier)

- 1 checklist par bail (unicité sur `lease_id`).
- Création automatique à `Lease.activated` si `Agency.settings.tenant_onboarding_enabled` est vrai (default true).
- Items requis pour `completed_at` : `inventory_completed_at` + `first_payment_at`. Les 2 autres sont informatifs.
- L'EDL n'est pas conditionné par d'autres items — le tenant peut faire son premier paiement avant de finaliser l'EDL.
- Activity log : `tenant_checklist_created`, `tenant_checklist_item_completed`, `tenant_checklist_completed`.

## Delta à produire

- [ ] Migration : `create_tenant_onboarding_checklists_table` (cf. spec §50)
- [ ] Modèle : `App\Models\TenantOnboardingChecklist` avec scope `incomplete()`
- [ ] Listener : créer la checklist sur `LeaseActivated` (TCK-265)
- [ ] Endpoints (cf. ci-dessus)
- [ ] Service : `App\Services\Tenant\TenantOnboardingService`
- [ ] Console : `App\Console\Commands\RemindTenantOnboarding` (horaire, idempotent)
- [ ] Tests backend : création auto, complétion auto via events (Inventory.signed, LeasePayment.created), rappel J+7, idempotence
- [ ] Widget frontend tenant `<TenantOnboardingChecklistWidget>` sur dashboard
- [ ] Page agence `/app/leases/onboarding-pending`
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Activation d'un bail crée une checklist (si flag agency activé).
- [ ] AC2 — Signature d'un EDL flippe automatiquement `inventory_completed_at`.
- [ ] AC3 — Premier `LeasePayment` créé flippe `first_payment_at`.
- [ ] AC4 — `completed_at` posé quand `inventory_completed_at` ET `first_payment_at` sont posés.
- [ ] AC5 — Cron J+7 sans EDL → notifications tenant + agent, idempotent au passage suivant.
- [ ] AC6 — Widget tenant disparaît à completion.
- [ ] AC7 — Page agence liste les baux avec checklist incomplète, sort par ancienneté.

## Hors périmètre

- Refonte du workflow EDL lui-même — autre ticket.
- Signature électronique EDL — autre ticket P3.
- Configuration UI du flag `tenant_onboarding_enabled` par agence — autre ticket settings.

## Notes d'implémentation

_(à remplir par implementing-specs)_
