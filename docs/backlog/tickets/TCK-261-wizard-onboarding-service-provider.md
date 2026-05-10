---
id: TCK-261
title: "Wizard onboarding Service Provider — KYC + disponibilités + 1ère intervention"
status: todo
phase: P1
family: applicatif
estimate: M
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

_(à remplir par implementing-specs)_
