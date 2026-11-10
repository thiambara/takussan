---
id: TCK-2649
title: "L'argent servi au locataire et au bailleur : un total dû pénalités comprises, le prochain loyer, l'échéancier pas encore émis, le reste à verser et le détail par bien"
status: todo
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
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

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
