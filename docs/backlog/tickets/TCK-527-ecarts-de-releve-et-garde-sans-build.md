---
id: TCK-527
title: "Écarts de relevé — courriel ACME, 2FA de Dokploy, `prod-drivers.json` périmé ; et une garde qui refuse tout `build:` dans les Compose"
status: done
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

- [x] Dokploy, *Settings → Traefik* : `certificatesResolvers.letsencrypt.acme.email` = l'adresse du
  porteur ; relevé mis à jour, écart A3 étape 5 refermé dans le plan
- [x] `docs/infra/hebergement.md`, relevé de Dokploy : ligne « Compte et 2FA » (`two_factor_enabled`,
  commande de relecture, sans l'adresse en clair si le porteur le préfère)
- [x] `prod-drivers.json` : décision écrite (régénéré ou retiré), `check-prod-drivers.mjs` et
  `docs/configuration.md` §5.7 en accord ; `CLAUDE.md` § « Environnement de développement » ne
  renvoie plus à un relevé périmé
- [x] `scripts/check-compose-sans-build.mjs` : rougit sur toute clé `build:` dans `deploy/**/*.yml`
  et `docker-compose.yml` n'est **pas** concerné (développement) ; enregistrée dans `repo-ci.yml`
  avec `deploy/**` déjà dans ses `paths:` ; ablation : un `build: .` ajouté rougit

## Critères d'acceptation

- [x] AC1 — `grep email /etc/dokploy/traefik/traefik.yml` ne rend plus `localhost`
- [x] AC2 — `for g in scripts/check-*.mjs; do node "$g"; done` vert, la nouvelle garde comprise
- [x] AC3 — l'ablation `build:` rougit `repo-ci` sur une PR, citée dans le ticket
- [x] AC4 — plus aucun document normatif ne cite `prod-drivers.json` comme source des valeurs
  déployées, ou le fichier est redevenu vrai et daté

## Hors périmètre

- Les valeurs des variables Dokploy : elles ne sont relevées nulle part, par décision (ADR-0028,
  « Ce que ça coûte »).

## Notes d'implémentation

- **Courriel ACME (AC1)** : posé le 2026-09-14, 23:14 Z, par `sed` sur
  `/etc/dokploy/traefik/traefik.yml` (ligne 77, `email:`), valeur = l'adresse du compte
  administrateur de Dokploy (lue dans sa base, table `user`), jamais écrite dans le dépôt ni dans le
  chat ; `docker restart dokploy-traefik`, sondes `preview.api.takussan.com/up` et
  `deploy.takussan.com` → `200` ; `acme.json` : même `sha256` (`4d3b7a0c…`), même taille et date
  avant et après — rien ré-émis. ⚠ **Limite mesurée dans le fonctionnement de Traefik** : le
  compte Let's Encrypt est déjà enregistré dans `acme.json` avec `test@localhost.com` (Let's
  Encrypt l'a accepté : `localhost.com` a un point), et Traefik ne met pas à jour le contact d'un
  compte existant. Changer réellement le destinataire des courriels d'expiration demanderait
  d'effacer `acme.json` et de ré-émettre les cinq certificats — non fait, hors contrainte du ticket
  et sans besoin : `certificats.yml` alerte 14 jours avant. Le nouveau courriel servira à tout
  compte enregistré après une réinstallation.
- **2FA** : `two_factor_enabled = t`, un seul compte, créé le 2026-09-14 (commande au relevé, sans
  l'adresse).
- **`prod-drivers.json` : régénéré, pas retiré.** Les deux consommateurs (`check-prod-drivers.mjs`,
  `docs/configuration.md` §5.7) gardent leur raison d'être — une checklist de production qui
  prescrit un driver doit être confrontée à ce qui sera déployé. Source désormais : Dokploy,
  `compose.one → env` (71 clés pour `takussan-api-preview`), relevé le 2026-09-14 : `DB_CONNECTION=
  pgsql`, `CACHE_STORE=redis`, `SESSION_DRIVER=redis`, `QUEUE_CONNECTION=database`,
  `MAIL_MAILER=log`, `SESSION_SECURE_COOKIE=true` ; `SESSION_SAME_SITE` absente (défaut `lax`,
  gravité faible, reste dans `manques`). La production, qui n'existe pas, porte l'état **`prescrit`**
  (plan F3, étape 1 : l'environnement de D1 à `MAIL_MAILER=resend` près) — un troisième état,
  déclaré dans `_lisez_moi`, parce qu'une checklist ne peut se confronter qu'à une prescription tant
  qu'il n'y a rien à mesurer. `check-prod-drivers.mjs` signale désormais les deux environnements
  comme hors dépôt partout (plus seulement en CI) et compare la checklist : 4 accords, vert.
  `CLAUDE.md`, `docs/configuration.md` et `hebergement.md` disent la même chose (AC4).
- **Garde `check-compose-sans-build.mjs`** : lit tout `deploy/**/*.y(a)ml` par le dossier (2
  fichiers, 5 `image:`), refuse `build:` à toute profondeur hors commentaires, exit 2 si elle ne
  trouve plus de fichier ou plus aucun `image:`. Enregistrée dans Repo CI, dont `paths:` porte déjà
  `deploy/**`. **AC3, ablation en CI** : le premier commit de la PR portait `build: .` sur `api` ;
  run `34908368490` (*Gardes documentaires*) → `failure` sur la ligne `✗
  deploy/takussan/compose.api.yml:43 — \`build:\``. Le commit suivant le retire.
- Un `build:` dans `docker-compose.yml` de la racine reste libre : c'est le poste, pas le serveur.
