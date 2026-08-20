---
id: TCK-303
title: "Deux répertoires de compétences concurrents, `.agent/` et `.agents/` — arbitrer, supprimer le mort, et garder contre son retour"
status: done
phase: P1
family: technique
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
tags: [outillage, agents, documentation, arbitrage, dette]
---

## Objectif utilisateur

Qu'un agent qui lit une compétence de ce dépôt lise la bonne — et qu'il n'existe plus deux réponses
opposées à la même question, chacune dans un répertoire que l'autre ignore.

## Contrat de données

> ### ⚠ Ce ticket a été RE-MESURÉ le 2026-08-16 avant implémentation, et sa prémisse était périmée
>
> **La divergence « en croix » n'existait plus au moment où ce ticket a été écrit.** Elle avait
> été soldée **la veille**. Ce qui suit remplace la version d'origine, conservée plus bas.
>
> Le ticket citait `.agent/skills/implementing-specs/SKILL.md` comme affirmant *« Permissions use
> `spatie/laravel-permission` »*. Cette chaîne **n'existait déjà plus nulle part dans le dépôt** :
>
> ```
> 33ce4f69  2026-05-18  la correction RBAC est écrite dans .agents/  ← la copie que personne ne charge
> a9524604  2026-08-15  .agent/ est réécrit : RBAC, INDEX et pile front  ← la croix disparaît (D-45)
> e53ce847  2026-08-16  CE TICKET est rédigé en décrivant l'état d'avant a9524604
> ```
>
> `git show a9524604^:.agent/skills/implementing-specs/SKILL.md | grep -n permission` rend encore la
> ligne 112 fautive ; `git grep 'Permissions use'` sur l'arbre de travail ne rend **rien**.
>
> **D'où venait l'erreur** : l'ardoise **D-46 se contredisait elle-même**. Son tableau annonçait la
> croix ; son dernier paragraphe écrivait *« la ligne RBAC l'est depuis le 2026-08-15 (cf. D-45) »*.
> Le ticket a recopié le tableau et laissé tomber la phrase qui le rectifiait. *Une entrée qui se
> contredit ne se lit pas en entier : on en retient la moitié la plus frappante.* D-46 est corrigée.
>
> **Ce que cela change concrètement** : il n'y avait **rien à fusionner** depuis `.agents/`, et la
> tâche « corriger l'affirmation `spatie/laravel-permission` » était déjà faite. Le reste du ticket
> — arbitrer, supprimer, garder — tient intégralement.

Aucune donnée applicative. **Mesures du 2026-08-16, sur l'arbre de travail :**

- `.agent/` — **646 fichiers** suivis par git. C'est celui que les outils chargent. ✔ conforme
- `.agents/` — **602 fichiers** suivis par git. Personne ne le lit. ✔ conforme
- `.agent/` porte en propre `AGENTS.md`, `INSTALL.md`, `agents/`, `tests/`, `workflows/`, et
  **13 compétences** absentes de `.agents/` — le ticket disait « sept », l'ardoise « 15 ».
- `.agent/skills/` porte **27** compétences, `.agents/skills/` **15**, dont **14 communes**.

**L'inventaire complet des divergences** (`diff -rq .agent/skills .agents/skills`) — **deux**
fichiers différaient, le reste étant des écarts de présence :

| # | Divergence | Version juste | Pourquoi | Décision |
|---|---|---|---|---|
| 1 | `implementing-specs/SKILL.md` — bloc RBAC | **les deux** | `.agent/` depuis `a9524604`, `.agents/` depuis `33ce4f69`. `.agent/` est plus complet : garde CI sur l'import, renvoi à la dette D-21 | garder `.agent/` |
| 2 | `implementing-specs/SKILL.md` — INDEX | **`.agent/`** | `.agents/` prescrit *« Move the ticket bullet »* — le geste manuel qui a rendu l'INDEX faux sur 213 de ses 266 entrées (D-15) | garder `.agent/` |
| 3 | `implementing-specs/SKILL.md` — pile front | **`.agent/`** | `.agents/` décrit **un autre projet** : *« Standalone components (no NgModules) »*, *« PrimeNG 21 »*, port 4201. Ce dépôt est Next 16 / `base-nova` / port 3000 | garder `.agent/` |
| 4 | `writing-specs/SKILL.md` — INDEX | **`.agent/`** | même motif que #2, plus le champ `wave` requis que `.agents/` ignore | garder `.agent/` |
| 5 | 13 compétences absentes de `.agents/` | **`.agent/`** | présence contre absence ; rien à arbitrer | garder `.agent/` |
| 6 | 12 `wds-*` communes | — | **identiques** ; posées par l'installateur du greffon | sans objet |
| 7 | `source-command-sync-specs` — **seulement dans `.agents/`** | **`.claude/commands/sync-specs.md`** | copie mécanique de la commande vivante : corps identique à un préambule de conversion près, et un `Co-Authored-By: Codex` là où la source écrit `Claude`. Le ticket ne la mentionnait pas | **rien à sauver** |

