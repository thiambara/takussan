---
id: TCK-525
title: "La preuve du déploiement s'authentifie avec un compte `ci`, distinct de l'identifiant du porteur"
status: done
phase: P1
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
tags: [infra, dokploy, traefik, secrets, github-actions, adr-0028]
---

## Objectif utilisateur

Que le porteur puisse changer son mot de passe de préproduction, ou le donner à un testeur puis le
retirer, sans casser la preuve `X-Build-Sha` d'`images.yml`.

## Contrat de données

Relevé du 2026-09-14 (`docs/infra/hebergement.md`, `takussan-web-preview` et `cpp-web-preview`) :
l'authentification basique de chaque front n'a **qu'un** identifiant, celui du porteur, et c'est
aussi le secret `PREVIEW_BASIC_AUTH` de l'environnement GitHub `preview` des deux dépôts. Traefik
accepte plusieurs identifiants par routeur (Dokploy, *Security* de l'Application).

## Contraintes strictes (métier)

- Le mot de passe du compte `ci` est généré (`openssl rand -base64 24`), ne transite ni par le chat
  ni par le dépôt, et vit dans le secret GitHub et le gestionnaire de mots de passe.
- L'identifiant du porteur n'est **plus** dans aucun secret GitHub après ce ticket.

## Delta à produire

- [x] Compte `ci` ajouté sur `takussan-web-preview` et `cpp-web-preview` ; secret
  `PREVIEW_BASIC_AUTH` de chaque dépôt remplacé (`gh secret set … --env preview`)
- [x] Ablation : le mot de passe du porteur changé, `images.yml` relancé (`workflow_dispatch`)
  reste vert sur la preuve du front
- [x] `docs/infra/hebergement.md` : les deux paragraphes disent « compte `ci` », et le runbook « donner
  l'accès à un testeur » (ajouter, retirer) y est écrit
- [x] `docs/hebergement.md` de `thiambara/check-print-plus` : même mise à jour

## Critères d'acceptation

- [x] AC1 — `curl -u ci:… https://preview.takussan.com/robots.txt` → 200 (code seul, jamais l'URL
  effective)
- [x] AC2 — le run de l'ablation porte `✓ https://preview.takussan.com/robots.txt sert <sha>`
- [x] AC3 — `gh secret list --env preview` montre `PREVIEW_BASIC_AUTH` mis à jour ce jour-là,
  dans les deux dépôts

## Hors périmètre

- Cloudflare Access à la place de l'authentification basique : option écrite dans le relevé, pas
  décidée.

## Notes d'implémentation

- **Comptes posés le 2026-09-14** par `security.create` sur `takussan-web-preview`
  (`5Y8vfB8wv79iHmJUkAZYA`) et `cpp-web-preview` (`xIKONsco2GU3mb4pcBRjF`), relus par
  `application.one` → `security[].username` : `takussan`, le second compte du porteur, `ci`
  (Takussan) ; `checkprint`, `ci` (CheckPrint Plus). Le middleware Traefik est réécrit à l'appel
  (`createSecurityMiddleware`) : un `security.update` est effectif en moins de 8 s, mesuré trois
  fois, sans redéploiement.
- **Une fuite, fermée par rotation.** En composant la mise à jour des secrets, une expansion zsh
  (`${pair##*:}` mal interprétée) a imprimé des fragments des deux mots de passe `ci` dans la
  session. Les deux ont été régénérés aussitôt (`openssl rand -base64 24`), reposés par
  `security.update` (réponse `200`, seul le code imprimé), les secrets GitHub reposés, le trousseau
  réécrit (`security add-generic-password -U`). Le mot de passe qui a fui n'ouvre plus rien. *Un
  script qui manipule un secret imprime des codes de retour, jamais une variable — et une fuite se
  fait tourner, elle ne se discute pas.*
- **Secrets reposés** (AC3) : `gh secret list --env preview` → `PREVIEW_BASIC_AUTH
  2026-09-14T23:06:38Z` (takussan), `2026-09-14T23:06:46Z` (check-print-plus). Aucun secret GitHub
  ne porte plus l'identifiant du porteur.
- **AC1, 2026-09-14 23:28 Z** : `curl -u ci:… https://preview.takussan.com/robots.txt` → `200`, et
  `200` aussi sur `https://preview.checkprintplus.com/robots.txt` ; un mot de passe faux → `401`.
- **Ablation (AC2), 2026-09-14 23:28-23:30 Z** : mot de passe du compte `takussan` remplacé par une
  valeur jetable (`security.update`, `securityId v2KCwO7hBk0720rdjzGCt`, `200`) ; 8 s plus tard
  `takussan:original → 401`, `ci → 200`. `gh workflow run images.yml --ref preview` → run
  **34909059826** (`workflow_dispatch`, `ad93e5e6`), `success` à 23:30:20 Z, journal :
  `✓ https://preview.api.takussan.com/up sert ad93e5e6…` et
  `✓ https://preview.takussan.com/robots.txt sert ad93e5e6…`. La preuve du front passe donc par
  `ci`, pas par le compte du porteur. Remise en état : `security.update` avec le mot de passe
  d'origine (`200`), 8 s plus tard `takussan:original → 200`, `ci → 200`, faux → `401`.
- Le runbook « donner l'accès à un testeur, puis le retirer » est dans `docs/infra/hebergement.md`
  (paragraphe *Donner l'accès à une préproduction à un testeur*) et dans `docs/hebergement.md` de
  check-print-plus.
