---
id: TCK-2661
title: "Commissions, côté API : payer avec date, moyen et référence, solder un agent, annuler avec motif, lire par agent"
status: done
phase: P1
family: back
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2662]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#85-commissionentry-"
tags: [back, commissions, adr-0049, audit-ux, app]
---

## Objectif utilisateur

L'admin solde ce qu'il doit à un agent en une fois et le prouve (date, moyen, référence) ; l'agent sait ce qu'on lui doit, ce qu'on lui a payé, et pourquoi une ligne a été annulée.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- `GET /api/commissions` (`CommissionEntryResource`) : `beneficiary_id`, `origin`, `base_amount`, `share_percent`, `amount`, `status` (due, paid, cancelled), `earned_at`, `paid_at`, `paid_by_id`, `cancelled_at`, `cancelled_by_id` ; `include=beneficiary,lease` (référence du bail seulement). **Ni bien, ni moyen, ni référence de paiement, ni motif d'annulation** : ces colonnes n'existent pas. Filtres : `status`, `beneficiary_id`, `lease_id`, `origin` ; aucune période. `meta.totals` par statut.
- `POST /api/commissions/{id}/mark-paid` et `…/cancel` : **aucun corps, aucune FormRequest**, `paid_at = now()` ; annulation sans motif. Journalisées par `Auditable`.
- Aucun agrégat par bénéficiaire, aucun solde groupé. `GET /api/export/commissions` exige `reports.export` (l'agent ne peut pas exporter ses lignes).
- Aucune notification au bénéficiaire quand une commission est payée.

## Contraintes strictes (métier)

- Autorisation inchangée : payer, solder et annuler exigent `payouts.approve` (`CommissionEntryPolicy`) ; l'agent ne lit que ses lignes, l'admin toutes (l'API tranche, ADR-0049).
- Seule une ligne `due` se paie ou s'annule ; un solde groupé est **atomique** (toutes les lignes ou aucune) et ne porte que sur un même bénéficiaire et une même agence.
- `paid_at` ≤ aujourd'hui (heure de Dakar) et ≥ `earned_at` ; moyen requis parmi `wave`, `orange_money`, `free_money`, `cash`, `bank_transfer` ; référence requise sauf pour `cash` (même règle de traçabilité que les décaissements, `features.md` § 1.5).
- Annulation : code de motif requis (`lease_terminated_before_move_in`, `wrong_beneficiary`, `wrong_rate_or_base`, `other`), texte requis si `other` (≤ 500) ; le motif est **visible du bénéficiaire**.
- ⚠ Le registre actuel (`CommissionsLedger`) appelle `mark-paid` et `cancel` **sans corps** : ce ticket ne se fusionne pas seul. Il part dans la même PR que TCK-2662, ou garde ses champs facultatifs jusqu'à TCK-2662 — jamais un `dev` où le bouton d'aujourd'hui rend 422.

## Delta à produire

- [ ] Migration `add_payment_and_cancel_details_to_commission_entries` : `payment_method`, `payment_reference` (100), `cancel_reason_code`, `cancel_reason` (500), tous nullables.
- [ ] `MarkCommissionPaidRequest` (`paid_at`, `payment_method`, `payment_reference`) et `CancelCommissionRequest` (`reason_code`, `reason`) branchées sur les routes existantes.
- [ ] `POST /api/commissions/settle` → `CommissionEntryController::settle`, `SettleCommissionsRequest` (`beneficiary_id`, `entry_ids[]` ≤ 100, `paid_at`, `payment_method`, `payment_reference`), via `CommissionLedgerService::settle` dans une transaction.
- [ ] `GET /api/commissions/summary?year=YYYY&month=YYYY-MM` → par bénéficiaire : `due_amount`, `due_count`, `oldest_due_earned_at`, `paid_month`, `paid_year`, `last_paid {at, method}` ; l'agent n'y voit que lui.
- [ ] Ressource : `payment_method`, `payment_reference`, `cancel_reason_code`, `cancel_reason` ; `include=lease.property` → `property {id, title, quarter}`.
- [ ] Filtres `filter[earned_from|earned_to|paid_from|paid_to]`.
- [ ] Notification `CommissionPaidNotification` (code `commission.paid`) au bénéficiaire : une seule par paiement ou par solde groupé, selon ses préférences de canal.
- [ ] `GET /api/export/commissions` s'ouvre au bénéficiaire pour ses seules lignes, sans `reports.export`.
- [ ] Tests : `CommissionMarkPaidDetailsTest`, `CommissionSettleTest`, `CommissionCancelReasonTest`, `CommissionSummaryTest`, `CommissionExportBeneficiaryTest`.

## Critères d'acceptation

- [ ] AC1 — `mark-paid` sans `payment_method` → 422 sur ce champ ; avec `cash` et sans référence → 200 ; avec `wave` et sans référence → 422.
- [ ] AC2 — Un solde de trois lignes dont une déjà payée → 422, et les deux autres restent `due` (état relu après l'appel).
- [ ] AC3 — Un solde de trois lignes dues → trois lignes `paid` avec la même date, le même moyen et la même référence, et **une** notification au bénéficiaire.
- [ ] AC4 — `cancel` sans `reason_code` → 422 ; avec `other` sans texte → 422 ; le bénéficiaire relit le code et le texte sur sa ligne.
- [ ] AC5 — Un agent qui appelle `summary` ne reçoit qu'une entrée, la sienne ; `settle` par un agent sans `payouts.approve` → 403.
- [ ] AC6 — `filter[paid_from]=2026-11-01` exclut une ligne payée le 31 octobre à 23:30 heure de Dakar.
- [ ] AC7 — L'agent exporte ses lignes et le fichier ne contient aucune ligne d'un autre bénéficiaire.

## Hors périmètre

- Le versement réel de la commission par Wave depuis l'écran (ambition de l'audit).
- La prévision « à venir » (approche C, non retenue).
- Les écrans (TCK-2662).

## Notes d'implémentation

**Prémisse re-mesurée (2026-11-11)** — conforme au « Contrat de données » : `mark-paid` et `cancel`
sans corps ni `FormRequest`, `paid_at = now()`, ni moyen, ni référence, ni motif, ni agrégat, ni
notification ; l'export des commissions exigeait `reports.export`. Le front
(`takussan-web/src/lib/queries/commissions.ts`) poste `{}` sur les deux routes.

**Transition jusqu'à TCK-2662 (décision du lead, 2026-11-11).** Le front d'aujourd'hui poste `{}` :
un corps **vide** garde exactement le comportement d'avant ce ticket — `mark-paid` paie à l'instant,
sans preuve ni notification ; `cancel` annule sans motif. Le trait
`App\Http\Requests\Api\Commissions\TransitionalEmptyBody` (`getInputSource()->count() === 0`) rend
`rules()` vide dans `MarkCommissionPaidRequest` et `CancelCommissionRequest`, et le contrôleur
reprend l'ancien chemin ; chaque usage porte « TCK-2661 — transition, retiré par TCK-2662 ».
L'autorisation n'est pas contournée (403 avant tout). Dès qu'un champ est posté, les règles
complètes s'appliquent. Gardé par `CommissionTransitionalEmptyBodyTest` (4 tests) ; les tests d'AC1
et d'AC4 postent donc un corps non vide. TCK-2662 porte dans son « Delta à produire » le retrait du
trait, de ses usages, de la branche du contrôleur et de ce test. Ce ticket se fusionne donc seul.

**Choix faits ici :**

- **`paid_at`** se saisit comme un jour de Dakar (`Y-m-d`), facultatif. Aujourd'hui (ou absent) →
  l'instant du geste ; un jour passé → le début de ce jour (comme la borne basse d'un filtre de date).
  Le contrôle « ≥ `earned_at` » se juge **au jour** : une ligne née à 10 h se paie le jour même
  (`after_or_equal` dans `MarkCommissionPaidRequest`, et sous verrou dans
  `CommissionLedgerService::settle` → 422 `commission.paid_before_earned`).
- **Moyens** : `PaymentMethod` restreint par `Rule::enum(...)->only(CommissionLedgerService::PAYMENT_METHODS)`
  — `card`, `check`, `mobile_money` refusés.
- **Solde groupé** : nouvelle `CommissionEntryPolicy::settle` (`payouts.approve` à l'agence du profil
  actif, jamais pour soi) déléguée par `SettleCommissionsRequest::authorize()` : 403 avant 422.
  Dans une transaction, lignes lues sous verrou par id croissant ; tout est jugé avant la première
  écriture : ligne introuvable, d'une autre agence ou d'un autre bénéficiaire → une seule 422
  `commission.settle_mismatch` (sans dire laquelle) ; une ligne non due → 422 `commission.not_due`.
  `entry_ids` ≤ 100, `distinct`. Ajouté aux deux listes de `ProtectedActions` comme `markPaid`
  (2FA d'agence et step-up).
- **Point par bénéficiaire** : `GET /api/commissions/summary` (`CommissionSummaryService`, deux
  requêtes : agrégats `FILTER` et `DISTINCT ON` pour le dernier paiement). Hors personnel, 403 avant
  la validation (nouvelle `CommissionEntryPolicy::viewAny`). `year` exige quatre chiffres
  (`date_format:Y` lisait « 26 »). Trié par `due_amount` décroissant. Les montants s'additionnent
  sans conversion de devise, comme `meta.totals`.
- **`include=lease.property`** : déclaré par `CommissionEntry::getAllowedQueryIncludes()` (et non
  `$requestLoadable`, qui ne nomme que des relations du modèle) ; le bien est rendu **sous `lease`**,
  `lease.property {id, title, quarter}`, `quarter` = `address.neighborhood` (chargé en une requête).
- **Notification** : code `commission.paid` (`NotificationCode::CommissionPaid`, pas de classe
  `Notification` : le dépôt émet par code, ADR-0032), paramètres `count` (pluriel) et `amount`
  (total). Une par geste, émise par le **contrôleur** après la transaction
  (`CommissionLedgerService::notifyPaid`) : `CommissionSeeder` rejoue `markPaid`/`cancel` par le
  service, et un seeder écrit ses notifications sans les envoyer (`AppNotificationSeeder`). Cible
  `commissions` → `/app/commissions`.
  **Écart accepté par le lead (2026-11-11), aligné sur `payout.processed` — « selon ses
  préférences de canal » n'est PAS tenu.** Comme
  `payout.processed`, le code n'a pas d'interrupteur (`preferenceEvent()` null) : mesuré dans
  `CodedNotification::via()`, cela donne la cloche + l'e-mail **toujours** (si le compte a un e-mail),
  jamais de push ni de canal mobile, et aucune préférence ne s'applique. Tenir la phrase demande un
  événement neuf (`commission_paid`) dans `PreferenceResolver::EVENTS` **et** dans la matrice des
  préférences du front — hors de ce ticket.
- **Export** : sans `reports.export`, le personnel exporte les commissions **bornées à ses propres
  lignes** — y compris qui lit toute l'agence au relevé. Les autres exports financiers restent fermés.
  `ExportReportingTypesTest::test_sans_reports_export_la_reponse_est_403` exclut désormais
  `commissions`. Aucune colonne ajoutée au fichier. Mesuré : le rôle système d'administrateur
  d'agence porte `reports.export` par défaut (`SystemRoleCapabilities::agencyAdmin()` →
  `Capability::agencyAssignable()`, qui n'exclut que `properties.moderate` et
  `reports.view_global`) ; seul un rôle personnalisé sans cette capacité tombe sur ses propres
  lignes — il prenait 403 avant ce ticket : rien n'est retiré à personne (accepté par le lead).
- Fuseau : `Africa/Dakar` est UTC+0 ; AC6 vérifie les bornes du jour, il ne peut pas éprouver un
  décalage horaire.

**Vérification par ablation** (36) : chaque règle retirée rougit son test — référence hors espèces,
liste des moyens, date future, date antérieure (requête et service, ce dernier au jour et non à
l'instant), début du jour, atomicité (transaction retirée et contrôle déplacé dans la boucle),
`not_due` et `settle_mismatch` (bénéficiaire, agence), les deux notifications du contrôleur et leur
absence par le service seul, policy `settle` (capacité, soi-même), délégation `authorize()` des
trois `FormRequest` (`mark-paid`, `cancel`, `settle`), step-up, `distinct`, motif exigé et `other`, motif
stocké et rendu, périmètre et tri du point, `viewAny`, bornage et ouverture de l'export, filtres
`paid_from` et `*_to` inclusif, `include=lease.property`, et les trois branches de la transition
(contrôleur, `mark-paid`, `cancel`). Le bornage de l'export aux lignes du
bénéficiaire ne rougit que le test de l'admin sans `reports.export` : pour un agent, `visibleTo` le
borne déjà (AC7 reste vert sans lui).

**Seeding** : `SeedingInvariantsTest` joué seul (346 s, charge 21-32) — 5 verts, 1 rouge
étranger à ce ticket : invariant `indisponibilite_sur_une_reservation_confirmee : 1` (réservations
et indisponibilités, que ce ticket ne touche pas). `SeedingJourneyTest`, `SeedingGrowthTest`,
`SeedingTextAndDeterminismTest`, `SeededAgentDirectoryTest` non joués (plus de 9 minutes sous
charge) : la CI les joue.
`docs/models-spec.md` n'est pas touché (compétence) : la phrase sur l'export, le point et le solde
groupé est pour `/sync-specs`, avec `features.md` § 15.
