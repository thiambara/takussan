---
id: TCK-2642
title: "Baux côté API : la file « À traiter » avec ses motifs, la recherche par locataire, les parties nommées et des capacités pour chaque geste"
status: done
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2644, TCK-2645]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#50-tenantonboardingchecklist-"
tags: [back, leases, audit-ux, app]
---

## Objectif utilisateur

L'agence ouvre « Baux » sur ce qui demande un geste aujourd'hui (signature qui traîne, préavis reçu, impayé, révision ouverte, caution à rendre, fin proche, entrée incomplète), chaque ligne nommant le locataire. La fiche ne montre que les gestes que l'appelant a le droit de faire.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** :

- `GET /api/leases` (`Lease::buildQuery`, `Lease.php:106-116`) :
  - filtres exacts : `property_id`, `tenant_id`, `landlord_id`, `agent_id`, `status`, `type`… ;
  - **pas de recherche** (`$requestSearchFields` absent), pas de plage sur `end_date`, aucun filtre « à traiter » ;
  - includes : `property`, `tenant`, `renewedFrom`, `renewals`. Ni `landlord` ni `agent` ;
  - aucun compte de retard par bail : le front le recompte (`LeaseDetail.tsx:94`).
- `LeaseResource` rend :
  - `abilities` : `renew`, `review_rent`, `record_payment`, `refund_deposit`, `request_early_termination`, `update` ;
  - ainsi que `can_sign_as`, `can_request_signature` et `can_activate_on_paper`.
  Quatre gestes du front suivent encore `user.roles` (`LeaseDetail.tsx:187, 228, 253, 378`) : ajouter un document, contrat PDF, libellé du préavis, laisser un avis.
- La révision (`PATCH /api/leases/{lease}/rent`) accepte `new_rent`, `reason` et `effective_date`, et applique un plafond (`rent_review_max_pct` du bail → agence → global). **Seul le locataire est prévenu** (`NotifyTenantOfRentReview`). Le plafond effectif n'est pas servi.
- Les entrées en attente vivent sur un endpoint à part : `GET /api/agencies/{agency}/tenant-onboarding-pending`, pour les checklists ouvertes depuis plus de 7 jours.

**À servir** (consommé par TCK-2644 et TCK-2645) :

