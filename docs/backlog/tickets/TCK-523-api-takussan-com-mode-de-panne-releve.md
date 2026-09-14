---
id: TCK-523
title: "`api.takussan.com` — le mode de panne du nom de production est relevé et daté, jusqu'à la phase F"
status: todo
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
tags: [infra, dns, tls, production, relevé, adr-0028]
---

## Objectif utilisateur

Que le dépôt dise ce que `api.takussan.com` rend **aujourd'hui** — c'est l'hôte que le front public
appelle — au lieu d'un 404 mesuré sur un serveur qui n'existe plus.

## Contrat de données

Mesuré le 2026-09-14 : `api.takussan.com` → `A 178.18.247.62`, en DNS seul ; Traefik y présente
`CN=TRAEFIK DEFAULT CERT` (émis le 2026-09-14 18:23 Z) et rend 404 derrière. Depuis
`www.takussan.com`, l'appel échoue donc sur la poignée de main TLS, plus sur un 404. ADR-0028 (tableau
« Ce qui sert quoi ») et `CLAUDE.md` (« Workflow git ») portent encore le 404 du 2026-08-20 ;
`docs/infra/hebergement.md` ne liste pas le nom ; `deploy/server/certificats.sh` non plus, à raison
(rouge chaque jour jusqu'à F). TCK-332 et D-04 décrivent l'effet utilisateur, inchangé.

## Contraintes strictes (métier)

- Aucune bascule de `api.takussan.com` derrière Cloudflare avant la phase F (TCK-517) : le
  certificat d'origine ne s'émet qu'avec un routeur Traefik, donc avec la pile de production.
- On écrit ce qu'on lit : la commande, la sortie, la date.

## Delta à produire

- [ ] `docs/infra/hebergement.md`, tableau « Ce qui sert quoi » : ligne `api.takussan.com` — « aucun
  service ; certificat par défaut de Traefik ; le front public échoue sur TLS », avec la commande
  `openssl s_client … -servername api.takussan.com`
- [ ] `CLAUDE.md`, « Workflow git » : le paragraphe du 404 gagne la mesure du 2026-09-14 (le récit
  du changement de serveur va au journal des corrections)
- [ ] TCK-332 : note datée, l'échec est TLS et non 404, même effet
- [ ] Le plan, tâche F3 étape 3 : « `api.takussan.com` rejoint `NOMS` de `certificats.sh` dès que
  son certificat existe » ; commentaire de `certificats.sh` mis en accord
- [ ] Décision écrite dans le ticket : servir ou non un `503` JSON explicite avant F (option :
  proxifier le nom chez Cloudflare avec une règle de réponse), avec le pour et le contre

## Critères d'acceptation

- [ ] AC1 — `node scripts/check-doc-links.mjs` et les gardes documentaires passent
- [ ] AC2 — les trois documents disent la même chose, avec la même date
- [ ] AC3 — `certificats.yml` reste vert (le nom n'y entre qu'en F3)

## Hors périmètre

- Servir l'API de production : TCK-517.
- Corriger le front public pour dégrader proprement sans API : TCK-332.

## Notes d'implémentation

_(à remplir par implementing-specs)_
