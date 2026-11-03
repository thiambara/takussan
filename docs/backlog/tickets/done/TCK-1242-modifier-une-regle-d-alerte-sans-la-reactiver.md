---
id: TCK-1242
title: "Modifier une règle d'alerte de la console sans la réactiver"
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
  models:
    - "docs/models-spec.md#59-alertrule-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-114--champs-écartés-par-validated-modules-de-l-à-z-et-server-actions"
tags: [front, super-admin, pistes]
---

## Contexte

Réf : **P114.02** du fichier de pistes, `retenu · autonome` (A1). Entrée dans le lot par l'angle
114, avec P114.01 (TCK-1240).

`AlertRuleDialog` (`components/admin/super/alerts.tsx`) envoie `is_active: true` en dur, en
création comme en modification. `AlertRuleService::update` écrit `is_active` dès qu'il est
présent, et le garde quand il manque : modifier une règle désactivée (par l'API, l'écran ne le
permet pas) la réactive.

## Objectif

Modifier une règle depuis la console ne change pas son état actif.

## Contrat de données

Aucun changement d'API. `PATCH /api/super-admin/alert-rules/{id}` ne reçoit plus `is_active`
de la console ; `POST` le reçoit toujours à `true`.

## Delta à produire

- [x] `AlertRuleDialog` : `is_active: true` en création seulement.
- [x] `Alerts.test.tsx` : modifier une règle inactive → le corps du `PATCH` n'a pas `is_active`.

## Critères d'acceptation

- [x] AC1 — Le corps envoyé en modification ne porte pas `is_active`.
- [x] AC2 — La création envoie toujours `is_active: true` (test existant inchangé).

## Hors périmètre

- Afficher ou basculer l'état d'une règle dans la console (comportement visible neuf).

## Notes d'implémentation

- Choix entre les deux voies de la Piste : ne pas envoyer la clé en modification, plutôt que
  reprendre `rule.is_active` — la plus étroite, et le contrat de `update()` garde l'état.
- Ablation : `alerts.tsx` rendu à `HEAD` → 1 rouge (`is_active` dans le corps du `PATCH`) ;
  correctif remis → 5/5 verts sur `Alerts.test.tsx`.
