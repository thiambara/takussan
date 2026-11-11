---
id: TCK-2630
title: "Conversations, côté API : chercher par nom ou par bien, filtrer non lus et groupes, et le contexte d'un fil (bien, fiche client, bail ou intervention)"
status: done
phase: P1
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2632]
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#18-conversation-"
tags: [back, messagerie, crm, audit-ux, app]
---

## Objectif utilisateur

L'agent retrouve le fil d'un client en tapant son nom ou le bien, voit d'un coup ses non lus ou ses groupes, et lit à côté du fil ce qu'il doit savoir : le bien, la fiche du client avec son téléphone et son étape, le bail ou l'intervention rattachés.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `GET /api/conversations` (`ConversationController::index`) :
  - n'accepte que `archived` et la pagination ;
  - **aucun filtre, aucune recherche** ;
  - rend `participants` (membres actuels, avec médias), `property.media`, `lastMessage`, `unread_count` par fil et `meta.unread_total` ;
  - le cloisonnement passe par `ConversationAccess::constrainListing` (TCK-592).
- `Conversation` porte `subject`, `property_id`, `lease_id`, `maintenance_request_id` et `type` (`direct`, `group`).
- `ConversationContextController` sert **seulement** la recherche de biens et de baux pour rattacher un groupe (TCK-576). **Aucune lecture du contexte d'un fil existant.**
- La fiche CRM d'un participant (`Customer` de l'agence, étape, téléphone) n'est lue nulle part depuis la messagerie.

## Direction UX / Artistique

Sans objet (ticket API). Écrans servis : TCK-2632 (liste, puces, recherche, colonne de contexte).

## Contraintes strictes (métier)

**Filtres** (sur `index`, cumulables, sous le même cloisonnement) :

- `filter[search]` : nom complet d'un participant actuel autre que l'appelant, titre ou référence du bien, sujet du fil.
  - Passe par `App\Support\CaseInsensitive` (le `lower()` de PostgreSQL ne replie que l'ASCII sous `--locale=C`).
  - Au moins 2 caractères, sinon le filtre est ignoré.
- `filter[unread]=1` : fils dont `unread_count > 0`, selon la même définition que le compte, sans recopier la sous-requête.
- `filter[type]=direct|group`.
- `meta.counts {all, unread, group}` sur l'ensemble cloisonné, hors archives, **sans** le filtre de recherche. Ce sont les compteurs des puces.

**Contexte** — `GET /api/conversations/{conversation}/context` :

- **Autorisation** : celle de `show`. Un non-participant reçoit 403, et un fil d'intervention inaccessible 404 (règle de TCK-592).
- **Bien** : `{id, slug, title, reference_number, price, status, cover_url}`.
- **Bail** : `{id, status, reference, tenant_name}` si `lease_id` et si l'appelant peut voir le bail (Policy du bail).
- **Intervention** : `{id, status, title, scheduled_at}` si `maintenance_request_id` et si l'appelant peut la voir.
- **Fiche client** : seulement pour un appelant du personnel de l'agence du fil, et pour un fil `direct`. C'est le `Customer` de l'agence rattaché à l'autre participant : `{id, full_name, stage, phone, assigned_agent {id, name}}`.
  - `phone` n'est rendu que si l'appelant peut voir la fiche (`CustomerPolicy::view`).
  - Un client, un bailleur ou un prestataire ne reçoit **jamais** de clé `customer`.
- Chaque bloc est `null` quand il est absent ou interdit : jamais un 403 pour un bloc.
- **Pas de N+1** sur `index` : la recherche ajoute une condition, pas une requête par fil. Le nombre de requêtes est constant entre 5 et 30 fils.

## Delta à produire

- [ ] `ConversationController::index` :
  - filtres `search`, `unread`, `type` ;
  - `meta.counts` ;
  - ligne ajoutée à `docs/spatie-query-builder.md` (filtres de la messagerie, bien que la route ne passe pas par `HasQueryBuilder`).
- [ ] `GET /api/conversations/{conversation}/context` → `ConversationController::context` (ou un contrôleur dédié), avec une ressource `ConversationContextResource`.
- [ ] Tests :
  - `ConversationListFiltersTest` : nom avec accent (« Ndiayé » trouvé par « ndiaye »), titre du bien, sujet ; `unread` ; `type` ; `meta.counts` ; nombre de requêtes constant ;
  - `ConversationContextTest` : bien, bail, intervention, fiche client pour l'agent, pas de `customer` pour le client, téléphone retiré sans `CustomerPolicy::view`, 403 non-participant.

## Critères d'acceptation

- [ ] AC1 — Agent participant à 3 fils (Malick Seck sur « Maison avec jardin · Thiès », Awa Ndiaye sur « Studio meublé · Mermoz », groupe « Suivi des impayés ») : `filter[search]=thiès` (comme `THIÈS`) rend le seul fil de Malick, et `filter[search]=NDIAYE` le seul fil d'Awa. *(Réécrit le 2026-11-11 par la session, option (a) : `CaseInsensitive` replie la casse, pas les accents — ADR-0020 § 2, comme TCK-2657 ; `thies` sans accent ne trouve pas « Thiès » tant qu'aucun ADR ne décide le repli des accents.)*
- [ ] AC2 — `filter[type]=group` rend le seul groupe. `meta.counts` vaut `{all: 3, unread: n, group: 1}`, quel que soit `filter[search]`.
- [ ] AC3 — `context` du fil de Malick, lu par l'agent : `property.title`, `customer.stage` et `customer.phone` sont présents. Lu par Malick lui-même : `customer` est `null`, et `property` est présent.
- [ ] AC4 — Un utilisateur qui n'est pas participant reçoit 403 sur `context`, et aucune donnée du bien n'est rendue.
- [ ] AC5 — Ablation : retirer `CaseInsensitive` de la recherche fait rougir le cas « Ndiayé ».

