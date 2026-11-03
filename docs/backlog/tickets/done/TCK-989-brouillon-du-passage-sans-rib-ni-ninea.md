---
id: TCK-989
title: "Le brouillon du formulaire de passage n'enregistre ni le RIB professionnel ni le NINEA"
status: done
phase: P1
family: full
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#70-wizarddraft-"
    - "docs/models-spec.md#49-agencyupgraderequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-49--passage-dune-agence-individual-à-standard"
tags: [web, api, rgpd, brouillon, agency-upgrade, pistes]
---

## Contexte

Réf : **P49.01** du fichier de pistes, `validé` par le porteur. Le formulaire « Passer en agence
professionnelle » (`UpgradeRequestForm`) enregistre tout son état (`data: form`) dans le brouillon
serveur `agency-upgrade-{agency_id}` à chaque saisie, RIB professionnel et NINEA compris.
`wizard_drafts.data` est un `jsonb` sans chiffrement, purgé à 90 jours d'inactivité, alors
qu'ADR-0044 § 1 chiffre ces deux champs dans `agency_upgrade_requests`.

## Décision du porteur

> validé — ne mettre ni `rib_pro` ni `ninea` dans le brouillon du formulaire de passage (pas de brouillon chiffré), et retirer les brouillons `agency-upgrade-*` existants qui les portent ; un test du formulaire qui vérifie que le corps du `PUT` ne contient ni `rib_pro` ni `ninea` (porteur, 2026-10-19)

## Objectif

Un RIB professionnel ou un NINEA saisi dans le formulaire de passage n'est jamais écrit dans
`wizard_drafts`, et ceux qui y sont déjà en sont retirés.

## Delta à produire

- [x] `lib/agency-upgrade-brouillon.ts` : `brouillonUpgradeDepuisFormulaire()`, le formulaire sans
      `rib_pro` ni `ninea`.
- [x] `UpgradeRequestForm` : l'autosave reçoit ce brouillon, et l'état vierge est jugé sur la même
      forme.
- [x] Migration de données neuve : supprime les brouillons `agency-upgrade-%` dont `rib_pro` ou
      `ninea` porte une saisie. `down()` sans effet (une suppression ne se rejoue pas).
- [x] Tests : `UpgradeRequestForm.test.tsx` (corps des écritures), `agency-upgrade-brouillon.test.ts`,
      `tests/Feature/Database/PurgeAgencyUpgradeDraftsSecretsMigrationTest.php`.

## Critères d'acceptation

- [x] AC1 — Formulaire entièrement rempli : aucune écriture du brouillon ne porte la clé `rib_pro`
      ni la clé `ninea`.
- [x] AC2 — Saisir le seul NINEA ou le seul RIB n'écrit aucun brouillon (ce n'est pas une saisie
      qui se conserve).
- [x] AC3 — La migration supprime les brouillons `agency-upgrade-*` qui portent un RIB ou un NINEA
      non vide, et laisse les autres : brouillon de passage sans ces champs, brouillon d'un autre
      parcours qui porterait une clé `ninea`.
- [x] AC4 — L'envoi de la demande transmet toujours le RIB et le NINEA (inchangé).

## Hypothèses (mode sans humain)

- « Le corps du `PUT` » se lit sur l'argument `data` de `save()` : `useWizardDraft.performSave`
  envoie `JSON.stringify({ step, data })` tel quel (`useWizardDraft.ts:174`). Le test du formulaire
  double `useWizardDraft`, comme les tests existants.
- Un brouillon `agency-upgrade-*` qui porte un RIB ou un NINEA est supprimé en entier (la décision
  dit « retirer les brouillons »), et non nettoyé de ces deux clés.
- La relecture d'un brouillon (`formulaireUpgradeDepuisBrouillon`) n'est pas modifiée : après la
  migration, aucun brouillon ne porte plus ces clés.

## Hors périmètre

- Une garde côté API qui refuserait ces clés dans `PUT /api/me/wizard-drafts/agency-upgrade-*`.

## Notes d'implémentation

- Avant : formulaire rempli → `save(0, { …, ninea: '005012345', rib_pro: 'SN012 …' })` ; saisir le
  seul NINEA écrivait déjà un brouillon (AC1, AC2 rouges).
- Ablation front : composant remis à sa version d'avant (tests gardés) → AC1 et AC2 rouges, les
  12 autres verts ; remis → 14 verts. ⚠ Remettre `data: form` sans remettre l'état vierge fait
  rougir 5 tests de TCK-566 : l'état vierge doit se sérialiser sur la même forme que `data`.
- Ablation API : `->delete()` remplacé par `->count()` → rouge ; la clause `ninea` retirée → rouge
  sur le brouillon qui ne porte que le NINEA ; remise → vert.
- Pas de `useMemo` autour du brouillon : React Compiler (ADR-0015) ; le hook compare des états
  sérialisés, un objet neuf par rendu ne réécrit rien.
