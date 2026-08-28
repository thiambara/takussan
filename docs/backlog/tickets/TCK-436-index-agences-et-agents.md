---
id: TCK-436
title: "`/agencies` et `/agents` n'existent pas : deux surfaces publiques soignées n'ont qu'un seul chemin entrant"
status: doing
phase: P2
family: full
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
tags: [back, front, public, navigation, agency, agent]
---

## Objectif utilisateur

Un visiteur qui cherche une agence ou un agent — parce qu'on lui en a recommandé un, ou parce
qu'il veut voir qui opère dans sa ville — peut les parcourir.

## Contexte

Deux tickets ont façonné ces pages : [TCK-242](TCK-242-public-agency-agent-pages-design-refresh.md)
(refonte design) puis [TCK-276](TCK-276-public-agency-agent-portrait-redesign.md) (itération
« Portrait/confiance »). Le résultat est livré : hero asymétrique, watermark bogolan, bandeau de
statistiques, bandeau d'équipe, portefeuille à onglets, section d'avis.

**Personne ne peut y arriver autrement qu'en passant par une fiche de bien.** Mesuré le
2026-08-27 :

```
$ find "src/app/(public)/agencies" "src/app/(public)/agents" -name "page.tsx"
  src/app/(public)/agencies/[slug]/page.tsx
  src/app/(public)/agents/[slug]/page.tsx          ← les deux segments dynamiques, et rien d'autre
```

