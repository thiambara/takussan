---
id: TCK-2806
title: "Les derniers avis de section d'agence posent leur agence : récapitulatif des retards, doublon sans bail, et crédits"
status: todo
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#12-appnotification-"
tags: [back, notifications, multi-espaces, paiements, credits, suite-de-tck-2751]
---

## Objectif utilisateur

Le membre du personnel de plusieurs agences qui ouvre un avis « paiements » ou « crédits » arrive dans l'agence dont
parle l'avis. Il n'arrive plus dans celle de son profil actif.

## Contrat de données

**Origine.** Écart consigné par TCK-2751 (« Reste hors périmètre, relevé ») : deux émetteurs de `payments` adressés au
personnel ne posent pas `forAgency`.

**Constat, relu sur HEAD (`ebc494478`, fichiers sans modification locale) le 2026-11-14.** Tous les
`NotificationTarget::of(<section>)` de `app/` ont été relevés (les genres de `AgenceDeLaCible::SECTIONS`), ainsi que
les constructions par `fromArray`. Trois émissions de section partent sans agence, et non deux :

1. **`SendLeasePaymentReminders`, le récapitulatif des retards** (`LeasePaymentOverdueDigest`, l. 125-130) :
   `NotificationTarget::of('payments')`. Le récapitulatif est indexé par agent (`$digests[$agent->id]`) et cumule les
   échéances de TOUS les baux dont il est le contact principal. Un agent de deux agences reçoit un seul avis qui mêle
   les deux, et ce total ne correspond à aucune page `/app/payments`.
2. **`PaymentGatewayService::notifyDuplicatePayment`**, doublon d'un paiement sans bail (l. 1617-1619) :
   `NotificationTarget::of('payments')`, alors que l'agence est connue (`$agencyId = $this->paymentAgencyId(…)`)
   et que les destinataires en sont tirés.
3. **Relevé en plus : `CreditsGrantedNotification` et `CreditsExpiringNotification`** (`app/Notifications/Credits/`) :
   `NotificationTarget::fromArray(['kind' => 'credits'])`. Leur commentaire date d'avant l'ajout de `credits` à
   `NotificationTarget::PATHS`. La cible mène donc à `/app/credits`, sans agence. Les émetteurs
   (`WelcomeCreditService`, `CreditExpiryNotifier`) les adressent aux administrateurs d'une agence connue, dont ils
   passent le nom.

**Effet, lu dans `AgenceDeLaCible::porte()`** : une cible de section SANS agence stockée sort telle quelle, comme un
lien simple. Le lecteur ouvre la section de l'agence de son profil actif. C'est la régression que TCK-1761 avait
fermée pour les autres sections. Une section AVEC agence ne sort que vers un lecteur qui y tient un profil actif, et
devient sinon une ligne inerte.

## Contraintes strictes (métier)

- **Chaque avis de section adressé au personnel porte l'agence pour laquelle il est émis** (`forAgency`, TCK-1761).
  La porte de lecture d'`AgenceDeLaCible` ne change pas.
- **Le récapitulatif des retards se fait par agent ET par agence.** Un agent de deux agences reçoit deux
  récapitulatifs, chacun avec son compte, son total et son agence. Un bail sans agence (bailleur direct) ne produit
  pas de récapitulatif de section.
- La règle d'une émission par jour et par agent du récapitulatif devient une émission par jour, par agent et par
  agence. Le commentaire `TCK-NNN` de l'entrée du planificateur, qui dit l'idempotence, est mis à jour s'il la
  décrit.
- Les codes, les paramètres et les canaux des avis ne changent pas.
- Les lignes déjà émises ne sont pas reprises en base (même choix que TCK-2751).

## Delta à produire

- [x] `SendLeasePaymentReminders` : récapitulatif indexé par (agent, agence), cible `payments` posée par
  `forAgency($agence)`.
- [x] `PaymentGatewayService::notifyDuplicatePayment` : la cible `payments` du doublon sans bail porte `forAgency($agencyId)`.
- [x] `CreditsGrantedNotification` et `CreditsExpiringNotification` : la cible `credits` porte l'agence, que leurs
  émetteurs transmettent. Leur commentaire périmé « C11 » est réécrit.
- [x] Une garde de test énumère les émissions de section de `app/` et refuse toute émission sans `forAgency`, pour
  qu'un quatrième émetteur ne passe pas inaperçu.