## Hors périmètre

- La recherche dans le **texte** des messages : coûteuse, et non demandée par la maquette. À rouvrir sur mesure d'usage.
- Le canal WhatsApp entrant dans le fil (spec § 2.3, P3).
- Les pièces jointes (TCK-2631).

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-coque, branche `feat/audit-ux-app-lot-1`, base 572bca108).

**Prémisses re-mesurées, et ce qui différait**

- `index` ne lisait bien que `archived` et la pagination ; la route `context` n'existait pas ; le nom
  `ConversationContextTest` est déjà pris (recherche de biens/baux, TCK-576) : le test du contexte
  s'appelle `ConversationThreadContextTest`.
- **`CaseInsensitive` replie la casse, PAS les accents** (son en-tête, ADR-0020 §2 : pas
  d'`unaccent` sans ticket). Donc « ndiaye » ne trouve pas « Ndiayé », et **AC1 tel qu'écrit
  (`filter[search]=thies` → « … · Thiès ») ne peut pas être vert** : `thiès`, `THIÈS` trouvent le
  fil, `thies` non. C'est la règle déjà assumée par la recherche de biens de
  `ConversationContextController` (« amitie » ne trouve pas « Amitié »). AC5 est éprouvé sur ce
  que `CaseInsensitive` fait réellement : nom stocké `NDIAYÉ`, cherché `ndiayé` — `lower()` nu
  rend `ndiayÉ` sous `--locale=C`.
- « un fil d'intervention inaccessible 404 (TCK-592) » : `show` rend **403** (`ensureParticipant`
  → `ConversationAccess::allows`). `context` reprend la garde de `show`, donc 403.

**Décisions**

