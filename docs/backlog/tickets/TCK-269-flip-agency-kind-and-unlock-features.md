---
id: TCK-269
title: "Flip Agency.kind à l'approbation + débloquage features + welcome agence"
status: done
phase: P1
family: applicatif
estimate: S
wave: 29
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-248, TCK-267, TCK-268]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
    - "docs/models-spec.md#49-agencyupgraderequest-"
tags: [back, front, agency, upgrade, p1]
---

## Objectif utilisateur

À l'approbation d'un `AgencyUpgradeRequest`, l'agence cible bascule en `kind = standard` automatiquement, ses champs légaux sont enrichis, les capacités précédemment restreintes deviennent accessibles, et le `agency_admin` voit une **welcome modale "Bienvenue dans votre agence"** qui l'invite à inviter sa première équipe.

## Contrat de données

Listener qui consomme `AgencyUpgradeApproved` (event émis par TCK-268) :

1. Charge la `Agency` cible.
2. `Agency.kind = standard`.
3. Copie les champs légaux depuis la demande approuvée vers l'agence si vides côté agence : `rc`, `ninea` (et autres champs juridiques si pas déjà sur Agency — sinon stockage dans `Agency.metadata.legal_info`).
4. Notification au `submitter` (déjà couverte par TCK-268 — pas redoublée).
5. Marque une key dédiée pour déclencher la welcome modale "Agence" au prochain login : `agency-standard-welcome-{agency_id}`.

Frontend :
- Au login, si key `agency-standard-welcome-{agency_id}` non vue ET le profil actif est `agency_admin` de cette agence → affichage `<WelcomeModal>` "Bienvenue dans votre agence" (slides : "Invitez votre équipe", "Configurez les rôles", "Accédez aux rapports").

## Contraintes strictes (métier)

- Le flip est **transactionnel** avec l'approbation : si le flip échoue, l'approbation est rollback (statut `pending`, commentaire technique loggé).
- Le débloquage de capacités est implicite : les policies existantes (TCK-256, 258, etc.) lisent `Agency.kind` et autorisent automatiquement.
- Pas de rétrogradation possible (déjà documenté en TCK-248/252).
- Activity log : `agency_kind_flipped` avec from/to + agency_id.

## Delta à produire

- [x] Listener : `App\Listeners\Agency\FlipAgencyKindOnUpgradeApproved`
- [x] Service : `App\Services\Agency\AgencyKindFlipService` (réutilisable + testable isolément)
- [x] Tests backend :
  - Approve → flip kind + copie champs légaux
  - Échec flip → rollback approbation
  - Activity log
  - Welcome marker posé
- [x] Frontend : déclencher `<WelcomeModal>` "Agence" au login si key non vue
- [x] Slides "Bienvenue dans votre agence" en i18n FR/EN/WO
- [x] Tests frontend : modale déclenchée 1 fois, ne réapparaît pas

## Critères d'acceptation

- [x] AC1 — Approbation d'une demande → `Agency.kind` passe à `standard` immédiatement.
- [x] AC2 — Champs légaux copiés (`rc`, `ninea`) sur l'agence si vides.
- [x] AC3 — Au prochain login du `agency_admin`, welcome modale "Agence" affichée 1 fois.
- [x] AC4 — Les pages auparavant bloquées (équipe TCK-258) deviennent accessibles côté UI et backend.
- [x] AC5 — Activity log entry `agency_kind_flipped`.

## Hors périmètre

- Form de soumission utilisateur — TCK-267.
- Console super-admin de review — TCK-268.
- Configuration UI des nouvelles capacités (rôles personnalisés…) — déjà existante / autre ticket.

## Notes d'implémentation

**Décisions clés :**

1. **Transactionalité — Option A** : `AgencyUpgradeReviewService::approve()` appelle `AgencyKindFlipService::flip()` directement à l'intérieur de sa propre `DB::transaction`. Si le flip throw, la transaction roll back l'update du `status=approved`, le `reviewed_*` et l'activity log d'approbation. Le listener `FlipAgencyKindOnUpgradeApproved` reste enregistré comme filet de sécurité pour les dispatchers directs (jobs, scripts) — il est idempotent et no-op quand l'agence est déjà `standard` (cas du happy path inline).
2. **Stockage des champs légaux** : Le modèle `Agency` n'a pas de colonnes `rc / ninea / rib_pro / company_legal_name / address_fiscale`. Tout est stocké dans `agency.metadata.legal_info.{field}` (cast `array`). Pas de migration créée — la constante `AgencyKindFlipService::LEGAL_FIELDS` documente les champs et la logique préfère une vraie colonne quand elle existe (fillable + déjà attribuée), sinon retombe sur le metadata bag. Idempotence : un champ déjà non-vide n'est jamais écrasé.
3. **Trigger welcome modale** : pas d'entry pré-créée dans `welcome_views` (qui est strictement scoped par user). À la place, le service stamp `agency.metadata.welcome.standard_unlocked_at = now()->toIso8601String()`. Le frontend `useAgencyStandardWelcomeOnce` lit ce marker via `GET /api/agencies/{id}?fields[agencies]=id,kind,metadata`, vérifie l'absence de la clé `agency-standard-welcome-{agency_id}` côté `welcome_views` user-scoped, puis affiche `<WelcomeModal>` une fois.
4. **Notification** : aucune nouvelle notification ajoutée — `AgencyUpgradeApprovedNotification` (TCK-268) reste seule responsable du ping submitter.
5. **Feature unlock** : aucune policy modifiée. Les guards existants (notamment `AgentInvitationService::assertAgencyCanInvite` qui throw 403 si `kind ≠ standard`) deviennent automatiquement passants une fois le flip appliqué — testé en bout-en-bout par `test_agent_invitation_unlocks_after_flip`.

**Fichiers touchés :**

Backend :
- `app/Services/Agency/AgencyKindFlipService.php` (nouveau)
- `app/Services/Agency/AgencyUpgradeReviewService.php` (injection + appel inline du flip dans la transaction d'approve)
- `app/Listeners/Agency/FlipAgencyKindOnUpgradeApproved.php` (nouveau, safety-net idempotent)
- `app/Providers/AppServiceProvider.php` (enregistrement du listener)
- `app/Http/Resources/AgencyResource.php` (expose `metadata` au frontend)
- `tests/Feature/Agency/AgencyKindFlipTest.php` (nouveau, 7 tests)

Frontend :
- `src/types/agency.ts` (ajout `AgencyMetadata` + champ `metadata` sur `Agency`)
- `src/hooks/useAgencyStandardWelcomeOnce.ts` (nouveau, mirror de `useTenantWelcomeOnce`)
- `src/components/agency/AgencyStandardWelcomeWizard.tsx` (nouveau, composition `<WelcomeModal>`)
- `src/components/layout/AppShell.tsx` (mount derrière `isAgencyAdmin`)
- `src/messages/{fr,en,wo}.json` (clés `agency.standardWelcome.{title, slides.{invite,roles,reports}.{title,body}}`)
- `src/hooks/__tests__/useAgencyStandardWelcomeOnce.test.tsx` (nouveau, 7 tests)
