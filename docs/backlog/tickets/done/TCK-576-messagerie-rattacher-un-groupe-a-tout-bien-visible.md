---
id: TCK-576
title: "Messagerie : rattacher un groupe à n'importe quel bien ou bail visible, par une recherche serveur ; restes de TCK-565"
status: done
phase: P2
family: full
estimate: M
wave: 69
created: 2026-09-24
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [fullstack, messagerie, recherche, securite, mobile, a11y]
---

## Objectif utilisateur

Un membre d'une équipe qui crée un groupe de discussion peut le rattacher à **n'importe quel** bien
ou bail qu'il a le droit de voir, en le cherchant par son titre ou sa référence, y compris un
brouillon ou un bien privé. Et une fois le groupe créé, il en voit les membres et peut y inviter
quelqu'un.

## Contexte

Suite de TCK-565. Sa vérification a laissé un plafond déclaré hors périmètre et plusieurs défauts
mineurs ; le porteur a délégué les décisions produit restantes. Tout a été mesuré le 2026-09-24 sur
la pile locale (API `127.0.0.1:8002`, front `localhost:3000`), compte `agent1@dakarimmo.sn`.

- **Le plafond de 100.** L'étape 2 de « Nouveau groupe » lisait `/api/properties` et
  `/api/leases` avec `per_page=100`, sans recherche. Agent1 voit **206 biens et 146 baux** : **106
  biens et 46 baux** ne pouvaient pas être rattachés à un groupe. Le seul signe en était la ligne
  « Les 100 premiers sur 206 ».
- **Le `filter[search]` de `/api/properties` ne suffit pas, et c'est mesuré.** Il passe par
  Meilisearch (`HasQueryBuilder`, TCK-280), dont l'index ne porte que les biens publics et publiés
  (`Property::shouldBeSearchable()`). Sur les 206 biens d'agent1, **10 sont hors index** (brouillon,
  privé, en attente, refusé). « Espace de bureau à Mbour » (id 145, privé, loué) est un de ceux-là :
  `filter[search]=Espace de bureau Mbour` rendait 8 biens publics et pas lui. Idem pour 149 et
  150 (brouillon). Or c'est précisément de ces biens qu'une équipe parle entre elle.
- **`/api/leases` n'a aucune recherche** : `Lease` ne déclare aucun `$requestSearchFields`.
- **Onze titres sont portés par plusieurs biens** dans la démo, par exemple « Entrepôt à
  Guédiawaye » (×3). Un titre seul ne permet donc pas de choisir.

**Restes de TCK-565**, chacun reproduit avant d'être corrigé, ou démontré faux (le détail est dans
TCK-565, « Reprise du 2026-09-24 ») :

- **La frontière d'isolation de `MessagingReach` n'était gardée que contre les retraits.** Sept
  élargissements ont été rejoués. Y7 (règle 1 ouverte aux conversations des autres) et Y5 (comptes
  supprimés) laissaient **tout vert**. Il en allait de même pour W3b, où l'équipe joignait les
  propriétaires de **toute** agence.
- **La garde de contexte laissait passer un bien, un bail ou une intervention supprimés.** La règle
  `exists:properties,id` accepte une ligne supprimée, puis `find()` la masque. Le modèle valait alors
  `null` et la garde passait son tour. Résultat : **201** en rattachant un groupe au bien supprimé
  d'une autre agence (reproduit par test).
- **`GET /api/conversations/{id}` ne rendait pas `participants`**, alors que le front le demande
  (`include=property,participants`). Mesuré sur le groupe 241 : aucune clé `participants`. La feuille
  d'infos affichait « 0 participant » et cachait le renommage, la gestion des rôles et l'invitation
  par nom de TCK-565.
- **`useCreateConversation`** n'avait aucun appelant, et son corps typé (`recipient_id`,
  `initial_message`) ne correspondait à rien de ce que l'API valide.

### Réparation 1 (vérificateur du 2026-09-24)

Le vérificateur a refusé le premier jet. Chaque point a été **reproduit par un test rouge** avant
d'être corrigé, puis re-mesuré au navigateur (agent1, latence émulée à 2,5 s) :