**Conclusion de l'arbitrage : `.agent/` gagne sur les sept lignes, et `.agents/` ne porte aucun
contenu à fusionner.** Le seul fichier qui semblait propre au perdant (#7) était lui aussi une copie
périmée d'un fichier vivant. *La contrainte « lister avant de supprimer » était juste — c'est elle
qui a permis d'écrire « rien à fusionner » comme un résultat mesuré, et non comme un pari.*

## Contraintes strictes (métier)

- **Lister l'inventaire complet des divergences avant toute suppression.** Le diff intégral se
  produit et se lit **avant** de décider quoi que ce soit. *(Tenue. Elle n'a pas sauvé la ligne
  RBAC — qui n'avait plus besoin de l'être — mais elle est ce qui a permis de le prouver.)*
- L'arbitrage porte sur le répertoire qui fait foi ; il ne dispense pas de **fusionner** ce que le
  perdant contient de juste. *(Tenue : mesuré, le perdant ne contenait rien de juste que le gagnant
  n'ait déjà en mieux.)*
- ~~`.agent/skills/implementing-specs/SKILL.md` affirme aujourd'hui l'usage d'un package
  désinstallé.~~ **FAUX au 2026-08-16** — corrigé le 2026-08-15 par `a9524604`. Voir l'encadré.

<details>
<summary>La version d'origine de ce contrat, écrite le 2026-08-16 et déjà périmée</summary>

- `.agent/` porte en propre `AGENTS.md`, `INSTALL.md`, `agents/`, et sept compétences absentes de
  `.agents/` (`brainstorming`, `executing-plans`, `finishing-a-development-branch`,
  `receiving-code-review`, `requesting-code-review`, `single-flow-task-execution`…).

**Et c'est un cas d'école : chacun a raison là où l'autre a tort.**

| Fichier | `.agent/` (chargé) | `.agents/` (mort) |
|---|---|---|
| `skills/implementing-specs/SKILL.md` | ❌ « Permissions use `spatie/laravel-permission` » | ✅ « résolues par `MembershipCapabilityResolver` (TCK-278, Règle 5) » |
| `skills/writing-specs/SKILL.md` | ✅ « `INDEX.md` is **GENERATED** » + champ `wave` requis | ❌ « Add a new bullet line », « `INDEX.md` is part of the deliverable » |

La bonne ligne sur le RBAC vit dans le répertoire mort ; la bonne ligne sur l'INDEX vit dans le
répertoire vivant.

</details>

## Delta à produire

- [x] Produire le diff intégral `.agent/` ↔ `.agents/` et l'inventorier fichier par fichier
- [x] Pour chaque divergence, désigner la version juste — et écrire pourquoi *(7 lignes ci-dessus)*
- [x] Fusionner les corrections du répertoire perdant dans le gagnant — **sans objet, mesuré** :
      le perdant ne portait rien que le gagnant n'ait déjà, en mieux
- [x] Supprimer le répertoire perdant, en une opération séparée et lisible dans l'historique
      *(602 fichiers, commit dédié)*
- [x] Corriger l'affirmation `spatie/laravel-permission` dans la compétence qui fait foi —
      **déjà corrigée le 2026-08-15 par `a9524604`**, la veille de la rédaction du ticket
- [x] Garde CI : un second répertoire de compétences réintroduit fait échouer le build
- [x] Prouver la garde **par mutation** *(4 mutations, dont un contrôle négatif)*

## Critères d'acceptation

- [x] AC1 — un seul répertoire de compétences subsiste, et le dépôt dit lequel
      → `.agents/` supprimé ; `CLAUDE.md` § Workflows nomme `.agent/skills/` et dit pourquoi.
        Aucun document d'entrée ne le disait avant : les quatre points d'entrée le montraient
        par leurs liens, ce qui n'est lisible qu'après enquête.
- [x] AC2 — aucune compétence survivante ne mentionne `spatie/laravel-permission` comme mécanisme
      d'autorisation en vigueur
      → `git grep 'spatie/laravel-permission' .agent/` rend **une** occurrence, et elle dit
        l'inverse : *« has been uninstalled (TCK-278) »*. Vrai avant ce ticket ; vérifié, pas supposé.
- [x] AC3 — l'inventaire des divergences est consigné, avec la décision prise sur chacune
      → tableau à 7 lignes, § Contrat de données.
- [x] AC4 — recréer un second répertoire fait échouer la CI
      → prouvé par mutation, y compris sous un nom que la garde n'avait jamais vu.

## Hors périmètre

- Le contenu métier des compétences au-delà des divergences relevées.
- `.claude/commands/` et `.windsurf/workflows/`, qui sont deux voies équivalentes documentées et
  assumées.

## Notes d'implémentation

**La prémisse du ticket était périmée d'un jour.** Détail, preuve et cause dans l'encadré du § Contrat
de données. L'enseignement n'est pas « le ticket était faux » — c'est **pourquoi** il l'était : il a
recopié la moitié d'une entrée d'ardoise qui se contredisait, et la moitié rectificative est morte là.
D-46 portait les deux affirmations à quinze lignes d'écart. Elle est corrigée, et son tableau d'origine
conservé en `<details>` daté — c'est lui l'objet de la leçon, l'effacer la perdrait.

**Trois temps séparés dans l'historique, délibérément** — garde rouge, puis suppression, puis
documentation :

| Commit | Contenu |
|---|---|
| `a0c6491e` | `scripts/check-skills-dir.mjs` + branchement `repo-ci.yml`. **Commité pendant que `.agents/` existait encore** : la garde y sort en 1 sur ses trois compétences. |
| `d1ba5df1` | suppression de `.agents/` — 602 fichiers. La garde passe au vert. |
| *(celui-ci)* | `CLAUDE.md`, ardoise D-46, ticket. |

L'ordre n'est pas cosmétique : une garde née verte ne prouve pas ce qu'elle attrape. Ici l'historique
porte le rouge **sur le défaut réel**, pas sur une mutation synthétique — `git checkout a0c6491e &&
node scripts/check-skills-dir.mjs` sort en 1 et nomme les trois fichiers.

**Ce que la garde vérifie, et ce qu'elle refuse de vérifier.** Elle ne cherche pas `.agents/` :
mesurer une ressemblance avec le dernier bug ne protège de rien, le prochain arbre s'appellera
`.codex/` ou `.cursor/`. Deux propriétés :

1. **unicité** — aucune compétence écrite par ce dépôt hors de `.agent/skills/` ;
2. **non-vacuité** — le canonique porte bien `implementing-specs` et `writing-specs`, les deux que
   `.claude/commands/` et `.windsurf/workflows/` citent nommément.

La seconde existe parce qu'« aucune copie parasite » n'est pas « la bonne copie » : sans elle,
renommer `.agent/skills/` laissait la garde **verte** pendant que les quatre points d'entrée
pointaient dans le vide. C'est la leçon déjà payée par `check-db-engine.mjs`.

**« Écrite par ce dépôt » se mesure, ne s'énumère pas.** Critère : *absence* de préfixe de
fournisseur (`bmad-`, `wds-`). Mesuré le 2026-08-16 — 15 compétences non préfixées sous
`.agent/skills/`, **zéro** sous `.claude/skills/` et `.windsurf/skills/` (77 chacun, toutes
préfixées). Le critère sépare donc exactement les deux populations, et une compétence ajoutée demain
est couverte le jour où elle est écrite. Une liste nominative serait fausse au prochain ajout — et
fausse avec l'autorité d'une garde verte, ce qui est le défaut que ce dépôt paie en boucle.

**Le déclencheur de `repo-ci.yml` n'énumère pas non plus.** `**/skills/**` et `**/SKILL.md`, aucun
nom de répertoire. Une PR qui n'aurait ajouté qu'un arbre inédit ne déclenchait **aucune** des
lignes existantes : la garde aurait été muette sur le seul défaut qu'elle existe pour voir. Le
bandeau de ce fichier documente déjà trois oublis successifs de ce type.

**Preuve par mutation — 4 mutations, dont un contrôle négatif :**

| Mutation | Attendu | Obtenu |
|---|---|---|
| Réintroduire `.agents/skills/implementing-specs/` | rouge | exit 1, fichier nommé |
| Créer `.codex/skills/implementing-specs/` — nom **jamais vu** | rouge | exit 1, fichier nommé |
| Amputer le canonique de `implementing-specs/` | rouge | exit 1, non-vacuité |
| Créer `.cursor/skills/bmad-quick-dev/` — fournisseur hors canonique | **vert** | exit 0 |

Le quatrième est le plus utile : sans lui, on saurait que la garde rougit, pas qu'elle rougit *à bon
escient*. Une garde qui rougit sur du légitime finit désarmée.

**Gotcha, et il a mordu.** Le `rm -rf .codex` de nettoyage d'une mutation a supprimé
`.codex/config.toml`, **fichier suivi et sans rapport** — j'avais créé `.codex/skills/…` sous un
répertoire qui existait déjà. Rattrapé par `git checkout`. *Une mutation se nettoie par `git status`,
jamais par la mémoire de ce qu'on croit avoir créé.*

**Hors périmètre, non traité, et signalé** — `.claude/skills/` et `.windsurf/skills/` portent
**77 compétences de greffon chacun, dupliquées à l'identique**, plus 12 `wds-*` sous `.agent/skills/`
qui les recoupent : ~166 copies. La garde les ignore délibérément (elles sont posées par un
installateur, personne ne les édite ici, une divergence s'y corrige en réinstallant). Ce n'est pas le
défaut de ce ticket, mais ce n'est pas rien non plus — à ticketer si l'on veut réduire l'arbre.
