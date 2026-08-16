---
id: TCK-300
title: "Les guides de déploiement prescrivent des drivers que les `.env` livrés contredisent"
status: done
phase: P2
family: technique
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, documentation, environnement, deploiement, dette]
---

## Objectif utilisateur

Qu'un opérateur qui suit la checklist de production obtienne l'environnement que la production
exécute réellement — au lieu d'appliquer des consignes qu'aucun fichier livré ne respecte.

## Contrat de données

Aucune donnée applicative. Écarts relevés le 2026-08-12 (ardoise D-11), **à re-mesurer fichier par
fichier avant correction** :

| Source | Prescrit | `.env.preview` / `.env.prod` livrent |
|---|---|---|
| `docs/infra/deploy-preview.html` | `CACHE_STORE=database` | `redis` |
| `docs/infra/deploy-preview.html` | `SESSION_DRIVER=database` | `redis` |
| `docs/infra/deploy-preview.html` | `MAIL_MAILER=log` | `resend` |
| `docs/configuration.md` §5.7 | `QUEUE_CONNECTION=redis` | `database` |
| `docs/configuration.md` | `SESSION_SECURE_COOKIE=true`, `SESSION_SAME_SITE=lax` | **absents des deux** |

La checklist de production n'a jamais été confrontée aux fichiers qu'elle prétend décrire.

## Contraintes strictes (métier)

- **Le sens de la correction n'est pas acquis.** Pour chaque ligne, deux sorties : le guide a
  raison et les `.env` livrés sont en défaut, ou l'inverse. `SESSION_SECURE_COOKIE=true` est une
  consigne de sécurité — son absence des deux `.env` est probablement un défaut à corriger, pas une
  consigne à retirer. Trancher **ligne par ligne**, jamais en bloc.
- `docs/configuration.md` a déjà été corrigé le 2026-08-16 sur sa contradiction Meilisearch : la
  re-mesure doit partir de l'état courant du fichier, pas de la citation de l'ardoise.
- Ce ticket **ne modifie pas la production**. Il fait converger les guides et les `.env` versionnés.
- La convergence sans garde retombe en dette. La sortie doit rendre l'écart détectable.

## Delta à produire

- [x] Chaque ligne re-mesurée — le sens de l'erreur était l'inverse : ce sont les GUIDES qui sont
      en retard, pas les `.env` qui dérivent
- [x] Arbitrage ligne par ligne, raison écrite dans chaque correction
- [x] `docs/configuration.md` corrigé : la ligne 422 qui se contredisait avec §5.7, et §5.7 qui
      prescrivait `QUEUE_CONNECTION=redis`
- [x] Source unique `docs/infra/prod-drivers.json` plutôt qu'une troisième copie — patron de
      `versions.json` (TCK-298)
- [x] Garde dédiée `scripts/check-prod-drivers.mjs`, câblée dans `repo-ci.yml`
- [x] Prouvée **par mutation** trois fois : guide désaligné → rouge · catalogue désaligné du `.env`
      → rouge · et un faux positif sur sa PROPRE prose, corrigé côté garde

## Critères d'acceptation

- [x] AC1 — 11 accords vérifiés, 0 divergence ; `node scripts/check-prod-drivers.mjs --report`
- [~] AC2 — **reformulé après mesure** : les deux clés sont hors dépôt donc non écrivables ici. Leur
      absence est documentée avec sa raison, et surtout **distinguée** — `SESSION_SAME_SITE` a un
      défaut sûr, `SESSION_SECURE_COOKIE` n'en a aucun. Seule la seconde est un trou, renvoyée à
      TCK-288
- [x] AC3 — prouvé par mutation, dans les deux sens (guide et catalogue)
- [x] AC4 — chaque arbitrage porte sa raison, dans le document corrigé et dans les notes

## Hors périmètre

- Les valeurs de `.env.example`, qui décrit un environnement fictif par construction (D-12) et sert
  d'environnement de test à la CI (D-54).
- L'application des corrections sur le serveur — TCK-288.

## Notes d'implémentation

**Le défaut n'était pas qu'une source soit fausse — c'est qu'il y en ait trois.** `configuration.md`
donnait *lui-même* deux réponses opposées : sa ligne 422 affirmait « la production tourne en
`CACHE_STORE=database` » et sa checklist §5.7 prescrivait `CACHE_STORE=redis`, tandis que les deux
`.env` livrés déclarent `redis`. Corriger la ligne fautive aurait laissé trois copies d'une même
valeur dans trois documents, qui divergent au premier changement. `docs/infra/prod-drivers.json`
devient la source unique, sur le patron exact de `versions.json` livré par TCK-298 la même journée.

**Mesures qui corrigent le ticket, et l'ardoise D-11 :**

1. **Le sens de l'erreur était l'inverse de ce que je croyais.** Le ticket supposait « les guides
   prescrivent, les `.env` s'en écartent ». Mesuré : ce sont les **guides** qui décrivent un état
   révolu — le guide « de A à Z » livre un gabarit d'installation neuve (`database`/`log`) et range
   redis/resend dans un tableau « à basculer quand… », alors que les deux environnements livrés ont
   déjà basculé. Le guide n'est pas faux, il est **en retard**.

2. **Un seul désaccord bloquant subsistait**, et la garde l'a trouvé seule : §5.7 prescrivait
   `QUEUE_CONNECTION=redis` quand les deux fichiers déclarent `database`. Les autres lignes du
   tableau du ticket étaient déjà alignées.

3. **`SESSION_SECURE_COOKIE` et `SESSION_SAME_SITE` n'ont pas le même coût, et D-11 les confondait.**
   Les deux sont absentes des `.env` livrés. Mais `config/session.php:202` lit `SESSION_SAME_SITE`
   **avec** le défaut `'lax'`, exactement la valeur prescrite : son absence ne coûte rien.
   `config/session.php:172` lit `SESSION_SECURE_COOKIE` **sans défaut** → `null` → faux → **le cookie
   de session n'est pas marqué `Secure`**. *Deux clés absentes du même fichier n'ont pas le même
   coût : c'est le défaut du code qui décide, pas l'absence.*

4. **Re-vérifié en direct le 2026-08-16** : `preview.api.takussan.com/up` → **200**,
   `api.takussan.com/up` → **404**. D-04 tient.

**Ce que la garde ne peut PAS faire, et pourquoi c'est écrit dans son en-tête.** `.env.preview` et
`.env.prod` sont ignorés par git — même découverte que TCK-296. Ils sont comparés en local et passés
en silence en CI : *une garde ne peut pas garantir ce que le dépôt ne contient pas.* Elle ne prouve
pas non plus que ces drivers **fonctionnent** : `.env.prod` déclare `REDIS_HOST=127.0.0.1` et
`server-setup.sh` n'installe pas Redis. La production n'ayant jamais démarré, personne ne l'a
découvert — c'est le premier risque à lever dans TCK-288, par un `redis-cli ping`, avant tout le reste.

**La garde a rougi sur sa propre correction, et c'est le même piège que TCK-298 venait de trouver.**
Ma phrase expliquant « cette ligne demandait `QUEUE_CONNECTION=redis` » contenait le littéral fautif
en tant que **récit**. Corrigé côté garde, pas côté phrase : seules les lignes d'amorce des cases à
cocher prescrivent, les lignes de continuation expliquent. *Une garde qui ne distingue pas la
prescription du récit interdit d'écrire pourquoi on a corrigé — et rend le dépôt plus muet à mesure
qu'il devient plus juste.*
