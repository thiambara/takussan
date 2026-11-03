---
id: TCK-257
title: "Wizard onboarding Owner post-acceptation — KYC + tour + biens pré-rattachés"
status: done
phase: P1
family: applicatif
estimate: M
wave: 29
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-256, TCK-250, TCK-251]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#42-kycdossier-"
tags: [back, front, onboarding, owner, kyc, p1]
---

## Objectif utilisateur

Un Owner qui vient d'accepter une invitation est guidé à travers un **wizard d'onboarding** : OTP téléphone, KYC documentaire (CNI, RIB, NINEA), tour produit (3 slides), affichage des biens déjà associés à son profil — pour qu'il soit opérationnel rapidement.

## Contrat de données

Endpoints existants ou à enrichir :

- `POST /api/me/profiles/{owner_profile}/kyc` — upload des pièces (CNI, RIB scan, NINEA), met `KycDossier.status = submitted`.
- `POST /api/me/phone/verify` (existant ou à créer) — OTP téléphone.
- `GET /api/me/owner-profile/{id}/properties` — liste des biens pré-rattachés visible en welcome.

Wizard porté côté frontend par `<WizardReprenable>` (TCK-250), key `owner-onboarding-{owner_profile_id}`.

Welcome modale (TCK-251), key `owner-welcome`.

## Direction UX / Artistique

4 steps :

1. **Vérification téléphone** — OTP obligatoire.
2. **KYC** — upload CNI/passeport, RIB, NINEA. Statut = `pending_review` non bloquant pour activer.
3. **Tour produit** — 3 slides : "Vos biens", "Vos paiements à recevoir", "Vos messages". Skippable.
4. **Vue d'arrivée** — liste des biens déjà associés (pré-rattachés par l'agent), CTA "Compléter mon profil" si KYC partiel.

Wizard reprenable (peut quitter et revenir). KYC peut être complété en plusieurs sessions.

## Contraintes strictes (métier)

- Statut `OwnerProfile.status = active` à l'acceptation invitation (pas conditionné par KYC complet).
- KYC en `pending_review` reste non bloquant pour les actions de base (consulter biens, paiements). Bloquant pour : signature de mandat, retrait Wave/OM gros montant (à traiter plus tard).
- Activity log : événements `owner_kyc_submitted`, `owner_phone_verified`, `owner_onboarding_completed`.
- Le tour produit n'est jamais bloquant.

## Delta à produire

- [ ] Endpoints backend :
  - `POST /api/me/profiles/{owner_profile}/kyc/upload` (per-doc upload via medialibrary)
  - `POST /api/me/profiles/{owner_profile}/kyc/submit` (validation soumission complète)
  - Réutilise `KycDossier` (modèle existant §42)
- [ ] Service : `App\Services\Onboarding\OwnerOnboardingService`
- [ ] Tests backend : OTP, KYC upload + submit, statuts
- [ ] Page wizard frontend `/onboarding/owner/{token}` (atterrissage post-acceptation TCK-249) + steps
- [ ] Wiring `<WelcomeModal>` (TCK-251) avec slides Owner
- [ ] Composant `<KycUploader>` (réutilisable pour Agent / SP) — dropzone + preview + retire
- [ ] Liste biens pré-rattachés en step 4
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Owner accepte l'invitation, atterrit sur le wizard step 1 (OTP).
- [ ] AC2 — KYC peut être complété en plusieurs sessions ; chaque doc uploadé persiste indépendamment.
- [ ] AC3 — Skip du tour ne bloque pas l'arrivée sur le step 4.
- [ ] AC4 — Step 4 liste correctement les biens pré-rattachés (joins via `OwnerProfile.properties`).
- [ ] AC5 — Activity log entries présents pour les 3 événements.

## Hors périmètre

- Workflow de validation/refus du KYC par l'agence — autre ticket (existe partiellement TCK-XXX KYC dossiers).
- Signature de mandat de gestion Owner ↔ Agence — autre ticket P2.

## Notes d'implémentation

**Backend (commit `71145c1`)**

- `App\Http\Controllers\Api\Me\OwnerProfileController` — monté sous `/api/me/owner-profiles/{owner_profile}`. Trois endpoints :
  - `POST kyc/upload` — accepte CNI / RIB / NINEA via `Document` polymorph + medialibrary.
  - `POST kyc/submit` — flippe `OwnerProfile.metadata.kyc.status = pending_review`.
  - `GET properties` — retourne les `Property` pré-rattachés à l'owner via le couple `(user_id, agency_id)` (pas de FK `owner_profile_id` sur Property).
- `App\Http\Controllers\OwnerOnboardingController::complete` — `POST /api/owner/onboard/complete`. Verrou OTP (`PhoneVerificationService` + bypass dev `123456`), flip `OwnerProfile.status` à `active`, set `phone_verified_at`, pose le cookie `active_profile_id`. Retourne `{owner_profile, active_profile_id, properties_count}`.
- `App\Services\Onboarding\OwnerOnboardingService` — orchestrateur, miroir du SP. Décision : OTP validé **avant** la transaction pour ne jamais polluer la DB sur code invalide.
- `DocumentType` étendu de `Rib` + `Ninea` (cases manquantes pour le KYC owner).
- `InvitationService::finalizeAccept` généralisé : flip `user_id` sur l'invitable polymorphe étendu au rôle `owner` (n'était que `service_provider`).
- 8 tests (`Feature\Onboarding\OwnerOnboardingTest`) — acceptance hook, KYC upload+submit, OTP gate, status flip, scope properties, activity log, 401/403.

