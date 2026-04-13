---
description: Analyse croisée itérative de docs/features.md et docs/models-spec.md pour les faire converger
---

# /sync-specs — Passe d'alignement features ↔ models-spec

Tu exécutes une **passe d'audit croisé** entre `docs/features.md` (catalogue fonctionnel) et `docs/models-spec.md` (spécification des modèles de données). Objectif : faire converger les deux documents jusqu'à corrélation totale (chaque feature a les modèles/colonnes qui la supportent, et chaque modèle sert au moins une feature).

## Règles strictes

1. **Ne modifie JAMAIS** `docs/features.md` ni `docs/models-spec.md`. Ces deux fichiers sont la source, en lecture seule pour cette commande.
2. Toutes les sorties vont dans `docs/sync-passes/` (créer le dossier s'il n'existe pas).
3. Chaque invocation crée une **nouvelle passe numérotée** : `pass-NNN-YYYY-MM-DD-HHMM/` où `NNN` est incrémenté automatiquement (001, 002, 003…) par rapport aux dossiers existants.
4. Avant d'écrire, lis **intégralement** la passe précédente (si elle existe) et tiens compte de ses recommandations non encore appliquées.

## Étapes d'une passe

### Étape 1 — Inventaire

- Lire `docs/features.md` et `docs/models-spec.md` en entier.
- Lire la passe précédente la plus récente dans `docs/sync-passes/` si elle existe (sinon première passe).
- Noter les recommandations précédentes qui n'ont pas encore été répercutées dans les deux fichiers source.

### Étape 2 — Analyse de corrélation

Pour chaque **feature** de `features.md` :
- Identifier les modèles, colonnes, enums et relations de `models-spec.md` qui la supportent.
- Marquer : ✅ supportée, ⚠️ partiellement supportée, ❌ non supportée.

Pour chaque **modèle/colonne/enum** de `models-spec.md` :
- Identifier la ou les features qui l'utilisent.
- Marquer : ✅ utilisé, ⚠️ partiellement utilisé, ❌ orphelin.

### Étape 3 — Recommandations mutuelles

Produire deux listes de recommandations :

**A. Changements proposés à `features.md`**
- Fonctionnalités à ajouter pour couvrir des capacités du modèle non exploitées.
- Fonctionnalités à reformuler si elles sont ambiguës par rapport au modèle.
- Fonctionnalités à retirer ou repousser (Pn → P3) si aucun modèle ne les supporte et qu'elles ne sont pas prioritaires.
- Ajustements de priorité si une feature P0 dépend d'un modèle marqué 🆕 non bloquant.

**B. Changements proposés à `models-spec.md`**
- Colonnes, enums ou relations manquants pour supporter des features P0/P1.
- Modèles à ajouter ou étendre.
- Indexes, contraintes ou FK onDelete à compléter.
- Éléments orphelins à retirer ou à justifier par une feature nouvelle.

### Étape 4 — Sortie

Dans le dossier `docs/sync-passes/pass-NNN-YYYY-MM-DD-HHMM/`, écrire **trois fichiers** :

1. `01-correlation-matrix.md` — matrice feature ↔ modèle avec statut (✅ ⚠️ ❌).
2. `02-recommendations-features.md` — liste des changements proposés à `features.md` (diff textuel, pas de code).
3. `03-recommendations-models-spec.md` — liste des changements proposés à `models-spec.md` (diff textuel).
4. `00-summary.md` — résumé exécutif en tête : numéro de passe, date, nombre de ✅/⚠️/❌, top 5 points critiques, évolution depuis la passe précédente (combien de ⚠️/❌ résolus, combien subsistent).

### Étape 5 — Index global

Mettre à jour (ou créer) `docs/sync-passes/INDEX.md` :

- Liste chronologique de toutes les passes avec lien vers leur `00-summary.md`.
- Tableau d'évolution : passe N, date, nb features, nb modèles, nb ✅/⚠️/❌, delta vs passe précédente.

### Étape 6 — Commit & push

Après avoir écrit les fichiers de la passe et mis à jour l'`INDEX.md`, effectuer un commit et un push automatiques :

1. `git add docs/sync-passes/` uniquement — ne jamais stager `docs/features.md` ni `docs/models-spec.md`.
2. Vérifier avec `git status` qu'aucun fichier source n'est staged par erreur. Si c'est le cas, `git restore --staged` pour les retirer.
3. Créer un commit avec ce message (HEREDOC) :

   ```
   chore(sync-specs): pass NNN — X ✅ / Y ⚠️ / Z ❌

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```

   où `NNN`, `X`, `Y`, `Z` viennent du `00-summary.md` de la passe.
4. `git push` sur la branche courante. Si pas d'upstream, utiliser `git push -u origin <branche>`.
5. Interdictions : jamais `--no-verify`, jamais `--force`, jamais `git add .` ou `git add -A`. Si un hook pre-commit échoue, investiguer et corriger la cause — ne jamais bypasser.
6. Si le push échoue (conflit, droits, réseau), rapporter l'erreur exacte en fin de réponse sans retry destructif.

## Critères de convergence

La corrélation est considérée **totale** quand :
- Aucun ❌ dans les deux sens.
- Les ⚠️ restants sont explicitement justifiés (P3 / futur, hors périmètre).
- Deux passes consécutives ne produisent plus aucune recommandation actionnable.

Quand cet état est atteint, le `00-summary.md` de la passe doit le déclarer explicitement : **« Convergence atteinte — passes suivantes facultatives »**.

## Ton et format

- Français, concis, factuel.
- Zéro code, zéro SQL. Uniquement du markdown descriptif.
- Citer systématiquement les lignes ou sections concernées (ex: `features.md §1.4` ou `models-spec.md Lease#rent_amount`).
- Ne jamais répéter la recommandation d'une passe précédente déjà appliquée : la suivre dans les fichiers source et la marquer comme résolue dans le résumé.

## Rappel final

Tu ne modifies **que** le dossier `docs/sync-passes/`. Les fichiers `docs/features.md` et `docs/models-spec.md` sont intouchables par cette commande — leur évolution est une décision humaine, appliquée entre deux passes.
