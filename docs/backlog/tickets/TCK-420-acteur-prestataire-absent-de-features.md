---
id: TCK-420
title: "L'acteur 🔧 (prestataire) n'est pas dans la légende de features.md, et un générateur du dépôt le dit depuis longtemps"
status: todo
phase: P2
family: technique
estimate: S
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#légende
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [docs, spec]
---

## Objectif utilisateur

La spec connaît tous les rôles que le produit sert.

## Contexte

`docs/features.md` déclare cinq acteurs dans sa légende — 👤, 🏠, 🏢, 🧑‍💼, 🛡️. Le
`service_provider` (🔧) n'y est pas, alors que le produit lui sert une barre latérale, un
parcours d'onboarding complet et tout le domaine des interventions.

Un générateur du dépôt le signale déjà tout seul, et le signalait avant ce ticket
(re-mesuré le 2026-08-27) :

```
$ node docs/gen-features-by-actor.mjs --check
⚠ 1 acteur(s) non déclaré(s) dans la légende de features.md : 🔧
✓ features-by-actor.md est à jour de features.md (233 lignes, 283 placements).
$ grep -c "🔧" docs/features.md
1        # une seule ligne : §2.1, le wizard d'onboarding Service Provider
```

⚠ **Le `--check` sort en 0** : l'écart est une ligne d'avertissement, pas un rouge. Il ne casse
donc aucune CI et ne se lit que si quelqu'un exécute la commande et lit sa sortie — c'est-à-dire
jamais.

Le coût est concret et déjà payé. [TCK-379](TCK-379-app-menu-et-inventaire-des-ecrans-ont-diverge.md)
a dû trancher ce que le menu d'un prestataire doit contenir sans que
[§2.5](../../features.md#25-reporting--tableaux-de-bord) ne dise rien de lui : la décision (« pas
de tableau de bord tant qu'aucun n'est spécifié ») est **écrite dans du code et dans un
commentaire**, pas dans la spec. *Une décision qui ne vit que dans un commentaire est une
décision perdue.*

## Delta à produire

- [ ] Déclarer 🔧 dans la légende des acteurs de `docs/features.md`
- [ ] Placer 🔧 sur les lignes que le produit lui sert déjà (§1.8 maintenance & interventions au
      minimum) — **relevé depuis le code, pas depuis l'intention**
- [ ] Trancher explicitement en §2.5 : tableau de bord prestataire, ou son absence assumée
- [ ] Faire de l'avertissement de `gen-features-by-actor.mjs --check` un **échec** (sortie ≠ 0)

## Critères d'acceptation

- [ ] AC1 — `node docs/gen-features-by-actor.mjs --check` n'émet plus d'avertissement d'acteur
      non déclaré, et sort en 0
- [ ] AC2 — le même script sort en **≠ 0** si on retire 🔧 de la légende ; vérifié par ablation
- [ ] AC3 — §2.5 dit ce qu'il en est du tableau de bord prestataire, dans un sens ou dans l'autre

## Hors périmètre

- Créer un tableau de bord prestataire (ce serait un ticket de code, après cette décision-ci).
