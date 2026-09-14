---
id: TCK-518
title: "Journaux d'accès — Traefik écrit chaque requête sur stdout, en JSON, sans l'en-tête d'autorisation"
status: done
phase: P0
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
tags: [infra, dokploy, traefik, observabilite, adr-0028]
---

## Objectif utilisateur

Qu'une requête passée se retrouve après coup : qui l'a envoyée, sur quel hôte, avec quel statut et
en combien de temps — sans avoir à la reproduire en direct.

## Contrat de données

Le relevé du 2026-09-14 (`docs/infra/hebergement.md`, ligne « Journaux d'accès ») mesure
**aucun** journal : `traefik.yml` n'a pas d'`accessLog`, et les conteneurs `api` n'écrivent pas une
ligne par requête. L'évaluation du même jour l'a payé : deux délais dépassés sur
`preview.api.takussan.com` depuis un poste, non reproduits ensuite, et rien sur le serveur ne peut
dire si la requête est arrivée. La configuration statique de Traefik se modifie dans Dokploy
(*Settings → Traefik*) ; le fichier est `/etc/dokploy/traefik/traefik.yml`.

## Contraintes strictes (métier)

- L'en-tête `Authorization` (authentification basique des préproductions) et les cookies ne sont
  **jamais** journalisés : `fields.headers.defaultMode: drop`, seule une liste blanche d'en-têtes.
- L'adresse consignée est celle reconstruite par `forwardedHeaders.trustedIPs` (`ClientAddr`), pas
  l'en-tête `X-Forwarded-For` brut : à prouver par une requête qui forge cet en-tête.
- Le journal va sur **stdout** du conteneur `dokploy-traefik`, borné par la rotation de
  `/etc/docker/daemon.json` (`10m × 3`) — jamais dans un fichier du volume.

## Delta à produire

- [x] `accessLog` dans `traefik.yml` : `format: json`, `bufferingSize: 100`, `fields.defaultMode: keep`,
  `fields.headers.defaultMode: drop` plus `User-Agent` et `Referer` en `keep`
- [x] Vérifier que la rotation s'applique au conteneur `dokploy-traefik` (créé hors Swarm après
  `bootstrap.sh`) : `docker inspect -f '{{.HostConfig.LogConfig}}' dokploy-traefik`
- [x] Ablation : une requête portant `X-Forwarded-For: 203.0.113.7` depuis le poste, sur un hôte en
  DNS seul, est consignée avec l'adresse du poste
- [x] `docs/infra/hebergement.md` : la ligne « Journaux d'accès » dit ce qui est consigné, où, combien
  de temps, et la commande de lecture (`docker logs dokploy-traefik | jq`)
- [x] `deploy/server/bootstrap.sh` ou le runbook « Reconstruire le serveur » : l'étape qui remet
  l'`accessLog` après une réinstallation (le fichier vit hors dépôt)

## Critères d'acceptation

- [x] AC1 — une requête `GET /up?sonde=<aléa>` sur `preview.api.takussan.com` se retrouve dans
  `docker logs dokploy-traefik` avec `RequestHost`, `DownstreamStatus`, `Duration` et `ClientAddr`
- [x] AC2 — une requête avec `Authorization: Basic …` sur `preview.takussan.com` est consignée **sans**
  la valeur de l'en-tête (`grep -c Authorization` → 0)
- [x] AC3 — la requête forgée de l'ablation porte l'adresse du poste, pas `203.0.113.7`
- [x] AC4 — `docker inspect` du conteneur Traefik montre `json-file` avec `max-size=10m`

## Hors périmètre

- Une ligne par requête côté Laravel : le journal de Traefik suffit, l'API garde `LOG_CHANNEL=stderr`
  pour ses erreurs.
- L'expédition des journaux hors du serveur (Loki, R2) : un ticket à part, sur mesure du volume.

## Notes d'implémentation

- Le bloc est **ajouté en fin de fichier** par `deploy/server/journaux-traefik.sh`, pas édité dans
  Dokploy : le geste est rejouable après réinstallation, et prouvé par une requête sonde. `bash
  journaux-traefik.sh` rejoué sort en 0 sans second redémarrage.
- `ClientHost` est déjà l'adresse reconstruite, des deux côtés : à travers Cloudflare (`preview.takussan.com`,
  `forwardedHeaders.trustedIPs`) comme sur un hôte en DNS seul avec un `X-Forwarded-For` forgé, la
  ligne porte l'IP du poste, et `request_X-Forwarded-For` est absent (en-tête non journalisé).
- `ClientUsername` porte le nom d'utilisateur de l'authentification basique de Traefik (`sonde` sur
  le 401 de l'AC2) — jamais le mot de passe. Relevé dans `hebergement.md`.
- `Referer` n'est pas gardé, contrairement au delta : il porte l'URL de la page précédente, donc
  potentiellement un jeton de lien ; `User-Agent` seul suffit au diagnostic.
- PR #279.
