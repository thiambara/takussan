---
id: TCK-088
title: "Remboursement de la caution en fin de bail"
status: done
phase: P1
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-25
depends_on: [TCK-027, TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#14-lease-
tags: [back, front, lease, deposit]
---

## Objectif utilisateur

Permettre à un Agent ou Bailleur de rembourser tout ou partie de la caution
d'un Locataire à la clôture d'un bail, en justifiant les retenues
éventuelles (dégâts, impayés) avec pièces jointes, afin de tracer le solde
final et émettre la pièce comptable correspondante.

## Contrat de données

Le modèle `Lease` (§14) expose `deposit_amount` (caution déposée à la
signature). Ce ticket ajoute les colonnes :
`deposit_refunded_amount` (decimal, total remboursé), `deposit_refunded_at`
(timestamp), `deposit_refund_reason` (text nullable, justificatif de
retenue). La somme des montants retenus est dérivée :
`deposit_amount - deposit_refunded_amount`.

**Endpoints nouveaux** :

- `POST /api/leases/{lease}/deposit-refund` body
  `{ amount, reason?, attachments?: [media_ids] }`
  → crée la trace, génère un `Payout` (§28) outflow, crée optionnellement
  une `Invoice` de régularisation pour les retenues.
- `GET /api/leases/{lease}/deposit-refund` → retourne l'état du
  remboursement (montant, date, raison, justificatifs).

## Direction UX / Artistique

**Bandeau "Caution"** dans la fiche bail (TCK-044) — visible uniquement si
`status in [terminated, expired]`. Trois états visuels :

- `non remboursée` (orange) — montant initial encore intégralement présent.
- `partiellement remboursée` (jaune) — affiche le delta retenu et la
  raison.
- `intégralement remboursée` (vert) — coche + date.

**Modale "Rembourser la caution"** : champ montant pré-rempli au montant
restant, sélecteur multi-fichiers (pièces jointes via media-library —
photos de dégâts, factures de réparation), zone de texte motif libre
(obligatoire si `amount < deposit_remaining`). Confirmation forte avant
soumission. Affichage clair : "Vous remboursez X FCFA, vous retenez Y FCFA"
avec décomposition.

**Historique** : timeline en bas de la fiche bail listant les évènements
(signature, paiements, fin, remboursement caution) — cohérent avec
ActivityLog.

**Mots-clés d'ambiance** : transparence, sérénité, traçabilité — pas
d'urgence ni d'alarme.

## Contraintes strictes (métier)

- **Statut bail requis** : le remboursement n'est possible que si
  `lease.status in [terminated, expired]`. 422 sinon.
- **Montant max** : `amount <= deposit_amount - deposit_refunded_amount`.
  422 si dépassement.
- **Justificatif obligatoire** : si `amount < deposit_remaining`, le champ
  `reason` est requis. 422 sinon.
- **Idempotence sur remboursement total** : une fois la caution intégralement
  remboursée, le endpoint répond 422 sur appel ultérieur.
- **Lien Payout** : chaque remboursement crée un `Payout` outflow lié au
  bail, en statut `pending` puis `completed` (selon flux comptable
  existant). Le `Payout.amount` correspond au montant remboursé au
  locataire (pas le retenu).
- **Invoice de retenue** : si `amount < deposit_remaining`, créer
  optionnellement une `Invoice` du delta retenu pour l'agence (line item
  "Retenue caution — <reason>").
- **Permissions** : `leases.refund_deposit` — réservé au rôle Agent
  / OwnerAgency. Le Locataire reçoit une notification mais ne peut pas
  déclencher.
- **Notification** : event `LeaseDepositRefunded` → notification email +
  in-app au locataire avec les pièces jointes accessibles.
- **ActivityLog** : entrée `event = deposit_refunded`
  `properties = {refunded, retained, reason}`.
- **Médias** : les pièces jointes utilisent `spatie/medialibrary` avec
  collection `lease_deposit_refund` (TCK-050).

## Delta à produire

- [ ] Migration: `add_deposit_refund_columns_to_leases`
      (`deposit_refunded_amount`, `deposit_refunded_at`,
      `deposit_refund_reason`)
- [ ] Service: `App\Services\Lease\DepositRefundService`
      (refund, invariant checks, payout creation, retention invoice)
- [ ] Controller: `App\Http\Controllers\Api\LeaseDepositRefundController`
      (`store`, `show`)
- [ ] FormRequest: `RefundDepositRequest` (validation montant, reason
      conditionnel, attachments optionnels)
- [ ] Routes: `routes/api/leases.php` étendue
- [ ] Policy: `LeasePolicy@refundDeposit`
- [ ] Event + Listener: `LeaseDepositRefunded` →
      `NotifyTenantOfDepositRefund`
- [ ] Media collection `lease_deposit_refund` enregistrée sur le modèle
      `Lease`
