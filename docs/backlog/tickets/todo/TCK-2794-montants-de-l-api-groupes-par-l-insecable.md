---
id: TCK-2794
title: "Les montants rendus par l'API (PDF, notifications) groupent par l'insécable U+00A0, comme l'écran"
status: todo
phase: P1
family: back
estimate: S
wave: 91
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2714]
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  models: []
tags: [back, formatting, intl, montants, typographie, notifications, pdf, suite-de-tck-2714, decision-porteur]
---

## Objectif utilisateur

Un bailleur, un locataire ou un agent lit le même « 1 482 166 F CFA » sur l'écran, dans la notification
qu'il reçoit et sur la quittance ou la facture PDF : les groupes de milliers séparés par la même espace,
lisible au téléphone.

## Contexte

TCK-2714 (décision n° 11 (a) du porteur, validée le 2026-11-11) a porté les groupes de milliers du front
sur l'espace insécable de pleine largeur U+00A0 : l'espace fine U+202F d'`Intl`, que DM Sans dessine à
0,133 em, rendait « 1 482 166 » illisible au téléphone. La décision nomme les PDF et les CSV comme la
référence de largeur.

**L'API, elle, groupe encore en U+202F** (relevé du 2026-11-13, base a78c5752e) :
`App\Services\Formatting\CurrencyFormatter::format()` passe par `NumberFormatter` d'ICU en `fr`, qui rend
U+202F, et son repli `number_format(…, ',', "\u{202F}")` l'écrit en dur. Le front déclarait la directive
Blade `@currency` « au même contrat » (`takussan-web/src/lib/format/currency.ts`) : ce n'est plus vrai pour
les groupes depuis TCK-2714 — la phrase y est corrigée et renvoie ici.

**Ce qui lit `CurrencyFormatter`** (relevé du 2026-11-13) :

- la directive `@currency` (`App\Support\Blade\CurrencyDirective`), dans six vues PDF :
  `pdf/receipts/booking.blade.php` (2), `pdf/receipts/rent.blade.php` (4),
  `pdf/invoices/default.blade.php` (6), `pdf/statements/owner.blade.php` (14),
  `pdf/leases/contract.blade.php` (4), `pdf/maintenance/quote.blade.php` (3) ;
- sept notifications : `SavedSearchMatchesNotification`, `InvoiceOverdueReminderNotification`,
  `LeasePaymentLateFeeNotification`, `FavoriteChangesNotification`, `LeaseDepositRefundNotification`,
  `LeaseEarlyTerminationNotification`, `LeaseRentReviewedNotification` ;
- `App\Services\Notifications\NotificationRenderer` (les montants de tout message rendu dans la langue du
  destinataire, l. 269), et sa méthode `number()` (l. 384-389, `NumberFormatter` nu : le montant de
  `payment_received`).

**À l'inverse, déjà en espace ordinaire** : `pdf/invoices/default.blade.php:129` (taux de TVA) et
`pdf/leases/contract.blade.php:31` (`number_format(…, ',', ' ')`), `RadarActivationReminders:327`. Une
espace ORDINAIRE est sécable : à trancher ici aussi (même convention partout, ou l'ordinaire gardée là où
le PDF ne coupe jamais).

## Contrat de données

Aucun endpoint, aucune donnée, aucune clé neuve. Le montant reste un nombre en base et dans tout JSON
(principe n° 3) ; le séparateur n'existe que dans le TEXTE rendu (PDF, notification, SMS, courriel).

## Contraintes strictes (métier)

- **Seuls les groupes de milliers changent** : l'espace avant le symbole (déjà U+00A0) et la place du
  symbole (USD devant) restent ; l'anglais (« 1,482,166 ») ne change pas.
- **Insécable, toujours** : jamais U+0020 entre deux groupes d'un montant (un SMS ou un PDF ne coupe pas
  un montant en deux lignes).
- **`CurrencyFormatter::parse()` lit les trois espaces** (U+202F, U+00A0, U+0020) comme groupes : un
  montant venu d'un ancien PDF ou d'un SMS se relit comme aujourd'hui.
- **Le SMS compte ses caractères** (`SMS_TEXT_MAX`) : U+00A0 et U+202F sont tous deux hors GSM-7 —
  vérifier que le passage ne change ni l'encodage ni la longueur comptée.

## Delta à produire

- [ ] `CurrencyFormatter::format()` : les groupes en U+00A0 en `fr` et `wo` (après `NumberFormatter`,
      seuls les groupes ; le repli `number_format` aussi). Un seul point de passage.
- [ ] `NotificationRenderer::number()` : même règle (ou passer par le même point).
- [ ] Les vues PDF qui groupent par `number_format(…, ' ')` : trancher (cf. Contexte) et suivre.
- [ ] Tests : `tests/Unit/Services/CurrencyFormatterTest.php` épingle le caractère EXACT (il normalise
      aujourd'hui U+00A0, U+202F et U+2009, l. 106 : une épingle neuve, sans normalisation) ; relire les
      tests qui citent U+202F (`NotificationAmountsTest`, `CurrencyPdfRegressionTest`, `ReceiptPdfTest`,
      `DocumentPdfServiceTest`, `MergedReminderPayLinkTest`, `PaymentCheckoutReuseTest`…).

## Critères d'acceptation

- [ ] AC1 — `CurrencyFormatter::format(1482166, XOF, 'fr')` rend exactement `1 482 166 F CFA`
      (U+00A0 ×3), de même en `wo` ; `en` inchangé. Une sortie en U+202F échoue.
- [ ] AC2 — Une des sept notifications, rendue en `fr`, porte son montant en U+00A0 (test sur le texte
      rendu, pas sur le formateur).
- [ ] AC3 — Une quittance PDF (`pdf/receipts/rent`) porte ses montants en U+00A0 (test sur le HTML
      rendu de la vue).
- [ ] AC4 — `parse()` lit « 1 234,56 € » avec chacune des trois espaces.
- [ ] AC5 — Le montant d'un SMS garde son encodage et sa longueur comptée (test existant ou neuf).

## Hors périmètre

- Le front (fait par TCK-2714), et `format.number` de next-intl (TCK-2795).
- Les CSV d'export : ils écrivent des nombres bruts (à vérifier une fois).
