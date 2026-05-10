---
id: TCK-259
title: "Wizard onboarding Agent post-acceptation — KYC + zones + tour"
status: todo
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

_(à remplir par implementing-specs)_
