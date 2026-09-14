---
id: TCK-518
title: "Journaux d'accès — Traefik écrit chaque requête sur stdout, en JSON, sans l'en-tête d'autorisation"
status: todo
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

- [ ] `accessLog` dans `traefik.yml` : `format: json`, `bufferingSize: 100`, `fields.defaultMode: keep`,
  `fields.headers.defaultMode: drop` plus `User-Agent` et `Referer` en `keep`
- [ ] Vérifier que la rotation s'applique au conteneur `dokploy-traefik` (créé hors Swarm après
  `bootstrap.sh`) : `docker inspect -f '{{.HostConfig.LogConfig}}' dokploy-traefik`
- [ ] Ablation : une requête portant `X-Forwarded-For: 203.0.113.7` depuis le poste, sur un hôte en
  DNS seul, est consignée avec l'adresse du poste
- [ ] `docs/infra/hebergement.md` : la ligne « Journaux d'accès » dit ce qui est consigné, où, combien
  de temps, et la commande de lecture (`docker logs dokploy-traefik | jq`)
- [ ] `deploy/server/bootstrap.sh` ou le runbook « Reconstruire le serveur » : l'étape qui remet
  l'`accessLog` après une réinstallation (le fichier vit hors dépôt)

## Critères d'acceptation

- [ ] AC1 — une requête `GET /up?sonde=<aléa>` sur `preview.api.takussan.com` se retrouve dans
  `docker logs dokploy-traefik` avec `RequestHost`, `DownstreamStatus`, `Duration` et `ClientAddr`
- [ ] AC2 — une requête avec `Authorization: Basic …` sur `preview.takussan.com` est consignée **sans**
  la valeur de l'en-tête (`grep -c Authorization` → 0)
- [ ] AC3 — la requête forgée de l'ablation porte l'adresse du poste, pas `203.0.113.7`
- [ ] AC4 — `docker inspect` du conteneur Traefik montre `json-file` avec `max-size=10m`

## Hors périmètre

- Une ligne par requête côté Laravel : le journal de Traefik suffit, l'API garde `LOG_CHANNEL=stderr`
  pour ses erreurs.
- L'expédition des journaux hors du serveur (Loki, R2) : un ticket à part, sur mesure du volume.

## Notes d'implémentation

_(à remplir par implementing-specs)_
