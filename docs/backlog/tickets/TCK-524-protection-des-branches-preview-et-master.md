---
id: TCK-524
title: "Protection des branches — `preview` et `master` n'acceptent qu'une PR verte ; `dev` reste libre à cause de la carte d'impact"
status: doing
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
tags: [infra, github, ci, securite, adr-0028]
---

## Objectif utilisateur

Qu'un commit qui déploie une préproduction — et demain la production — soit passé par une PR et
par la CI, et qu'un push direct soit refusé plutôt que déployé.

## Contrat de données

Mesuré le 2026-09-14 : `gh api repos/thiambara/takussan/branches/{preview,master,dev}/protection`
→ **404** sur les trois. Un `push` direct sur `preview` déclenche `images.yml`, donc un
déploiement, sans PR ni check. Les environnements GitHub `Preview` et `Production` existent (créés
par Vercel), sans règle de protection ; le réviseur de `Production` est prévu en F2 (TCK-517).
⚠ `dev` reçoit un push direct d'un step de CI (régénération de la carte d'impact, TCK-479, qui a
mesuré ce même 404) : la protéger casserait ce step — hors de ce ticket.

## Contraintes strictes (métier)

- `preview` et `master` : PR obligatoire, checks requis = les jobs des trois workflows (`api-ci`,
  `web-ci`, `repo-ci`) tels que GitHub les nomme, `enforce_admins` activé, pas de force-push, pas de
  suppression.
- Le rituel actuel (`gh pr merge` de `dev` vers `preview`) doit rester possible sans clic
  supplémentaire : pas de réviseur obligatoire sur les branches (le porteur est seul), le réviseur
  vit sur l'environnement `Production` (F2).
- Les noms de checks requis se relèvent (`gh api …/check-runs`), jamais recopiés d'un fichier.

## Delta à produire

- [ ] Règles posées par `gh api -X PUT …/branches/preview/protection` et `…/master/protection`, la
  commande complète dans le ticket
- [ ] Ablation : un `git push origin HEAD:preview` direct est **refusé** ; une PR `dev → preview`
  fusionne normalement une fois verte
- [ ] `CLAUDE.md`, « Workflow git » : la protection, ce qu'elle exige, et pourquoi `dev` n'y est pas
  (TCK-479)
- [ ] `docs/infra/hebergement.md` : ligne « Protection des branches », commande de relecture

## Critères d'acceptation

- [ ] AC1 — `gh api …/branches/preview/protection -q .required_status_checks.contexts` liste les
  checks, même chose pour `master`
- [ ] AC2 — le push direct de l'ablation est rejeté (`protected branch hook declined`)
- [ ] AC3 — une PR `dev → preview` fusionnée après ce ticket déploie et prouve (`images.yml` vert
  avec la ligne `X-Build-Sha`)
- [ ] AC4 — le step de la carte d'impact sur `dev` fonctionne toujours (run cité)

## Hors périmètre

- La protection de `dev` : dépend d'une reprise du step de TCK-479 (jeton d'application ou
  exception), ticket à part si on la veut.
- Le réviseur de l'environnement `Production` : TCK-517, F2.

## Notes d'implémentation

_(à remplir par implementing-specs)_