- [ ] Tests: `DepositRefundServiceTest` (8 scénarios — total, partiel,
      reason manquant, statut invalide, dépassement, idempotence)
- [ ] Tests: `LeaseDepositRefundEndpointTest` (201 + 422 + 403 + media
      attached)
- [ ] Tests: `LeaseDepositRefundNotificationTest`
- [ ] UI: bandeau "Caution" sur la fiche bail
- [ ] UI: modale de remboursement (montant + raison + upload multi-fichiers)
- [ ] UI: timeline historique étendue (évènement remboursement)
- [ ] UI: i18n fr/en/wo (`lease.deposit.*`)
- [ ] UI: Tests Vitest (modale validation conditionnelle)

## Critères d'acceptation

- [ ] AC1 — `POST /leases/{id}/deposit-refund` avec `amount =
      deposit_amount` et bail `terminated` → 201, `deposit_refunded_at` set
- [ ] AC2 — Même endpoint sur bail `active` → 422 (`status_invalid`)
- [ ] AC3 — `amount > deposit_remaining` → 422 (`amount_exceeds_remaining`)
- [ ] AC4 — `amount < deposit_remaining` sans `reason` → 422
      (`reason_required`)
- [ ] AC5 — Remboursement partiel crée un `Payout` outflow + une
      `Invoice` de retenue avec line item motif
- [ ] AC6 — Locataire reçoit une notification email avec pièces jointes
      téléchargeables
- [ ] AC7 — Frontend : bandeau caution affiche les 3 états distincts
      selon l'avancement du remboursement
- [ ] AC8 — Frontend : la modale impose le motif si l'utilisateur réduit
      le montant proposé

## Hors périmètre

- Calcul automatique des dégâts à partir de l'inventaire de sortie
  (TCK-076 fait l'inventaire ; un futur ticket lierait les deux).
- Litiges / médiation Agent ↔ Locataire (P3).
- Restitution multi-tranches étalées dans le temps (V1 = un seul
  remboursement, total ou partiel mais final).
- Calcul d'intérêts sur la caution (non pratiqué SN).
- Export comptable spécifique de l'opération (couvert par les exports
  globaux).

## Notes d'implémentation

- **Ancien endpoint TCK-027 supprimé** — `POST /api/leases/{id}/refund-deposit` (et
  `LeaseService::refundDeposit`) ne géraient qu'un remboursement total
  sans `amount` / `reason` / pièces jointes / Payout / Invoice. Remplacé
  par `POST/GET /api/leases/{id}/deposit-refund` côté
  `LeaseDepositRefundController` + `App\Services\Lease\DepositRefundService`.
  Les 3 tests originaux ont été portés sur le nouveau endpoint.
- **Idempotence** lue désormais via `deposit_remaining ≤ 0` (et non plus
  l'existence d'un `LeasePayment` de type `deposit_refund`) — autorise donc
  les remboursements partiels successifs jusqu'à épuisement.
- **Permission custom** `leases.refund_deposit` ajoutée hors du loop CRUD
  uniforme du seeder, avec `array_merge(...)` ciblé pour `agency_admin`,
  `agent` et `owner` (admin/super_admin obtiennent tout via `pluck`).
- **Politique d'autorisation** : `LeasePolicy@refundDeposit` combine
  `leases.refund_deposit` ET un check de scope (landlord_id / agency_id /
  admin). Le tenant lié au customer du bail est explicitement exclu —
  une notification email + in-app le tient au courant à la place.
- **Pièces jointes** : double chemin
  - `attachments[]` (IDs de média existants → re-labellisés `lease_deposit_refund`)
  - `uploads[]` (nouveaux fichiers multipart → ajoutés directement)
  Le frontend V1 utilise uniquement `uploads[]` côté modale, pour
  éviter le besoin d'une étape pré-upload.
- **JSON int vs float** : `assertJsonPath` faisait un strict-compare entre
  `500000` (PHP int post-`json_decode`) et `500000.0` (float PHP). Les
  tests d'endpoint utilisent désormais `assertEquals` sur la valeur lue
  du payload pour rester laxes sur le type numérique.
- **HttpException::getCode()** retourne 0 — les invariants 422 sont
  vérifiés via un helper `assertAborts422()` qui inspecte
  `getStatusCode()` au lieu d'`expectExceptionCode()`.
- **Build frontend** échoue actuellement sur `src/components/messages/ConversationInfoSheet.tsx`
  (TCK-085, ré-export `SheetTitle`/`SheetHeader`/`SheetDescription` manquant
  dans `ui/sheet.tsx`) — bug **pré-existant sur dev**, sans rapport avec
  TCK-088. À aiguiller vers TCK-078 ou un cleanup post-Vague 8.
- **Tests cumulés** : backend 1059 verts (+18 ciblés deposit refund),
  frontend 373 vitest verts (+5 ciblés deposit refund schema). Pint clean,
  ESLint 0 erreur sur les fichiers modifiés.