- **Majeur — le sélecteur de bail proposait les baux d'AUTRES biens pendant un chargement.**
  `useGroupLeaseOptions` gardait la liste de la clé précédente (`placeholderData: (precedent) =>
  precedent`) tant que `filter[property_id]=<nouveau bien>` était en vol : bien 145 choisi, la
  liste montrait « Pièce indépendante à Mermoz », « Studio rénové à Hann Maristes »… **cliquables**.
  Régression par rapport au `Select` de TCK-565, et la case X8 était cochée à tort. Le serveur
  acceptait la paire : `property_id=1` + `lease_id=363` → **201**. Vitest de reproduction :
  `LS-FC-DSZY4E` visible pendant la requête du bien 31 (rouge).
- **Mineur — `is_muted` des membres n'était tenu par aucun test**, alors que `ChatView` le lit
  dans le détail (`currentMute`) : figé à `false`, 19/19 verts.
- **Mineur — `filter[property_id]=abc` rendait 500** (`SQLSTATE[22P02]`, message SQL visible en
  débogage). Reproduit par test : 500.
- **Mineur — état vide trompeur** : sans recherche et sans résultat, « Aucun bien ne correspond à
  cette recherche. » à qui n'a rien cherché (acteur sans bien, bien sans bail).
- **Mineur — un bail choisi AVANT son bien était effacé** quand on choisissait ensuite ce même
  bien : la condition comparait le bien précédent (aucun) au nouveau, pas le bien du bail.
- **Mineur — hauteurs incohérentes à l'étape 2** : Sujet à 40 px au mobile et 32 px au bureau,
  les deux sélecteurs à 44 px.

## Delta produit

**API**

- `App\Http\Controllers\Api\ConversationContextController` : deux routes.
  - `GET /api/conversations/context/properties` lit `fields[properties]=id,title,reference_number`,
    `filter[search]` et `sort=title`.
  - `GET /api/conversations/context/leases` lit `fields[leases]=id,reference_number,property_id`,
    `fields[properties]=…`, `include=property`, `filter[property_id]`, `filter[search]` et
    `sort=created_at|reference_number`.

  Tout autre paramètre rend 400. La recherche est **SQL**, repliée en casse des deux côtés
  (`CaseInsensitive`, ADR-0025). Chaque mot saisi doit apparaître dans le titre ou la référence (du
  bien, ou du bien du bail). Les jokers `%` et `_` sont échappés, et l'ordre est total
  (`id` en dernier). Le périmètre traduit ligne à ligne `PropertyPolicy::view()` et
  `LeasePolicy::view()`, c'est-à-dire ce que `CreateGroupConversationRequest` accepte. Un bien
  archivé n'est pas proposé.
- `App\Http\Resources\Messaging\GroupContextPropertyResource` (`id`, `title`, `reference_number`)
  et `GroupContextLeaseResource` (`id`, `reference_number`, `property_id`, `property`). Les deux
  sont inscrites dans `tests/Support/ResourceInventory.php`.
- `GuardsConversationScope::guardLeaseMatchesProperty()` (réparation 1) : un bail et un bien
  envoyés **ensemble** doivent aller ensemble, sinon 422 sur `lease_id`
  (`messaging.errors.lease_property_mismatch`, fr/en/wo). Appliquée après `guardContext()` — on ne
  compare que deux contextes déjà visibles — par la création d'un groupe **et** par la directe.
- `ConversationContextController::leases()` (réparation 1) : `filter[property_id]` doit être un
  entier (`abc`, `1.5`, `1,2`, un nombre hors `bigint` → 422, plus jamais 500).
- `GuardsConversationScope::guardContext()` : un contexte introuvable par `find()` (supprimé) se
  **refuse**, au lieu de passer. Cela vaut pour le groupe comme pour la directe.
- `ConversationController::show()` charge les membres **actuels** (`left_at` nul) et leurs médias.
  `ConversationResource` rend `participants` : `id` (ligne de participation), `user_id`, `role`,
  `is_muted` (**pour le seul lecteur**, clé absente pour les autres), `last_read_at` (**pour le
  seul lecteur**, `null` pour les autres — réparation 1 de la reprise du 2026-09-24), `joined_at`,
  `left_at` et `user {id, full_name, avatar_url}`.
  **Aucune coordonnée.** `Conversation::participants()` ajoute `id` à ses colonnes de pivot.
- Reprise du 2026-09-24 : `GuardsConversationScope::guardMaintenanceMatchesContext()` — la demande
  d'intervention rattachée à un groupe doit concerner le bien du contexte (`property_id`, sinon le
  bien du bail), sinon 422 sur `maintenance_request_id`
  (`messaging.errors.maintenance_property_mismatch`, fr/en/wo). `ListGroupContextLeasesRequest::
  attributes()` nomme le champ (`messaging.attributes.property_filter` : bien / property / ber).

