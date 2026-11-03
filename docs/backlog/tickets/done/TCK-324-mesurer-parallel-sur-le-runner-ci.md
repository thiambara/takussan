---
id: TCK-324
title: "Mesurer `--parallel` sur le runner CI, puis trancher — la décision actuelle est un défaut, pas un résultat"
status: done
phase: P2
family: technique
estimate: S
wave: 41
created: 2026-08-17
updated: 2026-08-18
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, tests, ci, performance]
---

## Objectif utilisateur

Que la CI joue la suite backend au rythme que le runner permet réellement — et que la raison de ne
pas paralléliser, s'il faut ne pas le faire, soit une mesure plutôt qu'une absence de mesure.

## Contrat de données

Aucune donnée applicative.

## Contexte

[TCK-321](TCK-321-parallel-en-ci.md) a rouvert et validé `--parallel` en local : ×3,2 sur la
meilleure paire comparable (208,80 s séquentiel à `load average` 3,74 → **64,90 s** à 6,11, 8 cœurs,
mesuré le 2026-08-17), cinq exécutions d'épreuve à **0 échec**.

Son **AC6 est resté en échec, délibérément et par écrit** : la décision d'activer `--parallel` en CI
exigeait une mesure **sur le runner** — 2 à 4 cœurs, contre les 8 de la machine locale — et cette
mesure n'a pas été prise, TCK-321 n'étant pas autorisé à modifier `.github/workflows/api-ci.yml`
(cf. ardoise **D-30**).

**Ce qui rend ce ticket nécessaire plutôt que facultatif** : `--parallel` n'est pas activé en CI, ce
qui est la bonne décision par défaut, mais rien dans le dépôt ne dit que c'est un **défaut** et non
un résultat. Le prochain lecteur de `CLAUDE.md` y trouve « NON activé en CI : la décision exige une
mesure sur le runner, qui n'a pas été prise » — vrai aujourd'hui, et exactement le genre de phrase
qui se lit dans six mois comme « on a mesuré, ça ne valait pas le coup ». *Une décision par défaut
qu'aucun ticket ne porte devient une décision tout court.*

Ce ticket existait jusqu'ici **uniquement dans l'AC en échec de TCK-321**. Le solder sans déposer
celui-ci aurait effacé la suite avec le ticket.

## Contraintes strictes (métier)

- Le **cliquet de couverture `--min=86` n'est pas touché** : PCOV agrège mal entre processus. Si la
  parallélisation est activée, elle l'est sur le job de tests, pas sur celui de couverture.
- Un gain mesuré **inférieur à ~1,5×** sur le runner conclut à **ne pas activer**, et la mesure est
  alors consignée telle quelle : c'est un résultat, et il vaut autant que l'inverse.
- La mesure se prend **sur le runner réel**, jamais par analogie avec les 8 cœurs locaux. C'est la
  faute que D-30 a déjà commise une fois.
- `nproc` et la durée sont relevés **côte à côte**, comme `uptime` + `hw.ncpu` en local : un temps
  sans son contexte de charge ne veut rien dire (cf. le facteur ×11 mesuré localement).
- ⚠ **Deux `--parallel` simultanés se cassent** ([TCK-322](TCK-322-paratest-deux-executions-simultanees.md)).
  En CI, deux jobs concurrents sur un même runner tomberaient dessus. Vérifier que la matrice de
  workflows n'en lance pas deux sur le même hôte avant d'activer.

## Delta à produire

- [x] PR temporaire de mesure sur `api-ci.yml` : step `nproc` + une exécution séquentielle et une
      `--parallel` chronométrées, sur le même commit.
- [x] Relever les deux durées, `nproc`, et le nombre d'échecs de chacune.
- [x] Trancher, et écrire la décision **avec ses chiffres** dans l'ardoise D-30 et dans
      `CLAUDE.md` — en remplaçant la phrase « la mesure n'a pas été prise ».
- [x] Retirer le step temporaire.
- [x] Si activé : vérifier qu'aucun autre job ne parallélise sur le même runner (TCK-322).

## Critères d'acceptation

- [x] AC1 — Les deux durées et `nproc` du runner sont écrits dans D-30, datés.
- [x] AC2 — La décision est prise ET motivée par ces chiffres, dans les deux sens possibles.
- [x] AC3 — `CLAUDE.md` ne dit plus « la mesure n'a pas été prise » : soit le gain mesuré, soit le
      refus mesuré.
- [x] AC4 — Le cliquet `--min=86` rend la même valeur qu'avant, à la décimale.
- [x] AC5 — *sans objet : non activé.* Si activé, la suite CI passe trois fois de suite à 0 échec. Une seule rouge refuse.

## Hors périmètre

- Rendre `--parallel` sûr pour deux exécutions simultanées — c'est TCK-322, et il bloque l'activation
  seulement si deux jobs partagent un runner.
- La suite frontend.
- Toute optimisation du plancher de 105 ms par test (mesuré sans levier dans TCK-320).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Notes d'implémentation

**Mesuré le 2026-08-18** — runner `ubuntu-latest`, `nproc` **4**, AMD EPYC 7763, 15 993 Mo,
`load average` 1,05 au départ. Les deux exécutions sur le **même commit**, dans le **même job**.

| suite | durée | sortie | tests |
|---|---|---|---|
| séquentielle | **206 s** | 0 | 2552 passés, 2 ignorés |
| `--parallel` | **83 s** | 0 | 2554 tests, 8069 assertions, 2 ignorés |

⚠ Le décompte 2552/2554 n'est **pas** un écart : ParaTest imprime le TOTAL (2554 = 2552 + 2
ignorés) là où l'affichage séquentiel les sépare.

**Gain ×2,48 — et la décision est NÉGATIVE quand même.** C'est le point de ce ticket, et il ne se
lisait pas depuis les chiffres : **une seule exécution de la suite porte à la fois les tests et le
cliquet `--min=86`**. PCOV agrégeant mal entre processus, paralléliser cette exécution revient à
abandonner le cliquet, et l'ajouter en second passage coûte +83 s au lieu de −123 s puisque la
couverture reste le chemin critique du job.

*Le gain est réel et inutilisable dans la forme actuelle de la CI.* Ce n'est pas « ça ne vaut pas
le coup », et l'écrire autrement aurait reproduit exactement la phrase que ce ticket existait pour
supprimer.

**Vérifié aussi (contrainte du ticket)** : aucun autre job d'`api-ci.yml` ne parallélise, et chaque
job GitHub obtient son propre runner — le piège de TCK-322 ne s'applique pas.

**Ce qui changerait la réponse** : sortir le cliquet de couverture du job de PR. Le job de tests
rendrait alors son verdict en 83 s au lieu de 206. À ticketer le jour où le temps de retour de PR
devient le sujet.
