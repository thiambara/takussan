---
id: TCK-607
title: "Un bail renouvelé ou résilié ne rend pas deux fois la caution et ne facture plus : caution héritée, échéancier d'un bail résilié, loyer créé après la fin, garants d'un bail en vigueur (suites de TCK-594 H-1 et TCK-596 E11, m-n, n3)"
status: todo
phase: P1
family: back
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
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

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé** — 5 points sur 6 fermés par d'autres tickets ; reste les garants
d'un bail `active` (n3) et un reliquat de données d'E11. Estimation ramenée de L à M (S si le
reliquat se règle par une commande ponctuelle) ; le titre ne décrit plus que ce reste.

- **Fermés** : H-1 par TCK-2375 (`21043302e`, option (c) de fait, ADR-0039 amendé le 2026-10-25) ;
  E11 par TCK-1151 (`84c96f388`, `LeaseExitScheduleService::cancelAfterExit`) ; m-n par TCK-957
  (`4adcdecc3`) + TCK-1920 (`5e03a6a51`) ; garant en préavis par TCK-1716 (`2550707ba`) ; fichier
  orphelin par TCK-596 (`6ab5f4d98`), déjà fermé à la rédaction.
- **Reste** : reprise des baux `terminated` avant le 2026-10-21 (TCK-1151 n'a aucune migration de
  reprise : leurs échéances futures restent `pending`), **ou** filtre du statut du bail dans
  `ApplyLateFeesJob` / `SendLeasePaymentReminders` (contrainte 3) — seule la préproduction en porte.
- **Reste** : garde de `attachGuarantor` (`LeaseController.php:312`) / `detachGuarantor` (`:396`),
  sous le verrou déjà pris, + libellé (fr/en, wo = fr).
- **Décision attendue du porteur** — la contrainte 5 contredit ADR-0042 (amendement TCK-2316 : un
  enfant de renouvellement naît `active` et sans garant, « rattacher ensuite un garant […] défige son
  contrat »). Sur un bail `active`, le rattachement d'un garant est-il **(a)** interdit (409
  `lease.guarantors_frozen`, l'enfant ne pourra plus avoir de garant dans l'outil), **(b)** permis
  seulement sur un enfant de renouvellement sans garant, ou **(c)** permis partout et tracé comme
  avenant (contrat re-figé) ? ADR-0042 s'amende en conséquence.

## Objectif utilisateur

Un locataire n'est ni relancé ni pénalisé pour un bail résilié, ne se voit jamais rendre deux fois
sa caution, et le contrat qu'il a signé reste celui que l'agence affiche (garants compris).

## Contexte

Suites des contre-vérifications de **TCK-594** (passe 5, H-1) et de **TCK-596** (passes 2, 6, 7, 8),
classées hors périmètre par décision de session et consignées dans `FILE-D-ATTENTE.md` (13:15,
14:35, 15:37, 16:02, 17:00) et dans `pr-596.md` (« Reste hors de ce ticket »). verif-594 passe 5 :
H-1 « **mérite un ticket avant toute promotion** ».

**Re-mesure sur `839be671` (2026-10-08)** — chaque point tenait alors (lignes re-pointées le 2026-11-16 ;
points 1, 2, 3, 5, 6 fermés depuis, voir la re-vérification) :

1. **H-1 — la caution rendue est héritée au renouvellement (prouvé : 800 000 sortis pour une caution
   de 400 000).** `LeaseRenewalService::renew` reprend `$data['deposit_amount'] ?? $parent->deposit_amount`
   (`app/Services/Lease/LeaseRenewalService.php:133`) sans lire `deposit_refunded_amount` ni les
   restitutions vivantes ; `RENEWABLE_PARENT_STATUSES` contient `Expired` (`:57-60`), l'un des deux
   statuts où la caution se rend. Séquences de verif-594 passe 5 : `test_a5` (restitution totale du
   parent expiré, renouvellement 201, enfant résilié, seconde restitution 201) et `test_a6` (la
   restitution du parent attend son approbation, le renouvellement passe quand même). — **fermé par
   TCK-2375** (`21043302e`) : `Lease::getDepositRemainingAttribute` (`app/Models/Lease.php:580-589`)
   déduit le rendu de chaque ancêtre, `DepositRefundService` relit sous verrou ; gardé par
   `DepositRefundBoundedToCollectedTest`.
