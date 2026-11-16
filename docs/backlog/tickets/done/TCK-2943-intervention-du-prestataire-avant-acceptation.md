---
id: TCK-2943
title: "Assistant du prestataire : l'intervention jointe porte son échéance, sa date et sa référence de signalement, les mots du locataire et un lien de détail"
status: done
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2946]
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [back, entree, prestataire, intervention, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le prestataire invité juge l'intervention avant de l'accepter : pour quand, signalée quand et par qui, et ce que le locataire en dit.

## Contrat de données

Écart de TCK-2613 (`[2]`, « projection minimale de l'API avant acceptation »). Relevé du 2026-11-15 : `GET /api/me/profiles/{sp}/intervention-d-origine` rend une projection minimale (photo, titre, catégorie, quartier, devis, agence).

À ajouter : `respond_by` (échéance de réponse, p. ex. « à traiter sous 48 h »), `reported_at`, `reference`, `reported_by_role` (« locataire »), `tenant_quote` (le texte du signalement), `detail_url` (la fiche de l'intervention, lisible après acceptation).

## Contraintes strictes (métier)

- **Règle d'accès changée** (le texte du locataire est une donnée personnelle, servie à un tiers avant qu'il accepte) : l'ADR s'écrit AVANT (numéro suivant libre), validé par le porteur ; il dit ce qui sort avant acceptation (jamais le nom, le téléphone ni l'adresse exacte du locataire ; le texte tel quel ou tronqué ; coordonnées masquées dans le texte, [ADR-0044](../../../adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md)).
- `respond_by` vient d'une règle existante de l'agence ou de la plateforme (délai de réponse d'une intervention) ; s'il n'en existe aucune, l'ADR la pose (réglage de l'agence) au lieu d'écrire « 48 h » en dur.
- `detail_url` n'ouvre la fiche qu'après acceptation (avant : 403 sur la fiche, ce que le front sait).

## Delta à produire

- [ ] ADR « ce que le prestataire lit d'une intervention avant de l'accepter ».
- [ ] Projection étendue de `intervention-d-origine` (sparse fieldsets).
- [ ] Masquage des coordonnées dans `tenant_quote`.
- [ ] Tests : `InterventionDOrigineProjectionTest` (champs rendus, aucun nom ni téléphone du locataire, numéro de téléphone masqué dans le texte).

## Critères d'acceptation

- [ ] AC1 — Une intervention signalée par le locataire le 12 nov. (réf. INT-0042, texte « fuite sous l'évier, appelez-moi au 77 123 45 67 ») rend `reported_at`, `reference: "INT-0042"`, `reported_by_role: "tenant"`, `tenant_quote` avec le numéro masqué, et `respond_by`.
- [ ] AC2 — La réponse ne contient ni le nom, ni le téléphone, ni l'adresse exacte du locataire (test sur les clés et les valeurs).
- [ ] AC3 — Un autre prestataire que le titulaire reçoit la même réponse qu'aujourd'hui (403/404).

## Hors périmètre

- L'écran (TCK-2946).

## Notes d'implémentation

Implémenté le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`), [ADR-0122](../../../adr/0122-ce-que-le-prestataire-lit-d-une-intervention-avant-de-l-accepter.md) écrit d'abord (« valide tes choix » : accepté, à confirmer à la revue).

**Prémisses re-mesurées — ce qui différait :**
- La projection de TCK-2613 ne rend PAS l'agence (titre, catégorie, quartier/ville, photo, devis seulement) ; non ajoutée (hors delta).
- Aucun délai de réponse d'intervention n'existait (ni réglage d'agence, ni plateforme) → réglage d'agence neuf (§ 6 de l'ADR).
- Aucune colonne de référence → `MaintenanceRequest::reference()` (`INT-%04d` de l'id), sans migration.
- Le titre, écriture libre du même auteur, sortait non masqué : il passe désormais par le même masquage que les mots (quel que soit l'auteur).

**Choix (ADR-0122) :**
- `respond_by` = `invitations.created_at` + `maintenance_provider_response_hours` (réglage d'agence, int 0-168, défaut 48, 0 → `null`, écrit par `PATCH /api/agencies/{id}`) ; indicatif, aucun job ; `ServiceProviderOnboardingService::echeanceDeReponse()`.
- `reported_by_role` : `tenant` (titulaire du bail rattaché, à défaut d'un bail du bien en `ACTIVE_TENANT_LEASE_STATUSES`), `landlord` (bailleur du bien), `agency` sinon, `null` sans demandeur.
- `tenant_quote` : seulement quand l'auteur est le locataire, sinon `null` ; `App\Support\MotsDuSignalement` — `PhoneMasker::mask`, courriels (`EvalCaseAnonymizer::EMAIL`) → `[EMAIL]`, prénom/nom du demandeur ET de la fiche client du bail rattaché, entiers et mot à mot → `[NOM]`, rue du bien → `[ADRESSE]` (mot entier, sans casse, valeurs < 3 lettres ignorées ; `Address` n'a pas d'autre champ de lieu exact que `street`), coupé à 280 caractères à un mot entier + « … ». Masquage AVANT la coupe.
- `reported_at` = `created_at` ; `detail_url` = `NotificationTarget::of('maintenance', id)->path()` (`/app/maintenance/{id}`), fiche en 403 avant l'acceptation (inchangé, épinglé).
- Sparse fieldsets : les six clés rejoignent `ShowOriginRequestServiceProviderProfileRequest::CHAMPS` (borne du paramètre 200 → 300 caractères). Le front (`CHAMPS_DE_L_INTERVENTION_D_ORIGINE`) ne les demande pas encore : à TCK-2946 d'ajouter `respond_by,reported_at,reference,reported_by_role,tenant_quote,detail_url`. Types déclarés dans `takussan-web/src/lib/service-provider-onboarding.ts`.

**Mesures :** `InterventionDOrigineProjectionTest` (12) + `MotsDuSignalementTest` (8) verts ; `InterventionDOrigineTest` mis à jour (son `assertExactJson` porte les clés neuves ; demandeur sans bail → `agency`, sans citation) : 14 verts. 11 ablations rouges puis restaurées (md5) : masque des numéros, valeurs connues, courriels, masque du titre (deux fois : numéros seuls, puis masquage complet), rôle locataire, bail en cours, lecture du réglage, porte de la citation, découpage des noms composés, noms de la fiche client. Gardes : `AgencySettingsWritableTest`, `AgencySettingAccessorTest`, architecture ×3, `ControllerInstantFormTest`, `DateInventoryByValueTest`, `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest`, `scripts/check-*.mjs` : verts. `features.md` (ligne « Assistants des invités ») + `features-by-actor.md` régénéré ; `models-spec.md` (table des réglages d'agence).

**Défaut voisin corrigé :** `ControllerInstantFormTest` rougissait sur `PropertyVisitController::confirmeeParLeBailleur` (`toIso8601String`, commité par TCK-2871) → `$this->instant(…)` ; `OwnerConfirmsAgencyVisitTest` vert.

**Non mien, relevé :** `npx tsc --noEmit` rouge sur `src/app/(auth)/auth/__tests__/porte-par-numero.tck-2604.test.tsx` (`delaiMinutes` manquant à `BienQuitte`) — travail en cours d'un autre agent (délai de réponse de l'agence, TCK-2935).
