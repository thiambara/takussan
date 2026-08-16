---
id: TCK-311
title: "Cinq documents périmés, un pointeur mort dans les deux specs, et 4 Mo d'images commitées"
status: done
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

- [x] Re-vérifier chaque ligne du tableau contre l'état courant du dépôt
- [x] `docs/claude-code-prompt-notifications.md` — l'écrire, ou retirer sa citation de `models-spec.md`
- [x] `docs/features-by-actor.md` — décider : régénérer depuis `features.md`, ou supprimer
- [x] `docs/seeding-plan.md` — mettre à jour ou supprimer
- [x] `docs/qa/admin-qa.md` — retirer ou corriger le scénario `/admin/roles`
- [x] `takussan-web/README.md` — écrire un vrai README
- [x] Trancher le sort des 4,0 Mo d'images et l'appliquer
- [x] Vérifier le `status:` du document d'onboarding-discovery dont les 10 tickets sont `done`
- [x] Garde CI : un chemin `docs/*.md` cité par une spec et inexistant fait échouer le build
- [x] Prouver la garde **par mutation**

## Critères d'acceptation

- [x] AC1 — aucun chemin de document cité par `features.md` ou `models-spec.md` n'est mort
- [x] AC2 — plus aucun document de `docs/` ne porte de bandeau « désynchronisé » non traité
- [x] AC3 — `docs/qa/admin-qa.md` ne fait tester aucune route inexistante — vérifié contre la table
      des routes front, pas par lecture
- [x] AC4 — la décision sur les images est écrite et appliquée
- [x] AC5 — citer un document inexistant depuis une spec fait échouer la CI

## Hors périmètre

- `docs/models-spec.md` et ses 16 modèles absents — TCK-310.
- `.agent/` vs `.agents/` — TCK-303.
- `docs/plans/routing-layouts-roles.md`, déjà banni le 2026-08-12 (D-17).

## Notes d'implémentation

### Trois lignes du tableau de ce ticket étaient fausses

Re-mesuré le 2026-08-16 avant d'agir, comme l'exige la constrainte n°1. L'inventaire ci-dessus datait
en partie de l'audit du 2026-08-12 :

| Ligne du ticket | Ce que la re-mesure a trouvé |
|---|---|
| « pointeur mort dans **les deux specs** » (titre) | **Une seule** : `models-spec.md:673`. `features.md` n'en cite aucun. |
| `seeding-plan.md` « porte un bandeau ; 3 seeders quand **38** sont en place » | Le bandeau dit « ANTÉRIEUR À L'IMPLÉMENTATION », pas « désynchronisé ». Et **42** classes `extends Seeder`, pas 38 — le bandeau recopiait lui-même un compte faux. |
| `admin-qa.md` « `/admin/roles`, **2 occurrences** » | **3** occurrences, et surtout **4 surfaces supprimées** testées (page + 3 endpoints), plus une sidebar décrite qui n'existe pas. |
| images « captures **commitées par accident** » | `docs/image.png` est **cité** par `design-audit-2026-05-09.md:3` et par TCK-242. Pas un accident. |

### Décisions

**`features-by-actor.md` → dérivé, pas supprimé.** Le supprimer était exclu : **4 tickets `done` le
citent en `spec_refs`**, `check-backlog.mjs` aurait rougi. Et `features.md` est intégralement
machine-lisible par acteur (231 lignes `| Prio | Acteurs | Fonctionnalité |`), donc la vue miroir est
*exactement* dérivable. `docs/gen-features-by-actor.mjs` la produit ; `--check` garde sa fraîcheur.

> Piège d'implémentation : les emoji d'acteur sont des **séquences** (🛡️ = U+1F6E1 U+FE0F,
> 🧑‍💼 = U+1F9D1 U+200D U+1F4BC). `awk` les mutile et un découpage caractère par caractère les
> casse. Le générateur consomme la cellule en essayant les icônes connues, les plus longues
> d'abord.

**`seeding-plan.md` → déplacé, pas supprimé.** Il porte des volumétries cibles, des pondérations de
statuts et une stratégie de backfill de l'`activity_log` **écrites nulle part ailleurs**. Déplacé en
`docs/plans/2026-04-18-seeding-annee-activite.md` (où CLAUDE.md range les plans), bandeau « exécuté ».
Le déplacement a cassé une citation de `configuration.md` — **trouvée par la garde de ce ticket même**,
dans le commit qui l'introduit.

**Images → retirées du HEAD, historique NON réécrit.** Réécrire l'historique de `dev` (branche
d'intégration, 24+ PR) invaliderait tous les clones et toutes les PR ouvertes, et le ticket
l'interdit sans demande explicite. **Le gain n'est pas le poids** — retirer du HEAD n'allège aucun
`git clone`, les blobs restent dans le pack. Le vrai défaut est que ces captures montrent la
**palette bleue révoquée par TCK-129** et se lisaient, dans `docs/`, comme l'état courant de l'UI.
Restitution documentée dans `design-audit-2026-05-09.md` : `git show acec0596:docs/image.png`.

**`docs/claude-code-prompt-notifications.md` → citation retirée, document non écrit.** Il n'a jamais
existé ; l'inventer aurait fabriqué une source de vérité. C'est **la seule modification de
`models-spec.md`**, explicitement autorisée par ce ticket — une ligne, diff vérifié.

### Portée assumée de la garde

`scripts/check-doc-links.mjs` couvre les documents **normatifs** (les 2 specs, les ADR, `docs/*.md`
au premier niveau, les 4 `CLAUDE.md`/`AGENTS.md`, `takussan-web/README.md`) — **pas** tout `docs/`.
Mesuré : `docs/` porte 294 chemins morts, dont **269 dans le seul
`docs/backlog/_archive/INDEX-manuel-2026-08-12.md`**. Ces fichiers sont gelés à dessein ; un pointeur
mort y est un fait d'histoire, et le « corriger » falsifierait la pièce. *Une garde qu'on ne peut pas
rendre verte n'est pas une garde, c'est le bandeau d'avertissement que ce ticket existe pour retirer.*
Une ligne qui nomme délibérément un fichier absent se déclare par `<!-- lien-mort-assumé -->` (8
occurrences, toutes dans l'ardoise).

Règle qui a évité 149 faux positifs : **une citation n'est un chemin que si elle porte un `/`**.
`` `models-spec.md` `` est un *nom* de document, la façon normale de le désigner en prose.

### Preuve par mutation

| Garde | Mutation | Sortie |
|---|---|---|
| `check-doc-links.mjs` | ajout de `` `docs/ce-document-nexiste-pas.md` `` à `features.md` | **1** (puis **0** après révocation) |
| `gen-features-by-actor.mjs --check` | ajout d'une ligne de fonctionnalité à `features.md` (la **source**) | **1** (puis **0** après révocation) |

`features.md` a été restauré et vérifié **octet pour octet identique à HEAD** (`git diff --quiet`) :
la compétence interdit de le modifier, la mutation n'était qu'un banc d'essai.

### Reste ouvert

- **`features.md` déclare un acteur qu'il n'a pas en légende** : 🔧 (Service Provider), ligne 338,
  absent du tableau `### Acteurs`. Non corrigé — la compétence interdit de toucher `features.md`.
  Le générateur le **remonte** dans une section dédiée et avertit sur stderr plutôt que de le taire.
  À solder par un ticket sur la spec.
- `docs/design-audit-2026-05-09.md` est un audit daté dont le constat (« le DS n'est posé que sur
  ~30 % de la surface ») est probablement périmé depuis TCK-242. Hors périmètre de ce ticket.