**Décision KYC** — Le dossier KYC owner vit dans `OwnerProfile.metadata.kyc` (`{status, submitted_at, docs[]}`) plutôt que d'instancier le modèle `KycDossier` (§4.2). Évite une migration et reste cohérent avec le pattern SP. Le workflow formel review/refus reste hors scope (ticket séparé).

**Frontend**

- Page : `src/app/onboarding/owner/page.tsx` — gate auth (redirect `/auth/login?redirect=%2Fonboarding%2Fowner`), récupère `OwnerProfile` via `getMyProfilesAction`, fallback `/app` si l'user n'a pas de profil owner attaché.
- Wizard : `src/components/onboarding/OwnerOnboardingWizard.tsx` — 4 steps mirror du SP wizard (TCK-261) :
  1. **Phone** — OTP via `phoneSendOtpAction` / `phoneVerifyOtpAction` (réutilisés du SP).
  2. **KYC** — 3 `<KycUploader>` (CNI / RIB / NINEA), CTA "Soumettre mon dossier KYC" → `ownerSubmitKycAction`. **Non bloquant** pour la complétion (cohérent avec le service backend).
  3. **Tour produit** — 3 slides skippables (Vos biens / Paiements / Messages).
  4. **Recap** — fetch `getOwnerPropertiesAction` côté client dans `useEffect`, liste des biens pré-rattachés avec deep-link `/app/properties/{id}`.
- Storage key wizard : `owner-onboarding-{ownerProfileId}` ; règle de reprise mise à jour dans `wizard-drafts.ts` (route `/onboarding/owner?owner=…`).
- Server actions : `src/app/actions/owner-onboarding.ts` (`ownerSubmitKycAction`, `ownerOnboardCompleteAction`, `getOwnerPropertiesAction`). `ownerOnboardCompleteAction` pose aussi le cookie `active_profile_id` côté Next (en plus du cookie posé par Laravel).
- Wire types : `src/lib/owner-onboarding.ts`.
- SSR proxies : `src/app/api/me/owner-profiles/[id]/{kyc/upload,kyc/submit,properties}/route.ts`. L'upload re-stream le multipart (`duplex: 'half'`) — Server Actions ne forwardent pas proprement les `multipart/form-data` bodies.

**`<KycUploader>` — extension backward-compatible** : nouveau prop `endpoint: 'profiles' | 'owner-profiles'` (default `'profiles'`) + `i18nNamespace`. Permet à l'owner wizard de cibler `/api/me/owner-profiles/...` sans toucher au SP wizard. `kind` étendu de `'ninea'`.

**Welcome modale** — `src/components/owner/OwnerWelcomeWizard.tsx` (mirror de `<CustomerWelcomeWizard>`) consomme `useWelcomeOnce('owner-welcome', ...)` et les slides i18n existants (`ownerWelcome.slides.{properties,payments,messages}`). Monté dans `<AppShell>` derrière un guard `isOwner(user.roles)`.

**Tests**

- Backend : 8 tests existants conservés et verts (`Tests\Feature\Onboarding\OwnerOnboardingTest`).
- Frontend : 1 happy-path mocké (`OwnerOnboardingWizard.test.tsx`) — navigue les 4 steps, vérifie `getOwnerPropertiesAction(7)` puis `ownerOnboardCompleteAction(7, undefined)` puis `router.push('/app')`. Disambiguation du label "Suivant" sur le tour step (slide button + wizard footer partagent le même label).

**Fichiers touchés**

- Backend : `app/Http/Controllers/Api/Me/OwnerProfileController.php`, `app/Http/Controllers/OwnerOnboardingController.php`, `app/Models/Enums/DocumentType.php`, `app/Services/Invitation/InvitationService.php`, `app/Services/Onboarding/OwnerOnboardingService.php`, `lang/{fr,en,wo}/owners.php`, `routes/api/me.php`, `routes/api/onboarding.php`, `tests/Feature/Onboarding/OwnerOnboardingTest.php`.
- Frontend : `src/app/onboarding/owner/page.tsx`, `src/components/onboarding/OwnerOnboardingWizard.tsx`, `src/components/onboarding/__tests__/OwnerOnboardingWizard.test.tsx`, `src/components/owner/OwnerWelcomeWizard.tsx`, `src/components/layout/AppShell.tsx`, `src/components/kyc/KycUploader.tsx`, `src/lib/owner-onboarding.ts`, `src/lib/wizard-drafts.ts`, `src/app/actions/owner-onboarding.ts`, `src/app/api/me/owner-profiles/[id]/{kyc/upload,kyc/submit,properties}/route.ts`, `src/messages/{fr,en,wo}.json`.
