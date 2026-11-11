---
id: TCK-2649
title: "L'argent servi au locataire et au bailleur : un total dû pénalités comprises, le prochain loyer, l'échéancier pas encore émis, le reste à verser et le détail par bien"
status: done
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2679]
blocks: [TCK-2640, TCK-2641, TCK-2650, TCK-2651]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#101-ownerstatementsnapshot-"
tags: [back, payments, payouts, audit-ux, app]
---

## Objectif utilisateur

Le locataire lit un seul montant, « ce que vous devez », pénalités comprises, ainsi que la date du prochain loyer. Il ne lit jamais « à jour » quand l'agence n'a rien émis. Le bailleur lit « ce qui reste à vous verser » et la ligne de chacun de ses biens, sans faire de soustraction.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** :

- **Le locataire** :
  - lit `GET /api/payments/history`, deux fois (les dus sur 6 mois, puis l'historique) ;
  - chaque ligne porte `amount_due` (`PaymentGatewayService::amountDue`), qui inclut la pénalité **seulement si l'agence l'encaisse en ligne** ;
  - **une pénalité restant due sur un loyer payé n'entre dans aucun dû** (`CustomerPayments.tsx:31-33`) ;
  - **rien ne distingue « aucune échéance émise » de « tout est payé »** ;
  - la date du prochain loyer n'existe que sur `GET /api/dashboard/me` (`next_payment`).
- **Le relevé du bailleur** (`OwnerStatementService`, `GET /api/owner-statements`) :
  - rend `totals` (`gross`, `commission`, `fees`, `net`, `clawback`, `paid_out`), `properties[]` (`property_id`, `collected`, `commission`, `fees`, `net`), `lines`, `payouts`, `unpaid` et `late_fees_outstanding` ;
  - **aucun « reste à verser »** ;
  - `properties[]` ne nomme ni le bien, ni le locataire, ni l'état du mois ;
  - aucun prochain versement.

**À servir** :

- **`GET /api/me/rent-summary`** → `TenantRentSummaryController`, pour le client connecté qui a au moins un bail :
  - `total_due` : le restant des échéances de loyer **et de charges** (`rent`, `charges`, TCK-2679) échues ou dues **plus** les pénalités restant dues, y compris sur un loyer payé ;
  - `parts` : `{payable_online, payable_at_agency}`, dont la somme est `total_due` ;
  - `items[]` : ce qui compose le total, chaque pénalité étant une ligne nommée ;
  - `next_rent` : `{due_date, amount, lease_id}` ;
  - `schedule_state` : `none`, `up_to_date` ou `due` ;
  - `lease` : référence, loyer / mois, agence nommée et son téléphone ;
  - `offline_payment` : les moyens hors ligne de l'agence, la même donnée que `GET /api/pay/{jeton}` (TCK-2504).
- **Relevé du bailleur**, enrichi :
  - `totals.remaining_to_pay` ;
  - `next_payout` : `{scheduled_at, payment_method}`, le prochain reversement programmé de ce bailleur ;
  - `properties[]` gagne `title`, `tenant_name`, `expected_rent`, `month_status` (`paid`, `late`, `vacant` ou `partial`) et `days_late`.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md).
- **Pénalités dans le total** ([décision 8 du porteur](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10)) : elles sont **comptées dans `total_due`**. Ce qui ne se paie pas en ligne va dans `payable_at_agency`. C'est un amendement de §1.4 (« sinon la pénalité reste due et s'affiche à part »), cf. `spec-delta.md`.
- **Le montant encaissé en ligne ne change pas** :
  - le montant d'une échéance payée par la passerelle reste celui de TCK-593, figé à l'ouverture ;
  - `payable_online` est la somme de ces montants : il ne réinvente pas la règle, il appelle `amountDue` ;
  - aucune pénalité n'est encaissée en ligne contre le réglage de l'agence.