- **`filter[a_traiter]=1`** et **`filter[motif]=<motif>`**. Chaque bail porte `attention[]`, une liste de `{motif, since, amount?, due_date?}`.
- **`GET /api/leases/summary`** : les comptes par onglet (`a_traiter`, `active`, `onboarding_pending`, `ended`, `draft`) et par motif, sous les mêmes portées que l'index.
- **`filter[search]`** : nom et téléphone du locataire, titre et référence du bien, référence du bail.
- **`filter[onboarding_pending]=1`** : le même ensemble que l'endpoint des entrées en attente, servi par le même code ([décision du porteur, famille 4 n° 3a](../../../qa/audit-ux-2026-11/04-patrimoine-et-location.md)).
- **Includes** `landlord` (nom, téléphone) et `agent` (nom). `tenant` porte le nom et le téléphone.
- **Résumé d'échéance** par bail : `next_due` (`{due_date, amount, status}`), `overdue_count`, `overdue_amount`.
- **`rent_review_cap_pct`** : le plafond effectif de révision.
- **Nouvelles clés d'`abilities`** : `add_document`, `download_contract`, `leave_review`, `give_notice`. Ce sont des gestes du locataire servis comme capacités.
- **Tris** : `sort=attention`, pour la file (danger d'abord, puis l'ancienneté). Un tri par défaut qui place les baux actifs avant les brouillons (P3 de l'audit).

## Contraintes strictes (métier)

**Règles de la file**, écrites dans la spec (cf. `spec-delta.md`) et calculées côté serveur. Le front ne les recalcule pas. Un bail est « à traiter » quand :

- `signature_pending` : il est `pending_signature` depuis **plus de 3 jours** ;
- `notice_received` : il est `terminating`, ou bien `early_termination_requested_at` est posé et non annulé ;
- `rent_late` : une échéance de loyer est échue, non payée, au-delà du délai de grâce ;
- `late_fee_unpaid` : `late_fee_outstanding > 0` sur une échéance payée ;
- `rent_review_open` : la date anniversaire est passée, et aucune révision n'a eu lieu depuis 12 mois ;
- `deposit_to_refund` : le bail est terminé ou expiré, et la caution encaissée moins la caution rendue est > 0 (TCK-2375) ;
- `ending_soon` : il est `active`, `end_date` tombe dans moins de 4 mois, et aucun renouvellement n'est en cours ;
- `onboarding_incomplete` : sa checklist d'entrée est ouverte depuis plus de 7 jours. C'est la règle de l'endpoint existant, réutilisée.

Autres contraintes :

- **Révision** : le bailleur est prévenu comme le locataire (in-app + e-mail, nouveau listener `NotifyLandlordOfRentReview`).
- **`download_contract`** : vrai pour toute partie qui peut `view` le bail, bailleur et personnel compris. L'endpoint `GET /api/leases/{lease}/contract/pdf` l'autorise déjà par `view` ; seul le front le refusait.
- **Recherche** : repli de casse et d'accents par `App\Support\CaseInsensitive` (pas de `lower()` nu sous `--locale=C`).
- **Confidentialité** : le téléphone du locataire n'est servi qu'aux appelants qui le lisent déjà sur la fiche (`LeasePolicy::view`, même projection).
- **Performance** : `attention`, `next_due` et `overdue_*` se calculent en lot. La liste de 30 baux a un nombre constant de requêtes.

## Delta à produire

- [ ] Service `App\Services\Lease\LeaseAttention`. Une méthode par motif, et une requête de filtre par motif.
- [ ] Filtres `a_traiter`, `motif`, `search` et `onboarding_pending`. Tri `attention`. Tri par défaut.
- [ ] Route `GET /api/leases/summary` → `LeaseSummaryController`.
- [ ] Includes `landlord` et `agent`. Champs `next_due`, `overdue_count`, `overdue_amount` et `rent_review_cap_pct`.
- [ ] Clés d'`abilities` `add_document`, `download_contract`, `leave_review` et `give_notice`, jugées par la policy.
- [ ] Listener `NotifyLandlordOfRentReview`.
- [ ] Tests :
  - `LeaseAttentionQueueTest` : un cas par motif. Une signature attendue depuis 2 jours est **absente**. Un bail qui ne coche rien est absent ;
  - `LeaseSearchTest` ;
  - `LeaseSummaryCountsTest` ;
  - `LeaseOnboardingPendingFilterTest` : même ensemble que l'endpoint dédié ;
  - `LeaseAbilitiesTest` : `download_contract` vrai pour le bailleur et l'admin ; `give_notice` vrai pour le seul locataire ;
  - `RentReviewNotifiesLandlordTest` ;
  - `LeaseIndexQueryCountTest`.

## Critères d'acceptation

- [ ] AC1 — Chacun des huit motifs a son test, qui met un bail dans la file. Le test rougit si l'on retire la condition du motif (vérifié par ablation sur deux motifs au moins).
- [ ] AC2 — Un bail `pending_signature` depuis 2 jours n'est pas dans la file. Depuis 4 jours, il y est, avec `since` = la date de la demande de signature.
- [ ] AC3 — `GET /api/leases?filter[search]=seck` rend le bail de « Mamadou SECK ». `filter[search]=LS-0DPA` rend le bail de cette référence.
- [ ] AC4 — Les comptes de `GET /api/leases/summary` égalent le `meta.total` de chaque filtre correspondant, pour l'admin et pour un agent.
- [ ] AC5 — `filter[onboarding_pending]=1` et `GET /api/agencies/{agency}/tenant-onboarding-pending` rendent les mêmes baux sur la démo.
- [ ] AC6 — Pour le bailleur du bail 80, `abilities.download_contract=true`, et `GET /api/leases/80/contract/pdf` rend 200.
- [ ] AC7 — Une révision acceptée crée une notification pour le bailleur et une pour le locataire.

## Hors périmètre

- Les écrans (TCK-2644, TCK-2645).
- La relance par WhatsApp : c'est un geste du front (TCK-2644) sur des endpoints existants.
- Le retrait de la page « Entrées en attente » du menu (coque, famille 3).
- Les conditions acceptées à la création (TCK-2643).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

**2026-11-11 — implémentation (back-patrimoine-2).**

- **Une règle par motif, en SQL** : `App\Services\Lease\LeaseAttention::since($motif)` rend une
  sous-requête scalaire corrélée — la date d'entrée dans la file, `NULL` hors motif. Le filtre
  (`since IS NOT NULL`), la ligne (`attention[]`, une requête pour la page), le résumé et le tri lisent
  cette seule écriture ; `LeaseAttentionQueueTest` tient la parité ligne ↔ filtre sur tout le jeu.
  Les règles existantes sont lues, pas recopiées : préavis = `Occupation::onNotice()` (TCK-2637),
  impayé = `CollectedPayments::leaseOwed()` + reste dû, pénalités = `lateFeesOutstanding()`, entrée
  en attente = `TenantOnboardingChecklist::scopePending()` (que l'endpoint dédié lit aussi désormais).
- **`deposit_to_refund`** : `DepositRemaining::sql()` est l'accesseur `deposit_remaining`
  (TCK-2375) en SQL, chaîne de renouvellements, ancêtre supprimé et retenue vivante compris ;
  `DepositRemainingParityTest` tient l'égalité. Sur la démo : 358 baux, 0 écart, 14 chaînes.
- **`rent_review_open`** se lit dans `activity_log` (`lease_rent_reviewed`, écrit par
  `RentReviewService`) : aucune colonne ne date la dernière révision. `since` = le dernier
  anniversaire.
- **`since` est une date calendaire** (ADR-0018 : `calendarDate()`), `due_date` aussi.
- **`onboarding_incomplete` et `filter[onboarding_pending]` sont servis au seul personnel** (et au
  super-admin) : la file est interne (TCK-378, le bailleur exclu de l'endpoint). Pour le bailleur, le
  motif n'existe pas — il n'entre ni dans `a_traiter`, ni dans les comptes.
- **Recherche** : la casse se replie par `CaseInsensitive` (au-delà de l'ASCII), **pas les accents**
  — le ticket les demandait, la décision reconduite d'ADR-0020 §2 l'emporte (`elodie` ne trouve pas
  `Élodie`). Le patron est celui de `BookingSearch` (TCK-2593).
- **`attention` et le résumé d'échéance sont des inclusions** (`include=attention`,
  `include=due_summary`, `InclusionLueParLeControleur`), jamais des champs de `fields[leases]` (voie
  écartée d'ADR-0021). `next_due` = la prochaine échéance **à venir** (aujourd'hui ou plus tard) ;
  ce qui est échu est dans `overdue_*`.
- **Téléphone du bailleur** (`include=landlord`) : au personnel de l'agence du bail et au bailleur
  lui-même ; le locataire lit son nom, pas son numéro (l'agence le sert). L'agent : nom seul.
- **Onglets** : `summary` compte par listes de statuts (`active` = `active,terminating` ;
  `ended` = `expired,terminated,renewed` ; `draft` = `draft,pending_signature`), sous la portée **et
  les paramètres** de la liste — `filter[search]` compris.
- **Tri par défaut changé** : `etat` (en cours, en signature, brouillon, expiré, résilié, renouvelé)
  puis `-created_at`. Passé à `defaultSort()` en `AllowedSort::custom` : un nom nu, spatie le prend
  pour une colonne (`order by "etat"` → erreur SQL, mesuré sur `ImpersonationReadSweepTest`).
  `sort=attention` passe par une jointure latérale (les huit `since` lus une fois par ligne) :
  11 s → 141 ms sur la démo.
- **`give_notice` et `leave_review`** sont lus sur la policy hors de `Gate::before` : ce sont des
  gestes de PARTIE, que le super-admin ne reçoit pas. `leave_review` reprend aussi le refus du dépôt
  « bien déjà noté » (avis retiré compris) : sinon la fiche offrait un geste que l'API refuse.
- **Mesure sur la démo (super-admin)** : 167 baux à traiter sur 358 (263 en cours), dont
  `late_fee_unpaid` 126 — de vieilles pénalités de 2024, y compris sur des baux expirés ou
  renouvelés. La règle du ticket est appliquée telle quelle ; le volume est à trancher par le porteur.

