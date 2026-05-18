---
id: TCK-262
title: "Multi-rattachement Service Provider à plusieurs agences"
status: done
phase: P2
family: back
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-260, TCK-261]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#39-serviceprovideragencycollaboration-"
tags: [back, service-provider, multi-tenant, p2]
---

## Objectif utilisateur

Un Service Provider qui travaille déjà avec une agence A doit pouvoir être invité par une agence B et **ajouter cette nouvelle agence à son périmètre** — sans dupliquer son compte, son KYC, ni ses métiers/zones/tarifs.

## Contrat de données

Modèle existant `ServiceProviderAgencyCollaboration` (§39) — une ligne par couple (sp_profile_id, agency_id). Statut `active`, `paused`, `ended`.

Endpoint :

- `POST /api/sp/collaborations/{invitation_token}/accept` — acceptation d'une nouvelle invitation par un SP existant. Si l'email de l'invitation correspond à un user existant ayant déjà un `ServiceProviderProfile`, on **ne crée pas de nouveau profil** : on crée seulement une nouvelle `ServiceProviderAgencyCollaboration` rattachant son profil existant à la nouvelle agence.

## Contraintes strictes (métier)

- Un même `ServiceProviderProfile` peut avoir N collaborations actives.
- Le KYC est porté par le `ServiceProviderProfile` (pas par la collaboration) — donc réutilisé.
- Les métiers/zones/tarifs sont portés par le profil — par défaut réutilisés. Le SP peut **override par agence** via une future fonctionnalité (hors scope MVP).
- Lors de l'acceptation, l'agence inviteuse voit le SP comme "nouveau membre" mais l'historique côté SP est cumulé.
- Conflit : si une collaboration `active` existe déjà entre ce SP et cette agence → 409 (déjà rattaché).
- Activity log : `sp_collaboration_added`.

## Delta à produire

- [ ] Endpoint `POST /api/sp/collaborations/{token}/accept`
- [ ] Modification de `InvitationService::accept` pour détecter le cas SP-existant et créer collaboration au lieu de profil
- [ ] Tests backend :
  - SP nouveau → flow normal TCK-260/261 (création profile + collaboration)
  - SP existant invité par nouvelle agence → réutilisation profil + nouvelle collaboration
  - Doublon collaboration active → 409
  - Listage des collaborations d'un SP : cross-agences avec scoping correct
- [ ] Mise à jour du wizard SP (TCK-261) : si profil existant détecté, skip ou pré-remplir step 2
- [ ] Activity log entry

## Critères d'acceptation

- [ ] AC1 — SP existant accepte invitation d'une nouvelle agence → 1 nouvelle collaboration, pas de nouveau profil.
- [ ] AC2 — Le SP voit ses 2 agences listées dans son menu compte (switch d'agence active).
- [ ] AC3 — Les agences voient chacune le SP avec le bon statut local (`active` côté agence A même si suspendu côté agence B).
- [ ] AC4 — Doublon collaboration active rejeté.
- [ ] AC5 — Activity log entry.

## Hors périmètre

- Override par agence des métiers/zones/tarifs (settings locaux) — V2.
- UI SP pour comparer ses agences ou switcher (déjà couvert par profil actif TCK-138→142).

## Notes d'implémentation

### Décisions clés

1. **Détection en amont (invite), pas aval (accept)** : `ServiceProviderInvitationService::invite` détecte si un User existe déjà avec un SP profile via `lookupExistingServiceProviderForEmail($email)`. Si oui, on **ne crée ni nouveau profile draft ni collab paused** — on attache l'invitation au profile maître existant (via `invitable_id`). La collaboration est créée uniquement à l'acceptation, atomiquement, en `active`. Évite les rows fantômes et préserve KYC/métiers/zones/tarifs déjà renseignés.

2. **Pas d'endpoint dédié `POST /api/sp/collaborations/{token}/accept`** : la logique vit dans `InvitationService::finalizeAccept` (méthode helper `ensureServiceProviderCollaboration`). L'endpoint standard `POST /api/invitations/{token}/accept` couvre le cas (l'utilisateur fait juste un login préalable, le service détecte que le User a déjà un SP profile → il crée la collab au lieu d'un nouveau profile). C'est plus simple et symétrique avec les autres rôles.

3. **Conflit doublon** : la garde 409 vit à 2 endroits — (a) `ServiceProviderInvitationService::assertNoActiveServiceProviderInAgency` (au moment de l'invitation, l'inviteur sait tout de suite) et (b) `InvitationService::ensureServiceProviderCollaboration` (au moment de l'acceptation, défense en profondeur si une collab active a été ajoutée entre temps).

4. **Endpoint listing** : 2 endpoints sœurs sous `/api/me/service-provider/` :
   - `GET /collaborations` : spatie/query-builder full (sparse fields, includes, filters, sort) sur `ServiceProviderAgencyCollaboration`. Listing standard.
   - `GET /agencies` : projection plate enrichie de l'Agency (id, name, slug, kind, status). Consommé par la page Bienvenue multi-agences et le futur switcher.

5. **Wizard skip** : pas de modification structurelle du wizard. La page `/onboarding/service-provider/page.tsx` détecte l'état (`sp.status === 'active' && collabs.length > 0`) **server-side** et rend `<ServiceProviderMultiAgencyWelcome>` à la place du wizard. Un SP existant ne re-traverse jamais OTP/métiers/dispos.

6. **Switcher agence menu** : non touché (le `ProfileSwitcher` itère sur `/api/me/profiles`, et SP est une seule ligne agrégée). Le multi-rattachement est exposé via le nouvel endpoint `/api/me/service-provider/agencies` qui sera consommé par un widget dédié si besoin futur. Hors scope MVP — la spec dit "déjà couvert par profil actif TCK-138→142" pour la partie switcher.

### Fichiers touchés

**Backend**
- `app/Services/Invitation/ServiceProviderInvitationService.php` — détection SP existant + bypass création draft profile/collab.
- `app/Services/Invitation/InvitationService.php` — `ensureServiceProviderCollaboration` helper invoqué dans `finalizeAccept`.
- `app/Models/Profiles/ServiceProviderAgencyCollaboration.php` — config spatie (filterable, sortable, loadable, queryFields).
- `app/Http/Controllers/Api/Me/ServiceProviderAgenciesController.php` — `index` (collaborations) + `agencies` (projection plate).
- `routes/api/me.php` — 2 nouvelles routes `service-provider/{collaborations,agencies}`.
- `tests/Feature/Invitation/ServiceProviderMultiAgencyTest.php` — 7 tests (AC1-5 + bonus regressions).

**Frontend**
- `src/lib/service-provider-onboarding.ts` — `ServiceProviderAgencyEntry` type + `fetchSpAgencies`.
- `src/app/actions/service-provider-onboarding.ts` — `getSpAgenciesAction` server action.
- `src/app/onboarding/service-provider/page.tsx` — gating wizard vs welcome panel (SSR).
- `src/components/onboarding/ServiceProviderMultiAgencyWelcome.tsx` — nouveau composant.
- `src/messages/{fr,en,wo}.json` — clés `serviceProviders.multiAgency.*`.
