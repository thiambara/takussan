---
id: TCK-525
title: "La preuve du déploiement s'authentifie avec un compte `ci`, distinct de l'identifiant du porteur"
status: todo
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

- [ ] Compte `ci` ajouté sur `takussan-web-preview` et `cpp-web-preview` ; secret
  `PREVIEW_BASIC_AUTH` de chaque dépôt remplacé (`gh secret set … --env preview`)
- [ ] Ablation : le mot de passe du porteur changé, `images.yml` relancé (`workflow_dispatch`)
  reste vert sur la preuve du front
- [ ] `docs/infra/hebergement.md` : les deux paragraphes disent « compte `ci` », et le runbook « donner
  l'accès à un testeur » (ajouter, retirer) y est écrit
- [ ] `docs/hebergement.md` de `thiambara/check-print-plus` : même mise à jour

## Critères d'acceptation

- [ ] AC1 — `curl -u ci:… https://preview.takussan.com/robots.txt` → 200 (code seul, jamais l'URL
  effective)
- [ ] AC2 — le run de l'ablation porte `✓ https://preview.takussan.com/robots.txt sert <sha>`
- [ ] AC3 — `gh secret list --env preview` montre `PREVIEW_BASIC_AUTH` mis à jour ce jour-là,
  dans les deux dépôts

## Hors périmètre

- Cloudflare Access à la place de l'authentification basique : option écrite dans le relevé, pas
  décidée.

## Notes d'implémentation

_(à remplir par implementing-specs)_
