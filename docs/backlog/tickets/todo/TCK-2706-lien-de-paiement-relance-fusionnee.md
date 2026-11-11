---
id: TCK-2706
title: "La relance fusionnée dit ce qu'elle annonce et son lien le règle : loyer et charges du même jour, nommés et payables"
status: todo
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2679]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
tags: [back, payments, leases, relances, audit-ux, app]
---

## Objectif utilisateur

Un locataire **sans compte** reçoit par SMS une relance qui annonce « votre loyer de 650 000 F » (loyer
500 000 + charges 150 000, même date). Il ouvre le lien du SMS et paie. Aujourd'hui, il ne règle que
500 000 : les charges restent dues, et la relance suivante les lui annonce de nouveau sans qu'il
comprenne pourquoi. Il doit pouvoir payer, par ce lien, exactement ce que le message lui annonce.

Le texte ment aussi par son mot : « Votre loyer de 650 000 F » annonce sous le seul mot « loyer » un
montant qui comprend les charges. Le locataire et le bailleur doivent lire « loyer et charges », avec le
détail des deux montants.

## Contrat de données

**Relevé sur `feat/audit-ux-app-lot-1` le 2026-11-11**, après TCK-2679 (`1095f480d`) :

- `SendLeasePaymentReminders::claim()` rend des **groupes** d'échéances (même bail, même `due_date`) ;
  le message porte le solde **cumulé** du groupe (`remaining($dues)`), loyer en tête.
- `notifyTenant()` (`app/Jobs/SendLeasePaymentReminders.php`) ne reçoit que `$dues[0]`, le loyer. Pour
  un locataire sans compte, le lien porteur est
  `LeasePaymentLinkService::urlFor($payment)` : **un lien = une échéance** (`lease_payment_links`).
- Le paiement ouvert par ce lien (`PublicPaymentLinkController`, `PaymentGatewayService::amountDue`)
  encaisse le reste dû de **cette seule échéance**.
- Un locataire **avec compte** n'est pas touché par le lien : sa cloche mène au bail, et
  `GET /api/me/rent-summary` (TCK-2649) lui montre loyer et charges comme deux lignes payables chacune.
  **Il l'est par le texte**, comme le sans-compte et le bailleur.
- **Les textes** (`takussan-api/lang/{fr,en,wo}/notifications.php`, groupe `lease_payment`) :
  `due_soon` et `overdue` (`body`, `body_link`, `sms`, `sms_link`) disent « Votre loyer de :amount » /
  « loyer de :amount » ; `overdue_landlord` « Le loyer de :amount de :tenant ». Depuis TCK-2679,
  `:amount` est le solde **cumulé** du groupe : le mot « loyer » couvre aussi les charges. Le
  récapitulatif d'agent (`overdue_digest`, « :count loyers en retard ») compte des échéances, charges
  comprises.

**À servir** :

- un lien de relance dont le paiement couvre toutes les échéances du groupe annoncé, ou un SMS qui
  n'annonce que ce que son lien règle — le choix est à trancher (voir « Contraintes ») ;
- quand le groupe porte loyer **et** charges, des textes qui les nomment tous deux, avec le détail
  des montants (variantes de clé, ou paramètres `:rent` / `:charges` en plus de `:amount`) ; un groupe
  de loyer seul garde le texte d'aujourd'hui.

## Contraintes strictes (métier)

- **Le montant annoncé et le montant encaissé sont égaux.** Jamais un SMS qui annonce plus que ce que
  son lien permet de payer.
- **Le montant encaissé en ligne reste celui de TCK-593**, figé à l'ouverture du paiement, et une
  pénalité ne s'encaisse en ligne que si l'agence l'a choisi (`late_fee_online_collection`).
- **Le lien reste stable entre deux relances** (TCK-602, ADR-0051 §1) : le même lien à chaque relance
  d'un même groupe ; il ne doit pas en naître un par message.
