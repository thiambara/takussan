---
name: retro
description: Use when the user asks for a retrospective on a coding session ("retro", "rétro", "qu'est-ce qui aurait évité ça ?"), to propose improvements to the agents' environment — guards, navigation, steering files, tooling — ranked most severe first. Proposes only; writes nothing without the user's go-ahead.
---

# Rétro — améliorer l'environnement des agents après une séance

> Adapté de [`mattpocock/skills`](https://github.com/mattpocock/skills) (`skills/engineering/retro`, v1.3.2, licence
> MIT), aux conventions de ce dépôt : [ADR-0137](../../../docs/adr/0137-une-competence-venue-d-ailleurs-s-adapte-elle-ne-s-installe-pas.md).

**Annoncer au début :** « J'utilise la compétence retro. »

Le porteur demande une **rétrospective**. Le but n'est pas de juger le travail livré, c'est de proposer des
améliorations de l'**environnement** des agents pour que la prochaine séance n'ait pas le même accroc.

## Étapes

1. **Lire [ECRIRE-POUR-LES-AGENTS.md](ECRIRE-POUR-LES-AGENTS.md)** — la manière d'écrire tout ce qu'un agent lit.

2. **Lire les sources primaires de la séance visée.** Par défaut la séance courante. Une autre séance se retrouve dans
   les transcriptions de Claude Code : `~/.claude/projects/<chemin du dépôt, « / » remplacés par « - »>/*.jsonl` (un
   worktree a son propre dossier). Relever les faits — l'appel qui a échoué, la commande relancée, le fichier cherché
   longtemps — pas l'impression qu'en a gardé la séance.

3. **Chercher les candidats** dans les catégories ci-dessous.

4. **Les présenter au porteur, du plus grave au moins grave**, chacun avec : ce qui s'est passé (la preuve, citée de
   la transcription), la catégorie, le correctif proposé et où il s'écrirait. Puis **attendre** : rien ne s'écrit
   sans son accord. Un correctif retenu devient un ticket par `/write-spec`, ou se fait dans la foulée s'il le
   demande.

## Les catégories

- **Gardes automatiques** — une erreur de l'agent qu'une vérification déterministe aurait attrapée. *Quand* : l'agent
  a fait une erreur mécanique. **Lire d'abord l'existant** : `ls scripts/check-*.mjs`, les `npm run check:*` du front,
  `.github/workflows/repo-ci.yml`. Une garde qui existe mais n'est branchée nulle part, ou casse en silence, est le
  constat — pas une garde à réinventer. Une garde neuve suit les règles du dépôt : branchée dans `repo-ci.yml`
  (`scripts/check-gardes-branchees.mjs` le vérifie), son motif et son histoire dans son propre en-tête, prouvée par
  mutation (elle rougit sur le défaut qu'elle existe pour voir).

- **Règle de revue ou de conduite** — l'agent a enfreint une règle qu'aucune garde ne peut tenir. Classer d'abord :
  une violation **mécanique** (un motif de syntaxe, une API bannie, une forme d'import, un emplacement de fichier)
  reçoit une garde, point. Ne réserver l'écrit qu'aux vrais **jugements** (cohérence entre fichiers, « suit le style
  voisin »). **Par défaut, construire la garde plutôt qu'écrire la règle.**

- **Fichiers de pilotage** — le `CLAUDE.md` racine, `takussan-api/CLAUDE.md`, `takussan-web/CLAUDE.md`, les
  compétences de `.agent/skills/`. La répartition du dépôt fait foi : **le `CLAUDE.md` porte la RÈGLE, en une ligne,
  avec un renvoi ; `docs/journal-des-corrections.md` porte le RÉCIT** de ce qu'elle a coûté. Proposer de déplacer
  vers le journal ce qui est du récit, et vers une garde ce qui est mécanique ; une règle, elle, ne quitte jamais le
  `CLAUDE.md`. Chasser aussi les **lignes sans effet** : une consigne que le modèle suit déjà par défaut, ou un compte
  recopié à la main qui ment déjà (le dépôt préfère une commande qui le recalcule).

- **Navigation** — l'agent a mis longtemps à trouver une information. Un **pointeur** (une ligne dans le bon
  `CLAUDE.md`, un renvoi depuis le document qu'il lisait) l'y aurait mené ? Une dépendance cachée entre fichiers
  mérite-t-elle d'être dite là où on la rencontre ?

- **Accès à l'information** — une information cruciale manquait : un journal de serveur de dev, une lecture seule sur
  un service tiers, une commande de diagnostic (`./dev.sh doctor` en est un modèle).

- **Économie d'outils** — un appel coûteux évitable : une suite entière lancée là où
  `php bin/impacted-tests.php --run` suffisait, une lecture de fichier entier pour une ligne, un sous-agent pour une
  vérification qu'on pouvait faire soi-même.

- **Le vocabulaire** — l'agent a tâtonné sur un terme du domaine, ou en a employé un faux. Le correctif est une entrée
  de `docs/glossaire.md` (compétence `domain-modeling`).

- **La mémoire du porteur** — une préférence ou une consigne de méthode qui vaut pour toutes les séances et ne relève
  pas du dépôt (une manière de travailler, pas une règle du code) va dans la mémoire de l'agent, pas dans un
  `CLAUDE.md`.

## Implémentation et revue

Tout travail passe par deux temps : l'implémentation et la revue. L'agent qui implémente porte la plus forte
**pression de contexte** : il explore, écrit et débogue. Celui qui relit reçoit un diff et n'a presque rien à
explorer. Une règle de jugement s'impose donc d'abord à la **revue**, pas à l'implémentation — et une règle mécanique
ne s'impose à personne : une garde la tient.
