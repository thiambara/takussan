---
id: TCK-2369
title: "Noms vides : le destinataire d'une facture, les lecteurs du nom d'un compte et les personnes des avis ont un repli, et les replis morts sont retirés"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2281]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-235--replis--de-lapi-sur-des-colonnes-texte-non-nulles-que-des-écrivains-remplissent-de-"
tags: [api, web, identite, factures, notifications, pistes]
---

## Contexte

Pistes : P235.01, P235.02, P235.03

Réfs : **P235.01**, **P235.02** et **P235.03** du fichier de pistes, angle 235, `validé`. Un compte
ou une fiche client créés par téléphone portent des noms `''` (TCK-2281) ; plusieurs lecteurs de
l'API composaient le nom à la main, avec un repli qui ne joue jamais ou sans repli du tout.

- **P235.01** — `InvoiceNumberAllocator::issuedMentions` retombait sur `$customer->name`, qui ne lit
  aucune colonne : une facture émise pour une fiche sans nom imprimait « — » pour destinataire.
- **P235.02** — absences d'agence, préparateur d'un reversement, propriétaire et collaborateurs d'un
  bien, bailleur du relevé de gérance, auteur d'un équipement ou d'un quartier proposés : `''` ou
  `null`, que le `?? '—'` du front ne rattrape pas.
- **P235.03** — le locataire d'un avis au bailleur et le bénéficiaire d'un avis au délégant se
  rendaient « — » ; `$landlord->name` (contrat, état des lieux) et `title ?? '#id'` (urgence de
  maintenance) sont des replis morts.

## Décision du porteur

- **P235.01** — validation du porteur (2026-10-25) : la ligne « destinataire » d'une facture dont la fiche n'a pas de nom porte le numéro de la fiche, à défaut son e-mail ; le repli mort `$customer->name` est retiré
- **P235.02** — validation du porteur (2026-10-25) : ces lecteurs de l'API passent par `nameWithoutContact()`, et le front remplace `?? '—'` par `||` (ou `nomAffichable()`), dont `AgentAbsencesSection`
- **P235.03** — validation du porteur (2026-10-25) : un repli de nom unique pour les paramètres de personne des avis, libellé traduit sur le modèle de `unknown_tenant` (jamais le numéro masqué), et le retrait des replis morts

## Hypothèses

- **P235.01** — « le numéro de la fiche » est son téléphone (`customers.phone`), déjà imprimé sous
  le nom. Une facture déjà émise garde ses mentions figées (`metadata.issued`) : seule l'émission
  neuve change. Le brouillon, qui imprime les valeurs courantes, suit la même règle.
- **P235.02** — `CommissionEntryResource` garde son repli (`username`, puis `null`) : son seul
  lecteur, le registre des commissions, rend déjà « Bénéficiaire #id » sur `null`, et « — » le
  masquerait. C'est le reste de l'entrée.
- **P235.03** — le libellé est unique pour toutes les personnes des avis, et neutre en
  grammaire : « (sans nom) » / « (unnamed) », qui se lit en tête de phrase comme après « de »,
  « par » ou « à ». Le rendu le pose dans la langue du destinataire (`PARAM_PERSON`), au courriel,
  au SMS et à la cloche. Les écrivains des sept sites ne changent pas.

## Delta à produire

- [x] P235.01 — `Customer::invoiceRecipientName()` : nom, puis téléphone, puis e-mail ; lu par
      `issuedMentions` et par le gabarit d'un brouillon. Le repli mort retiré.
- [x] P235.02 — `nameWithoutContact()` dans `AgentAbsenceController`, `PayoutResource`,
      `PropertyResource` (collaborateurs et `buildUserLite`), `OwnerStatementService`,
      `TagModerationAdminController`, `GeoNeighborhoodAdminController` ; `||` dans
      `AgentAbsencesSection` et `PropertyModerationDetail`.
- [x] P235.03 — `NotificationCode::PARAM_PERSON` pour `tenant` (trois avis au bailleur) et
      `beneficiary` (trois avis au délégant) ; `notifications.unnamed_person` (API) et
      `notifications.unnamedPerson` (front) en `fr`, `en`, et `wo` recopié du français. Les replis
      morts des gabarits du bail, de l'état des lieux et de l'urgence de maintenance retirés.

## Critères d'acceptation

- [x] L'émission d'une facture pour une fiche sans nom fige son numéro, à défaut son e-mail, comme
      nom du destinataire, et le PDF l'imprime ; une facture déjà émise garde « — ».
- [x] Un membre sans nom ni `username` se lit « — » dans les absences, et le front ne laisse aucun
      trou dans « {absent} est remplacé par {substitute} ».
- [x] Un avis au bailleur ou au délégant dont la personne n'a pas de nom la nomme « (sans nom) »,
      jamais « — » ni un numéro, dans le courriel, le SMS et la cloche.

## Reste à faire

- P235.02 — `CommissionEntryResource` garde son repli `username`, puis `null`, que le registre des
  commissions remplace par « Bénéficiaire #id » ; y passer `nameWithoutContact()` rendrait « — » à
  la place.

## Vérification

Tests d'abord, rouges pour la bonne raison, puis le correctif ; chaque test neuf passé par ablation.

- **P235.01** (`e914c1597`) — `DestinataireSansNomDeLaFactureTest` (5), 3 rouges avant (`null`
  figé, « — » au brouillon) ; ablation (`invoiceRecipientName` réduit au nom) → les 3 mêmes
  rouges. Les deux autres sont des épingles (fiche nommée, facture déjà émise).
- **P235.02** (`b439ee24e`) — `NomsVidesDesLecteursTest` (5) et
  `AgentAbsenceTest::test_un_absent_et_un_remplacant_sans_nom_se_lisent_par_un_tiret` ; ablation
  (`app/` rendu à sa version d'avant) → 4 rouges sur 5 (le cas `username` est une épingle) et 1
  sur 1. Front : `AgentAbsencesSection.noms-vides.p235-02.test.tsx`, rouge avec `??`
  (« est remplacé par  jusqu'au »).
- **P235.03** (`865603da9`) — `PersonneSansNomDesAvisTest` (9) ; ablation (bras `PARAM_PERSON`
  retiré du rendu) → 7 rouges. Front : `NotificationRow.personne-sans-nom.p235-03.test.tsx` (4),
  branche `person` retirée → 3 rouges.
