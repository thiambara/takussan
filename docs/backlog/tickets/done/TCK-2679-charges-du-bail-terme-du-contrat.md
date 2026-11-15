---
id: TCK-2679
title: "Les charges du bail : un terme imprimé au contrat, appelé par l'échéancier à côté du loyer, et compté dans ce que doit le locataire"
status: done
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2643, TCK-2645, TCK-2649, TCK-2706]
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

Implémenté le 2026-11-11 sur `feat/audit-ux-app-lot-1` (base `acfe73fb3`).

**Prémisse re-mesurée — tient**, à deux précisions près :

- `LeaseService` est `app/Services/Model/LeaseService.php` ; `ApplyLateFeesJob` est
  `app/Jobs/Lease/ApplyLateFeesJob.php`. Les lignes citées (`:277`, `:116`, `:331`, `:476`, `:515`,
  `Lease.php:326`, `contract.blade.php:102-105`, `LateFeeCalculator:88`, `ApplyLateFeesJob:76`,
  `RentReviewService:161`, `DocumentPdfController:108`, `CollectedPayments:41`, `PayoutCalculator:55`)
  correspondent.
- **Les relances relançaient déjà les charges** : `SendLeasePaymentReminders::claim()` n'exclut que la
  caution. Le delta réel est la **fusion** (une relance par bail et par date), pas l'inclusion.

**Ce qui est posé** :

- Migration `2026_11_11_120000_add_monthly_charges_to_leases_table` (`decimal(14,2)` nullable, sans
  défaut ; `down()` la retire). `Lease` : `$fillable`, cast `decimal:2`, `$queryFields`
  (`fields[leases]=monthly_charges`), `CONTRACT_PRINTED_TERMS`. Création, mise à jour (`PATCH`) et
  renouvellement : `nullable|numeric|min:0`. `LeaseResource` : `monthly_charges` (float ou `null`).
- `LeaseService::SCHEDULED_PERIOD_TYPES = [rent, charges]` — une seule source pour la sortie
  (`rentDuesAfter`) et le renouvellement (`overlappingRentDues`).
- Échéancier : une échéance `charges` par loyer écrit quand `monthly_charges > 0` (même `due_date`,
  période, payeur, devise ; `charges × mois`), sauf si une échéance de charges vivante commence déjà à
  cette période (`chargesAlreadyCalled`). La valeur rendue par `generateSchedule()` compte
  désormais aussi les échéances de charges (c'est le nombre de lignes écrites).
- Contrat : ligne « Charges mensuelles » sous le loyer, rendue si la colonne est posée **et > 0** (un `0`
  n'imprime rien, comme `null`).
- Renouvellement : `monthly_charges` hérité (`$data[…] ?? $parent`, comme les autres termes : `0` retire
  les charges, `null` laisse hériter), renégociable (`RENEGOTIABLE_SIGNED_TERMS`) et suivi (`diffChanges`).
- Relances : `claim()` rend des **groupes** (bail, date) ; chaque échéance est réservée sous son verrou,
  le groupe des réservées part dans une relance au solde cumulé, au locataire et au bailleur. Le
  récapitulatif d'agent compte toujours des **échéances** (`+= count($dues)`) : le compter par relance
  faisait rougir `SendLeasePaymentRemindersTest::ac4` (deux échéances d'un même bail, même date →
  attendu 3, rendu 2). Le loyer passe en tête du groupe.
- `ApplyLateFeesJob`, `LateFeeCalculator`, `RentReviewService` : **non modifiés** (AC6).

**Écarts et limites, à trancher par la session** :

- **Lien de paiement d'une relance fusionnée** : le lien porteur (`LeasePaymentLinkService`) vise UNE
  échéance — celle du loyer, en tête du groupe. Un locataire **sans compte** lit le total loyer + charges
  dans le SMS mais le lien ne règle que le loyer. Un lien qui couvre les deux est un autre chantier.
- **Textes** : « Votre loyer de :amount » annonce désormais le total charges comprises ; les textes ne
  sont pas changés (ni `lang/` de l'API, ni le front).
- **ÉCART au ticket — le contrôle « déjà émis » reste sur le seul loyer.** Le ticket demandait qu'il
  compte les deux types. Mesuré : ainsi élargi, il fait rougir
  `DepositInstalmentScheduleTest::test_l_echeance_de_caution_se_paie_en_ligne` — une échéance `charges`
  saisie à la main (régularisation, que la saisie accepte toujours) fait taire l'échéancier, qui n'écrit
  alors ni loyer ni caution : exactement le défaut que TCK-957 a fermé pour la caution. Le but du ticket
  (pas de double appel de charges) est tenu autrement : l'échéancier n'appelle pas les charges d'une
  période qui en a déjà une vivante. Deux tests le gardent (charges saisies à la main ; régénération
  après des loyers annulés un à un), chacun vérifié par ablation, plus l'ablation inverse (contrôle
  élargi aux deux types → rouge).
- **AC5** (`total_due` de `GET /api/me/rent-summary`) : la route est livrée par TCK-2649. **Mesuré
  dans TCK-2649 le 2026-11-11 — tient** : `TenantRentSummary` lit `LeaseService::SCHEDULED_PERIOD_TYPES` ;
  bail 500 000 F + 150 000 F de charges + caution 1 000 000 F, échéancier généré, rien payé après la
  première échéance échue → `total_due=650000` (items `rent` puis `charges`, caution hors total).
  Ablation (filtre ramené au seul loyer) → `500000`, rouge
  (`TenantRentSummaryTest::test_tck_2679_ac5_les_charges_echues_entrent_dans_le_total`). Non mesurable
  sur la base de démo : aucun bail n'y porte de charges.
- **Lien de paiement d'une relance fusionnée** : ticket de suivi TCK-2706.
- **AC2** est mesuré sur le HTML de la vraie vue `pdf.leases.contract` (comme `LeaseContractTermsTest`),
  pas sur les octets du PDF (flux compressés par dompdf).
- **AC3, mesure en plus du test** : le HTML du contrat de 5 baux de démo sans charges, rendu par le
  gabarit d'avant et par celui d'après, est **identique octet pour octet** (6865/6865, 6829/6829…). Une
  première écriture (directives indentées, commentaire sur sa ligne) laissait 17 octets d'espaces : les
  directives sont en colonne 0 et le commentaire sur la ligne du `@if`.

**Tests** : `tests/Feature/Lease/LeaseChargesScheduleTest.php` (15 tests) et
`tests/Feature/Api/LeaseContractTermsTest.php` (variante `monthly_charges` ajoutée ; le test de parité
`$fillable` reste vert). Ablations : voir le rapport de l'agent.
