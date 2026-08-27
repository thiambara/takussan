---
id: TCK-363
title: "Console super-admin — sélecteur d'agence partagé, recherche temporisée, filtres réinitialisables"
status: done
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-27
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, super-admin, filtres, recherche, performance]
---

## Objectif utilisateur

Le super-admin filtre par agence en la **cherchant par son nom**, voit combien de résultats son filtrage produit, et peut tout remettre à zéro d'un geste — sans que chaque frappe parte en requête.

## Contrat de données

- `GET /api/admin/agencies` sert déjà la liste paginée et filtrable par `filter[search]` : le sélecteur s'appuie dessus, avec recherche côté serveur et chargement à la demande.
- `GET /api/super-admin-users`, `GET /api/super-admin-properties`, `GET /api/admin/moderation` exposent déjà `filter[agency_id]` et rendent `meta.total`.
- Aucun endpoint à créer.

## Direction UX / Artistique

Trois défauts de la même famille, relevés le 2026-08-26 :

1. **`/users` demande de taper un identifiant d'agence à la main**, dans un `<input type="number">`. Personne ne connaît par cœur l'ID d'une agence.
2. **`/properties` et `/moderation` chargent 50 agences** (`perPage: 50`) et tronquent en silence : au-delà, l'agence cherchée est simplement absente du sélecteur, sans que rien ne le dise. Un filtre qui tait ce qu'il ne montre pas est pire qu'un filtre absent.
3. **Aucune recherche du dépôt n'est temporisée** — chaque frappe déclenche une requête (`grep -rl 'debounce\|useDeferredValue'` sur la console : zéro).

- Un `AgencyCombobox` unique, partagé par les trois écrans : saisie, recherche serveur, chargement à la demande, agence sélectionnée affichée par son nom.
- La barre de filtres porte le **compte de résultats** et une action **« réinitialiser »** — aucune des barres actuelles ne les a.
- Les filtres actifs restent lisibles d'un coup d'œil : sur `/users`, six sélecteurs alignés dans une grille ne disent pas lesquels sont posés.

## Contraintes strictes (métier)

- La temporisation de saisie ne doit pas rendre l'interface muette : l'état « recherche en cours » doit être visible pendant l'attente.
- Le sélecteur d'agence ne doit **jamais** afficher une liste tronquée sans le signaler ni permettre d'aller chercher plus loin.
- L'état des filtres passe par l'URL partout où il l'est déjà (`/properties`, `/moderation`) ; `/users` s'aligne, sa mémorisation actuelle ne portant que sur le rôle.
- Le filtrage reste côté serveur (`filter[...]`), jamais côté client sur une liste déjà récupérée — règle de dépôt.

## Delta à produire

- [x] Composant `AgencyCombobox` (recherche serveur, chargement à la demande, valeur = id, libellé = nom)
- [x] `/users` : champ numérique remplacé par `AgencyCombobox` ; état des filtres porté par l'URL
- [x] `/properties` et `/moderation` : sélecteurs tronqués remplacés par `AgencyCombobox`
- [x] Temporisation (~300 ms) sur les trois champs de recherche, avec indicateur d'attente
  - les trois écrans à recherche sont `/users`, `/agencies` et `/properties` : `/moderation` n'a **aucun** champ de recherche (cf. note 3 ci-dessous).
- [x] `FilterBar` (TCK-357) : compte de résultats + « réinitialiser » sur `/users`, `/agencies`, `/properties`, `/moderation`
- [x] Tests : nombre de requêtes émises pour une saisie de N caractères ; sélection d'une agence au-delà des 50 premières ; réinitialisation

## Critères d'acceptation

- [x] AC1 — aucun écran de la console ne demande la saisie manuelle d'un identifiant d'agence
  - **tenu à la lettre, mais pas par ce ticket seul.** À la livraison il restait `announcements.tsx`, qui demandait une liste d'IDs d'agences saisie à la main (`placeholder="12,18"`) — un ciblage MULTI-valué que `AgencyCombobox` ne fait pas et que le delta ne prévoyait pas. Il a été porté sur un sélecteur paginé à recherche serveur par **TCK-366**, dans la même vague. Mesuré dans l'arbre fusionné le 2026-08-27 : plus aucun `<input type="number">` d'identifiant d'agence dans la console.
  - ⚠ Reste, hors du champ de cet AC : `CrossTenantAuditTable.tsx:90` demande encore un identifiant **d'utilisateur** (`causerId`) au clavier. Même motif, autre entité — à ticketer si on veut le fermer.
