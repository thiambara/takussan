# Les actions humaines du déploiement

Ce dossier tient ce qu'**une personne** doit faire au déploiement, et ce qui a été fait, environnement
par environnement ([ADR-0127](../adr/0127-les-actions-de-deploiement-un-fichier-par-action.md)).

**Ce qui reste à faire se lit, ne s'écrit pas :**

```bash
node scripts/check-actions-de-deploiement.mjs --report preview      # ce qui reste en préproduction
node scripts/check-actions-de-deploiement.mjs --report production   # ce qui reste en production
node scripts/check-actions-de-deploiement.mjs                        # la garde (Repo CI)
```

## Ce qui n'y entre pas

Tout ce qu'un script peut faire va dans `takussan-api/docker/release.sh`, joué à chaque déploiement
avant le démarrage des services. Il fait déjà : `migrate --force`, la réconciliation des rôles système,
les référentiels (`geo:sync-referential`, `tags:sync-catalog`), les règles d'alertes d'exploitation,
`search:sync-index-settings` et la réimportation des index dès que leur forme change. **Ne jamais
écrire ici une de ces commandes** : relire `release.sh` avant.

## Ajouter une action

Un fichier neuf `actions/AAAA-MM-JJ-<slug>.md` (la date du jour où l'action naît) :

```markdown
---
titre: "Poser les clés de l'appel vocal LAfricaMobile"
type: cle-env            # cle-env | externe | donnee | verification | decision
tickets: [TCK-2940]
cles: [VOICE_LAM_BASE_URL, VOICE_LAM_LOGIN]   # les clés d'environnement que l'action pose ([] sinon)
creee: 2026-11-16
preview: a-faire         # a-faire | fait | sans-objet
production: a-faire
---

## Quoi faire
…

## Comment vérifier
…

## Historique
```

- **`cles:`** : toute clé neuve des gabarits `deploy/takussan/env.*.production.example` doit être
  nommée par une action, sinon la garde rougit.
- Une action qui ne concerne qu'un environnement porte `sans-objet` sur l'autre, avec sa ligne.

## Marquer une action faite

Changer l'état de l'environnement **et** ajouter sa ligne sous `## Historique` :

```markdown
- 2026-11-20 · preview · fait · le porteur · `curl -s …` rend 200 ; clé posée dans Dokploy
- 2026-11-20 · production · sans-objet · le porteur · la production n'appelle pas ce fournisseur
```

La garde refuse un `fait` ou un `sans-objet` sans sa ligne. Rien ne se supprime : une action
abandonnée passe `sans-objet`, avec son motif.
