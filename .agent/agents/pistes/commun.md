# Règles communes aux trois agents des pistes

> Lu en premier par `pistes-explorateur`, `pistes-mesureur` et `pistes-implementeur`. La décision,
> le format du fichier et les critères de classement sont dans
> [ADR-0066](../../../docs/adr/0066-trois-agents-sur-les-pistes-d-amelioration.md). **Lis ses § 2
> et § 3 avant d'écrire une ligne dans le fichier de pistes.**

## Où tu es

- Tu tournes **sans humain**, lancé par `scripts/agents/pistes.sh`. Personne ne répondra à une
  question. Ne demande rien : décide selon ces règles. Si elles ne te permettent pas de décider,
  arrête-toi et dis-le dans ton rapport.
- Ton répertoire courant est **ton arbre de travail**, un worktree dédié à ton rôle. Le script l'a
  remis sur `origin/pre-dev` (ou sur la branche de ta PR à réparer) et t'a mis sur ta branche.
  N'en sors pas.
- Trois variables d'environnement te décrivent :
  - `PISTES_ROLE` : ton rôle ;
  - `PISTES_ARBRE` : ton arbre ;
  - `PISTES_SORTIE` : le dossier où tu écris ton rapport, hors du dépôt.
- Le message de lancement te donne le mode (`nouveau` ou `réparation`), la date, le sha de
  `origin/pre-dev` et les PR ouvertes des autres agents.
- Le fichier de pistes est `docs/plans/2026-10-15-pistes-d-amelioration.md`. Il dépasse 1 800
  lignes : **ne le lis pas en entier**. Interroge-le :

  ```bash
  node scripts/check-pistes.mjs --report              # comptes par statut et gravité
  node scripts/check-pistes.mjs --liste "à mesurer"   # Réf, gravité, ligne, statut, titre
  node scripts/check-pistes.mjs --angles-a-faire
  ```

  Puis lis les seules lignes utiles (`sed -n '120,140p' …`).

## Ce que tu ne fais jamais

Une garde (`PreToolUse`) refuse une partie de ces actions. Ces règles valent pour toi **aussi là
où elle ne voit rien**. Contourner la garde, par un détour de shell ou un autre outil, est une
faute, même si elle passe.

- **Publier.** `git push`, créer, fusionner ou commenter une PR, appeler l'API GitHub en écriture :
  c'est le script qui publie, après avoir vérifié ton travail. Toi, tu commites.
- **Toucher** `dev`, `preview` ou `master`, l'arbre principal du porteur, ou un autre worktree.
- **Écrire dans une base ou un index partagés** : la base de développement (port 5433) et le
  Meilisearch local se lisent seulement. Les tests créent leur propre base. Ni `migrate*`, ni
  `db:*`, ni `scout:*`, ni requête SQL en écriture.
- **Toucher aux conteneurs**, sauf `docker ps`, `docker compose ps`, `logs` et `exec` en lecture.
- **Sortir du poste** : préproduction, production, `takussan.com`, Dokploy, Vercel, ssh.
- **Lire ou afficher un secret** : `.env`, trousseau, jeton. Ce qui s'affiche finit dans un
  journal.
- **Ajouter, retirer ou mettre à jour une dépendance.**
- **Écrire du wolof.** Le wolof est en pause depuis le 2026-10-16, jusqu'à nouvel ordre du
  porteur : aucun texte `wo` neuf, aucune réécriture d'un texte `wo` existant. Une clé que tu
  ajoutes porte en `wo` **le texte français tel quel**, pour que la parité de `check:i18n` tienne.
  Une piste qui ne porte que sur le wolof ne se prend pas ; une piste qui demande du wolof en plus
  d'autre chose se fait sans lui, et ta PR le dit.
- **Modifier tes propres bornes** : `.agent/agents/`, `.claude/`, `scripts/agents/`,
  `scripts/check-pistes.mjs`, la CI, l'ADR-0066.
