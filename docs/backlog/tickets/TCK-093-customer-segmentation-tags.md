---
id: TCK-093
title: "Segmentation & tags clients"
status: doing
phase: P2
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-25
depends_on: [TCK-020, TCK-042]
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#10-tag
tags: [back, front, crm, tags]
---

## Objectif utilisateur

Permettre à un Agent de classer ses Customers via des tags libres
(`vip`, `prospect chaud`, `bailleur stratégique`, etc.) et de segmenter
le CRM par filtre multi-tags pour piloter ses actions commerciales et
ses campagnes ciblées sans dupliquer la donnée client.

## Contrat de données

Le polymorphe `Tag` (spec §10) est déjà partagé par Property et autres
modèles. Étendre la `taggable` morphTo à `Customer`.

**Endpoints** :

- `GET /api/customers?filter[tags]=vip,prospect&include=tags&fields[customers]=id,first_name,last_name,pipeline_stage,tags`
  — `AllowedFilter::callback('tags', ...)` qui matche un OR sur les
  noms de tags ; `tags` doit être includable.
- `POST /api/customers/{id}/tags` body `{ tags: [name1, name2] }` —
  attache (et crée si absent) des tags scopés à l'agence courante.
- `DELETE /api/customers/{id}/tags/{tag}` — détache un tag du customer.
- `GET /api/tags?filter[type]=customer&fields[tags]=id,name,color,usage_count`
  — liste des tags clients de l'agence avec compteur d'usages
  (utilisé pour l'autocomplete et la segmentation).

**Frontend** : composants tag-picker dans la fiche Customer + filtre
multi-select de tags dans la liste CRM `/app/customers` et dans le
kanban `/app/crm/pipeline` (TCK-083).

## Direction UX / Artistique

**Tag-picker inline** sur la fiche Customer : pastilles de tags
existantes + champ texte libre avec autocomplete. Création à la volée
si le tag n'existe pas (Enter ou virgule). Suppression via croix sur
la pastille. Couleurs déterministes par hash du nom (pour qu'un même
tag ait toujours la même couleur sur l'ensemble du CRM).

**Filtre multi-tags** dans la liste CRM : sélecteur popover
"Filtrer par tags" qui montre les tags les plus fréquents en haut.
Combinaison OR par défaut (un customer match si ≥ 1 tag sélectionné).
Indicateur visuel "n tags actifs" + bouton "tout effacer".

**Segmentation rapide** : sur la fiche client, click sur une pastille
de tag → recherche dans la liste CRM filtrée par ce tag (deeplink
URL avec query string).

## Contraintes strictes (métier)

- **Scope agence** — un tag créé par un agent appartient à l'agence ;
  un agent n'a accès qu'aux tags de son agence (policy `TagPolicy`).
- **Slug normalisé** — `name` est trim + lowercase ; deux tags
  identiques visuellement ne créent qu'une seule ligne (unicité par
  agence + name normalisé).
- **Limite par customer** — max 10 tags actifs par customer pour
  garder la lecture lisible (validation FormRequest).
- **Color déterministe** — la couleur est dérivée d'un hash du nom
  côté frontend ; pas stockée en base sauf si l'agent surcharge
  manuellement (champ optionnel `color`).
- **Filtre multi-tags** — combinaison OR par défaut, AND opt-in via
  `filter[tags_all]=vip,prospect` (callback dédié).
- **Activité** — chaque tag attach/detach est tracé via
  ActivityLog (`tag.attached`, `tag.detached`).

## Delta à produire

- [ ] Vérifier la table `taggables` (polymorphe spatie/laravel-tags ou table interne) supporte `Customer`
- [ ] Trait `HasTags` sur `Customer` model
- [ ] AllowedFilter `tags` (OR) et `tags_all` (AND) sur `CustomerController`
- [ ] AllowedInclude `tags` sur `CustomerController`
- [ ] Endpoints `POST /customers/{id}/tags` et `DELETE /customers/{id}/tags/{tag}` (Controller `CustomerTagController`)
- [ ] FormRequest `AttachCustomerTagsRequest` (validation array, max 10, scope agence)
- [ ] AllowedFilter `type` sur `TagController` + champ virtuel `usage_count`
- [ ] Policy `TagPolicy` (scope agence)
- [ ] Tests `CustomerTagsTest` (attach, detach, filter OR/AND, max 10, scope)
- [ ] Page UI `/app/customers` — colonne tags + filtre multi-tags
- [ ] Composant tag-picker (autocomplete + création inline)
- [ ] Composant filtre multi-tags (popover + chips actifs)
- [ ] Tests Vitest tag-picker + filtre

## Critères d'acceptation

- [ ] AC1 — `GET /customers?filter[tags]=vip,prospect` retourne les customers ayant au moins un des tags listés
- [ ] AC2 — `GET /customers?filter[tags_all]=vip,prospect` retourne uniquement les customers ayant TOUS les tags
- [ ] AC3 — `POST /customers/{id}/tags` avec un tag inexistant le crée puis l'attache (idempotent sur ré-appel)
- [ ] AC4 — un agent ne voit/modifie pas les tags d'une autre agence (policy 403)
- [ ] AC5 — la fiche Customer affiche les tags avec couleur déterministe et permet ajout/suppression sans rechargement
- [ ] AC6 — la liste `/app/customers` filtre côté API (pas côté client) sur sélection multi-tags
- [ ] AC7 — tentative d'ajout d'un 11ᵉ tag sur un customer renvoie 422
- [ ] AC8 — chaque attach/detach apparaît dans ActivityLog du customer

## Hors périmètre

- Campagnes email/SMS ciblées par tag (P3).
- Tag rules / segmentation auto basée sur événements (P3).
- Tags sur Properties (déjà géré, hors scope).
- Statistiques d'usage de tags (dashboard analytics) — pas demandé.

## Notes d'implémentation

_(à remplir par implementing-specs)_
