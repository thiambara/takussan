---
id: TCK-2679
title: "Les charges du bail : un terme imprimé au contrat, appelé par l'échéancier à côté du loyer, et compté dans ce que doit le locataire"
status: todo
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2643, TCK-2645, TCK-2649]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#15-leasepayment-"
tags: [back, leases, payments, contrat, audit-ux, app]
---

## Objectif utilisateur

Le locataire paie ce que son contrat dit : loyer **et** charges. Les charges qu'il a lues au contrat
sont appelées chaque mois à côté du loyer, entrent dans son total à régler, et le bailleur les voit
encaissées — sans saisie à la main par l'agence.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `properties.monthly_charges` existe (§ 1.1, TCK-598) ; **`leases` n'a aucune colonne de charges**.
- `LeasePaymentType::Charges` existe. Il a son reçu (`DocumentPdfController.php:108`, « Reçu de
  charges »), compte dans l'encaissé (`CollectedPayments.php:41`) et dans le reversement
  (`PayoutCalculator.php:55`). Seule la saisie manuelle en crée (`POST leases/{lease}/payments`,
  `LeasePaymentController.php:74` : loyer et caution y sont refusés, les charges acceptées).
- `LeaseService::scheduleUnderLock` (`:268-340`) n'écrit que des échéances `rent` (+ la caution).
- Les traitements qui filtrent sur `rent` : `LeaseExitScheduleService::rentDuesAfter` (`:116`),
  `LeaseRenewalService::overlappingRentDues` (`:331`), `RentReviewService` (`:161`),
  `ApplyLateFeesJob` (`:76`), `LateFeeCalculator` (`:88`), et le contrôle « échéancier déjà
  émis » de `scheduleUnderLock` (`:277`).
- `Lease::CONTRACT_PRINTED_TERMS` (`Lease.php:326`) et `CONTRACT_UNPRINTED_COLUMNS` couvrent
  `$fillable` exactement (`LeaseContractTermsTest`). Le contrat (`pdf/leases/contract.blade.php:102-105`)
  imprime le loyer, pas de charges.
- Le renouvellement recopie les termes imprimés un par un (`LeaseRenewalService.php:110-135`) et
  liste les termes renégociables (`RENEGOTIABLE_SIGNED_TERMS`, `:476`) et suivis (`diffChanges`, `:515`).

**À créer** :

- Migration : `leases.monthly_charges` `decimal(14,2)` nullable, sans défaut ; `down()` qui la retire.
- `Lease` : `monthly_charges` dans `$fillable`, cast `decimal:2`, **dans `CONTRACT_PRINTED_TERMS`**.
- FormRequests de création, de mise à jour et de renouvellement : `monthly_charges` `nullable|numeric|min:0`.
- `LeaseResource` : `monthly_charges`.
- Échéancier : pour chaque échéance de loyer écrite, **si `monthly_charges > 0`**, une échéance
  `charges` de même `due_date`, `period_start`, `period_end`, `payer_id`, `currency`, montant
  `monthly_charges × mois de la période`, statut `pending`.
- Contrat : une ligne « Charges mensuelles » sous « Loyer mensuel », **rendue seulement si la
  colonne est posée et non nulle**.

## Direction UX / Artistique

Sans objet (ticket API). Écrans servis : création du bail (TCK-2643), fiche du bail (TCK-2645),
« Paiements » du locataire (TCK-2650), page « Loyers » du bailleur (TCK-2651).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0042](../../../adr/0042-preuve-de-consentement-a-la-signature-du-bail.md) (amendement du 2026-11-10 — les charges sont un terme du bail), [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md) § 6 (décidé par le porteur le 2026-11-10, option b : dans ce lot).

- **Les baux existants ne changent pas.** Aucune échéance de charges n'est créée rétroactivement ;
  un bail signé garde son contrat (la ligne n'est pas imprimée tant que la colonne est nulle, donc
  l'empreinte d'un contrat figé reste la même et aucune signature ne tombe).
- **Terme imprimé** (ADR-0042 § 1) : modifié avant signature, il défige le contrat ; après, `PATCH`
  rend 422 `lease.terms_locked`.
- **Les charges suivent le loyer** dans :
  - la sortie anticipée : les échéances `charges` dont la période commence après la date de sortie
    sont traitées comme les loyers (même méthode, élargie aux deux types) ;
  - le renouvellement : `monthly_charges` passe du parent à l'enfant, est **renégociable**
    (`RENEGOTIABLE_SIGNED_TERMS`) et **suivi** (`diffChanges`) ; les échéances `charges` du parent
    qui chevauchent l'enfant sont traitées comme ses loyers ;
  - le contrôle « échéancier déjà émis », qui compte les deux types.
