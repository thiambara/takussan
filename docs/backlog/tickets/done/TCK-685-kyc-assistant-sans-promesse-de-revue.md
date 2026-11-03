---
id: TCK-685
title: "KYC de l'agent et du bailleur : plus de promesse « Votre agence va le vérifier », plus de statut pending_review"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#onboarding-parcours
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve
tags: [api, front, onboarding, kyc, i18n, pistes]
---

## Contexte

Réf : **P15.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

L'étape KYC des assistants d'onboarding de l'agent et du bailleur envoie le dossier par
`POST /api/me/{agent-profiles|owner-profiles}/{id}/kyc/submit`. Les deux contrôleurs écrivent
`metadata.kyc.status = pending_review` et le renvoient dans `data.kyc.status`. Aucun autre code ne
relit ni ne bascule ce statut : aucune file (d'agence ou de console) ne montre ces pièces, aucune
notification ne part. L'écran promet pourtant « Votre agence va le vérifier. Vous pouvez
continuer. », et le badge affiche « Soumis (en revue) » — un état qui ne se termine jamais.

## Décision du porteur

retirer la promesse « Votre agence va le vérifier » et le statut pending_review

## Objectif

L'assistant ne promet plus une relecture que personne ne fait, et l'API ne pose plus un statut
« en revue » que rien ne fait évoluer.

## Delta à produire

- [x] API — `AgentProfileController::submitKyc` et `OwnerProfileController::submitKyc` : ne posent
      plus `kyc.status` (le retirent s'il existait sur le profil soumis), et ne le renvoient plus ;
      `submitted_at` et `docs` inchangés.
- [x] Front — `submittedBody` et `submittedBadge` de `agents.onboarding.steps.kyc` et
      `owners.onboarding.steps.kyc`, en `fr`, `en` et `wo` : retrait de la phrase de relecture
      et de la mention « en revue ». Les textes restants sont des fragments des textes actuels.
- [x] Front — types `AgentKycSubmitResponse` / `OwnerKycSubmitResponse` sans `status`, docblocks
      alignés.

## Critères d'acceptation

- [x] AC1 — `POST …/kyc/submit` (agent et bailleur) rend 200 sans `data.kyc.status`, et le profil
      n'a pas de `metadata.kyc.status` ; `kyc.submitted_at` est posé.
- [x] AC2 — Dans les trois langues, la confirmation et le badge de l'étape KYC des deux assistants
      ne mentionnent plus ni l'agence ni une revue : `fr` « Soumis » / « Vous pouvez continuer. »,
      `en` « Submitted » / « You can continue. », `wo` « Soumis » ou « Yónni » / « Mën nga
      continuer. » ou « Mën nga jëkk. ».

## Hypothèses (mode sans humain)

- « Retirer le statut » vaut pour l'écriture et la réponse de `kyc/submit`. Les profils qui portent
  déjà `kyc.status = pending_review` en base ne sont pas réécrits (ce serait une réécriture de
  données, V4) : la clé n'a aucun lecteur. Elle disparaît d'un profil quand il soumet de nouveau.
- Les textes de remplacement sont la seconde moitié des textes actuels, sans texte neuf.
- L'assistant du prestataire n'est pas touché : il ne porte pas cette promesse (`grep` de
  `submittedBody` : deux occurrences par langue, agent et bailleur).

## Hors périmètre

- `docs/features.md` § « Onboarding parcours » (ligne du wizard Owner) décrit toujours un « KYC
  documentaire … en `pending_review` non bloquant » : la spec est fermée à l'implémenteur, à faire
  converger par `/sync-specs` ou le porteur.
- Une file de relecture (agence ou console) avec notification, l'autre option de la `Piste`, n'est
  pas ouverte.

## Notes d'implémentation

- Ablation : messages `fr`/`en`/`wo` et les deux contrôleurs remis à `pre-dev`,
  `kyc-sans-promesse-de-revue.test.ts` rougit 6/6 et les deux
  `test_kyc_submit_marks_dossier_as_submitted_without_a_review_status` rougissent
  (`data.kyc.status` présent). Correctif remis : 6/6 et 2/2 verts.
- Le test front est une garde de messages, pas un rendu : le wizard ne fait qu'afficher
  `t('submittedBody')` dans un toast, et un rendu avec les messages réels testerait la même chose
  par un chemin plus long.
