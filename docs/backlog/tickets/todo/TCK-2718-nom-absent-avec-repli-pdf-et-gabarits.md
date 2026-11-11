---
id: TCK-2718
title: "Une partie sans nom ne laisse plus de case vide : repli dans le contrat et la quittance, « Bonjour, » sans virgule orpheline"
status: todo
phase: P2
family: back
estimate: S
wave: 86
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2605]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#1-user"
tags: [back, pdf, notifications, gabarits, nom-absent, suivi-lot-1]
---

## Objectif utilisateur

Un locataire dont le compte n'a pas encore de prénom reçoit un contrat et une quittance qui le désignent quand même, et
un message qui commence par « Bonjour, » plutôt que « Bonjour , ».

## Contexte

Suivi de TCK-2605 (le compte ouvert par e-mail naît sans prénom, `first_name = ''`, comme celui ouvert par téléphone).
Une fiche née d'un tel compte n'a pas de nom non plus (`CustomerService::rattacherOuCreer` recopie `first_name` /
`last_name` du compte, P220.03). Relevé sur l'arbre du lot 1 :

- `$tenant` des PDF est une **fiche** (`Lease::tenant()` → `Customer`), pas un compte ; la quittance passe en plus par
  `PrintedIdentity::restore()` (l'identité figée au règlement, TCK-1792).
- `pdf/leases/contract.blade.php:58` et `pdf/receipts/rent.blade.php:54` écrivent
  `trim(first_name.' '.last_name)` **sans repli** : case vide. Le bailleur du même contrat (l. 46-48) et l'état des lieux
  (`pdf/inventories/report.blade.php:65`) ont déjà le repli `?: email ?? '—'`. Les garants (`contract.blade.php:181`) n'en
  ont pas non plus.
- Gabarits éditables (TCK-748) : `lang/fr/notifications.php` `editable_templates.*.body` commencent par
  `Bonjour {{ user.first_name }},`. `NotificationTemplateService::renderString()` remplace une variable vide par `''` :
  « Bonjour , votre réservation… ». Ne se produit **que si une ligne `NotificationTemplate` active existe** pour
  l'événement ; sinon `renderActive()` rend le repli de `lang/` (dont les salutations sont déjà `Bonjour,`).

## Décision

**Aucune décision du porteur requise** : correctif d'affichage. (L'exigence d'un nom avant la signature d'un bail, qui en
demande une, est TCK-2719.)

## Contrat de données

- Le nom imprimé d'une personne (locataire, garant) : prénom et nom ; à défaut l'e-mail ; à défaut le téléphone ; à
  défaut « — ». Même repli que le bailleur et l'état des lieux, étendu au téléphone (un compte ouvert par téléphone n'a
  pas d'e-mail).
- `renderString()` : une variable rendue vide emporte l'espace qui la précède quand elle est suivie d'une ponctuation
  (`,` `.` `!` `?` `:`) — « Bonjour {{ user.first_name }}, » → « Bonjour, ».

## Contraintes strictes (métier)

- Le repli est **un seul helper** partagé par les vues PDF (pas un ternaire recopié dans chaque Blade).
- Un contrat déjà figé (`contract_sha256`, octets signés) n'est jamais régénéré : seul un nouveau rendu porte le repli.
- Un nom présent s'imprime à l'octet près comme aujourd'hui.
- Le repli d'un gabarit ne touche pas une variable non vide ni le texte autour d'elle.

## Delta à produire

- [ ] Helper du nom imprimé (Customer et garant) ; `contract.blade.php` (locataire, garants) et `rent.blade.php`
      (locataire) l'emploient.
- [ ] `NotificationTemplateService::renderString()` : variable vide + espace avant ponctuation.
- [ ] Tests : `PrintedPartyNameTest` (contrat et quittance, fiche sans nom avec e-mail, sans e-mail avec téléphone, sans
      rien) ; `NotificationTemplateEmptyVariableTest` (ligne de gabarit active, prénom vide et non vide).

## Critères d'acceptation

- [ ] AC1 — Bail dont la fiche du locataire a `first_name = last_name = ''` et `email = a@x.sn` : le texte du contrat
      rendu contient « a@x.sn » dans la ligne « Locataire ». Même fiche sans e-mail, téléphone `+221771234567` : la ligne
      porte le téléphone.
- [ ] AC2 — Quittance d'un règlement de ce bail (identité figée comprise, `PrintedIdentity`) : la ligne « Nom » porte le
      même repli.
- [ ] AC3 — Locataire nommé « Awa Ndiaye » : contrat et quittance portent « Awa Ndiaye » (non-régression).
- [ ] AC4 — Avec une ligne `NotificationTemplate` active `Bonjour {{ user.first_name }}, …` : prénom vide → le corps
      commence par « Bonjour, » ; prénom « Awa » → « Bonjour Awa, ».

## Hors périmètre

- Exiger le nom du locataire avant la demande de signature (TCK-2719).
- Les autres PDF qui ont déjà un repli (bailleur, état des lieux, devis, reçu de réservation).
- La syntaxe des gabarits (pas de filtre `default` ni de condition).

## Notes d'implémentation

_(à remplir par implementing-specs)_
