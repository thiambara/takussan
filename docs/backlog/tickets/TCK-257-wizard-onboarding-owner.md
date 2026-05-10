---
id: TCK-257
title: "Wizard onboarding Owner post-acceptation — KYC + tour + biens pré-rattachés"
status: todo
phase: P1
family: applicatif
estimate: M
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

_(à remplir par implementing-specs)_
