---
id: TCK-435
title: "Une seule page du site public porte des données structurées — le fil d'Ariane, l'organisation et les profils n'en ont aucune"
status: todo
phase: P2
family: front
estimate: S
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
tags: [front, seo, public, json-ld]
---

## Objectif utilisateur

Ce qu'un moteur affiche de Takussan — fil d'Ariane, note moyenne d'une agence, identité du site —
correspond à ce que la page dit vraiment.

## Contexte

Mesuré le 2026-08-27 :

```
$ grep -rln "ld+json" src/
  src/app/(public)/properties/[slug]/page.tsx
```

Un seul emplacement. `src/lib/jsonld-property.ts` est un travail soigné — sous-types schema.org
exhaustifs par type de bien, refus délibéré de `Product`/`Offer`, omission de `geo` quand la
coordonnée manque. **Rien de cet effort n'est réutilisé ailleurs**, alors que trois surfaces
portent déjà les données exactes qu'un balisage demanderait :

| Page | Donnée déjà rendue | Balisage présent |
|---|---|---|
| `/properties/[slug]` | fil d'Ariane visible (`PropertyBreadcrumb`) | **aucun** `BreadcrumbList` |
| `/agencies/[slug]` | nom, logo, licence, ville, contact, note moyenne + nombre d'avis | **aucun** |
| `/agents/[slug]` | nom, photo, agence, spécialité, note moyenne + nombre d'avis | **aucun** |
| toutes | identité du site | **aucun** `Organization` / `WebSite` |

Le fil d'Ariane est le cas le plus net : il est **affiché** à l'utilisateur et **invisible** au
moteur, alors que les deux décrivent la même chose.

## Contrat de données

Aucun endpoint nouveau. Tout est déjà servi :

- `GET /api/public/agencies/{slug}` — `name`, `logo_url`, `license_number`, `city`, `email`,
  `phone`, `reviews.average`, `reviews.count`.
- `GET /api/public/agents/{slug}` — `full_name`, `avatar_url`, `agency`, `specialty`,
  `reviews.average`, `reviews.count`.

## Direction UX / Artistique

Sans objet — aucune surface visible n'est modifiée. Le balisage décrit ce que la page rend déjà ;
il n'introduit ni ne cache aucune information.

## Contraintes strictes (métier)

- **Un balisage n'affirme que ce que la page rend.** Une note moyenne absente ne devient pas
  zéro, une ville nulle ne devient pas la chaîne « null » — le défaut a déjà été payé une fois
  dans la `<meta description>` d'une fiche de bien (TCK-292, réparé par TCK-335).
- **Ne jamais baliser un avis inexistant.** `aggregateRating` n'est émis que si `reviews.count`
  est strictement positif ; un `ratingValue` de 0 sur 0 avis est une affirmation fausse et une
  cause connue d'action manuelle.
- Le contact d'un agent ne doit pas être élargi par le balisage : voir
  [TCK-441](TCK-441-contact-personnel-agent-sans-authentification.md), qui tranche ce qui reste
  public.
- La sérialisation reprend l'échappement déjà en place (`</script>` → `<`) — un seul
  utilitaire, pas une copie par page.

## Delta à produire

- [ ] `BreadcrumbList` sur la fiche de bien, dérivé du même fil d'Ariane que celui affiché
- [ ] `RealEstateAgent` (ou sous-type retenu) sur `/agencies/[slug]` et `/agents/[slug]`, avec
      `aggregateRating` **conditionnel**
- [ ] `Organization` + `WebSite` posés une fois pour le site
- [ ] Un utilitaire de sérialisation partagé, l'échappement compris
- [ ] Tests : un profil sans avis ne produit aucun `aggregateRating` ; le fil d'Ariane balisé a
      les mêmes maillons que le fil affiché

## Critères d'acceptation

- [ ] AC1 — le JSON-LD du fil d'Ariane d'une fiche liste **les mêmes maillons, dans le même
      ordre**, que le fil rendu à l'écran. Un test qui vérifie seulement la présence d'un
      `BreadcrumbList` cocherait la case avec un fil faux : il doit comparer les deux.
- [ ] AC2 — une agence à `reviews.count = 0` ne produit **aucune** clé `aggregateRating`. Un
      `ratingValue: 0` fait échouer le test.
- [ ] AC3 — un profil dont la ville ou la note est nulle ne produit ni `"null"`, ni `undefined`,
      ni clé vide dans le JSON émis.
- [ ] AC4 — chaque bloc émis est du JSON valide après échappement, y compris pour une description
      contenant `</script>` ; un test l'éprouve sur cette chaîne exacte.
- [ ] AC5 — `Organization` et `WebSite` sont émis une seule fois par page, jamais dupliqués par
      un composant imbriqué.

## Hors périmètre

- Le balisage de la page de résultats `/properties` : sa canonicité n'est tranchée que par
  [TCK-433](TCK-433-canonical-et-metadatabase-absents.md).
- Toute modification du balisage existant de la fiche de bien, hors ajout du fil d'Ariane.
- Les cartes sociales (`openGraph` / `twitter`), déjà livrées sur les trois pages de détail.

## Notes d'implémentation

_(à remplir par implementing-specs)_
