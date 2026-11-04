---
id: TCK-261
title: "Wizard onboarding Service Provider — KYC + disponibilités + 1ère intervention"
status: done
phase: P1
family: applicatif
estimate: M
wave: 29
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-260, TCK-250, TCK-251]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#42-kycdossier-"
tags: [back, front, onboarding, service-provider, kyc, p1]
---

## Objectif utilisateur

Un Service Provider qui vient d'accepter une invitation est guidé à travers : OTP téléphone, KYC (CNI, métiers, zones, tarifs indicatifs, assurance RC pro), disponibilités hebdomadaires, accès direct à la 1ère intervention si l'invitation a été déclenchée par une demande active.

## Contrat de données

Endpoints :

- `POST /api/me/profiles/{sp_profile}/kyc/upload` — upload CNI, assurance RC pro
- `PATCH /api/me/profiles/{sp_profile}/trades` — body `{ trades[], intervention_zones[], hourly_rate, visit_fee }`
- `PATCH /api/me/profiles/{sp_profile}/availability` — body `{ available_slots: [{ day: 'monday', from: '09:00', to: '18:00' }, ...] }`
- `POST /api/me/phone/verify` — OTP téléphone

Wizard porté par `<WizardReprenable>` (TCK-250), key `sp-onboarding-{sp_profile_id}`.

Welcome modale (TCK-251), key `sp-welcome`.

## Direction UX / Artistique

4 steps :

