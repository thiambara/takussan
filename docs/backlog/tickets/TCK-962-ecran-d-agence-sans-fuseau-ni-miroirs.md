---
id: TCK-962
title: "L'écran d'agence n'envoie plus le fuseau ni les miroirs de `settings`, et lit commission et devise sur leurs colonnes"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#lécran-de-configuration-dagence-enregistre-le-fuseau-horaire-et-lapi-le-jette"
tags: [front, agency, settings, pistes]
---

## Contexte

Réf : **P47.02** du fichier de pistes, `validé` (critère V7 accordé, V1 tranché par le porteur).

L'écran de configuration d'agence propose un champ « Fuseau horaire » et `normaliseAgencyForm`
envoie `settings.timezone`, `settings.currency` et `settings.default_commission_rate`.
`AgencyUpdateRequest` n'a aucune règle pour ces trois clés : `validated()` les retire, l'API
répond 200 et les perd. Le champ revient vide après chaque enregistrement. `toDefaults` lit en
outre `settings.default_commission_rate` avant la colonne `commission_rate`, et `settings.currency`
en repli de la colonne `currency`.

## Décision du porteur

> retirer le champ « Fuseau horaire » de l'écran d'agence et ne plus envoyer `settings.timezone`, `settings.currency` ni `settings.default_commission_rate` (la spec range le fuseau sur l'utilisateur, et l'API jette déjà ces trois clés) ; lire la commission et la devise sur leurs seules colonnes : une agence dont le miroir diffère de la colonne affiche et réenregistre la valeur de la colonne, celle que l'API applique (porteur, 2026-10-18, sur la recommandation du délégué)

## Objectif

Le formulaire d'agence n'envoie dans `settings` que des clés que l'API accepte, et affiche la
commission et la devise que l'API applique.

## Hypothèses (mode sans humain)

- Les clés i18n du seul champ fuseau (`fields.timezone`, `fields.timezonePlaceholder`,
  `validation.agency.timezoneTooLong`) se retirent des trois langues, parité gardée ; aucun texte
  wolof n'est écrit.
- Le docblock « spec alignment » de `normaliseAgencyForm` se corrige ici (P47.08 le rattache à
  P47.02).

## Delta à produire

- [ ] `lib/schemas/agency.ts` : retirer `timezone` du schéma et l'écriture des trois clés de
  `settings` ; docblock corrigé.
- [ ] `AgencyConfigForm.tsx` : retirer le champ ; `toDefaults` lit `commission_rate` et `currency`
  sur les colonnes seules.
- [ ] `types/agency.ts` : `AgencySettings` ne déclare plus les trois clés.
- [ ] Tests : les clés de `settings` envoyées ; les valeurs affichées pour une agence dont les
  miroirs diffèrent des colonnes.

## Critères d'acceptation

- [ ] AC1 — `normaliseAgencyForm` n'émet ni `timezone`, ni `currency`, ni
  `default_commission_rate` dans `settings`, et `commission_rate`/`currency` restent au premier
  niveau.
- [ ] AC2 — une agence `commission_rate: 5`, `settings.default_commission_rate: 12` affiche et
  réenregistre 5 ; `currency: null`, `settings.currency: 'EUR'` n'affiche pas EUR.
- [ ] AC3 — l'écran n'a plus de champ « Fuseau horaire ».

## Hors périmètre

- Un fuseau d'agence (colonne, règle, lecteur) : la spec le range sur l'utilisateur.
- La purge des miroirs déjà stockés dans `agencies.settings` (V4).
- L'accesseur commun des réglages d'agence (P47.08).

## Notes d'implémentation

_(à remplir par implementing-specs)_
