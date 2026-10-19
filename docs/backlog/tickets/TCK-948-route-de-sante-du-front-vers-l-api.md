---
id: TCK-948
title: "Une route du front qui joint l'API (`/api/sante`) : la preuve d'`images.yml` et `smoke-web.sh` la lisent, le HEALTHCHECK n'en dépend pas"
status: doing
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-44--front-en-conteneur--healthcheck-de-takussan-web-preview-journaux-next"
tags: [front, infra, deploiement, sante, adr-0028, adr-0069, pistes]
---

## Contexte

Piste P44.01 (angle 44). Le `HEALTHCHECK` de l'image du front et la preuve d'`images.yml` lisent
`/robots.txt`, qui ne joint pas l'API. `docker/demarrer.mjs` ne vérifie que la forme d'`API_URL`,
`SITE_URL` et `MEDIA_URL`, et ne lit pas `API_INTERNAL_URL`, que le serveur prend dès qu'elle est
posée. Un front dont `API_INTERNAL_URL` vise un hôte injoignable, ou un autre environnement, est
donc déclaré sain : Swarm bascule le trafic sur lui et `images.yml` passe au vert, pendant que les
pages publiques rendent « indisponible » ou des listes vides.

Décision du porteur (ligne Statut de la piste), recopiée mot pour mot :

> porteur (2026-10-18) : traité hors agents, en session : une route du front qui joint l'API, lue par la preuve d'`images.yml` et par `smoke-web.sh` (étape « API injoignable »), hors du `HEALTHCHECK`

## Objectif utilisateur

Un déploiement du front qui ne joint pas son API ne passe plus au vert. Une panne de l'API, elle,
n'arrête pas le front.

## Delta à produire

- `takussan-web/src/app/api/sante/route.ts` : `GET`, dynamique, sans cache. Joint `/up` par le chemin
  des lectures serveur (`API_INTERNAL_URL`, sinon `API_URL`, avec les en-têtes du chemin interne),
  délai de 3 s, **sans suivre de redirection** (`redirect: 'manual'`). Rend 200 `{api:"ok"}` si l'API répond 200, sinon 503 `{api:"ko", amont}`. Ni
  l'adresse jointe ni l'erreur dans la réponse : elles vont au journal. `X-Build-Sha` est posé par
  `next.config.ts` comme sur toute réponse.
- `takussan-web/src/lib/api.ts` : `urlSanteApiServeur()`, l'URL de `/up` sur ce chemin.
- `.github/workflows/images.yml` : la preuve attend `/api/sante` après `/robots.txt` (avec
  l'authentification basique de la préproduction). `attendre` exige désormais un **200** en plus du
  bon arbre, puisque `/api/sante` porte `X-Build-Sha` même en 503.
- `deploy/takussan/smoke-web.sh` : `/api/sante` à 200 avec `X-Build-Sha` quand l'API répond, puis
  une étape « API injoignable » (`API_INTERNAL_URL=http://127.0.0.1:9`) où le conteneur reste sain
  et la route rend 503.
- Le `HEALTHCHECK` du Dockerfile ne change pas.

## Critères d'acceptation

- [x] **AC1** — `GET /api/sante` rend 200 quand `/up` répond 200, par `API_INTERNAL_URL` quand elle
      est posée (avec `X-Forwarded-Host` du chemin interne), sinon par `API_URL`. *Mesuré :
      `npx vitest run src/app/api/sante` → 10 tests verts (deux fichiers).*
- [x] **AC2** — 503 quand l'API répond autre chose que 200 (500, 502, 404), quand `/up` redirige
      (même vers une page à 200), quand elle est injoignable, et dans les 3 s quand elle accepte la
      connexion sans répondre ; sans l'adresse ni l'erreur dans le corps ; ni l'appel ni la réponse
      ne sont mis en cache. *Mesuré par exécution : 500/502/404 et injoignable par doublure de
      `fetch` (`route.test.ts`) ; la redirection et le délai contre un VRAI serveur `node:http` local
      avec le `fetch` réel (`route.serveur-reel.test.ts`) : `/up` → 301 vers `/ailleurs` → 200 (le
      serveur de l'épreuve redirige bien : `fetch` suivi → 200, `redirected`) → la route rend 503
      `{api:"ko", amont:301}` ; un `/up` qui ne répond jamais → 503 en moins de 2 s, délai ramené à
      100 ms par espion de `AbortSignal.timeout`, appelé avec 3000. **Ablations** : `const ok = true`
      → 6 rouges ; `redirect: 'manual'` retiré → le cas 301 rouge ; `signal` retiré → le cas muet
      rouge (« figée » à 2 s). Chaque fois restauré par `cp`, `md5` identique.*
- [x] **AC3** — La preuve d'`images.yml` attend `$SITE_URL/api/sante`, et refuse un 503 même s'il
      porte le bon `X-Build-Sha`. *Mesuré : la fonction `attendre` extraite du workflow, contre un
      serveur local → 200 du bon arbre vert, 503 du bon arbre rouge (« rend 503 »), port fermé rouge
      (« rend 000 ») ; **ablation** : l'`attendre` d'avant accepte le 503. `actionlint` → 0.*
- [x] **AC4** — Le `HEALTHCHECK` du Dockerfile lit toujours `/robots.txt`. *Lu :
      `git diff takussan-web/Dockerfile` ne touche que l'`ENV` de TCK-949.*
- [x] **AC5** — `deploy/takussan/smoke-web.sh` sort en 0 : `/api/sante` à 200 avec l'API, puis 503
      avec `API_INTERNAL_URL` vers un port fermé, conteneur sain dans les deux cas. *Mesuré par la
      session le 2026-10-18 (`./dev.sh api`, puis le script, sortie 0 en 115 s) : « ✓ /api/sante à
      200 quand l'API répond, avec X-Build-Sha » et « ✓ API injoignable : conteneur sain,
      /api/sante à 503 ».*
- [ ] **AC6** — Sur la préproduction, la preuve d'`images.yml` lit `/api/sante` à 200. *Au premier
      déploiement de `preview` qui porte ce ticket.*

## Reste

- Relever le job « Prouver ce qui est servi » d'`images.yml` au premier déploiement de `preview`.

## Hors périmètre

- Mettre la route dans le `HEALTHCHECK` : écarté par le porteur. Swarm arrêterait le front à chaque
  panne de l'API.
- Faire joindre l'API par `docker/demarrer.mjs` au démarrage : même raison.

## Notes d'implémentation

- Re-mesuré le 2026-10-18 avant de coder : `HEALTHCHECK` sur `/robots.txt` (`Dockerfile`),
  `attendre "$SITE_URL/robots.txt"` seul dans `images.yml`, aucune route de santé sous
  `src/app/api`. Le constat tient.
- Le chemin est `/api/sante` : le `matcher` du proxy exclut `/api`, la route ne reçoit donc ni
  langue ni `X-Robots-Tag`.
- **Vérification adverse du 2026-10-18** : le cas 301 de la première version était éprouvé par une
  doublure de `fetch`, qui rend le 301 tel quel ; le `fetch` réel suit la redirection, et la route
  rendait 200 `{api:"ok"}`. Le délai n'était éprouvé par rien (retiré, les 8 tests restaient verts).
  D'où `redirect: 'manual'` (sous Node, le statut 301 reste lisible) et le second fichier de test,
  contre un serveur réel. *Une doublure de `fetch` ne prouve rien de ce que fait `fetch` lui-même.*
- La route se déclare `dynamic = 'force-dynamic'` en plus du `cache: 'no-store'` : rien ne doit la
  prérendre au build, où l'API n'existe pas.
