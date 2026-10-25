---
id: TCK-2325
title: "Les courriels et SMS des classes historiques écrivent leurs dates par le formateur du rendu, et la cloche les écrit de même"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-128--dates-des-charges-utiles-de-notification-et-leur-lecture-par-le-front"
tags: [api, front, notifications, i18n, dates, pistes]
---

## Objectif

Les sept classes de notification sans code écrivent leurs dates comme les codes : `LL` dans la
langue du destinataire pour une date, `LLL` dans `users.timezone` pour une échéance, SMS compris. La
cloche écrit les dates des codes au même niveau que le courriel : mois en toutes lettres.

## Contexte

Réf : **P128.03** du fichier de pistes, `validé`. Elle tranche aussi une part du reste de **P128.06**
(TCK-1328, archivée) : « le choix d'un rendu de date unique entre courriel et cloche ».

Les codes formatent leurs dates par `NotificationRenderer` (`isoFormat('LL')` / `'LLL'`). Les
classes historiques passaient `toDateString()` (renouvellement, résiliation anticipée, relance de
facture), le `Y-m-d` brut de `RentReviewService` (révision de loyer), `format('Y-m-d H:i')` en UTC
(rappel de tâche) et `format('d/m/Y')` (demande et rappel de suppression du compte, courriel et
SMS), y compris dans le courriel anglais. La cloche, elle, écrivait les dates des codes en
`dateStyle: 'medium'` (« 29 sept. 2026 ») quand le courriel écrit « 29 septembre 2026 ».

## Décision du porteur

validé — validation du porteur (2026-10-25) : les sept classes passent par le formateur du rendu (`LL` pour une date, `LLL` dans `users.timezone` pour une échéance), SMS compris ; tranche aussi le reste de P128.06 (même rendu en courriel et en cloche)

## Delta à produire

- [x] `NotificationRenderer::formatDate()` et `::formatDateTime()`, publics, qui délèguent au
  formateur privé des paramètres `date` et `datetime` ; `::timezoneOf()` lit `users.timezone`
  (défaut `Africa/Dakar`), comme `CodedNotification`.
- [x] `LeaseRenewedNotification`, `LeaseEarlyTerminationNotification`,
  `InvoiceOverdueReminderNotification`, `LeaseRentReviewedNotification` : `LL`.
- [x] `TaskDueReminderNotification` : `LLL` dans le fuseau du destinataire.
- [x] `AccountDeletionRequestedNotification`, `AccountDeletionReminderNotification` : `LL`,
  courriel et SMS.
- [x] Front, `texteNotification.ts` : `dateStyle: 'long'` pour les paramètres `date` et `datetime`.
- [x] `DatesDesCourrielsHistoriquesTest` ; `NotificationRow.test.tsx`.

## Critères d'acceptation

- [x] AC1 — sous `en` et `fr`, le courriel de chacune des sept classes contient sa date en `LL`
  (« November 1, 2026 », « 1 novembre 2026 ») et ne contient ni `\d{4}-\d{2}-\d{2}` ni
  `\d{2}/\d{2}/\d{4}`.
- [x] AC2 — le rappel de tâche d'un compte à `America/New_York`, pour une échéance à 14 h UTC, écrit
  « October 23, 2026 10:00 AM » (`LLL`, dans son fuseau).
- [x] AC3 — les deux SMS de suppression du compte suivent AC1.
- [x] AC4 — la date de suppression d'un instant à 23 h 30 UTC se lit dans le fuseau du compte : le
  lendemain à `Asia/Tokyo`.
- [x] AC5 — la cloche écrit une date déclarée « 29 septembre 2026 » (`fr`) et « 29 September 2026 »
  (`en`), sans le mois abrégé ; un instant « 25 octobre 2026 … 14:30 ».

## Hypothèses

- La date de suppression du compte (`scheduled_for`, un instant) est une **date** au sens de la
  décision (`LL`), comme elle l'était (`d/m/Y`) ; seul le rappel de tâche est une échéance (`LLL`).
  Sa date est celle du fuseau du compte, puisque la décision lie le fuseau au destinataire.
- « Même rendu » se prend au niveau du format : mois en toutes lettres des deux côtés. L'ordre des
  mots reste celui de chaque locale : le front écrit `en` en `en-GB` (« 29 September 2026 ») et
  Carbon en `en` (« September 29, 2026 ») ; un instant prend « à » / « at » au front. Les aligner
  au caractère demanderait de changer la locale de l'un des deux côtés, ce que la décision ne dit
  pas.
- Le fuseau de la cloche reste `Africa/Dakar` (`TIMEZONE`) : la décision porte sur le rendu, pas
  sur le fuseau du front.
- Une date absente s'écrit « — », celle du formateur ; la demande de suppression écrivait une chaîne
  vide (cas qui n'arrive pas : `scheduled_for` est toujours posé).

## Reste à faire

Du reste de P128.06, ce ticket ne ferme que le rendu de date unique. Restent au porteur : le texte
du fuseau des courriels et SMS de visite, et le passage des crédits à un code (reste de P75.05).

## Notes d'implémentation

- Avant correctif : les 19 cas de `DatesDesCourrielsHistoriquesTest` rouges ; 7 rouges dans
  `NotificationRow.test.tsx` (le cas neuf, et les attentes « sept. » / « oct. » des cas existants).
- Ablation : les sept classes remises à l'état d'avant → 19 rouges ; la conversion de fuseau de
  `formatDate()` retirée → 1 rouge (AC4) ; `texteNotification.ts` remis → 7 rouges ; remis → verts.
- `AvisSansEmailTest` attendait `d/m/Y` dans le SMS de suppression : il attend désormais `LL`.
- SMS : « 21 septembre 2026 » allonge le texte de 7 caractères au plus ; le texte français part déjà
  en UCS-2 (accents), et le nombre de segments ne change pas (149 → 156 et 114 → 121 caractères).
