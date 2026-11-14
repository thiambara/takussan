---
id: TCK-2821
title: "Les clés mortes `owners.onboarding.steps.kyc` et `agents.onboarding.steps.kyc` quittent le dictionnaire"
status: todo
phase: P3
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models: []
tags: [front, dette, code-mort, i18n, kyc, onboarding, audit-ux, app]
---

## Objectif utilisateur

Aucun effet visible. Le dictionnaire ne porte plus le texte d'une étape « Vos pièces justificatives » que plus aucun
assistant ne montre, et un test ne garde plus un texte que personne ne lit.

## Origine

Relevé de l'implémentation de TCK-2799 (accueil-2799), 2026-11-14. L'étape KYC a quitté les assistants du bailleur et
de l'agent (les pièces se déposent dans « Vos pièces »). Ses textes sont restés sous `owners.onboarding.steps.kyc` et
`agents.onboarding.steps.kyc`, en `fr`, `en` et `wo`.

TCK-2796 retire `KycUploader` et les sous-arbres `<rôle>.onboarding.kyc` qu'il lisait seul. Il écarte explicitement
`…onboarding.steps.kyc`, que `KycUploader` ne lisait pas : ce ticket les prend.

## Contrat de données

Aucun endpoint touché.

**Lecteurs relevés au 2026-11-14** (`grep` littéral sur `takussan-web/src`) : aucun composant. Trois tests seulement :

| Fichier | Ce qu'il lit | Sort |
|---|---|---|
| `src/components/onboarding/__tests__/kyc-sans-promesse-de-revue.test.ts` | `submittedBadge` et `submittedBody` des deux sous-arbres, dans les trois langues (garde de TCK-685 : aucune promesse « votre agence va le vérifier ») | supprimé avec les clés ; la règle de TCK-685 se garde sur le texte vivant de « Vos pièces » si aucune garde ne la tient déjà (à vérifier) |
| `src/components/onboarding/__tests__/AgentOnboardingWizard.test.tsx:128-129` | `steps.kyc.submitCta` et `licenseNumberLabel`, pour affirmer leur ABSENCE de l'assistant | l'absence s'affirme par le texte littéral, ou par l'absence de tout champ fichier |
| `src/components/onboarding/__tests__/OwnerOnboardingWizard.test.tsx:133` | `steps.kyc.submitCta`, pour affirmer son absence | idem |

## Contraintes strictes

- **Avant toute suppression, re-vérifier les lecteurs dynamiques** : un `t(\`steps.${…}\`)` sous `owners.onboarding` ou
  `agents.onboarding` (ou un `useTranslations` qui compose le chemin) échappe au `grep` littéral. Lister dans le ticket ce
  qui a été cherché et trouvé, PUIS supprimer.
- Parité `fr` / `en` / `wo` gardée ; `node scripts/check-i18n.mjs` et `check-i18n-namespaces` verts (`--update` si une
  frontière perd des clés).
- Un brouillon d'assistant qui porte encore une étape `kyc` (`OwnerOnboardingWizard.test.tsx:197`, reprise à l'écran 2)
  continue de reprendre : ce ticket ne touche que le dictionnaire et les tests.

## Delta à produire

- [ ] Inventaire des lecteurs (littéraux et dynamiques) écrit dans le ticket.
- [ ] Retrait de `owners.onboarding.steps.kyc` et `agents.onboarding.steps.kyc` de `fr.json`, `en.json`, `wo.json` ;
  `src/i18n/namespaces.json` régénéré si besoin.
- [ ] Les trois tests réécrits ou retirés comme dit au tableau.

## Critères d'acceptation

- [ ] AC1 — `rg "steps\.kyc" takussan-web/src` ne rend plus rien, hors du test de garde ci-dessous.
- [ ] AC2 — Les tests des assistants du bailleur et de l'agent affirment toujours l'absence de l'étape de pièces (un
  assistant qui remonterait un champ fichier ou « Envoyer mes pièces » les fait rougir — ablation).
- [ ] AC3 — Aucun `MISSING_MESSAGE` au navigateur sur `/onboarding/owner` et `/onboarding/agent`, à chaque étape.
- [ ] AC4 — La règle de TCK-685 (aucune promesse de revue) reste gardée quelque part, ou le ticket écrit pourquoi elle
  n'a plus d'objet.

## Hors périmètre

- `KycUploader` et les sous-arbres `<rôle>.onboarding.kyc` (TCK-2796).
- `serviceProviders.onboarding.steps` : il n'a pas de sous-arbre `kyc`.
