---
name: syncing-specs
description: Use at the end of a lot, or after merging a ticket that changes a spec, to carry what was delivered into docs/features.md and docs/models-spec.md. Default mode edits the two specs from the merged code and verification reports, then commits locally as docs(specs) without pushing. Audit mode (on request only) writes a numbered pass under docs/sync-passes/ and never touches the specs.
---

# Syncing Specs

## Vue d'ensemble

Faire converger `docs/features.md` et `docs/models-spec.md` avec ce que le code **fusionné** fait réellement.
Deux modes :

| Mode | Quand | Écrit | Ne touche jamais |
|---|---|---|---|
| **Report du livré** (défaut) | fin de lot, ou après fusion d'un ticket qui modifie une spec | `docs/features.md`, `docs/models-spec.md` (+ `docs/features-by-actor.md` régénéré, `docs/spatie-query-builder.md` si un filtre ou un `include` a changé) | le code, les tickets fermés |
| **Passe d'audit** (sur demande explicite) | l'utilisateur demande « une passe d'audit » ou « une passe NNN » | `docs/sync-passes/pass-NNN-…/` et `docs/sync-passes/INDEX.md` | `docs/features.md`, `docs/models-spec.md` |

**Annoncer au début :** « J'utilise la compétence syncing-specs, mode report du livré » (ou « mode passe d'audit »).

> Pourquoi le report est le défaut : la pratique réelle de la convergence est l'édition directe des specs en
> `docs(specs): …` (603e184eb, 62c6090b8, c580d4916, 4af7dd63d, 1e47b67d3). La dernière passe d'audit date du
> 2026-10-29 (pass-017). Décision du team-lead du 2026-11-11 (TCK-2737) : la pratique prime.

## Mode 1 — Report du livré (par défaut)

### Sources, dans cet ordre

1. **Le code fusionné** — c'est la seule vérité. Une spec écrite avant l'implémentation n'en est pas une preuve.
2. **Les migrations du lot** (`takussan-api/database/migrations/`, celles que le lot a ajoutées ou modifiées) :
   `git log --diff-filter=AM --name-only <base>..<tête> -- takussan-api/database/migrations`.
3. **`docs/spatie-query-builder.md`** — filtres, tris, `include` et `fields` autorisés par ressource.
4. **Les rapports de vérification** du lot (vérifications adverses, relevés de fidélité, `docs/qa/…`) : ils portent
   les bornes de lecture et les corrections que la revue a imposées après coup.
5. **Le journal du plan du lot** (`docs/plans/<date>-….md`) : décisions du porteur, écarts consignés.
6. Les tickets du lot (`docs/backlog/tickets/done/…`) pour situer un comportement — jamais comme preuve.

### Méthode

1. **Le schéma d'abord, migration par migration.** Pour chaque migration du lot : table, colonnes (type, nullabilité,
   défaut), index et contraintes d'unicité (partielles comprises), FK et `onDelete`, enums PHP touchées. Reporter
   dans `docs/models-spec.md` à la section du modèle. Un modèle de premier niveau neuf doit y être nommé
   (`scripts/check-models-spec.mjs` casse sinon).
2. **Le comportement ensuite.** Pour chaque ticket du lot : qui lit, qui écrit (capacités, profil, agence), quels
   filtres et quelles relations l'API expose, quelles transitions d'état. Reporter dans `docs/features.md`, à la
   section de la fonctionnalité.
3. **Chaque affirmation relue dans le code avant d'entrer dans une spec.** Ouvrir le contrôleur, la policy, le
   service ou la migration qui la porte. Une phrase qu'on ne peut pas rattacher à une ligne de code n'entre pas.
   *Ne jamais conclure d'un docblock, d'une configuration ou d'un nom de ticket.*
4. **Corriger ce qui était faux**, pas seulement ajouter : une colonne renommée, une borne resserrée, une spec écrite
   avant l'implémentation et démentie par le code fusionné.
