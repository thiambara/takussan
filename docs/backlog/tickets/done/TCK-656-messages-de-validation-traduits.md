---
id: TCK-656
title: "Les messages de validation écrits en français en dur passent par `lang/{fr,en,wo}`"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo
tags: [back, i18n, validation, pistes]
---

## Objectif utilisateur

Un utilisateur qui consulte l'application en anglais ou en wolof lit les erreurs de validation
dans sa langue : aujourd'hui, six FormRequests lui rendent un message français écrit en dur, ou un
gabarit de sa langue dans lequel est injecté un nom de champ français (« The utilisateur field is
required. »).

Réf : **P06.04** du fichier de pistes (classement A4 : messages existants déplacés vers des clés
`lang/{fr,en,wo}`, sans changer le texte français ; la garde proposée relève d'A5).

## Contrat de données

- Aucune route, aucune règle, aucun code de statut ne change : seul le texte de `errors.<champ>`
  (et donc de `message`) suit la langue de la requête.
- En `fr`, chaque message garde **exactement** son texte actuel.

## Contraintes strictes (métier)

- Pas de texte de produit neuf : l'anglais et le wolof traduisent le français existant.
- Hypothèse (mode sans humain) : les traductions wolof reprennent le vocabulaire déjà employé dans
  `lang/wo/*` (`nataal`, `xaatim`, `rol`, `sabab`…). Une relecture par un locuteur reste
  souhaitable, comme pour le reste de `lang/wo`.

## Delta à produire

- [x] `StorePropertyMediaRequest::messages()` (4), `RejectPropertyRequest::messages()` (3),
      `AssignAgencyRoleRequest::messages()` (1), `SyncCapabilitiesRequest::messages()` (1) :
      valeurs passées par `__()`.
- [x] `SignatureDataUrlRule` (`InventorySignRequest.php`, 5 messages) : `$fail(__(…))`.
- [x] `StoreRoleDelegationRequest::messages()` : les cinq surcharges qui injectent un nom de champ
      français sont retirées ; le message par défaut et `validation.attributes` (fr, wo) rendent le
      même texte en `fr`.
- [x] Clés dans `lang/{fr,en,wo}/{properties,moderation,inventories,agencies}.php`.
- [x] Garde : `ProseLitteraleScanner` reconnaît deux positions de plus — (h) une valeur littérale
      dans `messages()`/`attributes()`, remplacements de `__()` compris ; (i) le message littéral
      d'un `$fail(…)` (une clé seule, `$fail('validation.x')->translate()`, reste tolérée).
- [x] Tests : `MessagesDeValidationTraduitsTest`, fixtures du scanner. `SyncPropertyTagRequest`
      est exempté de (h), nommément et de façon expirante (voir « Hors périmètre »).

## Critères d'acceptation

- [x] AC1 — En `fr`, les 14 messages et les 5 messages de `StoreRoleDelegationRequest` rendent
      leur texte d'avant, à la lettre.
- [x] AC2 — En `en` et en `wo`, chacun des 14 messages diffère du français et n'est pas une clé
      brute.
- [x] AC3 — En `en` et en `wo`, aucun message de `StoreRoleDelegationRequest` ne contient
      « utilisateur », « rôle », « date de fin » ni « motif ».
- [x] AC4 — `ProseLitteraleInterditeTest` est vert sur `app/` et compte exactement les positifs
      (h) et (i) des fixtures.

## Hors périmètre

- `role_delegations.validation.max_duration` affiche « :max » sans le remplacer (aucun paramètre
  passé) : autre défaut.
- `SyncPropertyTagRequest` passe `'tag_ids'` comme attribut : c'est un nom de champ, pas une
  phrase, et `en/validation.php` n'a aucun `attributes`.
- Les `$validator->errors()->add(…, 'littéral')` et `Validator::make(…, [messages])` hors
  FormRequest, que la garde ne lit pas.

## Notes d'implémentation

- Rouge avant correctif : 15 échecs sur 30 — les 14 phrases rendues en français en `en` et en
  `wo`, et `StoreRoleDelegationRequest` qui rendait « The utilisateur field is required. ». Les
  15 cas `fr` étaient verts, et le restent.
- Ablation (`app/` et `lang/` remis à l'état d'avant, tests gardés) : 16 rouges — les 15 ci-dessus,
  plus `ProseLitteraleInterditeTest`, qui nomme 16 lignes en (h). Correctif remis : vert.
- La garde (h) ne tolère **aucun** code, contrairement à (d) : `'utilisateur'` a la forme d'un
  code (`[a-z_]+`). D'où l'exemption de `SyncPropertyTagRequest` (`'tag_ids'`), plutôt qu'une
  tolérance qui aurait rendu la garde aveugle au défaut qu'elle vise.
- Le petit `bail()` de `SignatureDataUrlRule` est retiré : il cachait le littéral à la forme (i),
  qui ne lit que l'argument de `$fail(…)`.
- Les fixtures citent un domaine fictif (`exemple.*`) : une clé réelle (`inventories.*`) faisait
  escalader `bin/impacted-tests.php` à la suite entière pour toute modification de ce dictionnaire.
