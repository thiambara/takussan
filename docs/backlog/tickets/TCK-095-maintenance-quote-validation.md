---
id: TCK-095
title: "Demande de devis maintenance + validation"
status: review
phase: P2
family: applicatif
estimate: M
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-030]
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
  models:
    - docs/models-spec.md#21-maintenancerequest-
tags: [back, front, maintenance]
---

## Objectif utilisateur

Permettre à un Agent / Bailleur de demander un devis chiffré au
prestataire avant d'autoriser une intervention de maintenance, et
au prestataire de soumettre son devis (montant + pièces jointes)
qui passe en validation explicite avant d'autoriser le démarrage
des travaux — garantir la traçabilité financière et l'accord du
payeur sur le coût.

## Contrat de données

Le statut `MaintenanceRequest.status` (spec §21) gagne 3 états
intermédiaires entre `created` et `in_progress` :
`quote_requested` → `quote_submitted` → `approved` (ou `rejected`).

**Champs additionnels** sur `MaintenanceRequest` (vérifier la spec —
sinon migration additive) :

- `quote_amount` (decimal nullable)
- `quote_currency` (string, default tenant currency)
- `quote_submitted_at` (timestamp)
- `quote_decision_at` (timestamp)
- `quote_decision_by_id` (FK users)
- `quote_rejection_reason` (text nullable)

**Endpoints** :

- `POST /api/maintenance-requests/{id}/request-quote` — agent/bailleur,
  passe `created` → `quote_requested` ; envoie notification au
  prestataire assigné.
- `POST /api/maintenance-requests/{id}/submit-quote` body
  `{ amount, currency, message?, attachments? }` — prestataire,
  passe `quote_requested` → `quote_submitted` ; attachments via
  medialibrary collection `quotes`.
- `POST /api/maintenance-requests/{id}/approve-quote` — agent/bailleur,
  passe `quote_submitted` → `approved` ; déclenche notification
  prestataire.
- `POST /api/maintenance-requests/{id}/reject-quote` body
  `{ reason }` — agent/bailleur, passe `quote_submitted` → `rejected`
  ; le prestataire peut soumettre un nouveau devis (retour à
  `quote_requested`).
- `POST /api/maintenance-requests/{id}/start` — passe
  `approved` → `in_progress` (gardé en garde-fou, déjà existant
  TCK-030, à étendre).

**Frontend** : timeline / stepper sur la fiche MaintenanceRequest
montrant les 5 jalons quote (created → quote_requested →
quote_submitted → approved → in_progress).

## Direction UX / Artistique

**Stepper visuel** sur la fiche maintenance : 5 étapes alignées
horizontalement (mobile : verticales). Étape courante en couleur
ambiance maintenance (orange/ambre), étapes franchies en vert,
étapes futures en gris.

**Card devis** : quand `quote_submitted`, encart proéminent au-dessus
de la timeline avec montant en gros, prestataire, message, pièces
jointes (preview thumbnails), et 2 actions principales :
"Approuver" (vert primary) / "Rejeter" (outline rouge). Modale de
rejet pour saisir le motif (textarea required, min 10 chars).

