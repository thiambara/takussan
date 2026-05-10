---
id: TCK-255
title: "Wizard host individual — création Agency.kind=individual + profils + 1er bien draft"
status: todo
phase: P0
family: applicatif
estimate: M
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-248, TCK-250, TCK-254]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#2-agency"
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#3-property"
tags: [back, front, onboarding, host, individual, p0]
---

## Objectif utilisateur

Un utilisateur (Customer ou nouveau signup) qui clique "Publier" doit pouvoir, en un wizard de **5 steps maximum**, créer son agence individuelle, son `AgencyAdminProfile` + `OwnerProfile`, et un premier bien en `draft` — prêt à être finalisé immédiatement après.

## Contrat de données

Endpoint backend transactionnel :

- `POST /api/host/individual/onboard` — body :

  ```json
  {
    "agency": { "name": "Espace de Amine", "primary_city": "Dakar", "currency": "XOF" },
    "phone_otp": { "phone": "+221...", "code": "..." },
    "preferences": { "primary_property_type": "residential" },
    "first_property_draft": {
      "title": "...", "type": "...", "city": "...",
      "contract_type": "rent|sale", "price": 0
    },
    "payment_setting": { "preferred_provider": "wave|om|bank_transfer|cash" }
  }
  ```

  Réponse : `{ agency, profiles: [agency_admin, owner], property_draft }`. Crée tout en transaction unique.

Le wizard utilise `WizardDraft` (TCK-250) avec `key = "host-individual-wizard"` pour la persistance step par step.

## Direction UX / Artistique

5 steps max, barre de progression en haut :

1. **Intent** — "Particulier (mon espace) / Professionnel (créer une vraie agence)" → si professionnel, propose contact super-admin (lien) ou "continuer en individual et upgrader plus tard".
2. **Identité** — nom de l'espace (auto-rempli "Espace de [Prénom Nom]"), téléphone vérifié OTP, ville principale, type de bien principal.
3. **Premier bien (esquisse)** — titre, type, ville, transaction, prix indicatif.
4. **Mode de paiement** — provider préféré (config complète différée à 1ère réservation).
5. **Récap & publication** — CGU host à accepter, bouton "Publier mon bien" → bien créé en `draft`, redirection vers fiche bien pour finaliser photos.

Wizard reprenable (TCK-250). Si quitté, bandeau persistant "Reprenez votre publication".

## Contraintes strictes (métier)

- L'utilisateur doit être authentifié avant le step 2 (TCK-254 gère le flow auth).
- L'agence créée a `kind = individual`, `status = active`, `verified = false`.
- Le user devient simultanément `AgencyAdminProfile` + `OwnerProfile` de l'agence — les 2 profils en `active`.
- Le profil actif bascule automatiquement vers `AgencyAdminProfile` à la fin du wizard.
- Rôles spatie attachés : `agency_admin` + `owner` scopés `team_id = agency.id`.
- OTP téléphone obligatoire avant step 5 (sinon le bouton "Publier" est disabled).
- Transaction unique : si la création échoue à n'importe quel step backend, rollback complet (pas d'agence orpheline).
- L'agence individuelle hérite des restrictions (pas d'invitation collaborateurs internes, pas de multi-admin, etc.) — appliquées via les policies portées par TCK-269 et les autres parcours.
- Le premier bien créé est en `status = draft, visibility = private` jusqu'à finalisation.
- Activity log : événement `host_individual_onboarded` avec `user_id`, `agency_id`, `first_property_id`.

## Delta à produire

- [ ] Service : `App\Services\Onboarding\HostIndividualOnboardingService` (transaction)
- [ ] Controller : `App\Http\Controllers\HostOnboardingController::individual()`
- [ ] FormRequest : `HostIndividualOnboardRequest` (validation imbriquée)
- [ ] Route : `Route::post('host/individual/onboard', ...)` dans `routes/api.php`
- [ ] Tests backend : `tests/Feature/Onboarding/HostIndividualOnboardingTest.php`
      - flow nominal (création agency + 2 profils + bien draft)
      - rollback si OTP invalide
      - rollback si bien draft refusé par validation
      - bascule profil actif vers AgencyAdminProfile
      - rôles spatie attachés correctement
      - kind = individual posé
- [ ] Wizard frontend `<HostIndividualWizard>` — 5 steps, intégration `<WizardReprenable>` (TCK-250), CGU step 5
- [ ] Page d'entrée `/host/individual/start` (atteinte par TCK-254)
- [ ] i18n FR/EN/WO du wizard
- [ ] Tests E2E : flow complet, reprise après quit

## Critères d'acceptation

- [ ] AC1 — Wizard 5 steps complet en moins de 5 minutes pour un user motivé.
- [ ] AC2 — Reprise après quit : le user retrouve exactement son step et sa data.
- [ ] AC3 — À la fin, l'agence existe avec `kind = individual`, le user a `AgencyAdminProfile` + `OwnerProfile` actifs, un bien `draft`, et le profil actif est `AgencyAdminProfile`.
- [ ] AC4 — Si OTP refusé, l'agence n'est pas créée (rollback).
- [ ] AC5 — Step 1 "Professionnel" propose contact super-admin avec lien clair.
- [ ] AC6 — Activity log entry `host_individual_onboarded` créée.

## Hors périmètre

- Restrictions de capacités sur l'agence individuelle dans les autres écrans — portées par les policies des tickets parcours (TCK-256, 258, 269).
- Configuration complète de la passerelle de paiement — déclenchée à la 1ère réservation (TCK-079 / 172 existants).
- Branding / sous-domaine — accessibles dès `active` mais configuration UI non scopée ici.

## Notes d'implémentation

_(à remplir par implementing-specs)_
