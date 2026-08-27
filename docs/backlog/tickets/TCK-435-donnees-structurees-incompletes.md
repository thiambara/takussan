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

### Ce que la re-mesure a contredit dans ce ticket

1. **Le chemin cité n'existe plus.** `grep -rln "ld+json" src/` rend
   `src/app/[locale]/(public)/properties/[slug]/page.tsx` — TCK-434 a déplacé toute la surface
   publique sous `[locale]`. Le constat du ticket (« un seul emplacement ») reste vrai.

2. **Le balisage existant portait un défaut que le ticket rangeait hors périmètre.**
   `jsonLdRealEstateListing` émettait `url: '/properties/<slug>'` — **relative**. Une URL relative
   dans un JSON-LD est résolue contre l'URL du DOCUMENT : sur `/fr/properties/x`, elle désignait
   `https://hôte/properties/x`, qui rend **307** depuis TCK-434. Le balisage annonçait donc une
   redirection comme identité du bien. Corrigé — `jsonLdRealEstateListing(property, locale)` — et
   listé en hors périmètre : y ajouter un `BreadcrumbList` aux URL justes en laissant celle-là
   fausse aurait été incohérent.

### Décisions non évidentes

- **`RealEstateAgent` des deux côtés, `Person` écarté sur une raison précise.** Le réflexe pour la
  fiche d'un agent serait `Person`. Il est écarté parce que **`aggregateRating` n'est pas dans le
  domaine de `Person`** : schema.org l'attache à `Organization`, `Place`, `Service`, `Brand`,
  `CreativeWork`, `Event`, `Offer`, `Product`. Un nœud `Person` ne pourrait donc pas porter la note
  que la page AFFICHE, et le balisage cesserait de dire ce que la page dit — la contrainte centrale
  du ticket. L'agent est relié à son agence par `parentOrganization` (et non `worksFor`, qui est une
  propriété de `Person`).

- **Le fil d'Ariane n'a PAS de maillon final pour le bien.** Le fil affiché n'en porte pas ; en
  ajouter un au seul balisage romprait l'égalité que l'AC1 exige.

- **La dérivation des maillons quitte le composant** (`src/lib/fil-d-ariane.ts`, fonction pure, le
  traducteur en argument) : c'est la seule façon d'être appelable du composant client
  (`useTranslations`) et de la page serveur (`getTranslations`). Écrire un second calcul aurait
  produit deux fils qui se ressemblent, et qui divergeraient au premier changement.

- **`Organization` et `WebSite` sont émis depuis `[locale]/(public)/layout.tsx`.** Un layout est
  rendu exactement une fois par page : c'est la seule structure qui garantisse l'AC5 sans
  convention. Un test **dérivé** balaie `src/` et exige que `jsonLdOrganisation` / `jsonLdSiteWeb`
  n'aient qu'un seul appelant, et que `ld+json` n'apparaisse que dans le point d'émission unique.
  Muté dans les deux sens : un second appelant fait rougir.

- **L'`@id` de l'organisation est le MÊME dans les trois langues** (c'est la même organisation),
  celui du `WebSite` est **distinct par langue** (trois sites de langue, que les `hreflang` relient).

- **Rien n'est inventé.** Pas de `logo` — `takussan-web/public/` ne porte aucun logo au 2026-08-27,
  seulement cinq SVG hérités de `create-next-app`. Pas de `sameAs` — aucun compte social vérifié.
  Pas de `PostalAddress` quand la ville est nulle : un objet vide, ou une rue inventée, seraient
  pires que l'absence.

- **`sansVides` filtre `undefined`, `null` ET `''`** (elle ne filtrait qu'`undefined`). `0` et
  `false` sont conservés : ce sont des valeurs. La note à zéro sur zéro avis est refusée là où elle
  se décide, pas ici.

- **L'échappement porte sur TOUS les `<`**, pas sur le motif `</script`. Un échappement qui
  reconnaît un motif précis est un échappement qu'on contourne : `</SCRIPT >` et `<!--` sont
  traités par l'analyseur HTML et ratés par un littéral.

### Vérification de bout en bout

`next start`, HTML servi, blocs `ld+json` comptés et analysés :

```
/fr/properties/<slug>  → 4 blocs : Organization, WebSite, RealEstateListing (url absolue et
                          préfixée), BreadcrumbList [Accueil, Louer, Dakar, Guédiawaye] avec les
                          quatre `item` absolus et préfixés
/fr/agencies/dakar-immo → 3 blocs ; RealEstateAgent SANS `aggregateRating` (0 avis) et SANS
                          `address` (ville nulle) — AC2 et AC3 constatés en production locale
/en/agents/<slug>       → 3 blocs ; RealEstateAgent sans aucun `email` (TCK-441), `telephone` seul
```
