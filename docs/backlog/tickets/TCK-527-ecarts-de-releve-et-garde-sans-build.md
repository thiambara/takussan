---
id: TCK-527
title: "Écarts de relevé — courriel ACME, 2FA de Dokploy, `prod-drivers.json` périmé ; et une garde qui refuse tout `build:` dans les Compose"
status: doing
phase: P2
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-14
depends_on: [TCK-515]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, dokploy, relevé, gardes, adr-0028]
---

## Objectif utilisateur

Que le relevé dise ce qui est mesuré — le 2FA est activé, l'adresse ACME est une vraie adresse —,
qu'un document qui se déclare périmé cesse d'être une source, et que l'interdiction de construire
sur le serveur (ADR-0028 §2) soit gardée par le dépôt.

## Contrat de données

Mesuré le 2026-09-14 : `traefik.yml` garde `email: test@localhost.com` (écart A3 étape 5, « laissé
tel quel ») ; le compte Dokploy a `two_factor_enabled = t`, absent du relevé ;
`docs/infra/prod-drivers.json` se déclare lui-même périmé dans `docs/infra/hebergement.md`, mais
reste la source de `scripts/check-prod-drivers.mjs` (TCK-300) et de `docs/configuration.md` §5.7 ;
Dokploy lance `docker compose … up -d --build`, sans effet tant qu'aucun service ne porte `build:` —
le jour où l'un en porte un, le serveur construit, contre l'ADR.

## Contraintes strictes (métier)

- Changer le courriel ACME ne ré-émet rien : on le change, on relit `traefik.yml`, on ne touche pas
  `acme.json`.
- `prod-drivers.json` ne disparaît pas sans reprise de sa garde : soit il est régénéré depuis le
  relevé Dokploy (clés seulement) et redevient vrai, soit la garde change de source. Les liens
  morts sont refusés par `check-doc-links.mjs`.
- La nouvelle garde suit les quatre règles d'une garde du dépôt (en-tête avec le défaut réel,
  ablation, déclencheur `paths:` aligné, inventaire par `ls scripts/check-*.mjs`).

## Delta à produire

- [ ] Dokploy, *Settings → Traefik* : `certificatesResolvers.letsencrypt.acme.email` = l'adresse du
  porteur ; relevé mis à jour, écart A3 étape 5 refermé dans le plan
- [ ] `docs/infra/hebergement.md`, relevé de Dokploy : ligne « Compte et 2FA » (`two_factor_enabled`,
  commande de relecture, sans l'adresse en clair si le porteur le préfère)
- [ ] `prod-drivers.json` : décision écrite (régénéré ou retiré), `check-prod-drivers.mjs` et
  `docs/configuration.md` §5.7 en accord ; `CLAUDE.md` § « Environnement de développement » ne
  renvoie plus à un relevé périmé
- [ ] `scripts/check-compose-sans-build.mjs` : rougit sur toute clé `build:` dans `deploy/**/*.yml`
  et `docker-compose.yml` n'est **pas** concerné (développement) ; enregistrée dans `repo-ci.yml`
  avec `deploy/**` déjà dans ses `paths:` ; ablation : un `build: .` ajouté rougit

## Critères d'acceptation

- [ ] AC1 — `grep email /etc/dokploy/traefik/traefik.yml` ne rend plus `localhost`
- [ ] AC2 — `for g in scripts/check-*.mjs; do node "$g"; done` vert, la nouvelle garde comprise
- [ ] AC3 — l'ablation `build:` rougit `repo-ci` sur une PR, citée dans le ticket
- [ ] AC4 — plus aucun document normatif ne cite `prod-drivers.json` comme source des valeurs
  déployées, ou le fichier est redevenu vrai et daté

## Hors périmètre

- Les valeurs des variables Dokploy : elles ne sont relevées nulle part, par décision (ADR-0028,
  « Ce que ça coûte »).

## Notes d'implémentation

_(à remplir par implementing-specs)_