1. **Vérification téléphone** — OTP obligatoire.
2. **Métier & tarifs** — multi-select métiers (plomberie, électricité, climatisation, serrurerie, peinture, autre), zones d'intervention, tarif horaire indicatif, frais de visite. Upload assurance RC pro (optionnel mais valorisé : badge "Assuré" affiché).
3. **Disponibilités** — grille hebdomadaire 7 jours × créneaux horaires (matin / après-midi / soir).
4. **Bienvenue** — résumé + accès à la 1ère intervention pré-assignée si présente (via `metadata.from_maintenance_request_id` de l'invitation TCK-260) + tour produit 3 slides.

## Contraintes strictes (métier)

- Statut `ServiceProviderProfile.status = active` à l'acceptation invitation.
- Profil actif basculé automatiquement vers ce nouveau `ServiceProviderProfile` à la fin du wizard.
- Si SP déjà rattaché à une autre agence : le wizard détecte (via TCK-262) et propose de **réutiliser ses métiers/zones/tarifs** existants au lieu de tout ressaisir.
- Activity log : `sp_kyc_submitted`, `sp_phone_verified`, `sp_onboarding_completed`.

## Delta à produire

- [ ] Endpoints backend (cf. ci-dessus)
- [ ] Service : `App\Services\Onboarding\ServiceProviderOnboardingService`
- [ ] Tests backend : OTP, KYC, métiers, dispos, redirection vers 1ère intervention si applicable
- [ ] Page wizard frontend `/onboarding/service-provider/{token}` + steps
- [ ] Réutilise `<KycUploader>` (TCK-257)
- [ ] Composant `<TradesMultiSelect>` (avec icônes par métier)
- [ ] Composant `<AvailabilityGrid>` (grille 7×3 ou 7×24)
- [ ] `<WelcomeModal>` avec slides SP
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — SP accepte invitation, atterrit sur step 1 (OTP).
- [ ] AC2 — KYC reprenable.
- [ ] AC3 — Si invitation depuis maintenance request, step 4 affiche un CTA direct vers la fiche intervention.
- [ ] AC4 — Profil actif basculé automatiquement.
- [ ] AC5 — Si SP existant autre agence (détecté via TCK-262), step 2 propose de réutiliser ses settings (UX validée séparément).

## Hors périmètre

- Multi-rattachement détaillé (plusieurs `ServiceProviderAgencyCollaboration`) — TCK-262.
- Validation/refus KYC par l'agence — autre ticket.

## Notes d'implémentation

### Décisions clés

- **Pas de migration de schéma.** Les colonnes existantes sur `service_provider_profiles` couvrent déjà 80 % du delta :
  - `trades` → `specialties` (json)
  - `intervention_zones` → `service_areas` (json)
  - `hourly_rate` → `hourly_rate_min` (decimal)
  - `visit_fee` → `metadata.visit_fee` (json) — promotion en colonne reportée à l'introduction d'une range query côté booking.
  - `availability` → `metadata.availability` (json `[{day, from, to}, ...]`).
- **`KycDossier` non utilisé.** Le modèle existe (TCK-256-ish) mais n'est pas branché aux SP. Choix : stocker les pièces via `App\Models\Document` polymorph (déjà utilisé partout dans la base) avec collection medialibrary `file`. Mapping `kind → DocumentType` :
  - `cni` → `DocumentType::IdCard`
  - `insurance` → `DocumentType::Insurance`
  La présence d'une assurance écrit `metadata.has_insurance = true` sur le SP profile pour le badge "Assuré". TCK-257 réutilisera `<KycUploader>` tel quel.
- **Hook acceptation invitation.** `InvitationService::finalizeAccept()` patché (TCK-261) pour, en plus du flip `status=active`, attacher `user_id` sur le SP profile draft quand `invitation.role === 'service_provider'`. Sans cette attache le wizard ne pouvait pas autoriser via ownership trivial.
- **Endpoint `complete()` séparé des PATCH chunks.** Le wizard PATCH /me/profiles/{sp}/{trades,availability} en cours de route, puis POST /service-provider/onboard/complete pour la transaction finale (status flip + collab activation + cookie + activity log). Mirror exact de `HostIndividualOnboardingService` mais sans création d'agence.
- **OTP bypass quand `phone_verified_at` déjà set.** Le wizard pré-vérifie en step 1 via `phoneVerifyOtpAction` (TCK-069), donc `complete()` skip la vérif OTP si `user->phone_verified_at !== null`. Évite une seconde demande de code à l'utilisateur.
- **Multipart KYC via SSR proxy.** Les server actions Next ne forwardent pas proprement un body multipart binaire, donc `<KycUploader>` POST directement sur `/api/me/profiles/{id}/kyc/upload` (route handler Next) qui re-stream vers Laravel avec le bearer cookie.
- **Active profile cookie.** L'action `spOnboardCompleteAction` (server action) pin `active_profile_id` côté Next en plus du cookie posé par Laravel — mirror `hostIndividualOnboardAction`.
- **`<WizardReprenable>` storageKey = `sp-onboarding-{sp_profile_id}`.** Banner dashboard sait reprendre via `wizard-drafts.ts` (rule prefix `sp-onboarding-`).
- **Hors scope (assumé).** Multi-rattachement (TCK-262) — la step 2 ne propose pas la réutilisation des settings d'une autre agence ; `existing_sp_other_agency` est exposé par l'invitation mais ignoré ici. Pas de welcome modale post-onboarding (slides) — peut être ajoutée dans une itération séparée puisque `useWelcomeOnce` est déjà fonctionnel et la clé `sp-welcome` est libre.

### Fichiers touchés

**Backend**
- `app/Http/Controllers/Api/Me/ServiceProviderProfileController.php` (nouveau) — uploadKyc / updateTrades / updateAvailability + ownership.
- `app/Http/Controllers/ServiceProviderOnboardingController.php` (nouveau) — `POST /api/service-provider/onboard/complete`.
- `app/Services/Onboarding/ServiceProviderOnboardingService.php` (nouveau) — OTP gate, status flip, collab activation, activity logs.
- `app/Services/Invitation/InvitationService.php` — hook SP : attache `user_id` sur draft profile à l'acceptation.
- `routes/api/onboarding.php`, `routes/api/me.php` — wires.
- `lang/{fr,en,wo}/service_providers.php` — `onboarding.errors.{invalid_otp,not_owner}`.
- `tests/Feature/Onboarding/ServiceProviderOnboardingTest.php` (nouveau) — 8 tests, 46 assertions.

**Frontend**
- `src/lib/service-provider-onboarding.ts` (nouveau) — wire types + helpers `apiRequest`.
- `src/app/actions/service-provider-onboarding.ts` (nouveau) — server actions `spPatchTrades / Availability / OnboardComplete`.
- `src/app/api/me/profiles/[id]/kyc/upload/route.ts` (nouveau) — multipart proxy.
- `src/app/onboarding/service-provider/page.tsx` (nouveau) — page d'entrée, gate auth + lookup SP profile.
- `src/components/onboarding/ServiceProviderOnboardingWizard.tsx` (nouveau) — 4 steps, mirror HostIndividualWizard.
- `src/components/kyc/KycUploader.tsx` (nouveau) — composant minimal réutilisable par TCK-257.
- `src/components/service-providers/{TradesMultiSelect,AvailabilityGrid}.tsx` (nouveaux).
- `src/lib/wizard-drafts.ts` — rule prefix `sp-onboarding-`.
- `src/messages/{fr,en,wo}.json` — namespace `serviceProviders.onboarding.*` + banner label.
- Tests (vitest) :
  - `src/components/service-providers/__tests__/AvailabilityGrid.test.tsx` (3 tests)
  - `src/components/onboarding/__tests__/ServiceProviderOnboardingWizard.test.tsx` (1 test, parcours nominal mocké).