**Front**

- `components/messages/GroupContextPicker.tsx` : `GroupPropertyPicker` et `GroupLeasePicker`, deux
  combobox Base UI à recherche serveur temporisée à 300 ms, chargés à l'ouverture. Ils disent la
  troncature (« 20 sur 206 — précisez la recherche »), l'absence de résultat et l'échec (avec
  « Réessayer »). Chaque option porte un détail : la référence d'un bien, le bien d'un bail. Le champ
  vide vaut « aucun rattachement », et une croix « Retirer le bien » / « Retirer le bail » de
  44 × 44 px y ramène. Un long titre choisi se coupe par une ellipse.
- `NewGroupDialog` : les deux `Select` sont remplacés par ces deux champs, toujours **empilés**
  (TCK-565, M11). Choisir un autre bien retire le bail. Les props `defaultPropertyId` et
  `defaultLeaseId` sont retirées : aucun appelant ne les passait, et un identifiant seul ne donne pas
  le libellé à afficher. Réparation 1 : choisir un bien ne retire le bail que s'il concerne un
  AUTRE bien (l'option de bail porte son `propertyId`) ; retirer le bien garde le bail. Le
  formulaire de l'étape 2 ouvre la portée `data-field-density="comfortable"` (TCK-468) : le Sujet
  passe à 44 px, comme les deux sélecteurs.
- `GroupContextPicker` (réparation 1) : sans recherche et sans résultat, un message propre —
  « Vous n'avez encore aucun bien à rattacher. », « Ce bien n'a aucun bail. », « Vous n'avez
  encore aucun bail à rattacher. » — distinct du « aucun … ne correspond » d'une recherche.
- `lib/queries/conversations.ts` : `useGroupPropertyOptions(search)` et
  `useGroupLeaseOptions(propertyId, search)` lisent les deux routes, 20 par page. Réparation 1 : les baux ne gardent la liste précédente pendant un chargement **que
  pour le même bien** (`placeholderData` lit le bien de la clé précédente) ; au changement de bien,
  l'écran dit « Recherche… » au lieu de proposer les baux d'un autre. **`useCreateConversation`
  et `CreateConversationPayload` sont retirés** (code mort).
- i18n `messaging.group.create` : clés ajoutées `propertyPlaceholder`, `leasePlaceholder`,
  `clearProperty`, `clearLease`, `noPropertyMatch`, `noLeaseMatch`, `contextError`, et à la
  réparation 1 `noPropertyYet`, `noLeaseYet`, `noLeaseForProperty` (fr, en, wo) ;
  clés retirées `contextTruncated`, `noProperty` et `noLease`.

## Critères d'acceptation

- [x] Un bien au-delà des 100 premiers se trouve et se rattache. Mesuré au navigateur (agent1) :
      à l'ouverture, 20 options et « 20 sur 206 — précisez la recherche » ; `bureau mbour` rend
      une seule option, « Espace de bureau à Mbour · PR-QWVI2KQS » (id 145, privé, **hors
      index Meilisearch**) ; on la choisit, et les baux se restreignent alors au sien (`LS-FC-DSZY4E`).
      Vitest : `TCK-576 — un bien au-delà de la première page…` (la recherche retirée du hook fait
      rougir 3 tests).
- [x] La recherche atteint ce que Meilisearch n'indexe pas : un bien privé et un brouillon. Elle
      trouve par des mots dans le désordre, par un mot partiel, par la référence, et en casse
      non ASCII (« AMITIÉ » trouve « Amitié »). `%` et `_` ne valent pas « tout »
      (`ConversationContextTest`, ablation de l'échappement : 1 rouge).
- [x] **Frontière d'isolation.** Tout bien et tout bail listés passent la policy `view` que la
      création applique. Pour les baux, l'équivalence est vérifiée **dans les deux sens** sur un monde
      à agent, bailleur, locataire et autre agence. Rien d'une autre agence ne sort, même quand la
      recherche le désigne par un titre identique. Ablations : périmètre des biens retiré (4 rouges),
      élargi à toute agence (3), archivés réadmis (2), clause locataire retirée (1), périmètre
      d'agence des baux élargi (2).
- [x] L'ordre est total : cinq biens de même titre, paginés un par un, sortent chacun une fois
      (retrait du `orderBy('properties.id')` : 1 rouge).
- [x] Liste blanche : `fields[properties]=id,price`, `sort=price`, `include=owner`,
      `filter[status]`, `filter[agency_id]`, `fields[leases]=id,monthly_rent`, `include=tenant`
      rendent 400. Un bien ne rend que `id`, `title` et `reference_number` ; un bail que sa
      référence, son bien et le titre de ce bien.
- [x] Le bail choisi est **envoyé**, et c'est celui qu'on a choisi (TCK-565, X1 et X2). La liste des
      baux est restreinte au bien choisi (`filter[property_id]`, X8), et changer de bien retire le
      bail. Ablations : `lease_id` non envoyé, choix ignoré, bien non transmis, bail non retiré au
      changement de bien, recherche des baux ignorée → 1 rouge chacune (tests `TCK-576 (TCK-565, …)`).
      ⚠ **Cette case était cochée à tort au premier jet** : la restriction ne tenait pas PENDANT le
      chargement (voir le critère suivant).
- [x] **Pendant le chargement des baux d'un bien, aucun bail d'un autre bien n'est proposé**
      (réparation 1). Vitest `TCK-576 (X8) — pendant le chargement…` : la requête du bien est
      retenue, aucune option `LS-FC-DSZY4E`, « Recherche… » affiché ; puis le bail du bien se
      choisit et part avec lui. `placeholderData` inconditionnel remis : 1 rouge. Au navigateur,
      latence 2,5 s, bien 145 choisi : **0 option** et « Recherche… » / « Searching… » /
      « Mi ngi wut… » à 320 (wo), 360 (fr), 390 (wo) et 1366 px (en) — le vérificateur y lisait
      Mermoz, Hann Maristes, Garage à Mbour ; une fois chargé, seul `LS-FC-DSZY4E`.
- [x] **Le serveur refuse une demande d'intervention d'un autre bien que le contexte** (reprise du
      2026-09-24), groupe seulement — la directe ne lit pas `maintenance_request_id`. 201 avant,
      422 après sur la pile locale ; appel retiré : 1 rouge ; repli sur le bien du bail retiré :
      1 rouge.
- [x] **Le serveur refuse un bail qui ne concerne pas le bien envoyé** (réparation 1), pour le
      groupe et la directe ; témoins 201 pour la bonne paire et pour chacun seul
      (`GroupConversationCreationTest::test_un_bail_qui_ne_concerne_pas_le_bien_choisi_est_refuse`).
      Appel retiré du groupe : 1 rouge ; de la directe : 1 rouge. Sur la pile locale,
      `property_id=1` + `lease_id=363` → **422** avec la phrase localisée (201 au vérificateur).
- [x] Un bail choisi avant son bien reste choisi quand on choisit **ce** bien, et part avec lui ;
      il est retiré si l'on choisit un autre bien (réparation 1). Ancienne condition remise : 1
      rouge ; condition retirée : 2 rouges ; `propertyId` du bail non transmis : 1 rouge. Au
      navigateur (360 fr) : `LS-FC-DSZY4E` puis « Espace de bureau à Mbour » → bail conservé ;
      puis « Appartement F4 à Mermoz » → bail retiré.
- [x] Sans recherche et sans résultat, les sélecteurs le disent sans parler de recherche
      (réparation 1) : deux tests, libellé unique remis : 2 rouges ; libellé du bien sans bail
      confondu avec « aucun bail » : 1 rouge. Au navigateur (360 fr), bien 1 (sans bail) :
      « Ce bien n'a aucun bail. ».
- [x] `filter[property_id]` mal formé → 422, jamais 500 (réparation 1 ;
      `ConversationContextTest::test_un_bien_mal_forme_dans_le_filtre_rend_422_et_pas_500`,
      validation retirée : 1 rouge ; pile locale : `abc` → 422).
- [x] Le détail rend au lecteur **sa** sourdine (`is_muted`), et **jamais celle des autres
      membres** (clé absente). ⚠ **Cette case disait « la sourdine de chaque membre » : c'était
      l'exposition d'une préférence privée**, corrigée à la reprise du 2026-09-24 (décision de la
      session). Tenue par `ParticipantManagementTest::test_le_detail_rend_les_membres_actuels…`
      (sa propre sourdine figée à `false` : 1 rouge) et
      `…::test_la_sourdine_d_un_membre_n_est_rendue_qu_a_lui_meme` (avant correctif : 2 rouges).
- [x] Le détail rend au lecteur **son** `last_read_at`, et `null` pour les autres membres (clé
      présente : le front la déclare obligatoire). ⚠ **Une version précédente de cette case disait
      « `last_read_at` reste rendu pour chaque membre »** : c'était garder une exposition sans
      consommateur (réparation 1 de la reprise). Tenu par
      `…::test_la_sourdine_d_un_membre_n_est_rendue_qu_a_lui_meme` : exposé pour tous → 1 rouge ;
      `null` pour tous → 1 rouge ; clé absente pour les autres → 1 rouge.
- [x] La croix « Retirer le bien » mesure 44 × 44 px et défait le rattachement (à 7 px : 1 rouge).
      Un échec de chargement se dit et se réessaie (message retiré : 1 rouge). La troncature est
      dite (ligne retirée : 1 rouge).
- [x] Mobile et bureau, mesurés au navigateur (Chrome headless, `mobile: true`), étape 2 après
      choix d'un bien :
      320 px (fr) : champs à x = 32, w = 256, h = 44, croix 44 × 44 à x = 244 ;
      **réparation 1 : le Sujet aussi fait 44 px** à 320 (wo), 360 (fr), 390 (wo) et 1366 px (en)
      — il en faisait 40 et 32 (portée de densité retirée : 1 rouge) ;
      360 px (en) : x = 32, w = 296 ; 390 px (wo) : x = 32, w = 326 ; 1366 px (fr) : x = 475,
      w = 416. Chaque libellé tient sur une ligne de 20 px, et `scrollWidth` = `innerWidth` partout.
      À 390 px en wolof, le premier jet de placeholder était coupé ; il a été raccourci, puis un
      titre choisi trop long se termine par une ellipse (capture à 320 px, wo).
- [x] La création refuse un bien, un bail ou une demande d'intervention **supprimés**, même les
      siens, pour le groupe comme pour la directe (201 avant, 422 après ; correctif retiré : rouge).
- [x] `GET /api/conversations/{id}` rend les membres actuels, leur rôle et leur nom, sans e-mail.
      Un membre parti n'est pas rendu. Ablations : filtre `left_at` retiré, 1 rouge ; e-mail ajouté,
      1 rouge. Au navigateur, sur le groupe 241 à 360 px : « Participants (3) », trois membres,
      l'invitation et le renommage visibles pour l'administrateur (la feuille affichait 0 membre).
- [x] Pint, ESLint, `tsc --noEmit`, `check-i18n` et `check-i18n-namespaces` sont verts, ainsi que les
      classes touchées : les 15 classes API qui touchent la conversation, plus
      `tests/Unit/Http/Resources` (227 tests, 1097 assertions), et `messages` +
      `chat-widget` côté front, 69 tests. Réparation 1 : les 9 classes `Feature/Api` de la
      messagerie (106 tests, 685 assertions), `messages` + `chat-widget` (75 tests). La suite entière n'a **pas** été lancée par l'agent :
      `impacted-tests` répond « SUITE ENTIÈRE » (`GuardsConversationScope` est absent de la carte).
- [ ] Mesure sur `preview.takussan.com` après déploiement.

## Hors périmètre

- **La recherche des biens de la console (`/api/properties?filter[search]=`) ne trouve pas un bien
  privé ou un brouillon**, pour la même raison que ci-dessus (index public seulement). Seul le
  sélecteur de la messagerie en est sorti ici. La console relève d'un ticket à part : index du
  back-office, ou repli SQL.
- **Les accents ne se replient pas** : « amitie » ne trouve pas « Amitié », alors que « amiti » le
  trouve. C'est la reconduction d'ADR-0020 §2, qui refuse `unaccent` sans ticket.
- **`/api/leases?filter[property_id]=abc` rend 500 lui aussi** (même cause, relevé par le
  vérificateur). Ce contrôleur n'est pas de la messagerie : laissé à un ticket à part.
- La documentation des deux routes dans `docs/features.md` §1.7 est laissée à `/sync-specs`.

## Reprise par la session (2026-09-24) — le 500 sur `filter[<x>_id]`, partout

La vérification avait relevé que `filter[property_id]=abc` rendait **500** sur la route de contexte
de la messagerie (corrigé ici en 422 par sa requête), et noté pour l'ardoise la même panne sur
`/api/leases`. Re-mesuré par la session : **systémique** — `/api/leases?filter[property_id]=abc`,
`/api/properties?filter[agency_id]=abc`, `/api/invoices?filter[customer_id]=abc`,
`/api/maintenance-requests?filter[property_id]=abc` → 500 (`SQLSTATE[22P02]`), seul
`/api/customers?filter[id]=abc` rendait 400 (filtre non déclaré).

Corrigé à la cause : `App\Http\Filters\ExactIdentifierFilter` (hérite de `FiltersExact`) refuse en
**400** toute valeur non entière — texte, négatif, décimal, plus de 18 chiffres, liste dont un
élément est invalide — sur les colonnes `id` / `*_id`. `HasQueryBuilder` l'applique à tout
`$requestFilterable` d'identifiant (67 colonnes, toutes `bigint` au relevé des migrations), et les
trois contrôleurs qui déclaraient eux-mêmes un `AllowedFilter::exact('<x>_id')` (journal d'audit,
audit transverse, délégations) l'emploient. Même enveloppe `{message}` que les autres 400 de spatie.
Après : les quatre routes ci-dessus → **400**. Tests : `tests/Feature/Api/FiltreIdentifiantTest.php`
(7) ; garde retirée de `HasQueryBuilder` → **6 rouges** ; md5 restaurée.

## Reprise des défauts mineurs (2026-09-24)

Restes mesurés par le vérificateur de la réparation 1. Chacun a été **reproduit avant d'être
corrigé** (mutation verte, ou défaut rendu par un test rouge), puis tenu par un test qui rougit sans
le correctif. Ablations : copie dans le bloc-notes, mutation, rouge, restauration par `cp`, md5
vérifiée identique.

1. **X8 d'un bien A à un bien B** — le test X8 ne couvrait que « aucun bien → un bien ». Test
   `TCK-576 (X8) — en passant d'un bien à un autre, les baux du premier ne sont pas proposés
   pendant le chargement` (bien A : Almadies, bien B : Mbour, requête de B retenue ; le bail d'A
   n'est ni montré ni cliquable, « Recherche… » affiché, puis le bail de B part avec B). Mutation
   du vérificateur (`… || requetePrecedente?.queryKey[3] != null ? precedent : undefined`) :
   **1 rouge / 24**.
2. **« Retirer le bien garde le bail »** — test `TCK-576 — retirer le bien garde le bail, et le
   groupe part avec le bail seul`. Mutation du vérificateur
   (`if (bail !== null && bail.propertyId !== suivant?.id) setBail(null)`) : **1 rouge / 24**.
   (Les deux tests front étaient déjà dans l'arbre, écrits par une passe précédente ; ils n'ont été
   comptés qu'après la mutation ci-dessus.)
3. **L'ordre « visibilité, puis cohérence » est un contrat, désormais tenu.** Test
   `GroupConversationCreationTest::test_un_bail_invisible_avec_un_bien_visible_rend_la_phrase_de_visibilite`
   (bien à soi + bail d'une autre agence → `errors.lease_id` vaut **exactement** la phrase de
   visibilité, jamais « ne concerne pas », groupe et directe). Ordre inversé dans le groupe :
   **1 rouge** ; dans la directe : **1 rouge**. L'ordre inverse confirmait l'existence d'un bail
   invisible et disait quelque chose de son bien.
4. **La demande d'intervention n'était pas comparée au contexte.** Reproduit : intervention sur le
   bureau + groupe rattaché à la villa → **201**. `guardMaintenanceMatchesContext()` compare au
   niveau du **bien** (`property_id`, sinon le bien du bail) : une intervention appartient à un
   bien, son `lease_id` facultatif ne dit que le bail en cours à la demande. Test
   `…::test_une_intervention_d_un_autre_bien_que_le_contexte_est_refusee` (bien seul en fr, bail
   seul en en, les deux en wo ; trois phrases distinctes ; témoins 201 avec son bien, son bail, les
   deux, et seule). Appel retiré : **1 rouge** ; repli sur le bien du bail remplacé par `return` :
   **1 rouge**. La **directe n'est pas concernée** : `maintenance_request_id` n'est ni dans ses
   règles ni écrit par le contrôleur. Un test existant construisait un bail et une intervention sur
   deux biens différents par accident (deux fabriques) : il pose désormais l'intervention sur le bien
   du bail. Pile locale (agent1) : intervention 35 (bien 56) + `property_id=1` → **422** avec la
   phrase française, aucune conversation créée.
5. **`is_muted` est une préférence privée** (décision de la session). Le détail le rendait pour
   chaque membre à tous les membres. Il n'est plus rendu que sur la ligne du lecteur ; pour les
   autres, la clé est **absente** plutôt que `null` : le type du front la déclare déjà facultative
   (`is_muted?: boolean`), et ses trois lecteurs (`ChatView`, `ConversationList`,
   `useUnreadCount`) ne lisent que la ligne de l'utilisateur courant. Aucun changement front. Le
   test qui épinglait l'exposition
   (`ParticipantManagementTest.php`, ex-lignes 455-456) affirme désormais l'absence ; nouveau test
   `…::test_la_sourdine_d_un_membre_n_est_rendue_qu_a_lui_meme` — **2 rouges** avant correctif.
   ⚠ **Ce point gardait d'abord `last_read_at` des autres membres, et c'était faux** — refusé par
   le vérificateur, voir « Réparation 1 de la reprise » ci-dessous. La justification citait une
   « décision de la session » qui n'existe pas : la décision de la session disait l'inverse
   (« s'il n'a aucun consommateur pour les AUTRES membres, même traitement »), et la fonction P2
   citée (`docs/features.md` §1.7, accusés de lecture individuels) n'est pas construite. Pile
   locale, groupe 241 : trois membres, `is_muted` présent sur la seule ligne du lecteur.
6. **Le 422 de `filter[property_id]` disait « filter.property id ».** Reproduit par test (rouge).
   `ListGroupContextLeasesRequest::attributes()` ; pile locale : « Le champ bien doit être un
   nombre entier. » / « The property field must be an integer. » / « Barabu ber bi war na doon
   nimero bu mat. ». Test `ConversationContextTest::test_le_422_du_filtre_nomme_le_bien_dans_la_langue_de_la_requete`.
   **La jumelle `properties` n'a pas le défaut** : elle ne type aucun filtre (seul
   `filter[search]`, un rappel qui ne valide rien), donc ne rend jamais ce 422.

### Réparation 1 de la reprise (vérificateur, 2026-09-24) — `last_read_at`

**Défaut (majeur).** Le détail rendait encore le `last_read_at` de chaque membre à tous les
membres. La règle de la session était conditionnelle : même traitement que `is_muted` **si aucun
consommateur ne lit celui des autres**. Mesuré :

- front : `grep last_read_at takussan-web/src` (tests exclus) → la seule déclaration de
  `types/message.ts:17`, et un commentaire de `lib/queries/conversations.ts` ;
- API : `ConversationController` ne le lit que pour le lecteur (compte de non-lus, lignes 44-45,
  jointure `lecteur`) et ne l'écrit que pour lui (`store()`, `markAsRead()`), et aucun événement
  diffusé ne le porte.

Aucun consommateur, donc même traitement. **Reproduit** avant correctif : le test épinglait
l'exposition (`assertNotNull` sur le `last_read_at` d'un autre membre), et il était vert.

**Correctif.** `ConversationResource` rend `last_read_at` pour le seul lecteur, et `null` pour les
autres (la condition est portée par `estLeLecteur()`, partagée avec `is_muted`). **`null` plutôt
qu'absent** : le type du front déclare la clé obligatoire (`last_read_at: string | null`), et
`null` est déjà la valeur d'un membre qui n'a rien lu. La clé absente aurait menti au type sans
qu'aucun `tsc` le voie. Rien ne change côté front. Si des accusés de lecture individuels se
construisent un jour, ils rouvriront la donnée par une décision explicite, pas par un reste.

**Test.** `ParticipantManagementTest::test_la_sourdine_d_un_membre_n_est_rendue_qu_a_lui_meme`
affirme maintenant trois choses. Vu par l'admin, B et C ont `last_read_at` présent et `null`, alors
que tous deux ont lu. L'admin lit sa propre lecture. Vu par B, c'est la ligne de B qui porte
`is_muted` et `last_read_at`, et l'admin n'a plus que `null`. Ablations (copie dans le bloc-notes,
mutation, `cp`, md5 `f242e6b8…` identique après chaque mutation) :

| Mutation de `ConversationResource` | Résultat |
|---|---|
| `last_read_at` rendu pour tous (l'état d'avant) | 1 rouge / 20 |
| `null` pour tous, lecteur compris | 1 rouge / 20 |
| clé absente pour les autres | 1 rouge / 20 |

Pint vert. `ParticipantManagementTest` 20/20, et les six autres classes `Feature/Api` de la
messagerie 68/68. Sur la pile locale, groupe 241 : `is_muted` absent pour les deux autres
membres, et `last_read_at` à `null`. **Cette mesure ne départage rien** : dans les données de
démo, aucune conversation d'agent1 n'a de pointeur de lecture, ni le sien ni celui d'un autre (lu
en base, en lecture seule). Aucune donnée n'a été créée pour forcer la différence. C'est le test
Feature qui en fait la preuve.

**Relevé pendant la réparation, et corrigé : l'historique des messages n'avait pas d'ordre stable.**
J'ai rejoué ensemble les classes de la messagerie (`ParticipantManagement`, `Conversation`,
`ConversationArchiveRead`, `ConversationUnreadCount`, `GroupConversationCreation`,
`ConversationMessagesPagination`, `MessagingContacts`, `DateInventoryByValue`), et
`ConversationMessagesPaginationTest::test_initial_load_returns_latest_page_with_has_more` a rougi
**2 fois sur 2**. Jouée seule, elle était verte. En cause, `ConversationController::messages()`
triait par `latest()`, donc par `created_at` seul, alors que son curseur (`before_id`, `after_id`)
est un `id`. Des messages créés dans la même seconde revenaient dans un ordre quelconque sous
PostgreSQL. Dans le produit, deux messages d'une même seconde pouvaient donc s'inverser à
l'affichage. **Correctif** : départage par `id` (`->latest()->orderByDesc('id')`, et
`->oldest()->orderBy('id')` pour `after_id`). Après correctif : 113/113, deux fois sur deux. Sans
le départage : 1 rouge / 113 dans le même ensemble, md5 `d096f596…` identique après
restauration. Aucun test neuf : c'est un test existant qui tombe sans le correctif, et seulement
selon l'ordre des classes. Le curseur lui-même n'a pas changé : ce qui est trié par `created_at`
reste filtré par `id`, comme avant.

