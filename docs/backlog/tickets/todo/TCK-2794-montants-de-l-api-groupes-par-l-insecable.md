---
id: TCK-2794
title: "Les montants rendus par l'API (PDF, notifications) groupent par l'insécable U+00A0, comme l'écran"
status: todo
phase: P1
family: back
estimate: S
wave: 91
created: 2026-11-13
updated: 2026-11-14
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

- [x] `CurrencyFormatter::format()` : les groupes en U+00A0 en `fr` et `wo` (après `NumberFormatter`,
      seuls les groupes ; le repli `number_format` aussi). Un seul point de passage.
- [x] `NotificationRenderer::number()` : même règle (ou passer par le même point).
- [x] Les vues PDF qui groupent par `number_format(…, ' ')` : trancher (cf. Contexte) et suivre.
- [x] Tests : `tests/Unit/Services/CurrencyFormatterTest.php` épingle le caractère EXACT (il normalise
      aujourd'hui U+00A0, U+202F et U+2009, l. 106 : une épingle neuve, sans normalisation) ; relire les
      tests qui citent U+202F (`NotificationAmountsTest`, `CurrencyPdfRegressionTest`, `ReceiptPdfTest`,
      `DocumentPdfServiceTest`, `MergedReminderPayLinkTest`, `PaymentCheckoutReuseTest`…).

## Critères d'acceptation

- [x] AC1 — `CurrencyFormatter::format(1482166, XOF, 'fr')` rend exactement `1 482 166 F CFA`
      (U+00A0 ×3), de même en `wo` ; `en` inchangé. Une sortie en U+202F échoue.
- [x] AC2 — Une des sept notifications, rendue en `fr`, porte son montant en U+00A0 (test sur le texte
      rendu, pas sur le formateur).
- [x] AC3 — Une quittance PDF (`pdf/receipts/rent`) porte ses montants en U+00A0 (test sur le HTML
      rendu de la vue).
- [x] AC4 — `parse()` lit « 1 234,56 € » avec chacune des trois espaces.
- [x] AC5 — Le montant d'un SMS garde son encodage et sa longueur comptée (test existant ou neuf).

## Notes d'implémentation (2026-11-14)

**Prémisse re-mesurée** (ICU 78.3) : `NumberFormatter` rend U+202F en `fr`/`fr_SN`, et `wo` groupe par
un POINT (« 1.482.166,5 ») — pas par une espace.

**Un seul point de passage : `CurrencyFormatter::nombre($valeur, $langue, $min, $max)`** (statique). Il ne
change que le symbole de GROUPE d'ICU (`setSymbol(GROUPING_SEPARATOR_SYMBOL, U+00A0)`), et seulement
quand la langue groupe par une espace : `en` garde sa virgule, la virgule décimale et l'U+00A0 d'avant le
symbole ne bougent pas. `format()`, `NotificationRenderer::number()` (bornes ICU gardées : 0 à 3
décimales), `RadarActivationReminders::number()`, `ThresholdAlertTriggered` (ex-`Number::format`), le
taux de TVA de `pdf/invoices/default` et le `$number` de `pdf/leases/contract` y passent. Les sept
notifications et les six vues `@currency` n'ont pas bougé : elles lisent `format()`.

**Décisions prises ici (réversibles)** :

1. `wo` rend du `fr_SN` (dans `format()` ET `parse()`), comme le front (`lib/format.ts`, `wo: 'fr-SN'`) :
   c'est la seule façon de tenir AC1 « de même en `wo` », les données CLDR de `wo` groupant par un point.
2. Espace ordinaire des PDF (taux de TVA, pourcentages du bail) et de la relance du radar : même
   convention partout, U+00A0 (un pourcentage n'atteint pas 1 000, mais rien ne garde la règle sinon).
3. Restent hors du formateur, délibérément : `NotificationRenderer::money()` (paramètre brut stocké),
   `Favorite:83`, `OwnerStatementSnapshots:202` (signature), `PropertyLabels:402`, `RentReviewService:98`
   (pourcentage d'un message de validation, en `number_format` anglais — inchangé), `LeasePaymentLateFeeNotification`
   (`percent`, `Number::format` : un pourcentage), les drivers de paiement (aucun ne lit le formateur).

**Preuves** :

- AC1 — `CurrencyFormatterTest::test_tck2794_*` (fr, fr_SN, wo, wo_SN au caractère près ; `en` et USD inchangés).
- AC2 — `MontantsGroupesParLInsecableTest` : `LeaseDepositRefundNotification` rendue en `fr`, le message
  codé en `fr`/`wo`/`en`, le gabarit `payment_received`, l'alerte de seuil.
- AC3 — `ReceiptPdfTest::test_tck2794_la_quittance_groupe_ses_montants_par_l_insecable` (HTML brut, sans normalisation).
- AC4 — `CurrencyFormatterTest::test_tck2794_parse_lit_les_trois_espaces` (EUR, EUR en `wo`, XOF).
- AC5 — `MontantsGroupesParLInsecableTest::test_ac5_*` : même `isUnicode`, même `mb_strlen`, même nombre
  de segments qu'avec U+202F (l'U+00A0 d'avant « F CFA » rendait déjà le SMS UCS-2).
- Ablations : retirer `setSymbol` → 13 rouges (AC1-AC3, AC5, radar, seuil) ; retirer `wo → fr_SN` → 6
  rouges ; formateur saboté → `OwnerStatementTest` et `ExportControllerTest` (CSV) restent VERTS (ils ne
  passent pas par lui) ; une cellule du CSV du relevé passée par le formateur → `OwnerStatementTest`
  rouge (`'183000'` attendu, `'183 000'` rendu). Fichiers restaurés, md5 vérifiés.

## Hors périmètre

- Le front (fait par TCK-2714), et `format.number` de next-intl (TCK-2795).
- Les CSV d'export : ils écrivent des nombres bruts (à vérifier une fois).
