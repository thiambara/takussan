---
id: TCK-1362
title: "Le code de vérification du téléphone quitte le brouillon d'onboarding une fois vérifié"
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
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#70-wizarddraft-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations--angle-84"
tags: [front, onboarding, securite, pistes]
---

## Objectif utilisateur

Le code de vérification du téléphone, que l'API garde haché cinq minutes, ne reste plus en clair
dans le brouillon serveur des quatre assistants d'onboarding (propriétaire, agent, prestataire,
hôte particulier), gardé jusqu'à 90 jours.

## Contexte

Réf : **P84.03** du fichier de pistes, `validé` (critère V2 cité par le classement, accordé).

Mesuré avant correctif (tests de garde ci-dessous, rouges sur `45fd976b2`) : dans chacun des
quatre assistants, numéro saisi, code envoyé, `123456` saisi puis vérifié (action simulée en
succès) → le dernier corps écrit dans le brouillon porte `verified: true` **et** `code: "123456"`.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

## Choix de l'implémenteur

- La piste propose deux voies sans en recommander une : retirer `code` des données de
  l'assistant (état local de l'étape), ou le vider au passage de `verified` à vrai. **Retenue : la
  plus étroite, le vider au passage de `verified` à vrai** (une ligne par assistant), sans toucher
  à la forme des données ni à la relecture des brouillons.
- Conséquence acceptée : entre la saisie et la vérification (le code vit cinq minutes côté API),
  le brouillon porte encore le code tapé. C'est l'autre voie qui le fermerait : reste.
- L'assistant hôte envoie `phone_otp.code` à la soumission finale : il part désormais vide. La
  soumission n'est possible qu'une fois `verified` vrai, donc `phone_verified_at` posé par la
  vérification inline ; `HostIndividualOnboardRequest` passe alors la règle à `nullable`, et `''`
  arrive `null` (`ConvertEmptyStringsToNull`) — le chemin d'un compte déjà vérifié, dont le code
  initial est déjà `''`.

## Reste à faire

- le code tapé et non encore vérifié part encore dans le brouillon (retirer `code` des données de l'assistant pour un état local de l'étape le fermerait)

## Delta à produire

- [x] `OwnerOnboardingWizard`, `AgentOnboardingWizard`, `ServiceProviderOnboardingWizard`,
  `HostIndividualWizard` : `code: ''` au passage de `verified` à vrai.
- [x] Un test par assistant : le dernier corps du brouillon après vérification ne contient pas le
  code.

## Critères d'acceptation

- [x] AC1 — dans chacun des quatre assistants, après une vérification réussie, le dernier
  `save(step, data)` porte `verified: true` et ne contient pas `123456`.

## Hors périmètre

- Les brouillons déjà écrits (la purge à 90 jours les efface ; aucune réécriture de données).

## Notes d'implémentation

- Ablation : les quatre assistants remis à `45fd976b2` → 4 rouges sur 29 ; remis → 29 verts.
- Les trois tests d'assistant qui simulaient `save` par un `vi.fn()` anonyme ont maintenant un
  espion stable (`sauverBrouillon`), comme celui de l'hôte.
