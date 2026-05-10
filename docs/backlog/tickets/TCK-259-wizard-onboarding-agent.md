---
id: TCK-259
title: "Wizard onboarding Agent post-acceptation — KYC + zones + tour"
status: done
phase: P1
family: applicatif
estimate: M
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-258, TCK-250, TCK-251]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#35-agentprofile-"
    - "docs/models-spec.md#42-kycdossier-"
tags: [back, front, onboarding, agent, kyc, p1]
---

## Objectif utilisateur

Un Agent qui vient d'accepter une invitation est guidé à travers : OTP téléphone, KYC (license_number, pièce d'identité, photo, spécialisation, zones d'intervention), affichage du périmètre de permissions choisi par l'admin, lien vers premier lead pré-assigné si applicable.

## Contrat de données

Endpoints :

- `POST /api/me/profiles/{agent_profile}/kyc/upload` — upload pièces (license, CNI, photo)
- `PATCH /api/me/profiles/{agent_profile}/specialization` — body `{ specialization, intervention_zones[] }`
- `POST /api/me/phone/verify` — OTP téléphone
- `GET /api/me/agent-profile/{id}/first-lead` — renvoie le premier lead pré-assigné si existe

Wizard porté par `<WizardReprenable>` (TCK-250), key `agent-onboarding-{agent_profile_id}`.

Welcome modale (TCK-251), key `agent-welcome`.

## Direction UX / Artistique

4 steps :

1. **Vérification téléphone** — OTP obligatoire.
2. **KYC** — license_number (input), upload license card, CNI/passeport, photo de profil.
3. **Spécialisation & zones** — select spécialisation (résidentiel / commercial / luxe / mixte), multi-select zones d'intervention (villes/quartiers).
4. **Bienvenue dans l'équipe** — affichage du rôle assigné par l'admin (junior/senior/manager) + permissions principales + lien vers premier lead pré-assigné si présent + tour produit 3 slides (Welcome modale).

## Contraintes strictes (métier)

- Statut `AgentProfile.status = active` à l'acceptation invitation (pas conditionné par KYC complet).
- License_number requis pour `pending_review` du KYC, mais non bloquant pour les actions de base.
- Profil actif basculé automatiquement vers ce nouveau `AgentProfile` à la fin du wizard.
- Activity log : `agent_kyc_submitted`, `agent_phone_verified`, `agent_onboarding_completed`.

## Delta à produire

- [ ] Endpoints backend (cf. ci-dessus)
- [ ] Service : `App\Services\Onboarding\AgentOnboardingService`
- [ ] Tests backend : OTP, KYC upload, spécialisation/zones, premier lead pré-assigné
- [ ] Page wizard frontend `/onboarding/agent/{token}` + steps
- [ ] Réutilise `<KycUploader>` (créé en TCK-257)
- [ ] Composant `<ZoneMultiSelect>` (avec autocomplete villes/quartiers)
- [ ] `<WelcomeModal>` avec slides Agent
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Agent accepte l'invitation, atterrit sur step 1 (OTP).
- [ ] AC2 — KYC reprenable en plusieurs sessions.
- [ ] AC3 — Profil actif basculé automatiquement vers `AgentProfile` à la fin.
- [ ] AC4 — Si lead pré-assigné existe, affiché en step 4 avec lien direct vers la fiche customer.
- [ ] AC5 — Activity log entries pour les 3 événements.

## Hors périmètre

- Workflow de validation/refus du KYC par l'agence — autre ticket.
- Pré-assignation de leads à un agent avant son arrivée (côté admin) — autre ticket.

## Notes d'implémentation

Mirror exact du wizard Owner (TCK-257) avec quatre étapes : OTP téléphone, KYC,
spécialisation+zones, écran de bienvenue. Aucun nouveau ticket de complexité —
toutes les briques (`<WizardReprenable>`, `<KycUploader>`, `<WelcomeModal>`,
`PhoneVerificationService`) sont réutilisées telles quelles.

**Choix de stockage**

- `KYC` (license / cni / photo) → `Document` polymorphe attaché à
  `AgentProfile` (un row par `(profile, kind)`, ré-upload remplace le média
  in-place via `medialibrary` `singleFile`). Statut + horodatage de soumission
  dans `AgentProfile.metadata.kyc.{status, submitted_at, docs[]}` — pas de
  migration dédiée. Mapping `kind → DocumentType` : `license`→`other`,
  `cni`→`id_card`, `photo`→`photo`.
- `license_number` (string) → colonne dédiée existante
  `agent_profiles.license_number`.
- `specialization` (string) → colonne existante `agent_profiles.specialty`
  (le front parle de "specialization" pour la cohérence UX, mais la colonne
  schema reste `specialty` — voir `AgentProfileFactory`). Validée contre
  `[residential, commercial, luxury, mixed]`.
- `intervention_zones` (string[]) → `metadata.intervention_zones` (mirror
  des `service_areas` SP). Pas de migration : promotion en colonne quand un
  flux booking aura besoin d'une range-query.