- **`schedule_state=none`** quand le client a un bail `active` sans aucune échéance de loyer. `up_to_date` exige au moins une échéance émise et aucun reste dû.
- **`remaining_to_pay`** :
  - il vaut `net − paid_out` sur la période, calculé dans `OwnerStatementService`, une seule fois ;
  - il est négatif s'il a été trop versé, et la ressource le rend tel quel. La reprise suit ADR-0039 ;
  - **le relevé figé (`OwnerStatementSnapshot`, TCK-2321) n'est pas réécrit** : le champ est ajouté au calcul vivant. Un relevé figé rend la valeur de son temps, ou ne rend pas le champ ; le choix est écrit dans la PR.
- **`properties[]`** : le nom du locataire n'est servi au bailleur que pour ses propres biens, avec la même projection que TCK-2637.
- **Une seule source** pour le reste à verser : la fiche bailleur (TCK-2640) et la page « Loyers » du bailleur (TCK-2651) lisent ce champ, jamais une soustraction côté front. Famille 6 (« Argent ») : même consigne.

## Delta à produire

- [ ] Route `GET /api/me/rent-summary` → `TenantRentSummaryController`, avec `App\Services\Payments\TenantRentSummary`.
- [ ] `OwnerStatementService` : `remaining_to_pay`, `next_payout`, `properties[]` enrichi. Exports PDF et CSV inchangés, ou enrichis de la même colonne.
- [ ] Tests :
  - `TenantRentSummaryTest` :
    - pénalités dues sur loyers payés comptées dans le total et dans `payable_at_agency` ;
    - agence qui encaisse en ligne : pénalité dans `payable_online` ;
    - bail sans échéance : `none` ;
    - tout payé : `up_to_date`, avec `next_rent` ;
    - `parts` qui somme `total_due` ;
  - `OwnerStatementRemainingTest` ;
  - `OwnerStatementPropertiesTest` ;
  - `OwnerStatementSnapshotUnchangedTest`.

## Critères d'acceptation

- [ ] AC1 — `locataire-f4` de l'audit (loyers payés, deux pénalités de 67 750 F dues, l'agence n'encaissant pas les pénalités en ligne) : `total_due=135500`, `payable_at_agency=135500`, `payable_online=0`, `schedule_state=due`.
- [ ] AC2 — `locataire-vrai` (bail actif à 500 000 F, aucune échéance) : `schedule_state=none` et `total_due=0`. Jamais `up_to_date`.
- [ ] AC3 — Pour toute échéance payable en ligne, `payable_online` égale la somme des `amount_due` que rend `GET /api/payments/history` pour les mêmes lignes. Test de parité, qui rougit si l'un change seul.
- [ ] AC4 — Pour owner1, novembre : `remaining_to_pay = net − paid_out` au centime. Chaque bien de `properties[]` porte son titre, son locataire et `month_status`.
- [ ] AC5 — Un relevé déjà envoyé (instantané) relu après une écriture garde ses totaux d'origine. Le rectificatif reste servi comme aujourd'hui.

## Hors périmètre

- Les écrans (TCK-2650, TCK-2651, TCK-2641).
- Le paiement en ligne des pénalités contre le réglage de l'agence.
- La vue argent de l'agence (famille 6).

## Notes d'implémentation

Implémenté le 2026-11-11 sur `feat/audit-ux-app-lot-1` (base `1095f480d`, après TCK-2679).

**Prémisse re-mesurée — tient.** Aucune route `me/rent-summary` ; `OwnerStatementService::statement()`
rendait `totals` sans reste à verser, `properties[]` = `{property_id, collected, commission, fees, net}`
des seuls biens qui avaient encaissé, aucun prochain versement.

**Locataire — `GET /api/me/rent-summary`** (`TenantRentSummaryController`, invocable, `auth:sanctum`,
toujours 200 ; `App\Services\Payments\TenantRentSummary`) :