- [x] AC2 — une agence classée au-delà du 50ᵉ rang est sélectionnable dans les trois écrans, **le test la choisissant explicitement** (un test qui ne sélectionne que parmi les 50 premières cocherait aussi l'ancien comportement)
  - catalogue de 63 agences, la 63ᵉ (« Ziguinchor Habitat ») choisie explicitement par cinq tests, une fois par la recherche serveur et une fois en cliquant « Afficher plus » jusqu'à dépasser le 50ᵉ rang (paliers 20/40/60/63 assérés).
- [x] AC3 — une saisie de 10 caractères déclenche au plus 2 requêtes de recherche (mesuré par un espion sur `fetch`), contre 10 aujourd'hui
  - vérifié **par ablation** : délai ramené à 0 ms → 11 requêtes au lieu de 2, le test rougit.
- [x] AC4 — pendant l'attente de la temporisation, un état de chargement est visible
  - l'indicateur est branché sur `brouillon !== valeur || isFetching`, **jamais** sur le seul `isFetching` : aucune requête n'est en vol pendant la fenêtre d'attente.
- [x] AC5 — chaque barre de filtres affiche le compte de résultats et propose « réinitialiser » ; l'action remet tous les filtres à leur valeur par défaut et vide l'URL
  - « vide l'URL » vaut pour les trois écrans à état d'URL (`router.replace('?')` assére). `/agencies` garde son état en React — le ticket ne demande l'URL que là où elle est déjà, et `/agencies` n'y était pas.
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
  - **reste décochée.** `npx tsc --noEmit` (exit 0) et `npx eslint` sur les fichiers du lot (exit 0) sont verts ; `npm run test` **en entier** ne l'a été par personne — rituel de fin de branche de la session. Joué à la place : 12 fichiers / 98 tests après correctifs, 39 fichiers / 269 tests par la revue.

## Hors périmètre

- La recherche publique et la recherche agence, servies par d'autres surfaces.
- Le tri des colonnes : TCK-357.
- Tout changement de la logique de filtrage côté API.

## Notes d'implémentation

**Quatre affirmations du ticket ont été re-mesurées, et trois étaient fausses ou incomplètes.**

1. **« Aucune recherche du dépôt n'est temporisée » — faux du dépôt, vrai de la console.**
   `src/hooks/useDebouncedValue.ts` existe depuis TCK-335 et porte DEUX formes
   (`useDebouncedValue`, `useDebouncedCallback` avec `flush`/`cancel`). Un seul appelant :
   `useSuggest.ts`. Le grep du ticket portait sur `src/app/(super-admin)` et
   `src/components/admin/super` — répertoires où le compte est bien zéro. *Un grep de répertoire
   ne mesure pas le dépôt* : la temporisation n'était pas à écrire, elle était à brancher.

2. **`/properties` n'émettait PAS une requête par frappe.** Sa recherche vivait dans un
   `<form onSubmit>` : rien ne partait avant la touche Entrée. C'est un troisième comportement,
   pas le même défaut — et le test qui le couvrait s'appelait *« debounces search via form
   submit »*, ce qui nommait « temporisation » quelque chose qui n'en est pas une.

3. **Il y a QUATRE champs de recherche à traiter, pas trois — et le quatrième est ailleurs.**
   `/moderation` n'a **aucun** champ de recherche (types, statut, agence, tri). Le troisième
   écran à recherche est `/agencies`, que le ticket ne cite que dans la ligne `FilterBar`.
   L'AC3 ne s'applique donc pas à `/moderation`.

4. **`GET /api/admin/agencies` est bien la route BACKEND**, mais le front l'atteint par
   `/api/super-admin/agencies` (route handler BFF `src/app/api/super-admin/[...path]/route.ts`,
   qui réécrit en `/api/admin/<path>`). `filter[search]` y couvre `name`, `slug` et `email`
   (`AgencyModerationController::index`). Aucun changement d'API.

**Décisions techniques**

- `AgencyCombobox` est bâti sur `@base-ui/react/combobox` avec `filter={null}` — le filtrage
  interne est COUPÉ : filtrer côté client une liste déjà tronquée redirait le défaut corrigé.
  Pagination par `useInfiniteQuery`, `enabled: open` (rien ne part tant que le sélecteur n'est
  pas ouvert, là où les deux écrans chargeaient 50 agences au montage de la PAGE).
- Le nom de l'agence hydratée depuis l'URL est résolu par `fetchAdminAgencyDetail`, et
  seulement dans ce cas : après un choix à l'écran, le libellé est déjà connu.
- L'indicateur d'attente est branché sur `brouillon !== valeur || isFetching`, jamais sur le
  seul `isFetching` : pendant la fenêtre de temporisation, **aucune requête n'est en vol**. Un
  test d'AC4 branché sur le seul état de requête reste vert avec un délai de 0 ms — vérifié par
  ablation.
- Le bouton « afficher plus » du popup porte `onMouseDown={e => e.preventDefault()}` : sans ça,
  le retrait de focus ferme le popup AVANT le `click` et le bouton est inerte à la souris.
- `FilterBar` reçoit un passe-plat `data-testid`, comme `DataState`.

**Vérification par ablation** (délai ramené à 0 ms) : AC3 passe de 2 à **11 requêtes** pour dix
caractères, et l'AC4 rougit aussi. Les deux tests sont donc non vacuous.

**Reste hors périmètre, mesuré et signalé** : `src/components/admin/super/announcements.tsx`
demande une liste d'identifiants d'agences saisie à la main (`placeholder="12,18"`). Lu à la
lettre, l'AC1 n'est donc pas tenue à l'échelle du dépôt — elle l'est pour **toutes les barres de
filtres** de la console. Ce champ est un formulaire de CIBLAGE multi-valué, hors du delta ; il
demande un sélecteur multiple, à ticketer.

### Ce que la revue adverse a trouvé, et ce qui a été corrigé (2026-08-27)

La revue a **refusé**. Le cœur tenait, mais le champ de recherche partagé que ce ticket **introduit**
cassait le cas nominal, et deux contraintes strictes du ticket étaient violées. **Les huit défauts
sont corrigés.**

- **Le composant neuf mangeait l'espace d'une recherche à deux mots.** Le brouillon gardait la
  valeur brute, le commit envoyait la valeur **trimée**, et la resynchronisation réécrivait ensuite
  le brouillon sans son espace : `user.type('Dakar ')` puis `'Immo'` donnait **`DakarImmo`**. Sur
  les trois écrans, et sur des noms d'agence à deux mots — le catalogue de test du ticket lui-même.
  Aucun test ne l'attrapait : les trois tests d'AC3 tapent un **seul** mot. Corrigé en normalisant
  les **deux côtés** de la comparaison : *on ne compare jamais le brouillon à la valeur qu'on a
  transformée avant de l'envoyer.* Même cause pour le second symptôme — une saisie faite d'espaces
  seuls laissait l'indicateur « Recherche en cours… » allumé indéfiniment, `role="status"` compris,
  pour une requête qui ne partirait jamais.
- **Une garde perdue au merge.** La résolution de conflit avec TCK-360 avait gardé la lecture d'URL
  de `/users` et perdu sa validation : `?status=nawak` partait au serveur et rendait le jeton brut
  « nawak » dans le déclencheur du Select. Rétablie **et généralisée** aux quatre filtres à
  vocabulaire fermé (`role`, `status`, `email`, `twoFactor`), dont trois n'en avaient jamais eu.
- **Le sélecteur d'agence était MUET sur le chemin d'erreur** — ce que la contrainte stricte du
  ticket interdit nommément. API en échec à l'ouverture : le popup ne rendait **rien** (un sélecteur
  vide se lit « il n'y a pas d'agences », pire qu'une troncature). Page suivante en échec : le pied
  affichait toujours « 20 sur 63 » et le bouton devenait inerte sans un mot. Et quand le détail de
  l'agence portée par l'URL échouait, le champ affichait « Toutes agences » **sur un filtre actif**.
  Les trois chemins parlent désormais, avec réessai.

**Ce qui reste ouvert et signalé :** `AdminUsersFilters.tsx:76` (console agence) porte le **même
motif** que le premier défaut — non vérifié par exécution, non corrigé, hors périmètre. La
sur-demande de champs de `fetchAdminAgencies` (15 champs pour un combobox qui lit `id,name`) vit
dans une fonction partagée, hors périmètre. Aucune vérification navigateur : le rendu visuel du
popup (positionnement floating-ui, largeur `--anchor-width`, débordement en `md:`) n'est pas vu.
