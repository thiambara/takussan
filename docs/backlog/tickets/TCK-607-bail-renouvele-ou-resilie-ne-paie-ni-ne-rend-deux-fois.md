---
id: TCK-607
title: "Un bail renouvelé ou résilié ne rend pas deux fois la caution et ne facture plus : caution héritée, échéancier d'un bail résilié, loyer créé après la fin, garants d'un bail en vigueur (suites de TCK-594 H-1 et TCK-596 E11, m-n, n3)"
status: todo
phase: P1
family: back
estimate: L
wave: 74
created: 2026-10-08
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#27-guarantor-
tags: [back, bail, caution, renouvellement, resiliation, echeancier, garant, argent, securite]
---

# TCK-607 — Un bail renouvelé ou résilié ne rend pas deux fois et ne facture plus

## Objectif utilisateur

Un locataire n'est ni relancé ni pénalisé pour un bail résilié, ne se voit jamais rendre deux fois
sa caution, et le contrat qu'il a signé reste celui que l'agence affiche (garants compris).

## Contexte

Suites des contre-vérifications de **TCK-594** (passe 5, H-1) et de **TCK-596** (passes 2, 6, 7, 8),
classées hors périmètre par décision de session et consignées dans `FILE-D-ATTENTE.md` (13:15,
14:35, 15:37, 16:02, 17:00) et dans `pr-596.md` (« Reste hors de ce ticket »). verif-594 passe 5 :
H-1 « **mérite un ticket avant toute promotion** ».

**Re-mesure sur `839be671` (2026-10-08)** — chaque point tient :

1. **H-1 — la caution rendue est héritée au renouvellement (prouvé : 800 000 sortis pour une caution
   de 400 000).** `LeaseRenewalService::renew` reprend `$data['deposit_amount'] ?? $parent->deposit_amount`
   (`app/Services/Lease/LeaseRenewalService.php:119`) sans lire `deposit_refunded_amount` ni les
   restitutions vivantes ; `RENEWABLE_PARENT_STATUSES` contient `Expired` (`:52-55`), l'un des deux
   statuts où la caution se rend. Séquences de verif-594 passe 5 : `test_a5` (restitution totale du
   parent expiré, renouvellement 201, enfant résilié, seconde restitution 201) et `test_a6` (la
   restitution du parent attend son approbation, le renouvellement passe quand même).
2. **E11 — un bail résilié continue de facturer.** Ni `LeaseService::terminate`
   (`app/Services/Model/LeaseService.php:250-298`) ni la finalisation du préavis
   (`app/Services/Lease/EarlyTerminationService.php:218`) ne touchent l'échéancier ; seul le
   renouvellement annule les échéances (`LeaseRenewalService.php:254`). `ApplyLateFeesJob`
   (`app/Jobs/Lease/ApplyLateFeesJob.php:70-91`) et `SendLeasePaymentReminders::claim`
   (`app/Jobs/SendLeasePaymentReminders.php:120-124`) ne filtrent pas le statut du bail. Sonde E11
   (verif-596 passe 6) : `terminate 200 → terminated ; échéances {"late":5,"pending":6}` ; deux mois
   plus tard, le job pose des pénalités sur ce bail résilié.
3. **m-n — un loyer se crée et se solde après la fin d'un bail relevé.** `LeasePaymentService::create`
   (`app/Services/Model/LeasePaymentService.php:23-34`) ne lit ni le statut du bail ni sa fin.
   Atteint par `POST /api/payments` (`status: paid` accepté) et `POST /api/leases/{id}/payments` puis
   `mark-paid`. Sondes H1/H2 de verif-596 passe 8 : parent `renewed`, loyer de novembre → mois doublé
   `["2026-11"]` avec l'enfant.
4. **n3 — un garant se rattache à un bail en vigueur.** `LeaseController::attachGuarantor` et
   `detachGuarantor` (`app/Http/Controllers/Api/LeaseController.php:161`, `:230`) ne regardent pas le
   statut : `POST leases/{id}/guarantors` sur un bail **actif** → 201 (`test_l4`, verif-596 passe 2).
   La liste des garants diverge du contrat signé et figé.
5. **Garant d'un bail en préavis.** `GuarantorController::destroy`
   (`app/Http/Controllers/Api/GuarantorController.php:71`) refuse la suppression pour
   `pending_signature` et `active`, pas pour `terminating` — un bail encore en vigueur pendant le
   préavis (verif-596 passe 6, 204).
6. **Fichier orphelin.** `LeaseSignatureService::signOnPaper`
   (`app/Services/Lease/LeaseSignatureService.php:196`) écrit le contrat scanné sur le disque avant
   l'activation ; un 409 annule la ligne `media`, pas le fichier (lecture de code, verif-596 passe 6).

H-2 (une restitution lue comme dette du locataire) est **fermé** sur `dev` :
`AccountDeletionService::collectOpenObligations` et `CollectedPayments` passent par
`exceptDepositRefunds()`. Il ne fait pas partie de ce ticket.

## Décision du porteur

