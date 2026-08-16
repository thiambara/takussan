---
id: TCK-311
title: "Cinq documents périmés, un pointeur mort dans les deux specs, et 4 Mo d'images commitées"
status: todo
phase: P3
family: technique
estimate: S
wave: 40
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [documentation, nettoyage, qa, dette]
---

## Objectif utilisateur

Qu'un document de `docs/` soit soit juste, soit absent — pour qu'aucun lecteur ne perde son temps à
appliquer une consigne qui décrit un état antérieur du projet.

## Contrat de données

Aucune donnée applicative. Re-mesuré le 2026-08-16 :

| Élément | État mesuré |
|---|---|
| `docs/claude-code-prompt-notifications.md` | **absent**, et cité par `docs/models-spec.md` |
| `docs/features-by-actor.md` | porte un bandeau « ⚠️ MIROIR DÉSYNCHRONISÉ — gelé au 2026-04-14 » — signalé, **pas corrigé** |
| `docs/seeding-plan.md` | porte un bandeau ; décrit toujours « 3 seeders » quand 38 sont en place |
| `docs/qa/admin-qa.md` | fait toujours tester `/admin/roles`, page qui n'existe pas (2 occurrences) |
| `takussan-web/README.md` | toujours le template `create-next-app` par défaut |
| `docs/image.png` + `docs/image copy.png` | **4,0 Mo** versionnés, captures commitées par accident |

> **Bonnes nouvelles à la re-mesure.** L'ardoise annonçait 5 pointeurs morts (D-19) : il n'en reste
> **1** cité par les deux specs. Elle annonçait 7 documents périmés (D-25) : `docs/configuration.md`
> a été corrigé le 2026-08-16 sur sa contradiction Meilisearch, il en reste **5**. Le
> `docs/superpowers/specs/…-onboarding-discovery-design.md` en `status: draft` est à revérifier.

## Contraintes strictes (métier)

- **Un bandeau d'avertissement n'est pas une correction.** `features-by-actor.md` et
  `seeding-plan.md` ont été signalés le 2026-08-12 sans être traités. Le bandeau a rendu le mensonge
  honnête, il ne l'a pas retiré. Chacun se termine par une décision : régénérer, ou supprimer.
- **Lister l'inventaire avant toute suppression.** Un document périmé peut porter un raisonnement
  qui n'existe nulle part ailleurs. Lire avant de supprimer, et déplacer ce qui mérite de survivre.
  *(TCK-303 a appliqué la règle à `.agents/` : l'inventaire a conclu qu'il n'y avait **rien** à
  sauver — le ticket croyait le contraire. C'est le sens de la règle, pas son démenti : elle sert à
  transformer « il n'y a rien à sauver » d'un pari en un résultat mesuré.)*
- Supprimer une image de l'arbre de travail ne la retire pas de l'historique git : décider
  explicitement si le poids doit disparaître de l'historique ou seulement du HEAD, et écrire ce
  choix.
- `docs/features-by-actor.md` se déclare « vue miroir de `features.md` ». S'il est conservé, il doit
  être **dérivé**, pas maintenu à la main — c'est la leçon de D-15 sur `INDEX.md` : *aucune liste
  maintenue à la main ne reste juste ; seule une liste dérivée le reste.*

## Delta à produire

- [ ] Re-vérifier chaque ligne du tableau contre l'état courant du dépôt
- [ ] `docs/claude-code-prompt-notifications.md` — l'écrire, ou retirer sa citation de `models-spec.md`
- [ ] `docs/features-by-actor.md` — décider : régénérer depuis `features.md`, ou supprimer
- [ ] `docs/seeding-plan.md` — mettre à jour ou supprimer
- [ ] `docs/qa/admin-qa.md` — retirer ou corriger le scénario `/admin/roles`
- [ ] `takussan-web/README.md` — écrire un vrai README
- [ ] Trancher le sort des 4,0 Mo d'images et l'appliquer
- [ ] Vérifier le `status:` du document d'onboarding-discovery dont les 10 tickets sont `done`
- [ ] Garde CI : un chemin `docs/*.md` cité par une spec et inexistant fait échouer le build
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — aucun chemin de document cité par `features.md` ou `models-spec.md` n'est mort
- [ ] AC2 — plus aucun document de `docs/` ne porte de bandeau « désynchronisé » non traité
- [ ] AC3 — `docs/qa/admin-qa.md` ne fait tester aucune route inexistante — vérifié contre la table
      des routes front, pas par lecture
- [ ] AC4 — la décision sur les images est écrite et appliquée
- [ ] AC5 — citer un document inexistant depuis une spec fait échouer la CI

## Hors périmètre

- `docs/models-spec.md` et ses 16 modèles absents — TCK-310.
- `.agent/` vs `.agents/` — TCK-303.
- `docs/plans/routing-layouts-roles.md`, déjà banni le 2026-08-12 (D-17).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
