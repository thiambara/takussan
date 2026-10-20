---
id: TCK-517
title: "Production — les deux projets passent en auto-hébergement, puis Vercel est retiré"
status: todo
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-10-20
depends_on: [TCK-516, TCK-518, TCK-519, TCK-520, TCK-522, TCK-523, TCK-524, TCK-526]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, production, dokploy, vercel, adr-0028, attendre-go]
---

## Objectif utilisateur

Que `www.takussan.com` appelle une API servie, et que les deux productions tournent là où tournent
leurs préproductions, prouvées de la même façon.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Déroulé :
[plan, phase F](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#phase-f--la-production),
tâches F1 à F5. **Ne s'ouvre que sur la décision du porteur** — pas avant trois mois selon lui au
2026-09-13 ; ses prémisses se re-mesurent en ouvrant F1.

## Contraintes strictes (métier)

- ~~`LICENSE_DESKTOP_SECRET` de CheckPrint Plus garde la valeur de l'export~~ — caduc : CheckPrint Plus
  est arrêté depuis le 2026-10-04.
- La suppression des projets Vercel, irréversible, se fait sur confirmation du porteur, au moins
  7 jours après la bascule.

## Delta à produire

- [ ] F1 — re-mesure, bases, clé Meilisearch et sauvegardes de production ; seaux R2 et domaine
  `media.takussan.com` (étape 6) ; propriété Search Console par DNS TXT et relevé de l'index
  (étape 7) — ajoutées le 2026-10-17, pistes P34.03 et P34.01
- [ ] F2 à F3 — Takussan : `images.yml` sur `master` (image de la préproduction réétiquetée), environnement Dokploy `production`, mise en service DNS — réécrites le 2026-10-18 par TCK-931 (ADR-0069, étape 6)
- ~~F4 — CheckPrint Plus~~ — **annulée le 2026-10-04** : projet arrêté, retiré du serveur et de Vercel
- [ ] F5 — retrait de Vercel, des relevés et de la garde qui le mesuraient
- [ ] Réseau partagé de Dokploy et serveur — ajouté le 2026-10-20, décisions du porteur sur les
  pistes P74.01 à P74.05 et P73.03 (le détail de chaque décision est dans le fichier de pistes) :
  - **P74.04 d'abord** : relever les services attachés à `dokploy-network` et ce que chacun répond à
    un conteneur de la pile sans secret, dans `hebergement.md` ; puis un réseau de données dédié, et
    les piles d'API hors de `dokploy-network` sauf le service `api` ;
  - P74.01 : un alias `takussan-meilisearch` visé par `MEILISEARCH_HOST`, et la garde réseau étendue
    aux noms nus des services partagés ;
  - P74.02 : mesurer `/keys`, `/dumps` et `/snapshots` avec la clé de préproduction, puis des clés à
    liste d'actions fermée, et ces refus dans les preuves d'A4 et de F1 ;
  - P74.03 : un réseau dédié entre Traefik et le front (avec P37.03 et P37.04) ;
  - P74.05 : `REVOKE CONNECT ON DATABASE postgres FROM PUBLIC` aux étapes A4 et F1, et la note sur
    l'authentification basique ;
  - P73.03 : relever ce que Traefik journalise de la chaîne de requête.

## Critères d'acceptation

- [ ] AC1 — `https://api.takussan.com/up` rend 200 et le commit dans `X-Build-Sha`, à travers Cloudflare
- [ ] AC2 — `https://www.takussan.com/` sert le commit, sans `x-vercel-id`
- [ ] AC3 — une adresse usurpée reste refusée à travers Cloudflare
- [ ] AC4 — TCK-332 passe `done`
- [ ] AC5 — le sitemap servi par `www.takussan.com` compte plus de `<loc>` que de biens publiés, il
  est soumis à la Search Console, et le relevé de J+7 est reporté ici (F3, étapes 3 et 7 ; F5,
  étape 1 ; D-72 de l'ardoise)

## Hors périmètre

- Toute évolution applicative.

## Notes d'implémentation

**2026-10-18 — Vercel est supprimé avant ce ticket.** Vercel est supprimé : dernier déploiement de `vercel[bot]` le 2026-10-15 à 13:32 Z ; au
2026-10-18, `www.takussan.com` et `takussan.com` n'ont aucun enregistrement DNS, et
l'environnement GitHub `Production` est supprimé.

- F5, étape 1 est faite, hors de son ordre ; F5, étape 2 devient TCK-860 ; TCK-516 est `obsolete`.
- **Il n'y a plus de site public**, et plus de retour arrière vers Vercel : F3 devient une mise en
  service, pas une bascule. F2 et F3 sont réécrites par l'étape 6 d'ADR-0069 (TCK-931, fait le 2026-10-18).
- AC2 garde son sens (le commit servi) ; « sans `x-vercel-id` » ne peut plus échouer.
- AC5 : le relevé Search Console de J+7 n'a plus de référence d'avant bascule (F1, étape 7), le
  site ayant disparu de l'index pendant l'interruption.