- **Lancer une suite entière** (`php artisan test` sans argument, `npm run test`,
  `php artisan test --parallel`, une couverture). La CI de la PR les joue. Toi, tu lances les
  classes et fichiers que tu touches, ou `php bin/impacted-tests.php --run`. Son option
  `--parallel` est permise : elle ne répartit que la sélection, jamais la suite.

## Comment tu établis un fait

- **Mesurer plutôt que déduire.** Chaque affirmation dit comment elle est établie :
  - **lu** : `fichier:ligne` ;
  - **mesuré** : la commande, et ce qu'elle a rendu ;
  - **déduit** : à écrire « à vérifier », et jamais en 🔴.

  Un nom de fonction, un docblock, un commentaire ou une configuration ne prouvent rien sur ce
  que fait le code.
- **Un test vert ne prouve rien s'il serait vert sans le code qu'il garde.** Pour l'établir,
  retire le correctif, constate le rouge, puis remets-le (ablation).
- **Date et arbre** : toute ligne `Mesure` porte la date du jour et le sha court de
  `origin/pre-dev` donné au lancement.
- **Avant de lancer un test**, relève la charge : `sysctl -n vm.loadavg` et `sysctl -n hw.ncpu`.
  Un rouge sous une charge forte n'accuse pas le code. Dis-le, et ne relance pas en boucle
  jusqu'au vert.

## Ce qui est déjà pris

Avant de choisir ton travail :

```bash
gh pr list --base pre-dev --state open --json number,title,labels,body
```

Une Réf ou un angle cité dans une PR ouverte d'un **autre** agent, ou dans une autre de **tes**
PR ouvertes, est pris : tu ne le traites pas. Seule la PR que tu répares fait exception.
Pour que les autres te lisent de même, ton titre et ton corps de PR citent ce que tu traites (voir
« Fin de passage »).

## Fin de passage

1. **Commits** :
   - en français, préfixés du type conventionnel (`docs(pistes): …`, `fix(api): … (TCK-NNN)`) ;
   - chaque message finit par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ;
   - jamais `--no-verify` ;
   - l'arbre est **propre** à la fin : rien de non commité, aucun fichier de mesure oublié. Un
     test écrit pour mesurer, et non pour garder, se retire avant la fin.
2. **Auto-vérification**, que le script rejoue et qui bloque le push si elle est rouge :

   ```bash
   node scripts/check-pistes.mjs --role "$PISTES_ROLE" --base origin/pre-dev
   ```
3. **Rapport**, dans `$PISTES_SORTIE` :
   - `pr-titre.txt` : une ligne, `[<rôle>] <objet>`, où l'objet cite les Réf ou l'angle ;
   - `pr-corps.md` : en français, sans paraphraser le diff. Ce corps de PR contient :
     - une ligne `Réfs : P01.03, P02.05` (ou `Angle : 17`) ;
     - ce qui a été mesuré et comment, et ce qui a été écarté et pourquoi ;
     - les commandes de vérification lancées et leur résultat réel, rouges compris ;
     - ce que le passage n'a **pas** fait.
4. **Rien à proposer ?** Rien à mesurer, ou tout est pris : écris
   `$PISTES_SORTIE/rien.txt` avec la raison, et ne commite rien. Ce n'est pas un échec.

## Mode réparation

Le message de lancement donne ta PR, et les checks rouges ou le conflit.

- **Tu répares cela et rien d'autre.** Aucun travail neuf dans une réparation.
- **Conflit** : `git merge origin/pre-dev`. Résous, en gardant les lignes `Mesure` des deux côtés,
  puis commite la fusion.
- **Check rouge** : lis le journal du job (`gh run view <id> --log-failed`) et établis la cause.
  - Si c'est un intermittent connu du dépôt, tu peux relancer **une fois** par
    `gh run rerun <id> --failed`, et tu le dis. Deux intermittents connus : la police
    `next/font/google` (« exactly one entry ») et « document is not defined » après le démontage
    de Vitest.
  - Sinon, corrige.
- **Rapport** : `pr-corps.md` décrit la réparation. Le script le poste en commentaire de la PR.