Vérifications : Pint vert sur les fichiers touchés ; les 8 classes `Feature/Api` de la messagerie
(102 tests, 710 assertions), `SystemMessagesTest` (8), `tests/Unit/Http/Resources` et les deux
classes `Feature/Validation` qui touchent les conversations (95 tests) ; `NewGroupDialog.test.tsx`
24/24. La suite entière n'a pas été lancée par l'agent.

**Relevé en passant, non corrigé (hors des six points)** : `GET /api/conversations` (liste) ne
charge pas `participants` et l'API ne produit nulle part `unread_count`. L'icône de sourdine de
`ConversationList` et le compteur de non-lus (`useUnreadCount`, qui exclut les conversations en
sourdine) lisent donc des champs qui n'arrivent jamais : le compteur vaut toujours 0. Défaut
préexistant, à un ticket à part.

⚠ **Périmé au 2026-09-24, 04:26 — corrigé par [TCK-579](TCK-579-messages-non-lus-jamais-comptes.md),
pas par ce ticket** (qui ajoute aussi le marquage « lu » à l'ouverture d'un fil, que rien
n'appelait). `ConversationController::index` charge maintenant `participants.media` et compte
`unread_count` (messages d'un autre postérieurs au `last_read_at` du lecteur, hors avis système).
Test `tests/Feature/Api/ConversationUnreadCountTest.php` (3 tests, non suivi par git au moment de
la mesure). Contre-épreuve faite par M4 (réparation 1) : sans `participants.media`, 1 rouge / 3 ;
compteur renommé, 2 rouges / 3 ; md5 identique après restauration. La liste passe par la même
`ConversationResource`, donc la sourdine et la lecture des autres membres y sont masquées de la même
façon. Les membres partis y sont rendus (le détail les exclut), mais `ConversationList` filtre
`left_at` : pas de défaut visible. Effet de bord mesuré : `DateInventoryByValueTest` rougissait
sur la clé `ConversationResource::unread_count` (`whenHas`, jamais atteinte par une factory). Elle
est inscrite dans `CLES_JAMAIS_ATTEINTES` avec sa raison (c'est un entier, jamais une date) : 25/25.
