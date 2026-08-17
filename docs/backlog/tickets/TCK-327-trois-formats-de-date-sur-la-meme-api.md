---
id: TCK-327
title: "Trois formats de date sur la même API — 55 `toISOString`, 37 `toIso8601String`, 18 `toDateString`"
status: todo
phase: P2
family: technique
estimate: M
wave: 39
created: 2026-08-17
updated: 2026-08-17
depends_on: [TCK-308]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, front, api, resource, contrat, serialisation, convention, dette]
---

## Objectif utilisateur

Qu'une date se lise de la même façon d'un endpoint à l'autre — pour que le front n'ait pas à
connaître, champ par champ, laquelle des trois formes il va recevoir.

## Contrat de données

Aucun modèle nouveau, **et c'est un changement de contrat d'API, pas un nettoyage.**

**Mesuré le 2026-08-17** dans les 45 fichiers de `app/Http/Resources/`, en soldant
[TCK-308](TCK-308-baseresource-adoptee-par-7-sur-44.md). Les formes rendues ont été **vérifiées en
exécutant Carbon**, pas déduites de leur nom :

| Forme appelée | Occurrences | Chaîne émise |
|---|---|---|
| `toISOString()` | **55** | `2026-08-17T12:34:56.000000Z` |
| `toIso8601String()` | **37** | `2026-08-17T12:34:56+00:00` |
| `toDateString()` | **18** | `2026-08-17` |

`BaseResource::iso()` (`format(DateTimeInterface::ATOM)`) rend la **deuxième** forme. Les trois
cohabitent parfois dans le **même fichier**.

Deux écarts, pas un : `toISOString()` diffère de `iso()` par les **microsecondes** *et* par le
suffixe (`Z` contre `+00:00`). Sur un `Carbon` non-UTC, `toISOString()` convertit vers UTC quand
`format(ATOM)` conserve le décalage local — `config/app.php` déclare `'timezone' => 'UTC'`, donc
l'écart d'instant ne se manifeste pas aujourd'hui, **mais il n'est pas fermé par le code**, il l'est
par une valeur de configuration.

**Ce que TCK-308 a livré, et ce qu'il n'a pas livré.** Son *Objectif utilisateur* visait « qu'une
date […] se sérialise de la même façon sur toute l'API ». Il a livré l'**héritage** — les 44
ressources étendent `BaseResource`, donc `iso()` est disponible partout — et **pas l'emploi**. La
migration a été un échange de parent, deux lignes par fichier, précisément pour ne changer aucune
sortie. `scripts/check-resources-extend-base.mjs` écrit cette limite dans sa propre sortie.
Consigné en **ardoise D-36bis**.

**Ne pas confondre avec [TCK-153](TCK-153-formats-devise-date-harmonises.md) (`done`)**, qui traite
le format d'**affichage** côté front (`Intl.DateTimeFormat('fr-FR', …)`, `13 mai 2026`). Ce
ticket-ci traite la chaîne **sur le fil**, avant tout affichage. Les deux couches sont
indépendantes, et les confondre ferait chercher le défaut au mauvais endroit.

## Contraintes strictes (métier)

- **C'est une rupture de contrat, et rien ne la signalerait.** Converger changerait la valeur émise
  pour **73 champs** (55 + 18) sans qu'aucun test backend, aucun typage TypeScript ni aucun lint du
  front ne rougisse : les trois formes sont des `string` valides et `new Date(…)` les parse toutes.
  **L'inventaire des appelants front précède la conversion — pas un `sed`.**
- **Le format retenu est une DÉCISION, à écrire avant d'implémenter.** Trois candidats, et aucun
  n'est neutre : `toIso8601String()`/`iso()` (aligné sur `BaseResource`, mais 73 champs à changer),
  `toISOString()` (majoritaire à 55, mais `iso()` devrait alors changer de définition et les 8
  ressources qui l'emploient déjà changeraient de sortie), ou un format **nouveau**. Le dépôt exige
  qu'une décision structurelle s'écrive en **ADR AVANT l'implémentation** (`docs/adr/`).
- **`toDateString()` n'est pas du même ordre** : une date sans heure porte une intention métier
  (`due_date`, `date de fin de bail`). La convertir en horodatage complet **ajoute** une précision
  fausse et un fuseau qui n'existait pas. Traiter les dates-calendaires séparément, ou les exclure.
- Un champ dont le front dépend de la forme exacte (tri de chaînes, clé de cache, comparaison
  littérale) doit être trouvé **avant** conversion : c'est le cas où la rupture est silencieuse des
  deux côtés.
- **Ne pas assouplir un test** pour absorber le changement. Un test qui comparait une chaîne exacte
  et qu'on relâche en « contient une date » supprime la garde au moment précis où elle sert.

## Delta à produire

- [ ] **ADR** sous `docs/adr/` : quel format d'horodatage l'API émet, et pourquoi — avec le coût
      chiffré de chaque candidat (nombre de champs déplacés)
- [ ] Inventaire **dérivé, pas recopié**, des champs de date émis par `app/Http/Resources/` : par
      ressource, par clé JSON, avec la forme appelée
- [ ] Inventaire des **appelants front** de ces clés (`takussan-web/src`), en marquant ceux qui
      dépendent de la forme exacte plutôt que d'une date parsée
- [ ] Trancher le sort des **18 `toDateString()`** — convertis, ou exclus avec la raison écrite
- [ ] Convertir par domaine, tests verts à chaque étape, **aucune assertion assouplie**
- [ ] Adapter le front là où l'inventaire a montré une dépendance à la forme
- [ ] Garde CI : une date émise hors du format retenu fait échouer le build — avec un **contrôle de
      non-vacuité**, comme les deux gardes de TCK-307 et TCK-308
- [ ] **Prouver la garde par mutation**, sortie exacte consignée
- [ ] Solder **D-36bis** dans `docs/ardoise.md` et mettre à jour `takussan-api/CLAUDE.md`
      § *Ressources* (l'encart qui décrit aujourd'hui l'écart comme ouvert)

## Critères d'acceptation

- [ ] AC1 — un ADR décide du format, et il est écrit **avant** la première conversion
- [ ] AC2 — toute date émise par `app/Http/Resources/` respecte le format retenu, ou figure dans
      une liste d'exceptions **justifiées par écrit** (les dates-calendaires, si c'est la décision)
- [ ] AC3 — l'inventaire des appelants front est consigné, et chaque dépendance à la forme exacte
      est soit adaptée, soit écrite comme non concernée
- [ ] AC4 — la suite backend reste verte, **sans assertion assouplie** ; les tests qui comparaient
      une chaîne exacte comparent toujours une chaîne exacte
- [ ] AC5 — la suite frontend reste verte, et `npx tsc --noEmit` reste propre
- [ ] AC6 — émettre une date hors format fait échouer la CI, **prouvé par mutation**, y compris le
      cas où la garde ne trouve plus sa cible

## Hors périmètre

- Le **formatage d'affichage** côté front — livré par [TCK-153](TCK-153-formats-devise-date-harmonises.md)
  (`done`), et il appartient au front (principe non négociable n°5).
- Les **montants** : leur représentation est figée par
  `tests/Unit/Http/Resources/AmountRepresentationTest.php` (TCK-308) et ne bouge pas ici.
- L'**emploi des trois autres helpers** de `BaseResource` (`enumValue`, `enumLabel`, `mediaUrl`) —
  même famille, mais chacun a son propre coût de contrat ; ce ticket ne traite que les dates.
- L'enveloppe de pagination — [TCK-304](TCK-304-enveloppe-pagination-dupliquee.md).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
