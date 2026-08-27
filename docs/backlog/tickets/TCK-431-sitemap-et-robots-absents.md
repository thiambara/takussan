---
id: TCK-431
title: "Le catalogue public n'est déclaré à aucun crawler : ni sitemap, ni robots, et un POC de design indexable"
status: todo
phase: P1
family: front
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#3-property
tags: [front, seo, public, indexation, visiteur-anonyme]
---

## Objectif utilisateur

Un visiteur qui cherche « villa à louer Dakar » sur un moteur trouve les biens de la plateforme.

## Contexte

Mesuré le 2026-08-27 sur `takussan-web/` :

```
$ find src -name "sitemap*" -o -name "robots*"     → aucun résultat
$ ls src/middleware.ts                             → No such file or directory
```

Ni `src/app/sitemap.ts`, ni `src/app/robots.ts`, ni `public/robots.txt`. Le front de production
est **public et en ligne** (`https://www.takussan.com/` → 200, cf. `CLAUDE.md` § Workflow git) :
un catalogue de biens y est servi sans qu'aucun fichier ne dise à un moteur qu'il existe, ni
quelles URL sont canoniques, ni quelles URL ne doivent pas l'être.

La découverte du catalogue repose donc entièrement sur le maillage interne — et
[TCK-432](TCK-432-accueil-et-liste-sans-rendu-serveur.md) mesure que ce maillage n'existe pas non
plus dans le HTML servi : les cartes de la home et de `/properties` arrivent après hydratation.
**Les deux défauts se couvrent l'un l'autre** : tant que le HTML ne porte aucun lien vers une
fiche, un sitemap est le seul chemin entrant possible ; et tant qu'aucun sitemap n'existe, le
rendu serveur ne suffit pas à faire découvrir les fiches profondes.

⚠️ **Et une surface qui ne devrait pas être publique l'est.** `src/app/(public)/playground/page.tsx`
est un POC de design system (7 palettes commutables, photos `picsum.photos`, les fontes
alternatives que `docs/design-guidelines.md` dit de ne **jamais** voir en production). Il vit dans
le groupe `(public)`, dont le `layout.tsx` déclare `robots: { index: true, follow: true }`, et
aucune page ne l'écrase. Il est donc servi et indexable sur le domaine de production.

## Contrat de données

Endpoints publics existants, tous en place (`takussan-api/routes/api/public.php`) :

- `GET /api/public/properties` — liste paginée des biens publiés (source des URL de fiches).
- `GET /api/public/property-types` — types et comptes, pour les URL de facettes retenues.

⚠️ Il n'existe **aucun** endpoint d'index d'agences ni d'agents (`/public/agencies/{slug}` et
`/public/agents/{slug}` sont les seules routes de ces deux ressources). Les URL de profils publics
ne peuvent donc pas encore entrer dans un sitemap : c'est l'objet de
[TCK-436](TCK-436-index-agences-et-agents.md), dont ce ticket dépend pour ce périmètre-là
seulement.

## Direction UX / Artistique

Sans objet — aucune surface visible n'est produite, hormis le retrait de `/playground` de la
surface publique.

## Contraintes strictes (métier)

- Un sitemap ne liste que ce qui est **réellement indexable** : biens publiés, pages qui ne
  portent pas déjà `robots: { index: false }`. Les écrans personnels (`/favorites`, `/compare`,
  `/bookings`) en sont exclus — ils déclarent déjà `index: false` dans leur `generateMetadata`.
- Le sitemap se **dérive** de l'API, jamais d'une liste écrite à la main. Une liste maintenue à la
  main est juste le jour où on l'écrit.
- Un catalogue au-delà de 50 000 URL exige un index de sitemaps : la forme retenue doit tenir la
  croissance sans réécriture.
- `robots.txt` doit nommer l'URL du sitemap et interdire les surfaces non publiques
  (`/app`, `/admin`, `/super-admin`, `/api`, `/onboarding`, `/auth`, `/publish`).
- **L'hôte du sitemap et des URL absolues ne se devine pas** : il vient d'une variable
  d'environnement, et son absence doit être bruyante, pas silencieuse.

## Delta à produire

- [ ] `src/app/sitemap.ts` — pages statiques + fiches de biens, dérivées de l'API
- [ ] `src/app/robots.ts` — règles + renvoi vers le sitemap
- [ ] Variable d'environnement d'URL publique, ajoutée aux **deux** fichiers gardés par
      `scripts/check-env-parity.mjs`
- [ ] Trancher le sort de `/playground` : retrait, déplacement hors du groupe `(public)`, ou
      `robots: { index: false }` explicite — la décision s'écrit dans le fichier
- [ ] Tests : le sitemap contient une fiche de bien publiée ; il ne contient aucune URL portant
      `index: false` ; `robots.txt` interdit `/app` et `/super-admin`

## Critères d'acceptation

- [ ] AC1 — `GET /sitemap.xml` rend un XML valide contenant l'URL d'un bien publié, en absolu, sur
      l'hôte configuré. Un test le vérifie **par le contenu**, pas par le code HTTP : une réponse
      200 portant un sitemap vide le cocherait aussi.
- [ ] AC2 — `GET /robots.txt` rend une directive `Sitemap:` et interdit `/app`, `/admin`,
      `/super-admin`, `/api`. Un test échouerait si l'une des quatre disparaissait.
- [ ] AC3 — aucune URL déclarant `robots: { index: false }` n'apparaît dans le sitemap. Le test
      est écrit de façon à rougir si `/favorites` y était ajouté.
- [ ] AC4 — `/playground` n'est plus servi indexable sur le domaine de production, et un test le
      constate depuis la métadonnée ou depuis l'absence de la route — pas depuis un commentaire.
- [ ] AC5 — l'hôte manquant fait échouer bruyamment la génération, avec un message qui nomme la
      variable. Un sitemap contenant des URL relatives ou `undefined` fait rougir le test.

## Hors périmètre

- Les URL de profils publics d'agence et d'agent dans le sitemap — dépend de
  [TCK-436](TCK-436-index-agences-et-agents.md).
- Le rendu serveur de la home et de `/properties` — [TCK-432](TCK-432-accueil-et-liste-sans-rendu-serveur.md).
- Les URL canoniques — [TCK-433](TCK-433-canonical-et-metadatabase-absents.md).
- Les pages de facettes SEO par ville / type (`/louer/dakar`…) : surface produit non spécifiée.

## Notes d'implémentation

_(à remplir par implementing-specs)_