- `ListConversationsRequest` type les trois filtres ; saisie mal formée → 422 (`filter[type]` hors
  `direct|group`, `filter[unread]` hors `0|1|true|false`, `filter[search]` en tableau ou > 120
  caractères ou hors UTF-8, `filter` non tableau). `fields[]`, `include`, `sort` restent lus comme
  avant. Le cas hors UTF-8 a été trouvé en cours de route : `preg_split(…/u)` rend `false` sur un
  octet invalide (`%C3%28`), et la recherche était alors ignorée EN SILENCE (liste entière) — le
  client de test de Laravel produit d'ailleurs un tel octet pour un `È` non encodé dans l'URL.
- Recherche : chaque mot (6 au plus) doit trouver le prénom ou le nom d'un membre ACTUEL autre que
  l'appelant, le titre ou la référence du bien, ou le sujet — des `whereHas`, aucune requête par
  fil. `%` et `_` littéraux. Moins de 2 caractères (après `trim`) : ignorée.
- `filter[unread]` et `counts.unread` réemploient la fermeture `$nonLus` du compte
  (`whereHas('messages', $nonLus)`), sans la recopier.
- `meta.counts` : cloisonnement posé UNE fois sur une base commune ; `all`/`group` en une requête
  (`count(*) filter (where …)`), `unread` en une autre ; toujours hors archives, même sous
  `archived=1`, et sans aucun filtre. `counts.unread` compte des **fils, sourdine comprise** ;
  `unread_total` reste des **messages hors sourdine**, et sous `archived=1` celui des archives
  (inchangé).
- Contexte (`App\Services\Messaging\ConversationThreadContext` + `ConversationContextResource`) :
  - l'agence du fil = celle du bail, sinon celle du bien (ordre de `contextAllows`) ; une directe
    sans bail ni bien n'en porte aucune → l'agence où le lecteur est personnel (`staffAgencyId()`,
    son espace actif). Le personnel d'une autre agence y cherche donc dans SON CRM ;
  - prédicat de personnel = celui des policies (`staffAgencyId() === agence`) ;
  - `customer` : clé ABSENTE pour qui n'est pas personnel de l'agence du fil (client, bailleur,
    prestataire, super-admin) — « jamais de clé `customer` » et AC3 « `customer` est null » tiennent
    ensemble ; `null` pour le personnel sur un groupe (même réduit à un autre membre), avec un
    inconnu du CRM, ou s'il y a plus d'un autre membre ; deux fiches pour le même compte → la plus
    ancienne ;
  - `assigned_agent` = le référent du CRM (relation `agent_client` principale et active,
    `CustomerCommercialAttributes::asReferent`, TCK-2588) ;
  - `phone` seulement sous `CustomerPolicy::view` ; `stage`, `full_name` et le référent sont rendus
    au personnel de l'agence sans elle (lettre du ticket) ;
  - `cover_url` = la conversion `preview` par `PublicPhotoUrl::upTo` (filigrane respecté, comme
    `main_photo_url`).

**Mesures** : 24 tests (12 + 12), 16 ablations rouges (dont AC5), restaurées par `cp`, md5
vérifiés. Le nombre de requêtes de la liste filtrée est identique à 5 et à 30 fils (3 puis 28 lignes
rendues) — ce test était déjà vert avant TCK-2630 : il garde, il ne prouve pas le correctif.
AC1 « `NDIAYE` → le seul fil d'Awa » est éprouvé avec `NDIAY` (le nom du jeu porte `É` pour AC5),
Awa sortie du groupe ; tant qu'elle en est membre, son nom trouve aussi le groupe.
`ConversationContextResource` est inscrite à `ResourceInventory::SUJETS_SUR_MESURE` avec sa recette
(`DateInventoryByValueTest`).

**Non éprouvé par ablation** : le contrôle `can('view', $maintenance)` du bloc intervention — un fil
d'intervention n'est accessible qu'à qui voit la demande (`ConversationAccess::maintenanceAllows`),
le bloc ne peut donc pas être refusé à un lecteur admis ; il reste par défense.