`/agencies` et `/agents` **répondent 404**. Les quatre seuls liens entrants du produit sont :
`PropertyAgentCard` (deux, depuis une fiche de bien), `TeamStrip` (depuis une fiche d'agence
qu'il faut déjà avoir atteinte) et le lien vers l'agence depuis une fiche d'agent. Ni la navbar,
ni le pied de page, ni la home n'y mènent.

Côté API, la cause est en amont — `takussan-api/routes/api/public.php` ne déclare que :

```
GET public/agents/{slug}      GET public/agents/{slug}/properties
GET public/agencies/{slug}    GET public/agencies/{slug}/properties
```

**Aucun index.** Il n'existe donc aujourd'hui aucun moyen — ni pour une page de liste, ni pour le
sitemap de [TCK-431](TCK-431-sitemap-et-robots-absents.md) — d'énumérer les profils publiés.

C'est le motif qu'a déjà nommé [TCK-430](TCK-430-admin-settings-tags-sans-chemin-entrant.md) côté
console, et [TCK-379](TCK-379-app-menu-et-inventaire-des-ecrans-ont-diverge.md) côté `/app` : *un
écran sans chemin entrant est du travail livré que personne ne voit.*

## Contrat de données

**À créer, côté API** — deux index publics, sous le même préfixe et le même throttle
`public-read` que l'existant :

- `GET /api/public/agencies` — index paginé des agences ayant une présence publique.
- `GET /api/public/agents` — index paginé des agents ayant une présence publique.

Les deux passent par `spatie/laravel-query-builder` comme le reste du dépôt : filtres
(`filter[city]`, `filter[search]`), tri, pagination, et `fields[…]` respectés côté front
(`docs/spatie-query-builder.md`).

**Ce que « présence publique » recouvre doit être tranché par ce ticket, et écrit dans le code
qui l'applique** : une agence sans aucun bien publié, un agent désactivé ou un profil sans
portefeuille n'ont pas vocation à figurer dans un index public indexable.

⚠️ La forme de sortie **doit reprendre la redaction déjà décidée** dans
`PublicAgencyController` : l'e-mail personnel d'un membre d'équipe y est explicitement retiré
comme *« turnkey harvesting vector »*. Un index d'agents est exactement le vecteur que cette
redaction visait — voir [TCK-441](TCK-441-contact-personnel-agent-sans-authentification.md).

## Direction UX / Artistique

Deux pages de parcours, pas deux annuaires administratifs. Elles héritent du vocabulaire visuel
déjà posé par TCK-242/TCK-276 sur les fiches — carte, hairline, eyebrow en capitales espacées,
`font-display` pour les titres — pour que passer de l'index à la fiche ne change pas de monde.

Priorités : la ville et le volume de portefeuille avant tout le reste ; la note moyenne quand
elle existe ; l'agence de rattachement pour un agent. Une recherche simple et un filtre par
ville suffisent — pas de rail de filtres à la `/properties`.

État vide et état d'erreur distincts et non concurrents : la leçon de TCK-335 sur `/properties`
(vide **et** erreur affichés ensemble) vaut ici avant même la première ligne.

## Contraintes strictes (métier)

- Lecture publique, sans authentification, sous `throttle:public-read`.
- Sparse fieldsets obligatoires côté front : `fields[…]` avec les seules colonnes de la vue,
  filtres côté serveur, jamais de filtrage client sur une liste déjà récupérée.
- Aucune donnée de contact personnelle nouvelle n'est exposée par ces index.
- Un profil non éligible à la présence publique ne doit apparaître ni dans l'index, ni dans le
  sitemap.

## Delta à produire

- [ ] Endpoint `GET /api/public/agencies` (index paginé, filtres, tri)
- [ ] Endpoint `GET /api/public/agents` (index paginé, filtres, tri)
- [ ] Règle d'éligibilité à la présence publique, appliquée par les deux endpoints
- [ ] Tests backend : pagination, filtres, exclusion des profils non éligibles, absence de PII
- [ ] Pages `/agencies` et `/agents`, avec recherche et filtre par ville
- [ ] Chemins entrants depuis la chrome publique (le pied de page est le porteur naturel, cf.
      [TCK-437](TCK-437-pied-de-page-public.md))
- [ ] Les deux index alimentent le sitemap de [TCK-431](TCK-431-sitemap-et-robots-absents.md)
- [ ] Tests front : les deux pages rendent des profils, et un profil mène à sa fiche

## Critères d'acceptation

- [ ] AC1 — `GET /api/public/agencies` et `GET /api/public/agents` répondent 200 sans
      authentification et rendent une enveloppe paginée. Un test éprouve la **seconde page**, pas
      seulement la première : une pagination cassée rend la première page correctement.
- [ ] AC2 — un profil non éligible à la présence publique est absent de l'index. Le test crée un
      profil de chaque sorte et vérifie **l'exclusion**, pas seulement la présence de l'éligible.
- [ ] AC3 — aucune des deux réponses ne porte d'e-mail ni de téléphone personnel. Un test le
      vérifie sur la charge sérialisée entière, pas champ par champ.
- [ ] AC4 — `/agencies` et `/agents` répondent avec du contenu et non 404, et un clic sur un
      profil mène à sa fiche existante.
- [ ] AC5 — un test confronte les liens de la chrome publique aux routes existantes et échouerait
      si `/agencies` ou `/agents` redevenait un lien sans écran.
- [ ] AC6 — le sitemap contient les URL des profils éligibles, et aucune de celles qui ne le sont
      pas.

## Hors périmètre

- Toute modification visuelle des fiches `/agencies/[slug]` et `/agents/[slug]`, livrées par
  TCK-242 et TCK-276.
- La recherche full-text sur les profils via Meilisearch : une recherche par nom et par ville
  suffit à ce ticket.
- La redaction du contact personnel d'un agent sur sa **fiche** — [TCK-441](TCK-441-contact-personnel-agent-sans-authentification.md).

## Notes d'implémentation

### La règle d'éligibilité, et pourquoi la définition métier a été écartée

Le ticket demandait de trancher « présence publique ». La règle retenue, écrite dans le code qui
l'applique (`PublicAgencyController::index()`, `PublicAgentController::index()`,
`Property::scopePublicPortfolio()`) :

| | condition |
|---|---|
| Agence | `status = active` **et** ≥ 1 bien `publicPortfolio()` sous `agency_id` |
| Agent | `status = active`, `username` non nul, **et** ≥ 1 bien `publicPortfolio()` sous `user_id` |

`scopePublicPortfolio()` est l'**intersection** de `scopePublic()` (le prédicat du sitemap et de
`/public/properties`) et de `available()` (ce que les fiches `/agencies/{slug}` et
`/agents/{slug}` affichent réellement). Plus étroit que le premier ⇒ tout profil listé a sa place
au sitemap ; plus étroit que le second ⇒ **un profil listé a un portefeuille non vide sur sa
fiche**.

