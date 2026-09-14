---
id: TCK-520
title: "Le plafond mémoire des fronts se décide sur une mesure sous charge d'images, pas au repos"
status: done
phase: P1
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-14
depends_on: [TCK-515]
blocks: [TCK-517]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, dokploy, front, budget, next-image, adr-0028]
---

## Objectif utilisateur

Que le front de préproduction ne redémarre pas au premier visiteur qui déclenche cinquante encodages
AVIF — et que le plafond de production soit posé sur un chiffre, pas hérité de la préproduction.

## Contrat de données

Relevé du 2026-09-14 : `takussan-web-preview` à **308 Mio sur 384** au repos, stable sur deux
lectures à une heure d'écart, alors que le plan (§ Budget) l'avait mesuré à 57 puis 95 Mio juste
après déploiement. Le cache de l'optimiseur (`/app/.next/cache/images`, 157 entrées, 3,7 Mo) est
dans le conteneur, donc perdu à chaque déploiement : chaque variante AVIF est ré-encodée par le
premier visiteur (`next.config.ts`, `formats`). Une seule réplique : un OOM est un redémarrage
Swarm, visible. Le plafond est posé par `application.update` (`memoryLimit`, en octets).

## Contraintes strictes (métier)

- Le plafond retenu laisse **au moins 20 %** de marge au-dessus du pic mesuré sous la charge définie.
- La charge de mesure est écrite et rejouable : 50 photos de biens distinctes, `w=640`, `Accept:
  image/avif`, en 4 clients simultanés, sur une préproduction fraîchement déployée (cache vide).
- Aucun `OOMKilled` pendant la mesure (`docker inspect -f '{{.State.OOMKilled}}'`).

## Delta à produire

- [x] Script de charge (poste), résultat dans le ticket : pic `docker stats` du front pendant
  et après, temps de réponse médian de `/_next/image`
- [x] Plafond de `takussan-web-preview` porté à la valeur mesurée (au moins 512 Mio si le pic
  approche 384), même geste pour `cpp-web-preview` avec ses propres pages
- [x] Si le pic dépasse 80 % du nouveau plafond : `NODE_OPTIONS=--max-old-space-size=<n>` posé dans
  l'Application Dokploy, et la mesure rejouée
- [x] Le plan, tableau § Budget : colonne « Mesuré sous charge d'images », et la ligne « Instances à
  terme » recalculée pour deux fronts de production
- [x] `docs/infra/hebergement.md`, tableau « Ce qui sert quoi » : les plafonds mis à jour, datés

## Critères d'acceptation

- [x] AC1 — le pic sous charge est écrit dans le ticket avec la commande qui l'a produit
- [x] AC2 — plafond ≥ pic × 1,2, relu par `docker service inspect … .Spec.TaskTemplate.Resources`
- [x] AC3 — `OOMKilled=false` et `RestartCount` inchangé après la charge
- [x] AC4 — la mémoire disponible de la machine reste ≥ 1 500 Mo pendant la charge

## Hors périmètre

- Déplacer l'optimisation d'images vers l'API ou un CDN (`docs/infra/cdn.md`) : une décision à part.
- Un volume pour `.next/cache` : Swarm en `start-first` ferait cohabiter deux répliques sur le même
  cache ; à étudier seulement si la mesure montre que le ré-encodage coûte.

## Notes d'implémentation

- **Mesures du 2026-09-14, 21:03–21:07 Z**, front Takussan recréé à froid (`docker service update
  --force`, start-first, 51 Mo, 0 image en cache), 50 photos distinctes de `/api/public/properties`,
  échantillonnage `docker stats` toutes les ~4 s côté serveur :

  | Passage | Codes | Médiane | Max | Pic mémoire |
  |---|---|---|---|---|
  | 4 clients, `w=640` | 50 × `200 image/avif` | 1,27 s | 5,00 s | 219 Mo |
  | 8 clients, `w=1920` | 50 × `200 image/avif` | 1,57 s | 3,85 s | **327 Mo** |
  | 4 clients, `w=1200` | 50 × `200 image/avif` | 1,81 s | 5,56 s | (265 Mo au repos après) |

  `OOMKilled=false`, `RestartCount=0`, mémoire disponible de la machine jamais sous 5 014 Mo.
  Front CheckPrint Plus : 200 pages (`/`, `/download`, `/auth/login`, `/pricing`) à 4 clients,
  médiane 0,53 s, pic **140 Mo** sur 256.
- **Plafonds** : Takussan 327 × 1,2 = 393 → **512 Mio** ; CheckPrint Plus 140 × 1,2 = 168 → 256
  tient. Pic / nouveau plafond = 64 % < 80 % : pas de `NODE_OPTIONS`.
- `application.update` de Dokploy v0.30.6 exige `memoryLimit` en **chaîne** (`"536870912"`), pas en
  nombre : `Invalid input: expected string, received number`. Puis `application.deploy` ; relu
  `docker service inspect … Limits.MemoryBytes` = `536870912`, conteneur à 50 Mo / 512 Mo.
- Le script n'est pas jetable : `deploy/takussan/charge-images.sh`, pour rejouer la mesure avant
  la production (F1) et après tout changement de `next.config.ts` (`formats`, `deviceSizes`).
- PR #281.
