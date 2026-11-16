---
titre: "Exiger le check « API / couverture » sur preview et master"
type: externe
tickets: [TCK-637]
cles: []
creee: 2026-11-16
preview: a-faire
production: a-faire
---

## Quoi faire

TCK-637 coupe le job `lint-and-test` d'`api-ci.yml` en deux (amendement d'ADR-0063 §4) : `lint-and-test` joue
désormais les tests en `--parallel` **sans couverture**, et le nouveau job `couverture` rejoue la suite sous PCOV
et applique le cliquet `bin/coverage-gate.php … --min=92`. Tant que `API / couverture` n'est pas un check
**requis**, une promotion vers `preview` ou `master` peut fusionner avec le cliquet rouge : la protection
n'exige aujourd'hui que `API / lint-and-test`, qui ne mesure plus la couverture.

La protection vit chez GitHub ; aucun commit ne la change. `preview` pilote la préproduction, `master` la future
production : les deux se posent par le même geste, d'où `production: a-faire`.

⚠ **Dans cet ordre**, sans quoi les promotions ouvertes restent bloquées sur « Expected — Waiting for status » :

1. Fusionner TCK-637 sur `dev`, puis ouvrir (ou relancer) une PR de promotion `dev` → `preview`.
2. Relever le nom EXACT du check sur cette PR — ne pas le recopier d'ici :

   ```bash
   gh api "repos/thiambara/takussan/commits/$(gh pr view <PR> --json headRefOid -q .headRefOid)/check-runs?per_page=100" \
     -q '.check_runs[].name' | sort -u | grep -i couverture
   ```

   Attendu : `API / couverture` (le nom du job appelant de `promotion-ci.yml`, puis l'identifiant du job appelé,
   qui n'a pas de `name:`).
3. Ajouter ce check aux checks requis, **sans toucher au reste de la protection** (point d'accès additif, pas le
   `PUT` de toute la protection de TCK-524) :

   ```bash
   for b in preview master; do
     gh api -X POST "repos/thiambara/takussan/branches/$b/protection/required_status_checks/contexts" \
       -f 'contexts[]=API / couverture' -q '.'
   done
   ```

4. Mettre à jour la ligne « Protection des branches » de `docs/infra/hebergement.md` (sept checks requis, avec la
   date de la mesure ci-dessous) — après la mesure, pas avant.

## Comment vérifier

- `gh api repos/thiambara/takussan/branches/preview/protection -q .required_status_checks.contexts` contient
  `API / couverture` et toujours les six précédents ; même chose pour `…/master/protection`.
- Sur la PR de promotion du point 1, le check `API / couverture` apparaît comme *Required*.
- Ablation (facultative, sur une branche jetable vers `preview`) : `--min=` au-dessus du `Total:` mesuré dans le
  job `couverture` → le check rougit et la PR n'est plus fusionnable, alors que `API / lint-and-test` reste vert.

## Historique