**Side-by-side de plusieurs devis** : si le prestataire a soumis
plusieurs devis successifs après rejets, afficher l'historique
complet en accordéon en dessous du devis courant ("Devis précédents
(2)" expandable).

**Notification toast** post-action : "Devis approuvé — prestataire
notifié" / "Devis rejeté".

## Contraintes strictes (métier)

- **Transitions FSM** — strictement linéaires, contrôlées par un
  service `MaintenanceQuoteWorkflow` :
  - `created` → `quote_requested` (request-quote)
  - `quote_requested` → `quote_submitted` (submit-quote)
  - `quote_submitted` → `approved` (approve-quote)
  - `quote_submitted` → `rejected` (reject-quote)
  - `rejected` → `quote_requested` (request-quote, nouveau cycle)
  - `approved` → `in_progress` (start)
  Toute autre tentative retourne 422 avec `error.code = INVALID_TRANSITION`.
- **Permissions** — `request-quote`, `approve-quote`, `reject-quote`
  réservés à agent/bailleur (policy `MaintenanceRequestPolicy`) ;
  `submit-quote` réservé au prestataire assigné.
- **Validation montant** — `quote_amount > 0`, max 8 chiffres avant
  la virgule, 2 décimales, devise validée contre la liste tenant.
- **Pièces jointes** — max 5 fichiers, 10 MB chacun, formats PDF /
  JPG / PNG / DOCX (validation FormRequest + medialibrary
  collection `quotes`).
- **Rejet motif obligatoire** — `reason` min 10 chars.
- **Historique** — toutes les transitions sont tracées via
  ActivityLog (`quote.requested`, `quote.submitted`, `quote.approved`,
  `quote.rejected`).
- **Notifications** — chaque transition envoie une AppNotification +
  email selon les préférences du destinataire (PreferenceResolver
  TCK-070) au prestataire / payeur concerné.
- **Pas de re-soumission silencieuse** — un nouveau cycle après
  rejet recrée une transition explicite (audit lisible).

## Delta à produire

- [ ] Migration `add_quote_fields_to_maintenance_requests` (amount, currency, submitted_at, decision_at, decision_by_id, rejection_reason)
- [ ] Enum `MaintenanceRequestStatus` étendu (quote_requested, quote_submitted, approved, rejected) — vérifier alignement spec §21
- [ ] Service `App\Services\Maintenance\MaintenanceQuoteWorkflow` (transitions FSM)
- [ ] Controller `MaintenanceQuoteController` (request, submit, approve, reject)
- [ ] Routes resourceful `maintenance-requests.quote.*` dans `routes/api/maintenance.php`
- [ ] FormRequests : `RequestQuoteRequest`, `SubmitQuoteRequest`, `ApproveQuoteRequest`, `RejectQuoteRequest`
- [ ] Policy `MaintenanceRequestPolicy` étendue (quote actions)
- [ ] Medialibrary collection `quotes` sur `MaintenanceRequest`
- [ ] Notifications : `MaintenanceQuoteRequestedNotification`, `QuoteSubmittedNotification`, `QuoteApprovedNotification`, `QuoteRejectedNotification`
- [ ] Tests `MaintenanceQuoteWorkflowTest` (toutes transitions valides + invalides)
- [ ] Tests `MaintenanceQuoteControllerTest` (permissions, validation, attachments)
- [ ] Page UI `/app/maintenance/{id}` — stepper + card devis + actions
- [ ] Composants `MaintenanceStepper`, `QuoteCard`, `QuoteRejectionModal`, `QuoteHistoryAccordion`
- [ ] i18n fr/en/wo (`maintenance.quote.*`)
- [ ] Tests Vitest stepper + actions

## Critères d'acceptation

- [ ] AC1 — `POST /maintenance-requests/{id}/request-quote` sur status `created` passe en `quote_requested` et notifie le prestataire
- [ ] AC2 — `POST /submit-quote` avec montant + pièces jointes attache les fichiers à la collection `quotes` et passe en `quote_submitted`
- [ ] AC3 — `POST /approve-quote` sur `quote_submitted` passe en `approved` et notifie le prestataire
- [ ] AC4 — `POST /reject-quote` sans `reason` ou < 10 chars renvoie 422
- [ ] AC5 — toute transition non autorisée renvoie 422 avec `error.code = INVALID_TRANSITION`
- [ ] AC6 — un prestataire ne peut pas approuver son propre devis (policy 403)
- [ ] AC7 — la fiche UI affiche le stepper avec l'étape courante en évidence et permet l'action contextuelle
- [ ] AC8 — l'historique des devis successifs (rejets puis re-soumission) est lisible dans l'accordéon

## Hors périmètre

- Comparaison multi-prestataires (plusieurs devis en parallèle) — un seul prestataire à la fois pour cette V2.
- Génération automatique de PDF de devis signé — utiliser TCK-077 si demandé séparément.
- Paiement direct du prestataire post-`completed` — workflow paiement séparé.
- Marketplace de prestataires (annuaire) — hors V2.

## Notes d'implémentation

_(à remplir par implementing-specs)_