- Toutes les fiches client du compte (une par agence), comme `DashboardTenantService`.
- `total_due` = reste dû des échéances `LeaseService::SCHEDULED_PERIOD_TYPES` (loyer **et** charges)
  dues au plus tard aujourd'hui (heure de Dakar, `OverdueInstalment::today()`), sur la règle
  `CollectedPayments::leaseOwed()`, **plus** toutes les pénalités restant dues
  (`CollectedPayments::lateFeesOutstanding()`, loyer payé compris). Ni caution, ni échéance à venir.
- `parts.payable_online` = Σ `PaymentGatewayService::amountDue()` des échéances qui passent la porte du
  lien de paiement (`isPayable` **et** un fournisseur actif) ; `payable_at_agency` = le reste. La règle
  d'encaissement des pénalités n'est pas réécrite : `amountDue` / `lateFeeIncluded` en décident.
- `items[]` : `{kind: rent|charges|late_fee, lease_payment_id, lease_id, payment_type, due_date,
  period_start, period_end, amount, currency, days_late, payable_online}` — codes, jamais de libellé.
- `next_rent` : `{lease_id, lease_payment_id, due_date, amount, charges_amount, currency, payable_online}`
  — le premier loyer dû APRÈS aujourd'hui ; `charges_amount` = les charges appelées le même jour sur le
  même bail, à part (le paiement en ligne d'une échéance ne règle qu'elle).
