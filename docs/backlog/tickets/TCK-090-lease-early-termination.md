---
id: TCK-090
title: "Résiliation anticipée + pénalités"
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-027, TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#14-lease-
tags: [back, front, lease]
---

## Objectif utilisateur

Permettre à un Locataire (ou à l'Agent au nom du Bailleur) d'initier une
résiliation anticipée d'un bail avec préavis, et au système de calculer
automatiquement les pénalités contractuelles à régler avant la clôture
définitive du bail.

## Contrat de données

Le modèle `Lease` (§14) doit exposer :
`early_termination_requested_at` (timestamp nullable),
`early_termination_requested_by` (uuid → User),
`early_termination_effective_date` (date — date effective de fin après
préavis), `early_termination_penalty_amount` (decimal calculé),
`early_termination_reason` (text), `notice_period_days` (int, copié du bail
ou par défaut). Les colonnes manquantes par rapport à TCK-027 font l'objet
d'une migration additive.

Le statut `Lease.status` accepte la transition vers `terminating` (préavis
en cours) puis `terminated` à `effective_date`.

**Endpoints nouveaux** :

- `POST /api/leases/{lease}/early-termination` body
  `{ effective_date, reason, requested_by_role }`
  → calcule les pénalités, crée une `Invoice` (§25) pour les pénalités,
  passe le bail en `terminating`.
- `DELETE /api/leases/{lease}/early-termination` → annule la demande
  tant que `effective_date > today` et que l'invoice n'a pas été payée.
- `POST /api/leases/{lease}/early-termination/confirm` → effectue la
  transition `terminating → terminated` à la date effective (utilisé par
  le job scheduled ou manuellement par un Agent).

**Job scheduled** : `ConfirmEarlyTerminationsJob` (`daily`) qui clôture
les baux dont `effective_date <= today` et dont la pénalité a été soldée.

## Direction UX / Artistique

**Bouton "Résilier le bail"** sur la fiche bail (TCK-044) — visible si
`status in [active, ending_soon]` et pas déjà en `terminating`. Action
considérée comme **destructive secondaire** (rouge atténué).

**Modale "Résiliation anticipée"** :

1. Choix du motif (raison libre, sélecteur catégorie : déménagement,
   ventes, défaut, autre).
2. Date effective souhaitée (avec affichage du préavis minimum calculé).
3. Estimation pénalité en temps réel : "Préavis non couvert : X mois →
   pénalité estimée = Y FCFA". Affichage transparent du calcul.
4. Confirmation forte avec récap.

**Bandeau "Bail en résiliation"** sur la fiche : compteur "Fin dans X
jours", lien vers l'invoice de pénalité, bouton "Annuler la résiliation"
(visible tant que la fenêtre l'autorise).

**Mots-clés d'ambiance** : honnêteté, prévisibilité, accompagnement —
l'utilisateur comprend chaque chiffre avant de confirmer. Aucun "dark
pattern".

## Contraintes strictes (métier)

- **Préavis minimum** : `effective_date >= today + notice_period_days`
  (typiquement 30 ou 60). 422 sinon avec date suggérée.
- **Date effective <= end_date** : la résiliation anticipée ne peut pas
  dépasser la fin contractuelle ; sinon il s'agit d'une fin normale (pas
  de pénalité).
- **Calcul pénalité** : `months_remaining = ceil((end_date -
  effective_date) / 30)` ; `penalty = monthly_rent ×
  Setting('lease.early_termination_penalty_months', default=2)` capé à
  `months_remaining`. Configurable en surcharge par bail via colonne dédiée
  si besoin futur.
- **Statuts autorisés** : initiation possible uniquement depuis `active`
  ou `ending_soon`. 422 sinon.
- **Annulation** : possible tant que `effective_date > today` ET
  l'invoice de pénalité n'est pas marquée `paid`. 422 sinon.
- **Initiateur** : un Locataire ne peut résilier que son propre bail.
  Un Agent / OwnerAgency peut résilier au nom du Bailleur si
  permission `leases.terminate`.
- **Invoice de pénalité** : créée en statut `pending`, échéance =
  `effective_date - notice_period_days / 2` (mi-préavis). Lien dans le
  bail.
- **Notifications** : event `LeaseEarlyTerminationRequested` → notif aux
  parties prenantes (locataire, bailleur, agent). Event
  `LeaseEarlyTerminationCancelled`. Event `LeaseEarlyTerminationConfirmed`.
- **ActivityLog** : entrées dédiées avec `properties.penalty_amount`,
  `properties.effective_date`, `properties.reason`.
- **Idempotence** : impossible d'initier une 2e résiliation tant que la
  première n'est pas annulée. 422.

## Delta à produire

- [ ] Migration: `add_early_termination_columns_to_leases`
- [ ] Migration: ajout du status `terminating` à l'enum `LeaseStatus`
- [ ] Service: `App\Services\Lease\EarlyTerminationService` (request,
      cancel, confirm, computePenalty)
- [ ] Controller: `LeaseEarlyTerminationController` (`store`, `destroy`,
      `confirm`)
- [ ] FormRequest: `RequestEarlyTerminationRequest` (validation date,
      reason, role)
- [ ] Routes: `routes/api/leases.php` (3 routes nouvelles)
- [ ] Policy: `LeasePolicy@requestEarlyTermination`,
      `@cancelEarlyTermination`, `@confirmEarlyTermination`
- [ ] Job: `App\Jobs\Lease\ConfirmEarlyTerminationsJob` (daily)
- [ ] Schedule dans `routes/console.php` : `daily()->at('03:00')`
- [ ] Events: `LeaseEarlyTerminationRequested`, `…Cancelled`, `…Confirmed`
- [ ] Listeners: notifs aux parties prenantes (PreferenceResolver)
- [ ] Génération `Invoice` de pénalité (line item + lien lease)
- [ ] Tests: `EarlyTerminationServiceTest` (10+ scénarios — préavis,
      cap, idempotence, annulation post-paiement)
- [ ] Tests: `LeaseEarlyTerminationEndpointTest`
- [ ] Tests: `ConfirmEarlyTerminationsJobTest`
- [ ] UI: bouton + modale wizard
- [ ] UI: bandeau bail en résiliation + countdown
- [ ] UI: estimation live des pénalités
- [ ] UI: i18n fr/en/wo (`lease.early_termination.*`)
- [ ] UI: Tests Vitest (calcul live, validation préavis)

## Critères d'acceptation

- [ ] AC1 — `POST /leases/{id}/early-termination` avec `effective_date <
      today + notice_period_days` → 422 (`notice_period_too_short`)
- [ ] AC2 — Demande valide → 201, bail passe en `terminating`, invoice
      pénalité créée en `pending`
- [ ] AC3 — Tentative de double demande → 422 (`already_terminating`)
- [ ] AC4 — `DELETE` avant `effective_date` et invoice non payée → 200,
      bail revient à `active`
- [ ] AC5 — `DELETE` après paiement de la pénalité → 422 (`penalty_paid`)
- [ ] AC6 — Job `ConfirmEarlyTerminationsJob` au jour J du
      `effective_date` → bail passe en `terminated` si pénalité réglée
- [ ] AC7 — ActivityLog enregistre 3 events distincts (requested,
      cancelled, confirmed) avec properties détaillées
- [ ] AC8 — Frontend : la modale affiche la pénalité calculée en
      temps réel selon `effective_date`
- [ ] AC9 — Locataire reçoit notif email + in-app à chaque transition

## Hors périmètre

- Workflow de médiation / contestation de la pénalité (P3).
- Reversement de la caution lié à la résiliation anticipée — couvert par
  TCK-088.
- Génération automatique d'un PDF "lettre de résiliation" — peut être
  livré via TCK-077 (templates).
- Cas particulier "résiliation pour faute" sans pénalité (force majeure
  configurable plus tard).
- Pénalités progressives selon ancienneté (V1 = formule simple).

## Notes d'implémentation

_(à remplir par implementing-specs)_