- [x] Tests `AvisDeSectionPortentLeurAgenceTest`.

## Critères d'acceptation

- [x] AC1 — Un agent contact principal de deux baux en retard, dans deux agences A et B, reçoit deux
  `LeasePaymentOverdueDigest`. Chacun porte `target.agency_id` égal à son agence, et le compte et le total de cette
  seule agence. Le test vérifie les deux totaux, pas seulement le nombre d'avis.
  — *Preuve : `AvisDeSectionPortentLeurAgenceTest`::test_ac1_… (A : 2 échéances, 250 000 ; B : 1, 275 000 ; paramètres limités à `count`, `total`).*
- [x] AC2 — Un doublon de paiement sans bail de l'agence A : chaque administrateur notifié lit `target.agency_id = A`
  via `GET /api/notifications`, sous un profil actif dans A. — *Preuve : `test_ac2_…`.*
- [x] AC3 — Le même administrateur, sous un profil actif dans une autre agence uniquement (membre parti de A) : la
  ligne du doublon rend `target: null` (ligne inerte), et non un lien vers `/app/payments`. — *Preuve : `test_ac3_…`.*
- [x] AC4 — L'avis de crédits accordés et celui de crédits qui expirent portent l'agence du lot, lue de la même façon
  qu'en AC2. — *Preuve : `test_ac4_…`, par les émetteurs réels (`onSpaceCreated`, `sendNotices`).*
- [x] AC5 — La garde rougit sur une émission de section sans `forAgency` ajoutée à un fichier de `app/`.
  — *Preuve : `test_ac5_aucune_emission_…` (balayage de `app/` par jetons, ≥ 25 émissions vues) et
  `test_ac5_le_detecteur_rougit_…` (13 formes écrites, dont ternaire multiligne et genre non littéral).*
- [x] AC6 — Vérifié par ablation, une à la fois : `forAgency` retiré de chacun des trois émetteurs rend son AC rouge ;
  le récapitulatif ré-indexé par agent seul rend AC1 rouge. — *Preuve : 7 ablations, une à la fois, fichier restauré
  et md5 vérifié : digest sans agence → AC1 + AC5 ; clé par agent seul → AC1 ; bail sans agence admis → son test ;
  doublon sans agence → AC2, AC3, AC5 ; chaque avis de crédits sans agence → AC4 + AC5 ; détecteur sans contrôle
  du `forAgency` chaîné → AC5 (formes écrites).*

## Hors périmètre

- La reprise des avis déjà émis.
- Le cumul de devises différentes dans un même récapitulatif, s'il existe : à relever, pas à corriger ici.
- Les avis d'objet (bail, bien…), résolus à la lecture par TCK-2751.

## Notes d'implémentation

- **Clé du récapitulatif : `leases.agency_id`**, celle que filtrent les pages `/app/payments`
  (`LeasePayment`, l. 191 et 312). Un bail dont la seule agence est celle du bien n'a pas de récapitulatif.
  `SendLeasePaymentRemindersTest` (AC4 de TCK-588) pose donc l'agence de ses baux.
- **`agencyId:` n'est pas passé à `send()`** pour le récapitulatif : il choisirait l'intégration SMS/WhatsApp de
  l'agence. Les canaux ne changent pas (contrainte du ticket).
- **Constructeur des deux avis de crédits** : `int $agencyId` obligatoire, en dernier. Un émetteur qui l'oublie
  lève à la construction. Le préavis passe `$lot->agency_id`, pas `$agency?->id`, que la recherche peut rendre nul.
- **La garde** suit les jetons PHP, pas des lignes. Elle accepte `->forAgency(` chaîné à l'appel, ou une variable
  qui reçoit la cible puis appelle `->forAgency(` plus loin (`ErasedMemberPortfolio`). Un genre non littéral
  (`of($kind)`) doit aussi poser son agence. Un `fromArray($variable)` relit une cible stockée : ce n'est pas une émission.
- **Hors de portée de la garde, relevé :** `NotificationTarget::derive()` et `fromReferenceable()` déduisent à la
  lecture `payments`, `agency_kyc`, `finances` et `team` sans agence, pour les lignes anciennes et les classes sans
  cible. `porte()` les rend comme un lien simple.
