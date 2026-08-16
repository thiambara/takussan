---
id: TCK-299
title: "Le déploiement du frontend n'existe dans aucun workflow ni script du dépôt"
status: todo
phase: P1
family: technique
estimate: M
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, front, deploiement, vercel, dette]
---

## Objectif utilisateur

Qu'on puisse répondre, en lisant le dépôt, à la question « quelle branche déploie quel environnement
front ? » — sans avoir de compte Vercel ni demander à quelqu'un.

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-16 :

- `takussan-web/` — environ 870 fichiers `.ts`/`.tsx`, ~110 pages — n'est déployé par **aucun**
  workflow ni script du dépôt.
- Pas de `takussan-web/vercel.json`.
- `deploy.yml` et `deploy-preview.yml` citent **zéro** fichier de `takussan-web/` : les deux ne
  déploient que l'API.
- `web-ci.yml` existe (D-06, soldé le 2026-08-12) mais **teste** ; il ne déploie pas.
- La seule trace de Vercel dans le dépôt est une regex d'origine CORS côté Laravel.

## ✅ Première mesure, obtenue le 2026-08-16 — et sans accès à Vercel

**Le front N'EST PAS « déployé par rien ».** Il est déployé par une **intégration Git Vercel**, et
c'est mesuré : l'ouverture de la PR #176 a fait apparaître deux checks GitHub que le dépôt ne
déclare nulle part —

```
Vercel                    pending   « Vercel is deploying your app »
                          → vercel.com/thiambaras-projects/takussan/6UCsJQJ97xeAeCvUhjzhEPo4NiLF
Vercel Preview Comments   pass
```

Le projet est donc `thiambaras-projects/takussan`, et le déclencheur est l'**intégration côté
Vercel**, pas un workflow. C'est pour cela que `deploy.yml` et `deploy-preview.yml` citent zéro
fichier de `takussan-web/` : ils n'ont jamais eu à le faire.

> **La leçon est la même que D-04, dans l'autre sens.** D-04 disait *« ne jamais déduire l'état d'un
> environnement de la configuration qui le vise »* — et ce ticket avait déduit de l'absence de
> workflow que le déploiement n'existait pas. **Une absence dans le dépôt ne prouve rien : elle
> prouve seulement que le dépôt ne le fait pas.** Il a suffi d'ouvrir une PR pour que le mécanisme
> se montre.

**Ce qui reste à mesurer**, et qui exige toujours le tableau de bord Vercel : quelle branche sert la
production, quelle branche sert la preview, et quelles variables d'environnement le build reçoit.

## Contraintes strictes (métier)

- **Ne rien déduire de la plateforme.** Comme pour D-04, l'existence d'un fichier de configuration
  ne prouve pas qu'un déploiement se produise. Ce que ce ticket écrit sur le mapping
  branche→environnement doit être **vérifié auprès du tableau de bord Vercel**, pas supposé à
  partir des noms de branches.
- Le mapping doit couvrir les trois branches réelles du dépôt : `dev` (intégration), `preview`,
  `master` (figé au 2026-05-18, 31 commits derrière).
- Si le déploiement front reste hébergé par Vercel plutôt que par un workflow du dépôt, c'est une
  **décision structurelle** et elle s'écrit en ADR avant l'implémentation.

## Delta à produire

- [ ] Mesurer l'état réel côté Vercel : quels projets, quelles branches de production/preview,
      quelles variables d'environnement — et le consigner avec sa date
- [ ] ADR : le déploiement front est-il piloté par le dépôt (workflow) ou par Vercel (intégration
      Git) ? Écrire la décision **avant** de toucher au code
- [ ] Selon l'ADR : `takussan-web/vercel.json` versionné, ou workflow de déploiement front
- [ ] Documenter le mapping branche→environnement dans `docs/infra/`
- [ ] Déclarer les variables d'environnement front requises dans un `.env.example` côté
      `takussan-web/`, gardé par `check-env-parity.mjs` ou son équivalent

## Critères d'acceptation

- [ ] AC1 — un lecteur du dépôt peut nommer, sans accès externe, l'environnement front servi par
      chacune des branches `dev`, `preview` et `master`
- [ ] AC2 — la décision « dépôt ou Vercel » est écrite en ADR numéroté, avec ses conséquences
- [ ] AC3 — chaque variable d'environnement dont le build front dépend est déclarée dans le dépôt
- [ ] AC4 — l'état mesuré côté Vercel est daté et cite la commande ou l'écran qui l'a produit

## Hors périmètre

- Le déploiement de l'API — TCK-288.
- Les performances et le CDN images — TCK-105.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