- **Décidé par le porteur le 2026-11-11 : voie 2, un SMS par échéance payable (la recommandation ; pas d'ADR).** Deux voies étaient ouvertes (une ADR si la première est
  retenue : elle change ce qu'un lien désigne) :
  1. **un lien de groupe** — le lien porte plusieurs échéances, le paiement les règle dans un ordre fixé
     (loyer d'abord), un paiement partiel s'impute comme le reste de TCK-593 ;
  2. **un SMS par échéance payable** — le groupe reste un seul message pour le compte (cloche) mais le
     SMS du sans-compte annonce le loyer et donne son lien, puis les charges et le leur. Plus simple,
     mais deux liens dans un SMS.

## Delta à produire

- [x] La voie retenue, dans `SendLeasePaymentReminders::notifyTenant()` et, pour la voie 1,
      `LeasePaymentLinkService` + le paiement par lien.
- [x] Les textes de `lease_payment.due_soon`, `.overdue` et `.overdue_landlord` (corps, lien, SMS) dans
      les trois langues — **`wo` = le texte français tel quel** (wolof en pause depuis le 2026-10-16) —
      et les paramètres que le job leur passe.
- [x] Tests :
  - `MergedReminderPayLinkTest` : bail à 500 000 + 150 000 de charges, sans compte, relance J+1 ; le
    paiement par le lien du SMS solde les deux échéances (voie 1) ou chaque lien solde la sienne et le
    SMS annonce les deux montants (voie 2) ;
  - le lien est le même à la relance J+7 ;
  - une échéance du groupe payée entre deux relances : le lien ne demande plus que le reste ;
  - `MergedReminderWordingTest` : groupe loyer + charges → texte « loyer et charges » avec les deux
    montants, au locataire (compte et sans compte) et au bailleur, en `fr`, `en` et `wo` ; groupe de
    loyer seul → texte inchangé, octet pour octet.

## Critères d'acceptation

- [x] AC1 — Locataire sans compte, loyer 500 000 + charges 150 000 dus le même jour, rien payé : la somme
      que le SMS annonce égale ce que le ou les liens du SMS permettent de payer, au franc près.
- [x] AC2 — Après un paiement par le lien du SMS de l'AC1, il ne reste rien de dû sur les deux
      échéances (voie 1), ou le reste est exactement l'échéance dont le lien n'a pas été suivi (voie 2).
- [x] AC3 — Le même lien est envoyé à la relance suivante du même groupe.
- [x] AC4 — Un locataire avec compte ne reçoit toujours aucun lien porteur.
- [x] AC5 — Quand la relance fusionne loyer et charges, son texte les nomme (« loyer et charges ») et
      détaille les deux montants (500 000 et 150 000, total 650 000), pour le locataire et pour le
      bailleur, dans le corps et dans le SMS, en `fr`, `en` et `wo` (`wo` = le texte français). Une
      relance de loyer seul garde son texte d'aujourd'hui.

## Hors périmètre

- Les textes du front (aucun ne rend ces relances : elles sont rendues par l'API).
- Le récapitulatif d'agent (`overdue_digest`) : il compte des échéances, sans dire de quel type.
- Le paiement en ligne des pénalités contre le réglage de l'agence.
- La page « Paiements » du locataire avec compte (TCK-2650).

## Notes d'implémentation

- **Voie 2, un lien par échéance.** `SendLeasePaymentReminders::detail()` passe `rent` et `charges` (soldes, `money`)
  quand le groupe porte des charges ; `notifyTenant()` reçoit tout le groupe. Pour le contact sans compte :
  `payment_url` = le lien du loyer (ou des charges seules), `charges_url` = celui des charges, **tous ou aucun** (si
  une échéance ne se paie pas en ligne, aucun lien ne part : jamais un montant annoncé sans son lien). Le lien reste
  celui de `LeasePaymentLinkService::urlFor()`, stable d'une relance à l'autre (TCK-602).
- **Textes** : `NotificationCode::variant($params)` rend `rent_charges` (loyer + charges) ou `charges` (charges
  seules), `null` sinon ; le rendu cherche `<surface>_<variante>[_link]` avant `<surface>[_link]`. Clés `title_`,
  `body_`, `body_…_link`, `sms_`, `sms_…_link` pour `due_soon` et `overdue`, `title_`, `body_`, `sms_` pour
  `overdue_landlord`, en fr/en (wo = fr). Un loyer seul garde son texte, octet pour octet (épinglé en toutes
  lettres). Un groupe qui porte autre chose que le loyer et les charges (régularisation, pénalité) ou deux échéances
  d'un même type garde le texte et le lien d'aujourd'hui : hors périmètre, l'écart reste le même qu'avant.
- **SMS** : la forme compacte « loyer X + charges Y = Z (bien) ». **Le nom du bien reste** dans les SMS fusionnés
  sans lien (décision de session du 2026-11-11) : un locataire ou un bailleur à plusieurs biens ne saurait plus de
  quel bien il s'agit. Prix mesuré : 3 segments avec un intitulé long (49 caractères ; `due_soon` 138, `overdue` 135,
  `overdue_landlord` 166 caractères UCS-2), 2 avec un intitulé court ; le SMS bailleur fusionné fait 3 segments même
  avec « Villa Ngor » (144). La variante à deux liens suit la règle des SMS à lien d'aujourd'hui (`sms_link`, sans le
  bien : la page du lien le nomme) et fait 3 segments avec le lien d'échantillon de `SmsSegmentsTest`, **4 avec des
  liens de longueur réelle**. Plafond déclaré à 3 (`MAX_SEGMENTS_FUSION`), motivé en tête de `SmsSegmentsTest`, pour
  la seule variante `rent_charges`, avec ou sans liens ; 2 partout ailleurs, charges seules comprises.
- **Trou préexistant, non corrigé ici** : `SmsSegmentsTest` mesure avec un lien d'échantillon de 33 caractères, alors
  qu'un vrai lien de paiement en fait 71 (`https://takussan.com/fr/pay/` + 43). Le SMS à UN lien de longueur réelle
  (`sms_link`, loyer seul) fait déjà 3 segments (135 caractères UCS-2) quand le test plafonne à 2.
- **WhatsApp** : hors fenêtre de 24 h, `CodedNotification::whatsappTemplateEvent()` rend `<code>.<variante>`, qui n'a
  pas de gabarit Meta : le canal retombe sur le SMS, plutôt que d'envoyer le gabarit du code (le total sous le mot
  « loyer », avec le seul lien du loyer). `WhatsappTemplateRegistryTest` exclut `charges_url` (`variantParams()`)
  de l'exigence « chaque lien est dans le gabarit », avec ce motif, et épingle le repli.
- **Garde du SMS reporté à la nuit** : `DeferredSmsGuard::forPayLinks()` (`pay_links`) — le SMS ne part que si ses
  deux liens servent encore. `charges_url` est un paramètre porteur (`bearerParams`) : retiré de tout envoi à un compte.
- **Tests** : `tests/Feature/Jobs/MergedReminderPayLinkTest.php` (9), `tests/Feature/Jobs/MergedReminderWordingTest.php`
  (4) ; `SmsSegmentsTest`, `WhatsappTemplateRegistryTest` et `NotificationParamTypesTest` (natures de `due_soon`)
  adaptés. Neuf ablations rouges, puis deux de plus pour le nom du bien rendu aux SMS fusionnés (le bien retiré du
  SMS bailleur `en` rougit `MergedReminderWordingTest`, qui exige « Villa Ngor » dans chaque corps et SMS fusionné ;
  la fusion sans lien replafonnée à 2 rougit `SmsSegmentsTest`).
- **« Hors périmètre » FAUX sur son premier point** : « aucun texte du front ne rend ces relances » est inexact. La
  cloche (`NotificationRow`) rend `notifications.codes.<code>` des messages du FRONT par `texteNotification.ts`, et
  ne retombe sur le `title`/`body` de l'API que pour un code inconnu. Sans miroir, le compte et le bailleur lisaient
  encore « Votre loyer de 650 000 » dans la cloche ; l'AC5 n'était donc pas tenue.
- **Cloche du front (fait, feu vert de session du 2026-11-11)** : `varianteDe()` dans `texteNotification.ts`, miroir de
  `NotificationCode::variant()` (les trois codes de relance ; `charges` montant → `charges`, + `rent` montant →
  `rent_charges`) : titre et corps se lisent sous `title_<variante>` / `body_<variante>` quand la clé existe. Douze
  clés par langue sous `notifications.codes.lease_payment.{due_soon,overdue,overdue_landlord}` (`title_rent_charges`,
  `body_rent_charges`, `title_charges`, `body_charges`), en fr/en, `wo` = le texte français accordé par `=1` (les
  règles de pluriel du wolof ne rangent pas 1 sous `one` : « 1 jours » sinon). La cloche ne porte pas de lien : pas
  de `_link` côté front. Test `NotificationRow.relance-fusionnee.tck-2706.test.tsx` (15) ; six ablations rouges
  (pas de variante ; titre resté au loyer ; `rent_charges` sans `rent` ; `charges` non-montant accepté ; `wo` en
  `one` ; variante hors des codes de relance).
- **`/sync-specs`** : `docs/features.md` § 1.4 / § 1.5 (relances fusionnées : textes et liens), `docs/models-spec.md`
  § 15 si les paramètres de notification y sont décrits.