**Premier lead pré-assigné**

Le schéma `customers` ne dispose pas de colonne `assigned_agent_id` — on
utilise `customers.added_by_id = $agent->user_id` scopé par agence comme
proxy ("leads créés par cet agent ou attribués à lui à l'invite"). La
pré-assignation côté admin reste hors-périmètre (autre ticket).

**Hook acceptation invitation**

`InvitationService::finalizeAccept` est élargi pour attacher `user_id`
sur le draft `AgentProfile` à l'acceptation (mirror Owner / SP — il ne
le faisait que pour `service_provider` / `owner`). Bascule status → active
restée pilotée par le `array_key_exists('status', …)` existant.

**Endpoints**

- `POST   /api/me/agent-profiles/{id}/kyc/upload`     (multipart, throttle 10/min)
- `POST   /api/me/agent-profiles/{id}/kyc/submit`     (throttle 10/min)
- `PATCH  /api/me/agent-profiles/{id}/specialization` (JSON)
- `GET    /api/me/agent-profiles/{id}/first-lead`
- `POST   /api/agent/onboard/complete`                (throttle 5/min)

OTP : on réutilise `/api/auth/phone/send-otp` + `/api/auth/phone/verify-otp`
existants (pas besoin d'un endpoint `/api/me/phone/verify` dédié — le
wizard pré-vérifie en step 1, le `complete()` re-vérifie côté serveur si
`phone_verified_at` est encore null).

**Frontend**

- `<KycUploader>` étendu avec `endpoint='agent-profiles'` + nouveaux
  `kind='license'|'photo'` (backward-compat — Owner / SP intacts ; tests
  des deux wizards passent).
- Nouveau `<ZoneMultiSelect>` (free-form chips + suggestions Dakar). Pas
  de catalogue villes (codebase n'en ship pas) — swap pour Combobox
  trivial quand un catalogue arrivera, le contrat `value/onChange` reste
  inchangé.
- `<AgentWelcomeWizard>` mirror de `<OwnerWelcomeWizard>` (3 slides,
  `useWelcomeOnce('agent-welcome')`), monté dans `AppShell` derrière
  `isAgent(user.roles)`.
- Page `/onboarding/agent/page.tsx` — auth-gate + lookup du premier
  `AgentProfile` via `/api/me/profiles?fields[profiles]=...&include=agency`.
  Le rôle assigné (junior/senior/manager) est par défaut `agent` dans le
  recap car la projection `/api/me/profiles` n'expose pas `metadata` ;
  un endpoint dédié pourra raffiner le label dans un follow-up (purement
  cosmétique, ne gate jamais l'onboarding).
- `wizard-drafts.ts` : prefix `agent-onboarding-{id}` repointé vers
  `/onboarding/agent?agent={id}` (mirror Owner/SP — le path précédent
  `/app/profile/agent/onboarding` n'existait pas).

**Fichiers touchés**

Backend :
- `app/Http/Controllers/AgentOnboardingController.php` (nouveau)
- `app/Http/Controllers/Api/Me/AgentProfileController.php` (nouveau)
- `app/Services/Onboarding/AgentOnboardingService.php` (nouveau)
- `app/Services/Invitation/InvitationService.php` (élargissement de la
  liste des rôles qui attachent `user_id`)
- `database/factories/Profiles/AgentProfileFactory.php` (state `draft()`)
- `lang/{fr,en,wo}/team.php` (sous-clé `onboarding.errors`)
- `routes/api/{me,onboarding}.php` (5 routes)
- `tests/Feature/Onboarding/AgentOnboardingTest.php` (10 cas, 59 assertions)

Frontend :
- `src/components/onboarding/AgentOnboardingWizard.tsx` (nouveau)
- `src/components/agents/ZoneMultiSelect.tsx` (nouveau)
- `src/components/agent/AgentWelcomeWizard.tsx` (nouveau)
- `src/components/onboarding/__tests__/AgentOnboardingWizard.test.tsx`
- `src/components/kyc/KycUploader.tsx` (élargissement props)
- `src/components/layout/AppShell.tsx` (mount `<AgentWelcomeWizard>`)
- `src/app/onboarding/agent/page.tsx` (nouveau)
- `src/app/actions/agent-onboarding.ts` (nouveau)
- `src/app/api/me/agent-profiles/[id]/{kyc/upload,kyc/submit,specialization,first-lead}/route.ts`
- `src/lib/agent-onboarding.ts` (nouveau)
- `src/lib/wizard-drafts.ts` (URL agent-onboarding-)
- `src/messages/{fr,en,wo}.json` (namespaces `agents.onboarding.*` +
  `agentWelcome.*`)

**Hors périmètre confirmé**

- Validation/refus du KYC par l'agence (workflow autre ticket).
- Pré-assignation des leads à un agent depuis le back-office admin
  (autre ticket).
