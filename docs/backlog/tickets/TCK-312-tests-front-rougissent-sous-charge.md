---
id: TCK-312
title: "Quatre tests front rougissent sous charge — le pendant frontend de D-44"
status: todo
phase: P2
family: front
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, tests, ci, flaky, dette]
---

## Objectif utilisateur

Qu'un test rouge veuille dire « le code est cassé » — et non « la machine était chargée ce jour-là ».

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-12 (ardoise D-30bis), en lançant les suites back et
front **simultanément** : quatre tests de la console super-admin sortent en
`Test timed out in 5000ms`.

| Test | Fichier |
|---|---|
| `InviteSuperAdminModal` | `src/components/super-admin/__tests__/InviteSuperAdminModal.test.tsx` |
| `AgencyOnboardingDialog` | `src/components/admin/super/__tests__/AgencyOnboardingDialog.test.tsx` |
| `FeatureFlags` | `src/components/admin/super/__tests__/FeatureFlags.test.tsx` |
| `TemplateEditor` | `src/components/admin/super/__tests__/TemplateEditor.test.tsx` |

Au repos, les 802 tests passent.

## Contraintes strictes (métier)

- **Ne pas augmenter le délai en aveugle.** C'est la consigne que l'ardoise pose elle-même : *un
  test à 12 % de son plafond n'a pas le même problème qu'un test à 90 %*. La marge réelle de chacun
  des quatre se mesure **avant** de décider quoi que ce soit.
- **Le pendant backend a déjà été résolu, et pas par le délai** (D-44, mergé en `a9524604`) : la
  cause n'était pas la lenteur mais une barrière qui abandonnait en silence. Chercher ici aussi la
  cause avant le symptôme — un `waitFor` sans assertion, un mock qui ne résout jamais, une attente
  sur un effet qui ne se produit pas.
- Une garde qui rougit sous charge **accuse le code**. Le coût n'est pas le test rouge, c'est
  l'heure passée à chercher un bug qui n'existe pas.
- Ces quatre tests rougiront un jour sur un runner GitHub partagé, sur une PR qui n'y est pour rien.

## Delta à produire

- [ ] Mesurer la marge réelle de chacun des quatre tests : temps d'exécution au repos rapporté au
      plafond de 5000 ms
- [ ] Chercher la cause pour chacun — attente sans assertion, promesse non résolue, effet jamais
      déclenché — avant d'envisager le délai
- [ ] Corriger la cause quand il y en a une ; ajuster le plafond seulement pour ceux dont la marge
      mesurée le justifie, et écrire la mesure qui justifie chaque ajustement
- [ ] Rejouer les deux suites **simultanément** cinq fois de suite pour vérifier

## Critères d'acceptation

- [ ] AC1 — la marge de chacun des quatre tests est mesurée et consignée
- [ ] AC2 — cinq exécutions consécutives des deux suites en simultané rendent 0 échec
- [ ] AC3 — tout plafond augmenté cite la mesure qui le justifie ; aucun ne l'est « pour voir »
- [ ] AC4 — la suite front reste verte au repos, et le compte de tests n'a pas baissé

## Hors périmètre

- La couverture et la parallélisation backend — TCK-302.
- L'instabilité Meilisearch backend, soldée (D-44).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
