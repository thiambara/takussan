---
id: TCK-2495
title: Accueil « Deux gestes » : Louer/Acheter et catégories au téléphone, trois rangées sans doublon
status: done
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, accueil, mobile, audit-ux]
---

## Objectif utilisateur

Au téléphone, le chercheur arrive dans une liste filtrée en deux touchers (Louer, puis une catégorie), et voit des biens différents à chaque rangée.

## Contrat de données

Endpoints existants de l'accueil (rangées, quartiers). Aucun neuf.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=accueil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) (« Deux gestes »), téléphone et bureau.
- Pas de hero marketing : la recherche reste le premier objet de la page. Sous l'en-tête : Louer | Acheter, puis la rangée de catégories qui défile.
- Les quartiers en tuiles photo ; trois rangées au plus, de grammaire distincte.
- Cartes d'accueil : une pastille et le favori sur la photo, le comparateur en sort.
- Un bloc propriétaire chiffré en fin de page — du contenu, pas une bannière.

## Contraintes strictes (métier)

- Aucun bien n'apparaît dans deux rangées de la même page.
- « À Dakar » tant que la position n'est pas permise ; jamais une demande de position au chargement.
- Les sponsorisés suivent la règle de placement de TCK-2500 là où l'accueil en montre.

## Delta à produire

- [ ] Louer | Acheter et catégories visibles au téléphone.
- [ ] Rangées réduites à trois, dédoublonnées.
- [ ] Cartes d'accueil allégées (deux éléments au plus sur la photo sous `md`).
- [ ] Bloc propriétaire chiffré.
- [ ] Tests : dédoublonnage des rangées ; catégories présentes à 390 px.

## Critères d'acceptation

- [ ] AC1 — À 390 px, Louer/Acheter et au moins quatre catégories sont visibles sans défiler ; un toucher sur une catégorie ouvre la liste filtrée sur la transaction choisie.
- [ ] AC2 — Sur la base de démo, aucun identifiant de bien n'apparaît deux fois dans la page.
- [ ] AC3 — Aucune carte d'accueil ne porte plus de deux éléments sur sa photo sous `md`.

## Hors périmètre

- L'écran de recherche plein écran (TCK-2497).
- Le seed « vitrine » de démonstration.

## Notes d'implémentation

Re-mesuré le 2026-11-09 (vague 2, agent « accueil-recherche ») :

- **Les rangées n'étaient pas trois mais cinq** (`HomepageDiscovery`) : « Près de toi », « À louer », « Coup de cœur »,
  « À vendre » (lue par le serveur, `raccourcisDeLAccueil`) et « Nouveau », plus « Récemment consultés ». Le serveur
  (`HomepageDiscoveryService`) dédoublonne near/rent/latest, **pas** `featured` (« curée, a le droit de chevaucher »).
- **`featured` compte une impression par bien SERVI** (`BoostStatsRecorder::impressions($featuredIds)`, ADR-0061 §10) :
  le dédoublonnage côté front garde donc la rangée vedette ENTIÈRE et retire ses biens des rangées organiques — l'inverse
  ferait compter des impressions pour des cartes jamais montrées.
- **Aucune photo de quartier dans l'API** : `GET /api/public/properties/neighborhoods?city=Dakar` rend `{value, count}`
  trié par compte. Les « tuiles photo » de la maquette sont donc des tuiles sans photo (nom, compte), sur le motif bogolan.
- **Aucun chiffre public de demande** (« 1 240 personnes ont cherché ») : aucun endpoint public ne compte les recherches
  (le journal d'ADR-0088 n'est lu que par l'administration et Radar). Le bloc propriétaire est chiffré par l'OFFRE
  (`GET /api/public/properties/cities` → `contracts.rent/sale` de la ville), donnée publique et exacte ; sans elle, il
  s'affiche sans chiffre plutôt qu'avec un chiffre faux.


Ce qui a été fait, et pourquoi (2026-11-09) :

- **Ordre de la page** (`HomepageDiscovery`) : « Deux gestes » (sous `lg`), la carte de rappel de TCK-2493 (inchangée),
  les tuiles de quartiers, puis TROIS rangées — « À {ville} » (ex-« Près de toi », sans tutoiement ni « près de toi »
  qui n'est pas mesuré), « Coup de cœur » (vedette) et « Nouveau » — puis le bloc propriétaire. Sont retirées :
  « À louer », « À vendre » (et sa recherche serveur) et « Récemment consultés ».
- **Dédoublonnage** (`rangeesSansDoublon`) : vedette d'abord (cf. impressions ci-dessus), puis près, puis nouveau.
- **« Deux gestes »** n'est rendu que sous `lg` : au bureau, l'en-tête porte déjà Louer · Acheter et la bande de
  catégories (TCK-2494). « Louer » choisi par défaut ; un second appui retire la transaction. Les catégories sont des
  liens (`/properties?contract_type=rent&type=…`), pictogramme au-dessus du libellé : quatre tiennent à 390 px.
- **Cartes d'accueil allégées** (`allegee`, sur `PropertyRow` et les trois variantes) : une pastille (la transaction,
  sinon « neuf », aucune sous la robe « En vedette » dont le ruban tient lieu) et le favori ; le comparateur sort. La
  liste des biens, qui ne passe pas `allegee`, garde tout.
- **Bloc propriétaire** : « 127 locations et 63 ventes sont en ligne à Dakar en ce moment. » ; un compte de contrat
  absent n'est pas zéro — le bloc parle alors sans chiffre. Il est masqué en repli (découverte en panne).

### Revue adverse — corrections (2026-11-09)

- **zod hors de l'accueil** (bloquant) : `raccourcis-de-l-accueil.ts` importait `replie` et `FRAICHEUR_DOMAINE_VILLES`
  de `facettes.ts`, qui tire `canonique` → `schemas` → zod dans le JS client de `/`. Ces valeurs vivent désormais dans
  `src/lib/queries/domaine-des-lieux.ts` (sans dépendance), que `facettes.ts` réexporte. La garde
  `zod-hors-des-pages-publiques.test.ts` repasse au vert sans toucher à sa liste ; remettre l'import par `facettes`
  la fait rougir (`app/[locale]/(public)/page.tsx : zod seulement par un formulaire admis`).
- **« À Dakar · Changer »** retrouve son geste : `ChangerDeVille` (menu des villes de `/public/properties/cities`, lu à
  la première ouverture, 12 au plus, coche sur la ville actuelle) pose la ville choisie en `near_city` des rangées.
  Les tuiles et le bloc propriétaire suivent la ville **servie** (`near.city`) : une autre ville que celle du serveur
  les fait relire (`raccourcisDeLAccueil`), et rien de la ville d'avant ne s'affiche entre-temps. Mesuré à 390 et 1440
  : Dakar → Thiès (« À Thiès », « 4 locations et 4 ventes… à Thiès », tuiles absentes — Thiès n'a aucun quartier en
  base de dev) → Dakar (tuiles de Dakar revenues). Emplacement posé par une prop `apresLeTitre` de `PropertyRow` /
  `EnTeteDeRangee`. Les catégories empilées au téléphone restent (AC1) ; signalé au porteur par la session.
- **Code mort** : `completerParDesSimilaires`, `useSimilairesDesVus` et `similaires-des-vus` retirés après un grep sans
  appelant ; clés `recentlyViewed.withSimilar.*` retirées, suppression ESLint du hook supprimé retirée.
- Le texte du bloc propriétaire passe de `text-foreground/80` à `text-muted-foreground` (garde
  `encre-sans-alpha.contraste`, qui le relevait).