5. Le texte de spec décrit le comportement, en français, sans code ni SQL au-delà des noms de colonnes, d'enums et de
   paramètres (`filter[paid_from]`, `include=reminders`).

### Ce qui ne se tranche pas ici

Un écart qui demande une **décision** (le code fait X, la spec ou le ticket disait Y, et rien ne dit lequel est
voulu) n'est pas tranché en écrivant la spec :

- soit un ticket `todo` (compétence `.agent/skills/writing-specs/SKILL.md`) ;
- soit une ligne dans le rapport final, avec une recommandation.

La spec décrit alors ce que le code fait, et renvoie au ticket.

### Gardes, avant le commit

```bash
node scripts/check-models-spec.mjs
node scripts/check-doc-links.mjs
node docs/gen-features-by-actor.mjs          # régénère docs/features-by-actor.md
node docs/gen-features-by-actor.mjs --check
```

Toutes vertes, ou l'écart est nommé dans le rapport.

### Commit

- Préfixe `docs(specs): …`, en français, citant les tickets reportés (`(TCK-2578..TCK-2712)`), corps en puces qui
  disent ce qui a changé dans les specs.
- N'indexer que les fichiers de spec touchés (`git add docs/features.md docs/models-spec.md docs/features-by-actor.md …`),
  jamais `git add -A`.
- Pied d'attribution : celui que la session prescrit, pas une ligne recopiée d'ici.
- **Commit local, sans push.** Le `CLAUDE.md` racine : « Ne jamais merger ni pousser sans demande explicite. »
  Ne pousser que si l'utilisateur le demande.
- Dans un arbre partagé entre agents, ne rien écrire dans git : laisser le commit à la session qui délègue.

## Mode 2 — Passe d'audit (sur demande seulement)

Audit croisé des deux specs, sans les modifier. À lancer seulement quand l'utilisateur le demande.

1. **Inventaire.** Lire `docs/features.md`, `docs/models-spec.md`, et la passe la plus récente de `docs/sync-passes/`
   en entier ; noter ses recommandations non encore reportées.
2. **Corrélation.** Pour chaque fonctionnalité : les modèles, colonnes, enums et relations qui la portent
   (✅ / ⚠️ / ❌). Pour chaque modèle ou colonne : les fonctionnalités qui l'utilisent (✅ / ⚠️ / ❌ orphelin).
3. **Sortie** dans `docs/sync-passes/pass-NNN-YYYY-MM-DD-HHMM/` (`NNN` = dernière passe + 1) :
   - `00-summary.md` — numéro, date, compte ✅/⚠️/❌, cinq points critiques, évolution depuis la passe précédente ;
   - `01-correlation-matrix.md` ;
   - `02-recommendations-features.md` ;
   - `03-recommendations-models-spec.md`.
   Citer les sections (`features.md §1.4`, `models-spec.md Lease#rent_amount`). Pas de code ni de SQL.
4. **Index.** Mettre à jour `docs/sync-passes/INDEX.md` (liste chronologique + tableau d'évolution).
5. **Commit local** `chore(sync-specs): pass NNN — X ✅ / Y ⚠️ / Z ❌`, en n'indexant que `docs/sync-passes/`.
   **Sans push**, sauf demande explicite.
6. **Convergence** : aucun ❌ dans les deux sens, ⚠️ restants justifiés, deux passes consécutives sans
   recommandation actionnable. Le résumé le déclare alors : « Convergence atteinte — passes suivantes facultatives ».

Les recommandations d'une passe se reportent ensuite **en mode 1**, ou deviennent des tickets.

## Ce que cette compétence ne fait jamais

- Pousser, fusionner, ou ouvrir une PR sans demande explicite.
- Modifier le code, les tests, ou un ticket fermé pour qu'il colle à la spec.
- Écrire dans une spec une affirmation qu'elle n'a pas relue dans le code.
- Éditer `docs/features.md` ou `docs/models-spec.md` en mode passe d'audit.
- Réécrire les passes 001 à 017 : elles restent en archive.
