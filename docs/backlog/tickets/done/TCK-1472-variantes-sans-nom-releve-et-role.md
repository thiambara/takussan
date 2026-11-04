---
id: TCK-1472
title: "Relevé sans banque et rôle disparu : les avis prennent une variante sans le nom"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-164--paramètres-text-des-notifications-codées-qui-portent-un-code"
tags: [back, front, notifications, i18n, pistes]
---

## Contexte

Réf : **P164.06** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`bank_statement.imported` sans `bank_name` rendait « Votre relevé — (12 lignes)… » et
« Takussan : relevé — importé. » ; `governance.role_capabilities_changed` pour un rôle disparu
« Les droits du rôle — ont été modifiés… ».

## Décision du porteur (déléguée)

validé (délégué) — variantes de clé sans le nom, choisies par le rendu (API et cloche) quand le paramètre est nul ou vide, sur le modèle des variantes `_link` : `bank_statement.imported` sans `:bank` (« Votre relevé (:lines lignes) est prêt à être rapproché. », « Takussan : relevé importé. »), `governance.role_capabilities_changed` sans `:role` (« Les droits d'un rôle ont été modifiés par :actor. », tournure du titre existant) ; `fr` et `en`, `wo` en français tel quel

## Contrat de données

- `NotificationCode::unnamedParams()` : `bank` pour `BankStatementImported`, `role` pour
  `GovernanceRoleCapabilitiesChanged`. L'un d'eux nul ou vide → le rendu cherche d'abord
  `<surface>_unnamed`, puis `<repli>_unnamed` (`mail_body` → `body_unnamed`), avant les clés ordinaires.
- API, `lang/{fr,en,wo}/notifications.php` : `body_unnamed` et `sms_unnamed` des deux codes ; `wo` en
  français tel quel (pause du wolof).
- Cloche, `messages/{fr,en,wo}.json` : `body_unnamed` des deux codes (le titre ne porte pas le nom) ;
  `PARAMS_NOMMES` de `texteNotification.ts` est le miroir de `unnamedParams()`.
- Hypothèse : les SMS sans le nom suivent la même règle que le corps (phrase existante privée du
  nom, tournure « d'un rôle » du titre) : « Takussan : droits d'un rôle modifiés par :actor. »,
  « Takussan: role permissions changed by :actor. ».

## Delta à produire

- [x] `NotificationCode::unnamedParams()`, `NotificationRenderer::lacksName()` et ses candidats.
- [x] Clés API et front.
- [x] `texteNotification.ts` : choix de `body_unnamed`.
- [x] Tests : `VariantesSansNomTest` (API), `NotificationRow.test.tsx` (cloche).

## Critères d'acceptation

- [x] AC1 — fr et en, corps, corps de courriel et SMS sans nom : les phrases de la décision, sans « — ».
- [x] AC2 — avec le nom, la phrase d'origine reste.
- [x] AC3 — les variantes existent en fr, en et wo.
- [x] AC4 — la cloche rend les mêmes phrases sans « — ».

## Notes d'implémentation

- Ablation API : `NotificationRenderer.php` remis à l'état d'avant → 4 rouges, remis → vert.
- Ablation front : `texteNotification.ts` remis à l'état d'avant → 4 rouges, remis → vert.
- Le fr du front écrit l'apostrophe droite (« d'un »), comme le titre existant.
