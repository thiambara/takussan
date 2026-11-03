---
id: TCK-1483
title: "Les biens similaires de la fiche lus au rendu serveur, les avis demandés à l'approche"
status: done
phase: P1
family: front
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-103--appels-du-navigateur-à-lhydratation-des-pages-publiques"
tags: [front, seo, performance, public, pistes]
---

## Contexte

Réf : **P103.07** du fichier de pistes, `validé`.

La fiche publique demande ses biens similaires et ses avis au navigateur, dans un `useEffect` au
montage : le HTML servi ne porte aucun lien vers les biens similaires, alors que la page d'un bien
retiré reçoit déjà les siens du serveur (`EtatPublicDuBien.similar`).

## Décision du porteur

validé — (a) : les seuls biens similaires lus côté serveur avec la fiche et passés en données initiales (modèle `donneesInitiales`, TCK-432), avec une fraîcheur propre écrite dans le ticket ; les avis demandés seulement à l'approche de leur section ; garde : un test de rendu serveur de la fiche qui exige un lien `/properties/<slug>` d'un bien similaire dans le HTML (porteur, 2026-10-22)

## Objectif utilisateur

Le visiteur (et le moteur) reçoit les liens vers les biens similaires dans le HTML de la fiche ;
les avis ne coûtent une requête qu'au visiteur qui descend jusqu'à eux.

## Contrat de données

Endpoints existants : `GET /api/public/properties/{slug}/similar` (lu par le serveur Next),
`GET /api/public/properties/{slug}/reviews` (lu par le navigateur). Aucun endpoint neuf. La
réponse des similaires ne dépend pas du visiteur (`PropertyResource` en surface publique) : la
lecture est **partagée** (aucun en-tête propre au visiteur).

## Contraintes strictes (métier)

- **Fraîcheur propre des similaires : 900 s** (`FRAICHEUR_SIMILAIRES_SECONDES`), en cache de
  données de Next, sans étiquette de fiche : la liste dépend d'**autres** biens, que
  l'invalidation signée de la fiche (`property:{slug}`) ne suit pas. 900 s, trois fois la fraîcheur
  de la fiche (300 s) : un bien similaire retiré entre-temps mène à sa page de bien retiré
  (200 `noindex`, TCK-598), jamais à une erreur.
- Une panne de la lecture serveur ne casse pas la fiche : le carrousel retombe sur sa lecture du
  navigateur d'aujourd'hui.
- Les avis : aucune requête avant que la section approche du viewport (marge de 400 px) ; sans
  `IntersectionObserver`, la lecture part au montage comme aujourd'hui.

## Delta à produire

- [x] Lecture serveur partagée et mémoïsée des similaires dans `lib/queries/public-property.ts`.
- [x] La page passe la liste à la fiche, la fiche au carrousel, le carrousel au hook en données
      initiales : aucune requête du navigateur quand elles sont là.
- [x] `usePropertyReviews` attend un signal « à l'approche » de `PropertyReviews`.
- [x] Tests : rendu serveur de la fiche qui exige un lien `/properties/<slug>` d'un bien similaire ;
      hook des similaires sans requête avec données initiales ; avis sans requête avant l'approche.

## Critères d'acceptation

- [x] AC1 — le HTML servi de la fiche contient un lien `/properties/<slug>` d'un bien similaire.
- [x] AC2 — avec des données initiales, le navigateur ne redemande pas les similaires.
- [x] AC3 — les avis ne sont demandés qu'à l'approche de leur section.
- [x] AC4 — lecture serveur en échec : la fiche se rend, le carrousel lit au navigateur.

## Hors périmètre

- Le résumé des avis dans le HTML (non retenu par le porteur).
- Les en-têtes `no-cache, private` des deux routes de l'API.

## Notes d'implémentation

- Ablation, un volet à la fois rendu à `pre-dev` : `page.tsx` → `similaires.rendu-serveur`
  rouge (aucun lien dans le HTML) ; `useSimilarProperties.ts` → `donnees-initiales` et
  `similaires.rendu-serveur` rouges ; `PropertyReviews.tsx` → `PropertyReviews.approche` rouge
  (requête au montage) ; remis → 5/5 verts.
- La garde rend la VRAIE page et la vraie fiche par `renderToString`, seules la barre, le pied,
  le compteur de vue et les lectures serveur simulées.
- Les similaires partent en `Promise.all` avec les domaines du fil d'Ariane : aucune attente de
  plus en série au rendu.
- `page.server.test.tsx` simule `public-property` en entier : `getBiensSimilaires` y est ajouté
  (rend `null`).
- Avis : l'état « approchée » se fige à la première intersection (la section ne se décharge pas
  en remontant) ; sans `IntersectionObserver`, la lecture part au montage, comme avant.
