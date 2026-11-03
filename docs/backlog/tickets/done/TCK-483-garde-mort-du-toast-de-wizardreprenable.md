---
id: TCK-483
title: "Le garde `if (!completing)` de `WizardReprenable` est du code mort : la fermeture fige `completing` à `false`"
status: done
phase: P2
family: front
estimate: S
wave: 53
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-475]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, wizard, dette]
---

## Objectif utilisateur

À la fin d'un assistant, le brouillon est supprimé volontairement. Annoncer « Progression
sauvegardée » à ce moment-là est faux, et c'est précisément ce qu'un garde existant devait
empêcher.

## Le défaut

`takussan-web/src/components/wizard/WizardReprenable.tsx:154` — le garde `if (!completing)` du
toast de succès **n'a jamais rien gardé**. L'effet qui l'entoure déclare `[hydrated]` pour seule
dépendance (l. 160) : sa fermeture de nettoyage capture `completing` **tel qu'il valait à
l'hydratation**, c'est-à-dire `false`, définitivement.

Coût : le toast « Progression sauvegardée » part **aussi** sur le chemin de finalisation, là où le
brouillon vient d'être supprimé par `clear()`. Le garde existe pour l'empêcher et ne l'a jamais
fait.

⚠ **Ce défaut n'est pas aggravé par TCK-475** — il préexistait, et le correctif de TCK-475 ne le
traverse pas. Il est relevé ici parce qu'un garde mort dans un fichier qu'on vient de corriger est
exactement ce qu'on ne rouvrira plus jamais.

*Une valeur figée par une fermeture ne se voit pas à la lecture : le garde est écrit, il est juste,
et il porte sur une variable qui ne bouge plus.*

## Contrat de données

Aucun.

## Delta à produire

- [x] Rendre la valeur lisible au moment du nettoyage — une `ref` plutôt qu'une variable capturée,
      ou une dépendance juste — et **écrire laquelle**, parce que les deux ont des conséquences
      différentes sur le nombre d'exécutions de l'effet.
- [x] Vérifier que corriger la dépendance ne fait pas repartir l'effet à chaque changement d'état :
      c'est probablement pour ça que `[hydrated]` avait été écrit.

## Critères d'acceptation

- [x] **AC1** — sur le chemin de finalisation, le toast « Progression sauvegardée » **ne part
      pas** ; sur le chemin de démontage ordinaire, il part toujours.
- [x] **AC2** — un test **compte** les exécutions de l'effet avant et après : une correction par la
      liste de dépendances qui multiplierait les écritures serait un remède pire que le mal.
- [x] **AC3** — ablation : rétablir la capture figée fait rougir AC1, changement prouvé par `md5`
      **avant** lecture du résultat.

## Hors périmètre

- Les deux sites de toast corrigés par TCK-475.
- La stratégie de reprise du brouillon elle-même.

## Notes d'implémentation

Relevé par l'agent de TCK-475 en marge de son ticket, et signalé plutôt que corrigé — la
correction touche l'ordonnancement d'un effet, ce qui n'est pas un delta de toast.

**Le ticket posait le choix entre une `ref` et une dépendance juste. La mesure a tranché contre la
dépendance, et le ticket avait raison de deviner pourquoi `[hydrated]` était écrit là.** L'effet a
été instrumenté en comptant ses poses et déposes d'écouteur `pagehide` sur un parcours complet
(hydratation → saisie → étape suivante → *Terminer* → démontage) :

| Forme | Poses de l'effet | Déposes (= `flush()` de nettoyage) | Toasts « Progression sauvegardée » |
|---|---|---|---|
| `[hydrated]` + `finalisationRef` — **le correctif retenu** | **1** | **1** | **0** |
| `[hydrated]` + `!completing` — l'état d'avant | 1 | 1 | 1 *(le défaut du ticket)* |
| `[hydrated, completing]` + `!completing` — le remède par les dépendances | **3** | **3** | **2** |

Le troisième n'est pas seulement trois fois plus coûteux, il est **faux d'une façon neuve** : le
premier de ses deux toasts part **dès le clic sur *Terminer***, mesuré à `deposes=2, toasts=1`
avant tout démontage — annoncé à quelqu'un qui n'a rien quitté. Et il ne corrige même pas le défaut
d'origine : AC1 reste rouge, parce que chaque instance de l'effet re-capture `completing` et que la
dernière le capture à `false`.

**Mais la `ref` ne pouvait pas se contenter de recopier `completing`, et c'est le point que le
ticket ne pouvait pas voir.** `completing` retombe à `false` dans le `finally` de `handleNext`,
donc **avant** le démontage qu'une navigation de fin de parcours provoque : une `ref` miroir de
l'état serait restée fausse au moment exact où on veut qu'elle soit vraie, et AC1 serait resté
rouge. Ce que le garde doit lire est ce que son propre commentaire disait déjà — *« le brouillon a
été effacé volontairement »*, et non *« une finalisation est en cours »*. D'où `finalisationRef`,
armée à l'entrée du chemin de finalisation (**avant le premier `await`** : le démontage peut
survenir pendant `onComplete`) et désarmée **seulement** si ce chemin s'interrompt avant `clear()`.

*Un état booléen et le fait qu'il décrit ne durent pas le même temps.*

**Le désarmement est porteur, et il est éprouvé.** Une finalisation refusée par le réseau (TCK-475,
site 2) laisse le brouillon serveur vivant ; une sauvegarde acceptée plus tard doit s'annoncer
normalement. Une `ref` armée une fois pour toutes éteindrait ce toast-là pour le reste de la
session — c'est l'objet du troisième test, et son ablation le fait rougir.

**Ablations (les deux, `md5` relevé avant lecture du résultat) :**

| Ablation | `md5` | Effet |
|---|---|---|
| garde rétabli en `if (!completing)` (capture figée) | `0f8638…` → `d7febd…` | AC1 **rouge**, 11/12 |
| `finalisationRef.current = false` retiré de la branche d'échec | `0f8638…` → `d49d43…` | AC1-discriminant **rouge**, 11/12 |

⚠ La première tentative d'ablation par `perl -0pi -e 's/\Q…\n\E//'` a rendu un `md5`
**inchangé** — `\n` est littéral dans `\Q…\E` — et la suite est restée verte à 12/12. *Une
ablation qui ne modifie rien rend un vert qui ressemble trait pour trait à « le test ne garde
rien ».* C'est le `md5` pris avant la lecture qui l'a attrapée, et c'est exactement ce pour quoi
AC3 l'exige.

**Vérification** : `npx vitest run src/components/wizard/__tests__/WizardReprenable.test.tsx` →
**12/12** (8 préexistants, dont les 4 de TCK-475, + 4 neufs). Les cinq fichiers des consommateurs
(`onboarding/__tests__`, `search/__tests__/FilterSidebar.test.tsx`, `wizard/`) → **25/25**.
`npx tsc --noEmit` propre (3,7 s), `npx eslint` sur les deux fichiers → 0.