**La définition métier de l'agent — « porteur d'un `AgentProfile` » — a été mesurée et écartée.**
Relevé du 2026-08-28 sur la base de développement (SQL, lecture seule) :

```
utilisateurs actifs porteurs d'un AgentProfile ET publiant un bien public ....  0
idem pour AgencyAdminProfile .................................................  0
publieurs publics porteurs d'un OwnerProfile ................................. 44 / 44
publieurs publics dont au moins un bien porte un `agency_id` ................. 44 / 44
```

`properties.user_id` est le **bailleur** depuis TCK-142. La retenir aurait livré une page
`/agents` vide et un sitemap sans une seule URL d'agent — un endpoint vert qui ne montre rien.
L'index retient donc la définition que le produit APPLIQUE déjà : *la personne publiquement
présentée comme contact d'au moins un bien publié* — celle que `PublicAgentController::show()`
sert, et que `PropertyResource::buildOwner()` lie déjà à `/agents/{slug}`. **L'index n'expose
donc aucun nom que `/public/properties` ne rende déjà énumérable**, un bien à la fois.

### La redaction, et ce qui la borne

Les deux index ne servent **ni e-mail, ni téléphone, ni adresse** — ni ceux du profil, ni ceux
d'un membre d'équipe. C'est plus strict que les fiches, qui publient le `phone` d'un agent
(TCK-441) et l'`email` d'une agence : *une donnée consultable fiche par fiche et la même servie
par paquets de 48, filtrables et paginés, ne sont pas la même donnée.*

`description` a été retiré de la sortie **après** que le test d'AC3 l'a attrapé sur une
description portant « Nous écrire : contact@… » : un champ de texte libre est un champ de contact
que personne n'a déclaré. Le second demi-verrou est le plafond `per_page = 48`, que
`PublicPropertyController::index()` n'a pas.

La **ville** rendue vient du PORTEFEUILLE (villes des annonces publiées) et non de l'adresse
postale du profil, contrairement aux fiches. C'est à la fois la réponse à « qui opère dans ma
ville » et l'assurance qu'aucune commune de résidence n'entre dans l'index.

### Ce qui a été branché ailleurs

- **Pied de page** — la colonne « Professionnels » de TCK-437, qui existait vide en attendant ce
  ticket, porte ses deux liens. `src/data/__tests__/navigation.test.ts` les confronte à
  l'arborescence réelle : supprimer une des deux pages fait rougir six tests dans trois fichiers
  (mesuré par ablation).
- **Sitemap** — les deux index entrent dans `PAGES_STATIQUES_INDEXABLES`, et les deux sources
  `agences` / `agents` remplacent les `source: null` de `ROUTES_DYNAMIQUES_PUBLIQUES`. Le sitemap
  **ne rejuge pas l'éligibilité** : il pagine l'endpoint d'index, qui l'applique déjà.
- **Canonique** — `src/lib/canonique-profils.ts` applique le critère de TCK-433 : `city` garde son
  URL indexable (ensemble fini, servi par l'API en `meta.cities`), `q` et `page` se replient.

### Ce que ce lot laisse ouvert

- Les deux pages sont rendues **côté serveur**, contrairement à `/properties` (TCK-432) : c'est
  une divergence assumée, dans le sens de ce que TCK-432 veut obtenir.
- Le sitemap pagine l'index par lots de 48. À l'échelle actuelle c'est 1 à 2 requêtes par
  ressource ; à 10 000 profils ce serait 209. Un endpoint `sitemap` dédié, comme celui des biens,
  serait alors la suite — pas avant.
- L'`avatar_url` d'un agent et le `logo_url` d'une agence n'existent **pas** comme attributs sur
  `User` / `Agency` (ni colonne, ni accesseur) : les fiches livrées par TCK-242/276 émettent donc
  toujours `null`. Les index emploient `getFirstMediaUrl()`, la forme qui fonctionne ; corriger
  les fiches est hors périmètre.