- **Les charges ne suivent PAS le loyer** dans : la pénalité de retard (`LateFeeCalculator`,
  `ApplyLateFeesJob` restent sur `rent`) ; la révision du loyer (`RentReviewService` reste sur `rent`).
- **Relances automatiques** (`SendLeasePaymentReminders`, J-3 / J+1 / J+7) : une échéance de charges
  impayée se relance comme un loyer ; une échéance de charges et une de loyer **de même date** partent
  dans **un seul** message (pas deux relances le même jour au même locataire).
- **Total du locataire** : les échéances `charges` échues ou dues entrent dans `total_due` de
  `GET /api/me/rent-summary` (TCK-2649), comme les loyers. Le paiement en ligne d'une échéance de
  charges suit la règle d'une échéance de loyer, sans pénalité.
- **Saisie manuelle** : `POST leases/{lease}/payments` continue d'accepter `charges` (régularisation
  ponctuelle), inchangé.
- Montant décimal en base, entier ×100 à la frontière du driver (principe 3 du dépôt).

## Delta à produire

- [ ] Migration `add_monthly_charges_to_leases_table` (up/down).
- [ ] Modèle, FormRequests (création, mise à jour, renouvellement), ressource.
- [ ] `CONTRACT_PRINTED_TERMS` + ligne du contrat conditionnelle.
- [ ] Échéancier : échéance `charges` par période ; contrôle d'existence sur les deux types.
- [ ] Sortie anticipée, renouvellement (copie, renégociation, chevauchement) élargis aux charges.
- [ ] Relances automatiques : charges relancées, fusionnées avec le loyer de même date.
- [ ] Tests :
  - `LeaseChargesScheduleTest` : bail mensuel à 150 000 F de charges sur 12 mois → 12 échéances `charges` de 150 000 F, mêmes dates que les loyers ; trimestriel → 450 000 F par échéance ; charges nulles → aucune échéance `charges` ;
  - `LeaseContractTermsTest` étendu (le test existant de parité `$fillable` reste vert) ;
  - contrat rendu : la ligne « Charges mensuelles » présente si posée, absente si nulle ; empreinte d'un contrat figé sans charges inchangée après la migration ;
  - `PATCH monthly_charges` sur un bail signé → 422 `lease.terms_locked` ; sur un bail en attente → contrat défigé ;
  - pénalité : une échéance de charges en retard ne reçoit aucune pénalité ;
  - sortie anticipée et renouvellement : charges traitées comme les loyers ;
  - relance : loyer et charges de même date → un seul envoi.

## Critères d'acceptation

- [ ] AC1 — Un bail créé avec `monthly_rent=500000` et `monthly_charges=150000`, activé, rend dans `GET /api/leases/{id}/payments` 12 lignes `rent` et 12 lignes `charges` (plus la caution) ; chaque `charges` a la `due_date` et la période de son loyer, et `amount=150000`.
- [ ] AC2 — Le PDF du contrat de ce bail contient « Charges mensuelles » et « 150 000 » ; celui d'un bail sans charges ne contient pas « Charges mensuelles ».
- [ ] AC3 — Un bail signé avant la migration garde la même `contract_sha256` après elle, et ses signatures comptent toujours.
- [ ] AC4 — Une échéance de charges en retard de 10 jours, sur un bail à 5 % de pénalité, garde `late_fee_amount` nul après `ApplyLateFeesJob`, alors que le loyer de même date en reçoit une.
- [ ] AC5 — Le locataire de AC1, sans rien payer après la première échéance échue, lit `total_due=650000` dans `GET /api/me/rent-summary` (avec TCK-2649).
- [ ] AC6 — `ApplyLateFeesJob`, `LateFeeCalculator` et `RentReviewService` ne sont pas modifiés par la PR (le diff le montre), et retirer l'élargissement de la sortie anticipée fait rougir son test (ablation).

## Hors périmètre

- La régularisation annuelle des charges (type `regularization`, saisi à la main) : inchangée.
- Les écrans (création du bail TCK-2643, fiche TCK-2645, pages TCK-2650 et TCK-2651) : ils lisent les champs posés ici.
- Créer des échéances de charges pour les baux déjà actifs.

## Notes d'implémentation

_(à remplir par implementing-specs)_