- `schedule_state` : `due` s'il reste quelque chose ; sinon `none` si un bail en cours n'a aucune
  échéance de loyer non annulée (une caution seule n'est pas un échéancier) ; sinon `up_to_date`.
  **Sans aucun bail : `null`** (et `lease: null`) — `none` dirait « bail sans échéancier ».
- `lease` : le premier bail en cours, sinon le plus récent — `id, reference_number, status,
  monthly_rent, monthly_charges, currency, property {id, title}, agency {id, name, phone}`.
- `offline_payment` : `App\Services\Payments\OfflinePaymentMeans::of($agency)`, **la même lecture**
  que `GET /api/pay/{jeton}` — `PublicPaymentLinkController::offlinePayment()` l'appelle désormais au
  lieu de sa copie (fichier partagé avec la voie argent de l'agence : seul ce bloc change). Servi
  toujours sur le résumé ; le lien le garde réservé à une échéance qui doit encore quelque chose.

**Bailleur — `OwnerStatementService`** :

- `totals.remaining_to_pay = round(net − paid_out, 2)`, calculé une fois
  (`OwnerStatementService::remainingToPay()`), négatif s'il a été trop versé.
- `next_payout` : `{id, scheduled_at, payment_method, status, net_amount}` du prochain reversement
  **au bailleur** encore à venir (`PayoutStatus::upcoming()`), même agence, le plus tôt programmé
  d'abord, un reversement sans date après ; `null` sinon. Lu au jour, quelle que soit la période.
- `properties[]` : les lignes d'avant **en tête, dans leur ordre, chiffres inchangés**, puis les biens
  du bailleur sans mouvement (ses biens de l'agence — sauf archivés avant la période —, les biens de
  ses baux qui courent sur la période, ceux qui ont une échéance de loyer dans la période), à zéro.
  `has_movements` les distingue. Chaque ligne gagne `title`, `tenant_name` (bail le plus récent qui
  court sur la période, en cours d'abord ; fin effective = sortie anticipée, sinon résiliation, sinon
  terme), `expected_rent` (Σ des échéances de loyer non annulées dues dans la période), `month_status`
  et `days_late` (le plus grand retard, `OverdueInstalment::daysLate`).
- **Confidentialité** : le relevé ne porte que les baux `landlord_id` = ce bailleur et ses biens, et ne
  s'ouvre qu'à lui et au personnel de l'agence (`OwnerStatementPolicy`, inchangée) — la projection de
  TCK-2637 (« un bailleur ne lit que le locataire de ses biens »). Test : un autre bailleur de la même
  agence n'y apparaît pas, ni son locataire.
- **ÉCART au ticket — deux états de plus, pris au vocabulaire de TCK-2637** (`current_month.status`) :
  ordre `paid` → `late` → `partial` → `due` → `none` → `vacant`. `due` = rien de versé, rien d'échu (le
  loyer de novembre lu le 3 novembre) ; `none` = un bail court mais aucune échéance de loyer dans la
  période. Sans eux, un loyer pas encore échu se lisait « payé » ou « en retard », et un bail sans
  échéancier « vacant ». Une échéance échue **partiellement payée** est `late` (le retard prime).
  Période annuelle : l'état se juge sur les échéances de l'année.
- **Exports** : le CSV ne lit que `lines` → inchangé. Le PDF n'imprime que les lignes `has_movements`
  (`?? true` pour un instantané d'avant) → inchangé ; mesuré sur le relevé de novembre d'un bailleur de
  démo (14 lignes dont 9 avec mouvement) : HTML du gabarit d'avant et d'après **identique octet pour
  octet** (md5 `237d4676…`).

**Relevé figé (`OwnerStatementSnapshot`, TCK-2321) — le choix pour la PR** :

- Un instantané écrit depuis porte `remaining_to_pay`, figé avec les autres totaux ; il ne garde ni
  `title`, ni `tenant_name`, ni `next_payout` (lus au jour, comme le nom du bailleur).
- Un instantané **d'avant** reçoit `remaining_to_pay` recomposé sur **ses** totaux (`net − paid_out`
  de l'envoi) : la valeur de son temps, et aucun faux rectificatif (sans cela, le champ absent se
  lisait 0 et faisait naître un écart). Il ne sert pas `expected_rent`/`month_status`/`days_late` :
  aucun état fabriqué après coup.
- Le rectificatif compare toujours tous les totaux : il porte désormais aussi l'écart de
  `remaining_to_pay`.

**Mesures sur la base de démo (lecture seule, 2026-11-11)** :

- AC1 — `locataire-f4` (user 78, bail LS-0DPA75TK) : `total_due=135500`, `payable_online=0`,
  `payable_at_agency=135500`, `schedule_state=due`, items = deux `late_fee` de 67 750. **Tient.**
- AC2 — `locataire-vrai` (user 88, bail LS-EC-IEJWXT) : `schedule_state=none`, `total_due=0`. **Tient.**
- AC4 — owner1 (agence 1), novembre : `net=10587140`, `paid_out=7469771`, `remaining_to_pay=3117369`
  = `net − paid_out` au centime ; chaque ligne porte titre, locataire (ou `null`) et `month_status`.
  ⚠ owner1 a ~60 biens « Property Test Filter » dans la base de démo (résidus d'une exécution de tests
  hors base de test, à l'évidence) : ils sortent en `vacant`, sans mouvement.
- AC3 et AC5 : mesurés en test (parité contre `GET /api/payments/history` ; instantané relu après
  écriture).

**Tests** (tous vérifiés par ablation, 18 règles, chacune rouge puis restaurée, md5 contrôlé) :
`tests/Feature/Payments/TenantRentSummaryTest.php` (12), `tests/Feature/Payout/OwnerStatementRemainingTest.php`
(2), `tests/Feature/Payout/OwnerStatementPropertiesTest.php` (5),
`tests/Feature/Payout/OwnerStatementSnapshotUnchangedTest.php` (2). Classes voisines rejouées vertes :
relevé, instantané, reversements, lien de paiement, balayages de routes (132 + 57 tests).

**TCK-2679 AC5 — mesuré ici** : bail 500 000 F + 150 000 F de charges + caution 1 000 000 F, échéancier
généré par `LeaseService::generateSchedule()`, rien payé après la première échéance échue →
`total_due=650000` (items `rent`, `charges` ; la caution n'y est pas ; `next_rent` = 1er décembre,
500 000 + `charges_amount` 150 000). Ablation : filtre ramené au seul loyer → `500000`, rouge.

**Suite** : TCK-2706 (le lien de paiement d'une relance fusionnée ne règle que le loyer).