**H-1 — que devient la caution au renouvellement ?** Trois réponses justes ; une seule à retenir,
écrite en ADR (amendement d'[ADR-0039](../../adr/0039-les-sorties-d-argent.md)) avant le code :

- **(a)** refuser le renouvellement d'un bail dont la caution est rendue, ou dont une restitution est
  vivante (409) ;
- **(b)** faire naître l'enfant avec la caution **restante** (`deposit_amount − rendu − en cours`),
  et refuser (409) tant qu'une restitution attend son approbation ;
- **(c)** garder `deposit_amount` sur l'enfant, mais déduire du restituable de l'enfant ce qui a été
  rendu sur toute la chaîne.

*Recommandation de la session : (b)* — le contrat de l'enfant dit vrai sur la caution détenue, et le
cas d'une approbation en cours est fermé sans deviner. Les AC ci-dessous valent pour les trois.

**E11 — une échéance due AVANT la résiliation reste-t-elle due ?** Recommandation : oui (c'est une
dette du locataire, relancée et pénalisable) ; seules les échéances dont la période **commence après**
`terminated_at` sont annulées.

## Contraintes strictes (métier)

1. **Invariant de caution** : sur une chaîne de baux (parent, enfants), la somme des restitutions
   vivantes ou payées n'excède jamais la caution encaissée sur la chaîne. Il se juge sous le verrou de
   la ligne parent (piège PostgreSQL n°2), pas sur une instance liée.
2. **Toute voie qui fait passer un bail à `terminated`** (résiliation immédiate, fin de préavis) annule
   (`cancelled`, jamais supprimée) les échéances de loyer dont la période commence après la fin, dans
   la même transaction. Une échéance `paid` ou à checkout ouvert n'est pas annulée en silence : elle
   suit la règle du renouvellement (TCK-596, doublon à rembourser).
3. **Les jobs de relance et de pénalité** ne visent jamais une échéance `cancelled`, ni une échéance
   d'un bail `terminated` ou `renewed` dont la période commence après sa fin.
4. **Créer un loyer** dont la période commence après la `end_date` d'un bail `renewed`, `terminated`
   ou `expired` rend 409 `lease.period_after_end`, par les deux routes.
5. **Garants** : rattacher ou détacher un garant n'est possible que sur un bail `draft` ou
   `pending_signature` (le contrat n'est pas figé, ou se défige) ; ailleurs, 409
   `lease.guarantors_frozen`. Supprimer la fiche d'un garant rattaché à un bail `terminating` est
   refusé comme pour `active`.
6. Le fichier d'un contrat papier n'est écrit qu'après la validation de l'activation, ou supprimé si
   la transaction échoue.

## Delta à produire

- [ ] ADR : amendement d'ADR-0039 portant la décision H-1 (et la règle E11), avant le code.
- [ ] `LeaseRenewalService::renew` : la règle retenue, sous le verrou du parent (contrainte 1).
- [ ] `DepositRefundService` : le restituable de l'enfant tient compte de la chaîne si (c).
- [ ] `LeaseService::terminate` et `EarlyTerminationService` (finalisation) : annulation des échéances
      futures (contrainte 2), partagée avec le renouvellement plutôt que recopiée.
- [ ] `ApplyLateFeesJob`, `SendLeasePaymentReminders` : filtre du bail (contrainte 3).
- [ ] `LeasePaymentService::create` (et `PaymentStoreRequest` / la requête du bail) : contrainte 4.
- [ ] `LeaseController::attachGuarantor` / `detachGuarantor`, `GuarantorController::destroy` :
      contrainte 5 ; libellés d'erreur fr/en/wo côté front.
- [ ] `LeaseSignatureService::signOnPaper` : contrainte 6.
- [ ] Tests : `LeaseRenewalDepositChainTest`, `TerminatedLeaseScheduleTest`,
      `LeasePaymentAfterEndTest`, `LeaseGuarantorFreezeTest`, `PaperActivationFileTest`.

## Critères d'acceptation

- [ ] **AC1 (H-1, rouge sur `839be671`).** Rejeu de `test_a5` : bail `expired`, caution 400 000
      rendue et payée ; renouvellement ; enfant résilié ; **aucune** voie de l'API ne fait sortir plus
      de 400 000 sur la chaîne (selon la décision : 409 au renouvellement, ou enfant à caution 0 et
      restitution 422, ou restituable 0).
- [ ] **AC2 (H-1, approbation en cours).** Rejeu de `test_a6` : la restitution du parent attend son
      approbation ; le résultat respecte l'invariant (contrainte 1) quelle que soit l'issue de
      l'approbation (approuvée ou refusée).
- [ ] **AC3 (E11, rouge sur `839be671`).** Bail actif, 6 échéances futures ; `terminate` → les 6
      passent `cancelled` ; deux mois plus tard (`travel`), `ApplyLateFeesJob` et
      `SendLeasePaymentReminders` n'écrivent rien sur elles. Même assertion par la fin d'un préavis.
      Les échéances déjà échues avant la résiliation restent dues (décision E11).
- [ ] **AC4 (m-n).** Parent `renewed` dont la fin est coupée au 2026-10-08 : `POST /api/payments`
      (`status: paid`, loyer de novembre) → 409 `lease.period_after_end` ; même code par
      `POST /api/leases/{parent}/payments`. Un loyer d'octobre sur le même parent → 201.
- [ ] **AC5 (n3, rouge sur `839be671`).** `POST leases/{id}/guarantors` sur un bail `active` → 409 ;
      sur un bail `draft` → 201. `DELETE leases/{id}/guarantors/{g}` sur un bail `active` → 409.
- [ ] **AC6 (préavis).** `DELETE guarantors/{g}` d'un garant rattaché à un bail `terminating` → 422
      `guarantor.attached_to_open_lease`.
- [ ] **AC7.** Activation papier refusée (409) : aucun fichier nouveau sur le disque de la
      collection (`Storage::fake` compté avant et après).
- [ ] Chaque AC a son ablation rouge (garde retirée, ou verrou retiré pour AC1-AC2), consignée.

## Hors périmètre

- `refund_pending` et la part versée d'une échéance (TCK-608).
- La 2FA sur `terminate`, `force` et `signature-request` (TCK-609).
- Le bail résilié par un super-admin sans 2FA (TCK-609).

## Notes d'implémentation

_(à remplir par implementing-specs)_