2. **E11 — un bail résilié continue de facturer.** Ni `LeaseService::terminate`
   (`app/Services/Model/LeaseService.php`, aujourd'hui `cancelAfterExit` en `:789`) ni la finalisation du préavis
   (`app/Services/Lease/EarlyTerminationService.php:224`) ne touchent l'échéancier ; seul le
   renouvellement annule les échéances (`LeaseRenewalService.php:291`). `ApplyLateFeesJob`
   (`app/Jobs/Lease/ApplyLateFeesJob.php:74-94`) et `SendLeasePaymentReminders::claim`
   (`app/Jobs/SendLeasePaymentReminders.php:179-206`) ne filtrent pas le statut du bail. Sonde E11
   (verif-596 passe 6) : `terminate 200 → terminated ; échéances {"late":5,"pending":6}` ; deux mois
   plus tard, le job pose des pénalités sur ce bail résilié. — **fermé par TCK-1151** (`84c96f388`)
   pour toute résiliation postérieure au 2026-10-21 ; reliquat : aucune reprise des baux résiliés
   avant, et les jobs ne lisent toujours pas le statut du bail.
3. **m-n — un loyer se crée et se solde après la fin d'un bail relevé.** `LeasePaymentService::create`
   (`app/Services/Model/LeasePaymentService.php:23-34`) ne lit ni le statut du bail ni sa fin.
   Atteint par `POST /api/leases/{id}/payments` puis `mark-paid` (et, jusqu'au 2026-10-18, par
   `POST /api/payments`, `status: paid` accepté — route retirée par TCK-940). Sondes H1/H2 de verif-596 passe 8 : parent `renewed`, loyer de novembre → mois doublé
   `["2026-11"]` avec l'enfant. — **fermé par TCK-957 + TCK-1920** : `LeasePaymentController.php:62-77`
   refuse un bail non `active|terminating` (422 `lease_payment.lease_not_active`) et le loyer par
   cette route (422 `lease_payment.type_from_schedule`).
4. **n3 — un garant se rattache à un bail en vigueur.** `LeaseController::attachGuarantor` et
   `detachGuarantor` (`app/Http/Controllers/Api/LeaseController.php:312`, `:396`) ne regardent pas le
   statut : `POST leases/{id}/guarantors` sur un bail **actif** → 201 (`test_l4`, verif-596 passe 2).
   La liste des garants diverge du contrat signé et figé.
5. **Garant d'un bail en préavis.** `GuarantorController::destroy`
   (`app/Http/Controllers/Api/GuarantorController.php:137`) refuse la suppression pour
   `pending_signature` et `active`, pas pour `terminating` — un bail encore en vigueur pendant le
   préavis (verif-596 passe 6, 204). — **fermé par TCK-1716** (`2550707ba`) : refus sur
   `Lease::OPEN_STATUSES`, 422 `guarantor.attached_to_open_lease`.
6. **Fichier orphelin.** `LeaseSignatureService::signOnPaper`
   (`app/Services/Lease/LeaseSignatureService.php:196`) écrit le contrat scanné sur le disque avant
   l'activation ; un 409 annule la ligne `media`, pas le fichier (lecture de code, verif-596 passe 6).
   — **caduc dès la rédaction** : corrigé par TCK-596 (`6ab5f4d98`, ancêtre de `839be671`) ; le média
   s'écrit après `completeActivation` (`LeaseSignatureService.php:262-267`).

H-2 (une restitution lue comme dette du locataire) est **fermé** sur `dev` :
`AccountDeletionService::collectOpenObligations` et `CollectedPayments` passent par
`exceptDepositRefunds()`. Il ne fait pas partie de ce ticket.

## Décision du porteur

> **H-1 tranché (c)** de fait par TCK-2375 et l'amendement d'ADR-0039 du 2026-10-25 (point 4).
>
> **n3 tranché (b) le 2026-11-16** (ADR-0042, amendement du 2026-11-16) : sur un bail `active`,
> rattacher un garant n'est permis **que sur un enfant de renouvellement qui n'a encore aucun
> garant** (ADR-0042, amendement TCK-2316) ; partout ailleurs sur un bail `active`, rattacher ou
> détacher rend 409 `lease.guarantors_frozen`. Hors `draft` et `pending_signature`, la contrainte 5
> vaut telle quelle (409).

**H-1 — que devient la caution au renouvellement ?** Trois réponses justes ; une seule à retenir,
écrite en ADR (amendement d'[ADR-0039](../../../adr/0039-les-sorties-d-argent.md)) avant le code :

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

- [x] ADR : amendement d'ADR-0039 portant la décision H-1 (et la règle E11), avant le code. (tenu par TCK-2375, relevé 2026-11-16)
- [x] `LeaseRenewalService::renew` : la règle retenue, sous le verrou du parent (contrainte 1). (tenu par TCK-2375, relevé 2026-11-16 — option (c) : `renew` recopie `deposit_amount` ; le verrou porte sur le bail restitué, pas sur la tête de chaîne, fenêtre quasi théorique)
- [x] `DepositRefundService` : le restituable de l'enfant tient compte de la chaîne si (c). (tenu par TCK-2375, relevé 2026-11-16)
- [x] `LeaseService::terminate` et `EarlyTerminationService` (finalisation) : annulation des échéances
      futures (contrainte 2), partagée avec le renouvellement plutôt que recopiée. — tenu par
      TCK-1151 pour le neuf ; la reprise des baux résiliés avant le 2026-10-21 est
      `lease:cancel-dues-after-exit` (action de déploiement).
- [x] `ApplyLateFeesJob`, `SendLeasePaymentReminders` : filtre du bail (contrainte 3).
- [x] `LeasePaymentService::create` (et `PaymentStoreRequest` / la requête du bail) : contrainte 4. (tenu par TCK-957 + TCK-1920, relevé 2026-11-16 — par un 422 au contrôleur, pas le 409 prévu)
- [x] `LeaseController::attachGuarantor` / `detachGuarantor`, `GuarantorController::destroy` :
      contrainte 5 ; libellés d'erreur fr/en/wo côté front. — `GuarantorController::destroy` tenu
      par TCK-1716 ; reste `attachGuarantor`/`detachGuarantor`, après la décision du porteur.
- [x] `LeaseSignatureService::signOnPaper` : contrainte 6. (tenu par TCK-596, relevé 2026-11-16)
- [x] Tests : `LeaseRenewalDepositChainTest`, `TerminatedLeaseScheduleTest`,
      `LeasePaymentAfterEndTest`, `LeaseGuarantorFreezeTest`, `PaperActivationFileTest`. (les
      points fermés ailleurs ont leurs tests sous d'autres noms, cités par AC ;
      `TerminatedLeaseScheduleTest` et `LeaseGuarantorFreezeTest` livrés ici)

## Critères d'acceptation

- [x] **AC1 (H-1, rouge sur `839be671`).** Rejeu de `test_a5` : bail `expired`, caution 400 000
      rendue et payée ; renouvellement ; enfant résilié ; **aucune** voie de l'API ne fait sortir plus
      de 400 000 sur la chaîne (selon la décision : 409 au renouvellement, ou enfant à caution 0 et
      restitution 422, ou restituable 0). (tenu par TCK-2375, relevé 2026-11-16 :
      `DepositRefundBoundedToCollectedTest.php:165`)
- [x] **AC2 (H-1, approbation en cours).** Rejeu de `test_a6` : la restitution du parent attend son
      approbation ; le résultat respecte l'invariant (contrainte 1) quelle que soit l'issue de
      l'approbation (approuvée ou refusée). (tenu par TCK-2375, relevé 2026-11-16 : restitution
      comptée dès la demande, `DepositRefundService.php:173-175`, rendue au refus, `PayoutService::releaseDeposit`)
- [x] **AC3 (E11, rouge sur `839be671`).** Bail actif, 6 échéances futures ; `terminate` → les 6
      passent `cancelled` ; deux mois plus tard (`travel`), `ApplyLateFeesJob` et
      `SendLeasePaymentReminders` n'écrivent rien sur elles. Même assertion par la fin d'un préavis.
      Les échéances déjà échues avant la résiliation restent dues (décision E11). (tenu par TCK-1151,
      relevé 2026-11-16 : `LeaseExitScheduleTest` — sauf baux résiliés avant le 2026-10-21)
- [x] **AC4 (m-n).** Parent `renewed` dont la fin est coupée au 2026-10-08 :
      `POST /api/leases/{parent}/payments` (loyer de novembre) → ~~409 `lease.period_after_end`~~ 422
      `lease_payment.lease_not_active` / `lease_payment.type_from_schedule`, et `mark-paid` sur une
      échéance annulée → 409 `lease_payment.cancelled`. *(La voie `POST /api/payments` de la version du
      2026-10-08 est retirée par TCK-940.)* Un loyer d'octobre sur le même parent → 201. (tenu par TCK-957 + TCK-1920, relevé 2026-11-16)
- [x] **AC5 (n3, rouge sur `839be671`).** `POST leases/{id}/guarantors` sur un bail `active` → 409 ;
      sur un bail `draft` → 201. `DELETE leases/{id}/guarantors/{g}` sur un bail `active` → 409.
- [x] **AC6 (préavis).** `DELETE guarantors/{g}` d'un garant rattaché à un bail `terminating` → 422
      `guarantor.attached_to_open_lease`. (tenu par TCK-1716, relevé 2026-11-16)
- [x] **AC7.** Activation papier refusée (409) : aucun fichier nouveau sur le disque de la
      collection (`Storage::fake` compté avant et après). (tenu par TCK-596, relevé 2026-11-16)
- [x] Chaque AC a son ablation rouge (garde retirée, ou verrou retiré pour AC1-AC2), consignée.

## Hors périmètre

- `refund_pending` et la part versée d'une échéance (TCK-608).
- La 2FA sur `terminate`, `force` et `signature-request` (TCK-609).
- Le bail résilié par un super-admin sans 2FA (TCK-609).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **n3, option (b)** : `LeaseController::abortUnlessGuarantorsEditable()` juge, sous le verrou de la
  ligne `leases` et le pivot relu, avant les refus `already_attached`/`max` : `draft` et
  `pending_signature` libres ; sur `active`, seul le **premier** garant d'un enfant de renouvellement
  passe (geste à usage unique) ; tout le reste 409 `lease.guarantors_frozen`, sans pivot ni fiche
  neuve. ADR-0042 amendé (dont la correction mesurée : un garant rattaché à un enfant `active` ne
  défige pas son contrat). Libellé par la prose de l'API (`lang/*/errors.php`, wo = fr) : le
  formulaire du front affiche la prose serveur, aucune clé front ajoutée.
- **AC5** : `tests/Feature/Lease/LeaseGuarantorFreezeTest.php` (13 tests) ; ablation de la garde → 9
  rouges, de la condition « aucun garant » → 1 rouge. Trois tests de `LeaseContractTermsTest` qui
  épinglaient 201/200 sur un bail actif attendent désormais 409 (le verrou est toujours pris).
- **Contrainte 3** : `LeasePayment::scopeWithinLeaseTerm()` — sans les loyers et charges
  (`SCHEDULED_PERIOD_TYPES`, comme `cancelAfterExit` ; une régularisation ou une indemnité reste
  relancée, testé et ablaté) dont la période
  commence après la sortie d'un bail `terminated` (date d'effet du préavis, à défaut le jour de
  `terminated_at`) ou `renewed` (`end_date`) ; lue par `ApplyLateFeesJob` et
  `SendLeasePaymentReminders::remindable()` (donc aussi `NextDueNotice`). Les échéances commencées au
  plus tard le jour de la sortie restent dues (décision E11). Ablation par job → 1 et 3 rouges.
- **Reliquat d'E11** : `lease:cancel-dues-after-exit {--dry-run}` (`LeaseExitScheduleService::repairAfterExit`)
  — sélection par état (tout `terminated`), une transaction verrouillée par bail, `--dry-run` = même
  passe dans une transaction annulée ; une échéance engagée est laissée et listée ; journal
  `lease_termination_schedule_cancelled` + `repair: TCK-607`. Idempotente (seconde passe : 0).
  Action : `docs/deploiement/actions/2026-11-16-annuler-les-echeances-des-baux-resilies.md`.
  Ablations : dry-run qui commite → 1 rouge ; engagée non épargnée → 1 rouge. Le `--dry-run` ne
  pousse rien en file et n'envoie rien (`Queue::fake`, `Notification::assertNothingSent`) ; les
  hooks de `LeasePayment` sur le passage à `cancelled` sont synchrones et inertes.
- Aucune migration.

