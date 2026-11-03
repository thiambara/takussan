---
id: TCK-748
title: "Éditeur de gabarits de notification : chaque langue depuis lang/{locale}"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo"
tags: [back, notifications, i18n, super-admin, pistes]
---

## Contexte

Réf : **P06.07** du fichier de pistes, `validé` (critère accordé : V7). L'éditeur de gabarits de la
console super-admin (TCK-215) pré-remplit les trois langues avec le corps et le sujet français
(`NotificationTemplateService::fallbackBody()` ignore `$locale`), et le front renvoie toutes les
langues à l'enregistrement : la première sauvegarde écrit du français dans les lignes `en` et `wo`,
que `renderActive()` préfère ensuite à la notification d'origine.

## Décision du porteur

chaque langue pré-remplie depuis lang/{locale} ; seules les langues modifiées sont persistées

## Objectif

Chaque langue de l'éditeur part de son propre fichier de langue, et une langue laissée intacte
n'écrit aucune ligne.

## Contrat de données

`GET`/`PATCH /api/admin/notification-templates/{event}/{channel}` : même forme. Seuls les textes
de départ `en` changent, et le `PATCH` n'écrit plus une ligne pour une langue intacte.

## Contraintes strictes

- **Hypothèse** : une langue est « modifiée » quand son sujet ou son corps diffère du texte de
  départ de sa langue. Une langue qui a déjà une ligne est toujours réécrite (elle a été modifiée
  une fois).
- **Hypothèse** : désactiver un gabarit jamais modifié écrit la ligne `fr` (avec le texte reçu),
  qui porte `is_active = false` ; sans elle, l'état serait perdu au rechargement.
- Wolof en pause (2026-10-16) : `lang/wo` reprend le texte français tel quel. Comme il n'est jamais
  persisté s'il reste intact, il ne remplace plus la notification d'origine.
- Le front n'est pas modifié : il envoie toujours toutes les langues, le tri se fait côté API.

## Delta à produire

- [x] `lang/{fr,en,wo}/notifications.php` : bloc `editable_templates` (sujet et corps par événement).
- [x] `NotificationTemplateService` : `fallbackSubject()`/`fallbackBody()` lisent `lang/{locale}` ;
  `update()` ne persiste que les langues modifiées, sans repli sur `fr`.
- [x] Tests dans `tests/Feature/Api/Admin/NotificationTemplateTest.php`.

## Critères d'acceptation

- [x] AC1 — Le `GET` d'un gabarit rend en `en` le sujet et le corps de `lang/en`, différents du `fr`.
- [x] AC2 — Un `PATCH` qui renvoie les trois langues, `fr` seule modifiée, n'écrit que la ligne `fr`.
- [x] AC3 — Une langue modifiée ensuite s'ajoute seule.
- [x] AC4 — Désactiver un gabarit intact est conservé.

## Hors périmètre

- Les textes de départ restent ceux d'avant en `fr` ; ils ne reprennent pas ceux des notifications
  d'origine (`lang/*/notifications.php`, syntaxe `:param`).
- Les lignes `en`/`wo` déjà écrites en base par l'ancien comportement : aucune réécriture de données
  (mesuré en dev par le mesureur : aucune).

## Notes d'implémentation

- Avant correctif : 2 rouges sur 8 (AC1 sur la clé absente, AC2 sur `['fr','en','wo']` écrits).
- Ablation : service d'avant remis → les 2 mêmes rouges ; la ligne `fr` porteuse de l'état
  retirée seule → AC4 rouge. Remis : 8/8 verts.
