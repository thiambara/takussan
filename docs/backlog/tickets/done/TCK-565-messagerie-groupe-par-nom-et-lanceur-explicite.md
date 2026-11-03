---
id: TCK-565
title: "Messagerie : participants d'un groupe choisis par leur nom et bornés au périmètre, erreurs lisibles, contexte empilé, lanceur flottant nommé"
status: done
phase: P2
family: full
estimate: M
wave: 69
created: 2026-09-23
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [fullstack, messagerie, mobile, a11y, securite]
---

## Objectif utilisateur

Un utilisateur connecté crée un groupe de discussion en choisissant les personnes **par leur nom**,
parmi celles qu'il a le droit de joindre. Il y rattache un bien ou un bail choisi dans une liste,
sur un écran de téléphone qui reste aligné. Un refus lui est expliqué dans une phrase de sa langue.
Il reconnaît le bouton flottant comme l'accès à **sa** messagerie, et non comme un assistant de
support.

## Contexte

Retour testeur du 2026-09-23 (`TAKUSSSAN.docx`), constats M11, M12, M13 et M15. Tout a été relevé
sur le code de `fix/retours-testeur-2026-09-23`, puis mesuré en navigateur (Chrome, dev server local)
et en test.

- **M11 : la modale « New group » est désalignée sur mobile.** L'étape 2 posait « Property
  (optional) » et « Lease (optional) » côte à côte en `grid-cols-2`. À 360 px, le premier libellé
  passait sur deux lignes et poussait son champ sous celui du bail (capture du testeur). Le décalage
  dépend de la longueur de la **traduction**, et aucune largeur de colonne ne le corrige pour les
  trois langues. Les deux champs étaient en outre des `<input type="number">` qui attendaient un
  identifiant de bien et de bail.
- **M12 : les participants se saisissent par « User ID ».** L'étape 1 était un `<input
  type="number">`, avec l'aide « Saisissez les IDs un par un. Le serveur vérifie les permissions. »
  Aucun écran ne montre cet identifiant. Et **le serveur ne vérifiait rien** : avant correctif,
  `POST /api/conversations` (type `group`) rendait **201** avec l'identifiant d'un inconnu sans
  aucun lien avec l'appelant, et **201** avec un `property_id` d'une autre agence. C'est prouvé par
  test. Le docblock de `CreateGroupConversationRequest` affirmait que « le contrôleur vérifie le
  périmètre », ce qui était faux. La même saisie numérique existait dans la feuille d'infos du
  groupe (`ConversationInfoSheet`, « ID utilisateur »).
- **M13 : message brut « The selected participants.0 is invalid. (and 1 more error) ».**
  Reproduit par test avant correctif, mot pour mot en anglais. En français, la réponse était « La
  valeur sélectionnée pour participants.0 est invalide. (and 1 more error) ». Deux causes se
  cumulaient. D'abord, la règle `exists:users,id` s'appliquait **par élément**, avec l'attribut
  `participants.0` pour nom. Ensuite, `ValidationException::summarize()` ajoute « (and :count more
  error) » par une clé JSON que le dépôt ne traduit pas (aucun `lang/*.json`), si bien que ce
  suffixe reste en anglais dans toutes les langues.
- **M15 : le bouton flottant ressemble à un chatbot de support.** C'était une pastille terracotta
  avec une seule icône et aucun libellé visible, dans le coin où les sites posent leur widget
  d'assistance. Son nom accessible (« Ouvrir la messagerie ») n'était visible par personne.

**Réparation 1, après la vérification adverse du 2026-09-23.** Le vérificateur a accepté M11 et M15
et refusé M12 et M13. Chaque défaut a été reproduit avant d'être corrigé :

- **Des branches de la règle non tenues par un test.** Supprimer la règle CRM laissait 37 tests
  verts, retirer l'administrateur d'agence de l'équipe en laissait 33, et retirer `lease_id` et
  `maintenance_request_id` de la garde de contexte en laissait 16. Même chose pour le contrôle
  d'existence du chemin « conversation directe » : 74 verts une fois restreint aux groupes.
- **Le sélecteur proposait une personne que le serveur refusait.** `/contacts` comptait la
  conversation en cours comme une relation, alors que l'ajout l'excluait : une personne partie du
  groupe était listée puis refusée (422). Et en sens inverse, l'ajout acceptait l'équipe de l'agence
  du bien de la conversation, que le sélecteur ne montrait pas. La cause était double : deux lectures
  de la règle, et une feuille d'infos qui lisait la liste d'un **nouveau** groupe.
- **Un agent `draft` (invitation pas encore acceptée) ou `suspended` était listé comme membre de
  l'équipe.** `isAgentAt()` ne filtre pas le statut, par convention du dépôt pour l'autorisation.
- **M13 n'était corrigé que pour le cas exact de la capture.** Deux erreurs sur deux champs (un
  participant hors périmètre et un bien refusé) rendaient encore « … (and 1 more error) », et
  `participants=["abc","def"]` rendait encore `participants.0` et `participants.1`. En cause : les
  règles `integer` et `distinct` restées sur `participants.*`, et l'absence de `lang/*.json`.
  Surtout, **l'écran affichait le `message` de la 422**, c'est-à-dire un résumé qui ne montre que la
  première erreur. Aucun test front ne tenait cet affichage.
- **Deux tests acceptaient la régression qu'ils devaient refuser.** Le test M11 laissait passer des
  champs remis côte à côte en `flex gap-3`, et le test « libellé visible » de M15 un libellé en
  `hidden` ou en `max-w-0 overflow-hidden`.
- **Une affirmation fausse du ticket** : le nom accessible du lanceur ne « commence » pas par le
  libellé visible, il le **contient** (« Ouvrir la messagerie » contient « messagerie »). C'est ce
  qu'exige WCAG 2.5.3.

**Réparation 2, après la seconde vérification adverse du 2026-09-23.** Le vérificateur a accepté
M13 et M15, et refusé M11 et M12. Chaque défaut a été reproduit, puis corrigé :

- **La garde de périmètre se contournait en deux requêtes (majeur).** `POST /api/conversations`
  sans `type` (une conversation directe) acceptait N participants quelconques, sans aucun contrôle
  de joignabilité ni de contexte. Ces inconnus devenaient des « correspondants » (règle 1), le
  sélecteur les listait par nom, et le groupe refusé une requête plus tôt passait en 201. Une directe
  se rattachait aussi au bien d'une autre agence (201). Reproduit avec la sonde du vérificateur. Le
  docblock de `CreateGroupConversationRequest` (« les deux sont désormais vérifiés ») était donc
  faux **en pratique**, et le critère « la création refuse en 422 un inconnu » était coché à tort.
  Sonde rejouée sur le code de la réparation 1 : `DIRECTE A 2 INCONNUS: 201`, `CONTACTS APRES:
  ["Inconnu Deux","Inconnu Un"]`, `GROUPE APRES: 201`, `DIRECTE + BIEN ETRANGER: 201`. Après
  correctif : 422, `[]`, 422, 422. Relevé le même jour : aucun écran du front n'appelle ce chemin pour une directe
  (`useCreateConversation` n'a aucun appelant). Le premier contact avec un inconnu passe par la fiche
  publique d'un bien (`PublicPropertyController::contactMessage()`), qui choisit elle-même le
  destinataire.
- **La branche « propriétaires ACTIFS de l'agence, pour l'équipe » n'avait aucun test.** Retirer
  `->active()` laissait 52 tests verts (constat du vérificateur ; le test ajouté ici rougit sous
  la même ablation).
- **L'endpoint des contacts servait d'oracle sur les coordonnées.** `filter[search]` passait par
  `User::buildQuery()`, qui interroge aussi l'e-mail, l'identifiant et le téléphone, et `sort=email`
  y était permis. La ressource n'en rendait rien, mais un fragment d'adresse renvoyait « Awa Sarr »
  quand une recherche témoin ne renvoyait rien (sonde rejouée : `SEARCH PAR EMAIL: 200 ["Awa Sarr"]`,
  `SORT EMAIL: 200` ; après correctif : `[]` et 400). `filter[status]`, `filter[added_by_id]`,
  `filter[role]` et `include=` posaient de même des questions d'administration sur un compte.
- **Le test M11 restait une liste noire contournable.** `grid grid-flow-col auto-cols-fr gap-3` remet
  les deux champs côte à côte, et le test restait à 10/10 verts (rejoué sur l'ancien test : 10/10). L'ancien critère « refuse désormais
  TOUTE disposition en ligne » était faux.
- **Réserve M15, traitée aussi.** Le test du libellé visible ne regardait que les classes : un
  `style={{ display: 'none' }}` en ligne, ou un libellé en `text-[1px] text-primary` (la couleur du
  fond de la pilule), le laissaient vert (rejoué : `display: none` sur l'ancien test, 15/15 verts).

**Passe finale, après la troisième vérification adverse du 2026-09-23.** Le vérificateur a
accepté M11, M13 et M15, et refusé M12 sur deux trous de test ; le code produit était juste. Chaque
défaut a été reproduit sur le code en l'état, puis fermé par un test :

- **Le statut de l'ACTEUR n'était tenu par aucun test.** Retirer `->active()` dans
  `MessagingReach::isActiveStaffAt()`, sur les agents (V1) ou sur les administrateurs (V1b),
  laissait 60/60 verts sur les quatre classes de la messagerie (rejoué). Sous cette mutation, un
  agent suspendu listait les propriétaires de l'agence par nom. Nouveau test :
  `MessagingContactsTest::test_un_membre_non_actif_de_l_equipe_ne_joint_pas_les_proprietaires`
  (agents `draft`, `suspended`, `inactive` ; administrateurs `suspended`, `archived` ; liste, recherche
  indexée et création de groupe, avec un agent actif pour témoin).
- **La garde de la directe n'était testée que sans `type`.** Traiter `support` comme un groupe (V3),
  ou `booking`, `lease` et `property` (V3b), laissait 60/60 verts et rouvrait le détour de la
  réparation 2. Nouveau test :
  `ConversationTest::test_la_garde_de_la_directe_vaut_pour_tout_type_autre_que_groupe`, qui lit les
  types sur l'enum (deux inconnus, un inconnu, un bien étranger : 422 pour chacun ; contacts
  inchangés ; témoin 201 par type vers un contact joignable).
- **Réserve M15 levée.** Le test ne contrôlait que les nœuds situés entre le libellé et le lanceur.
  Or le libellé hérite du lanceur : une taille nulle, une couleur concurrente, `opacity-0`, une
  propriété arbitraire, `max-md:hidden`, un interlignage nul ou `text-transparent` posés sur le
  lanceur lui-même laissaient 15/15 verts (8 mutations rejouées). Le test contrôle désormais, sur
  le lanceur, les familles qui se transmettent au texte, chacune par liste blanche.
- **Deux observations traitées au passage.** Le message propre au minimum d'un groupe
  (`participants.min`) n'était tenu par aucun test ; `AddParticipantsRequest` renvoyait une phrase
  française écrite en dur (« Au moins un utilisateur doit être ajouté. ») dans les trois langues.
  Elle passe par la nouvelle clé `messaging.errors.participants_required` (fr, en, wo).
- **Mesure au navigateur, pile locale, 2026-09-23** (Chrome headless, `mobile: true`, facteur 3,
  compte agent de démo). M11, étape 2 de « New group » : à 360 px (en), sujet, bien et bail à
  x = 32, w = 296, h = 40, empilés (y = 250, 328, 426), chaque libellé sur une ligne de 20 px,
  `scrollWidth` = 360 ; à 390 px (wo), x = 32, w = 326, libellés longs « Ber (luñu bëgg) » et
  « Kontaaru lokal (luñu bëgg) » sur une ligne, `scrollWidth` = 390. M15 : bouton mobile 136 × 48 à
  360 px (en, « Messaging », 14 px), 123 × 48 à 390 px (wo, « Waxtaan »), lien `/app/messages` ;
  lanceur de bureau 149 × 56 à 1366 px (fr, « Messagerie »). Libellé à 14 px, opacité 1, couleur
  rgb(252, 249, 243) sur rgb(168, 83, 50).
- **Non reproduit, et pour cause** : aucun des défauts ne portait sur le comportement produit ;
  les sondes du vérificateur rendaient déjà 422 et `[]` sur le code en l'état.

## Delta produit

**API**

- `App\Services\Messaging\MessagingReach` : **une seule** règle de joignabilité, lue par la liste,
  par la création d'un groupe et par l'ajout de participants. Est joignable :
  1. un correspondant, c'est-à-dire une conversation partagée, **y compris le groupe en cours** : un
     ancien membre peut être ré-invité, chemin que `GroupConversationService` prévoit déjà ;
  2. un lien CRM (`user_customer_relationships`) dans ses trois sens : une même fiche pour les deux
     comptes, le compte client (`customers.user_id`) d'une fiche de l'acteur, et, en retour, les
     comptes rattachés à la fiche de l'acteur ;
  3. l'agence active : son équipe **active** (agents et administrateurs) pour tout membre, ses
     propriétaires **actifs** pour l'équipe seulement ;
  4. pour un groupe **existant** seulement, l'équipe active de l'agence de son bien ou de son bail.
     C'était la règle propre d'`AddParticipantsRequest`, désormais listée elle aussi.

  Les profils `draft`, `suspended` et `inactive` ne comptent pas, ni chez l'acteur ni chez la
  personne jointe.
- `GET /api/conversations/contacts` (nouveau groupe) et `GET /api/conversations/{conversation}/contacts`
  (groupe existant). La seconde route est réservée à qui peut y ajouter quelqu'un
  (`ConversationPolicy::addParticipant`, 403 sinon) et ne propose pas les membres actifs. Les deux
  répondent par `MessagingContactResource`, une liste blanche : `id`, `name`, `avatar_url`. Leur
  requête ne passe **pas** par `HasQueryBuilder` : c'est une liste blanche spatie propre au
  contrôleur (réparation 2, décrite plus bas).
- `App\Rules\ParticipantIdsRule` : la **forme** d'une liste de participants (entiers positifs, et
  sans doublon si on le demande), posée sur la liste elle-même après `bail|array`. Plus **aucune**
  règle `participants.*` ni `user_ids.*` : n'importe quelle règle y produit une erreur par position.
- `CreateGroupConversationRequest` : participants joignables, et `property_id`, `lease_id` et
  `maintenance_request_id` refusés quand l'appelant ne peut pas les `view`.
  `AddParticipantsRequest` : `MessagingReach` avec la conversation, un seul appel.
  `StoreConversationRequest` : un contrôle d'existence agrégé.
- **Réparation 2 — la conversation directe applique le périmètre du groupe.** Les deux gardes
  (joignabilité, contexte visible) vivent dans le trait
  `App\Http\Requests\Conversation\Concerns\GuardsConversationScope`, que `StoreConversationRequest`
  et `CreateGroupConversationRequest` utilisent tous deux. Pour une directe (tout `type` autre que
  `group`) : **exactement une autre personne** (au-delà c'est un groupe, qui a son propre chemin ;
  soi-même seul était un `abort` en anglais), **joignable**, et un `property_id` ou `lease_id`
  **visible**. Nouvelles clés `messaging.errors.direct_single_participant` et
  `messaging.errors.conversation_context_forbidden` (fr, en, wo).
- **Réparation 2 — `MessagingContactController` a sa propre liste blanche**, au lieu de
  `User::buildQuery()` : un filtre (`search`, sur `first_name` et `last_name` seulement, par
  `attributesToSearchOn` de Meilisearch), deux tris (`first_name`, `last_name`), trois colonnes
  (`id`, `first_name`, `last_name`), aucune relation. Tout autre paramètre rend 400. La recherche
  reste celle de Scout, avec l'ordre de pertinence restitué (`SearchRelevanceSort`).
- `lang/{fr,en,wo}.json` (nouveaux) : les deux clés du framework, « (and :count more error) » et
  « (and :count more errors) ». Le suffixe d'une 422 à plusieurs erreurs sort désormais en français
  ou en wolof **dans tout le dépôt**, pas seulement dans la messagerie.
- `lang/{fr,en,wo}/messaging.php` : `participants_unavailable`, `participants_out_of_reach`,
  `participants_duplicate` et `group_context_forbidden`. La clé `participant_out_of_scope` est
  retirée. Passe finale : `participants_required`, qui remplace la phrase française en dur de
  `AddParticipantsRequest::messages()`.

**Front**

- `ParticipantPicker` : un combobox Base UI à recherche **serveur** temporisée à 300 ms, chargé à
  l'ouverture. Il ne propose pas une personne déjà choisie et signale une liste tronquée. Les
  personnes choisies deviennent des puces « Retirer {nom} » avec une zone tactile de 44 px. La prop
  `conversationId` fait lire la liste du groupe existant.
- `NewGroupDialog` : le sélecteur à l'étape 1. À l'étape 2, le bien et le bail sont choisis dans deux
  `Select` **empilés** en pleine largeur (sparse fieldsets), et changer de bien réinitialise le
  bail.
- `ConversationInfoSheet` : le même sélecteur, sur `/api/conversations/{id}/contacts`. L'ajout et le
  retrait d'un participant invalident cette liste.
- `erreursDeValidation.tsx` (`phrasesDeValidation`, `AlerteErreurs`) : les deux écrans affichent
  **chaque phrase** de `errors` d'une 422, sans doublon, dans un `role="alert"`, et plus le résumé
  `message`. Pour toute autre erreur, ils gardent le libellé d'échec de l'écran.
- `ChatWidget` : les deux lanceurs, mobile et bureau, deviennent des pilules avec icône et libellé
  **visible** (« Messagerie », « Messaging », « Waxtaan »). Leur nom accessible **contient** ce
  libellé (« Ouvrir la messagerie »), ce qu'exige WCAG 2.5.3. Les hauteurs sont inchangées.

## Critères d'acceptation

- [x] M12 : aucune saisie d'identifiant ne subsiste dans la création ni dans l'ajout de
      participants. On choisit une personne par son nom (`NewGroupDialog.test.tsx`,
      `ConversationInfoSheet.test.tsx`).
- [x] M12 : la recherche part côté serveur, avec `fields[users]=id,first_name,last_name` et
      `filter[search]`, sur `/api/conversations/contacts` pour un nouveau groupe et sur
      `/api/conversations/{id}/contacts` pour un groupe existant (vitest ; ablation du
      `conversationId` de la feuille : 3 rouges).
- [x] M12 : **chaque branche de la règle a son test, qui rougit quand on la RETIRE.** ⚠ Ce critère
      ne mesure que des retraits : un ÉLARGISSEMENT le cochait tout aussi bien (Y7, Y5 : tout vert).
      L'élargissement a son propre critère, plus bas (reprise du 2026-09-24). Mesuré par
      ablation sur `MessagingContactsTest`, `GroupConversationCreationTest`,
      `ParticipantManagementTest` et `ConversationTest` : lien CRM a, b et c (1 rouge chacun),
      administrateur d'agence dans l'équipe (2 rouges), règle 4 (2 rouges), filtre `active()` (1),
      exclusion du groupe en cours réintroduite (2). Passe finale : `active()` retiré sur le statut
      de l'**acteur**, agents (V1) puis administrateurs (V1b) : 1 rouge chacun, contre 0 avant.
- [x] M12 : le sélecteur et l'ajout s'accordent. Un ancien membre est proposé **et** accepté,
      l'équipe de l'agence du bien est proposée **et** acceptée, un autre client de cette agence
      n'est ni proposé ni accepté, les membres actifs ne sont pas proposés, et un simple membre
      reçoit 403 sur la liste du groupe.
- [x] M12 : la création d'un groupe refuse en 422 un inconnu, ainsi qu'un bien, un bail ou une
      demande d'intervention que l'appelant ne peut pas voir. Elle accepte les siens (ablation du
      bail et de l'intervention : 1 rouge ; de l'intervention seule : 1 rouge).
- [x] M12 (réparation 2) : **le détour par une conversation directe est fermé.** La sonde du
      vérificateur est devenue un test (`ConversationTest::test_le_detour_par_une_directe_ne_rend_pas_un_inconnu_joignable`) :
      une directe vers un ou deux inconnus rend 422, la liste des contacts reste vide, et le groupe
      reste refusé. Ablations sur `StoreConversationRequest` : joignabilité retirée, 2 rouges ;
      « exactement une autre personne » relâchée, 1 rouge ; contexte retiré, 1 rouge. Une directe
      vers une personne joignable, rattachée à son propre bail, passe (témoins positifs).
- [x] M12 (passe finale) : la garde de la directe vaut pour **tout `type` autre que `group`**,
      lu sur l'enum. `support` traité comme un groupe (V3) : 1 rouge ; `booking`, `lease` et
      `property` (V3b) : 1 rouge ; 0 avant pour les deux.
- [x] M12 (passe finale) : un agent `draft`, `suspended` ou `inactive`, ou un administrateur
      `suspended` ou `archived`, ne liste pas les propriétaires de son agence, ni par la liste ni par
      la recherche, et ne peut pas les ranger dans un groupe (422). Un agent actif, témoin, les voit.
- [x] M12 (réparation 2) : un propriétaire `draft`, `inactive` ou `blocked` de l'agence n'est ni
      proposé à l'équipe ni accepté dans un groupe (ablation de `->active()` sur `ownerProfiles` :
      1 rouge, contre 0 avant).
- [x] M12 (réparation 2) : l'endpoint des contacts ne répond plus sur les coordonnées. Une recherche
      par un jeton qui n'apparaît que dans l'e-mail, l'identifiant ou le téléphone rend une liste
      vide, et la recherche par nom trouve (témoin). `sort=email`, `sort=-status`,
      `sort=created_at`, `filter[status]`, `filter[added_by_id]`, `filter[role]`,
      `include=agentProfiles` et `fields[users]=phone` rendent 400 ; `sort=-last_name` passe.
      Ablations : recherche remise sur tous les champs, 1 rouge ; tri `email` rouvert, 1 ;
      `allowedIncludes()` retiré, 1 ; `phone` rouvert dans les champs, 1 ; retour à
      `User::buildQuery()`, 3.
- [x] M13 : une 422 sur une liste de participants porte **une** erreur, sur la clé de la liste,
      qu'il s'agisse d'identifiants introuvables, mal formés (`"abc"`, `1.5`, `[1]`) ou en doublon.
      C'est vrai pour la création d'un groupe, d'une conversation directe et pour l'ajout
      (ablations de `ParticipantIdsRule` sur les trois requêtes : 1 à 2 rouges chacune ;
      restriction du chemin direct aux groupes : 1 rouge).
- [x] M13 (passe finale) : une liste vide à l'ajout rend `participants_required` dans la langue de
      la requête, et un groupe à une seule autre personne rend `group_min_participants` en fr, en
      et wo. Ablations : phrase française en dur rétablie, 1 rouge ; message `participants.min`
      retiré, 1 rouge.
- [x] M13 : deux erreurs sur deux champs rendent, en français, « … (et 1 autre erreur) », sans
      « more error » (`lang/fr.json` vidé : 1 rouge).
- [x] M13 : l'écran affiche chaque phrase de l'API, sans doublon, et jamais le résumé « (and 1 more
      error) » (`NewGroupDialog.test.tsx`, `ConversationInfoSheet.test.tsx` ; retour au résumé : 2
      rouges et 1 rouge ; sans dédoublonnage : 1 rouge).
- [x] M11 : le bien et le bail sont des listes empilées. Réparation 2 : le test est une **liste
      blanche** des jetons qui gardent les champs empilés (`space-y-*`, `gap-*`, `flex` avec
      `flex-col`, `grid` sans colonnes, `grid-cols-1`, `w-full`, marges et remplissages), sur le
      conteneur et sur chaque champ. Tout autre jeton, préfixé ou non, est refusé, ainsi que tout
      style en ligne. Il exige aussi des déclencheurs pleine largeur. Ablations :
      `grid grid-flow-col auto-cols-fr gap-3` (la mutation du vérificateur), `flex gap-3`,
      `space-y-3 sm:grid sm:grid-cols-2`, `style={{ display: "flex" }}`, et un champ en
      `inline-block w-1/2` : 1 rouge chacune. Mesure de la première passe à 360 px en anglais : les deux
      déclencheurs à x = 32, w = 296, h = 40, chaque libellé sur une ligne de 20 px, sans défilement
      horizontal. Même constat à 390 px en wolof. La mise en page n'a pas changé depuis.
- [x] M15 : le lanceur porte un libellé visible dans les trois langues, sur mobile comme sur bureau.
      Le test refuse une classe qui cache le libellé, sur lui ou entre lui et le lanceur, ainsi
      qu'un lanceur qui rogne son contenu (`hidden` : 1 rouge ; `max-w-0 overflow-hidden` : 1 rouge ;
      `size-14 overflow-hidden` : 1 rouge). Réparation 2 : entre le libellé et le lanceur, seuls
      des jetons typographiques nommés sont admis (ni couleur, ni taille arbitraire, ni style en
      ligne), le libellé doit être `toBeVisible()`, et le lanceur porte la paire
      `bg-primary` / `text-primary-foreground`. Ablations : `style={{ display: "none" }}`,
      `text-[1px] text-primary`, `text-[1px]`, l'attribut `hidden`, et le lanceur mobile en
      `text-primary` sur `bg-primary` : 1 rouge chacune. Le nom accessible contient le libellé :
      c'est une garde de non-régression. Passe finale : le lanceur lui-même est contrôlé sur les
      familles que le libellé hérite (taille, couleur, graisse, interlignage, opacité, `scale`,
      propriété arbitraire, `hidden` hors `md:hidden`, style en ligne autre que `bottom`). Ablations :
      taille nulle sur le bouton mobile puis sur celui de bureau, `opacity-0`, `text-primary` en plus
      de `text-primary-foreground`, propriété arbitraire de taille nulle, `max-md:hidden`, interlignage
      nul, `text-transparent` : 1 rouge chacune, contre 0 avant. Mesures de la première passe : 136 × 48 px à 360 px (en), 149 × 56 px à
      1366 px (fr), 123 × 48 px à 390 px (wo).
- [x] Pint, ESLint, `tsc --noEmit`, `check-i18n`, `check-i18n-namespaces` et toutes les gardes
      `scripts/check-*.mjs` sont verts, ainsi que les classes de test touchées. La suite entière n'a
      **pas** été lancée par l'agent : c'est à la session de la lancer.
- [x] M12 (reprise du 2026-09-24, TCK-576) : **la frontière ne s'élargit pas.** Autour de
      l'acteur, on pose ce qui ne doit PAS le rejoindre : une conversation entre deux inconnus, le
      correspondant de son correspondant, un lien CRM entre deux autres comptes (dans ses trois sens),
      l'équipe et les propriétaires d'une autre agence, un autre propriétaire de sa propre agence,
      des comptes supprimés. La liste rend exactement ses contacts, `outOfReach()` les refuse tous,
      et la création rend 422 pour chacun, avec un témoin 201. Sept élargissements ont été rejoués :
      Y7 (règle 1 ouverte), Y5 (`withTrashed()`), CRM a, b et c élargis, équipe et administrateurs
      de toute agence, propriétaires de toute agence pour l'équipe (W3b). Chacun fait rougir 1 à 2
      tests, contre 0 avant pour Y7, Y5 et W3b.
- [x] M11 (reprise du 2026-09-24) : le bail choisi est envoyé, c'est bien celui qu'on a choisi, et
      la liste se restreint au bien choisi. X1, X2 et X8 font rougir 1 test chacun (0 avant). Les
      deux `Select` sont désormais les champs à recherche de TCK-576.
      ⚠ **Cochée à tort au premier jet, vraie depuis la réparation 1** : pendant le chargement des
      baux d'un bien, la liste montrait — cliquables — ceux des autres biens, et le serveur
      acceptait la paire (201). Tenue désormais côté écran (aucun bail d'un autre bien pendant le
      chargement, 1 rouge sans le correctif ; 0 option au navigateur à 2,5 s de latence) **et**
      côté serveur (bail et bien sans rapport → 422, groupe et directe). Détail dans TCK-576.
- [ ] Mesure sur `preview.takussan.com` après déploiement (la modale exige une session, donc aucune
      mesure possible en lecture seule).

## Reprise du 2026-09-24 (TCK-576) : défauts ouverts et risques résiduels

Chaque point a été reproduit, ou démontré faux, par une mesure. Le détail des correctifs est dans
TCK-576.

**Défauts ouverts de la vérification**

- **Frontière d'isolation (Y7), comptes supprimés (Y5) : corrigés par des tests.** Reproduits, puis
  rejoués sur `MessagingContactsTest`. Y7 (`->orWhereNotNull('cpa.user_id')`) et Y5
  (`withTrashed()`) laissaient 17/17 verts. Même chose pour W3b (`ownerProfiles` sans condition
  d'agence), trouvé en élargissant la recherche. Trois tests les ferment :
  `test_la_frontiere_ne_s_elargit_pas_aux_relations_des_autres`,
  `test_l_equipe_ne_joint_pas_les_proprietaires_d_une_autre_agence` et
  `test_un_compte_supprime_n_est_ni_liste_ni_accepte`. Sous les sept mutations, 1 à 2 rouges chacune.
  Le code produit était juste.
- **Le `Select` du bail sans test de comportement (X1, X2, X8) : corrigé.** Il est remplacé par le
  champ à recherche de TCK-576. Trois tests `NewGroupDialog` tiennent l'envoi, le choix et la
  restriction au bien, et chacune des trois mutations fait rougir 1 test.
- **Plafond de 100 sans recherche : corrigé par TCK-576.** Deux routes de recherche SQL sur le
  périmètre de la policy `view`. Mesuré : le bien 145, hors des 100 premiers et hors index
  Meilisearch, se trouve et se rattache.
- **Critère « chaque branche… qui rougit quand on la retire » mal formulé : réécrit.** Il dit
  désormais qu'il ne mesure que les retraits, et un critère d'élargissement le complète.
- **Docblock périmé de `MessagingContactResource` : déjà corrigé par la session**, qui l'a aussi
  inscrite dans `tests/Support/ResourceInventory.php`.
- **Observation d'environnement : la recherche par nom ne se mesure pas en local. Confirmé, et la
  cause est plus précise.** Le `.env` local vise le Meilisearch **natif** du port canonique 7700
  (v1.36.0), pas le conteneur du dépôt (7701, v1.16.0). C'est la dette D-48. L'index
  `takussan_localusers` y porte **14 documents pour 302 comptes**. Ce n'est pas un défaut de code.
  `php artisan scout:import "App\Models\User"` le reconstruirait ; ce n'est pas fait ici, parce que
  c'est la pile de développement partagée.

**Risques résiduels**

- **`ConversationResource` ne renvoyait pas `participants` : corrigé.** Mesuré sur le groupe 241 :
  aucune clé `participants`, alors que le front envoie `include=participants`. `show()` charge
  désormais les membres actuels, et la ressource les rend sans coordonnées. Au navigateur, la
  feuille affiche « Participants (3) », l'invitation et le renommage.
- **`useCreateConversation` mort et mal typé : retiré** (aucun appelant, `tsc` vert).
- **Version de Meilisearch en production pour `attributesToSearchOn` (≥ 1.3) : établie par la
  configuration, pas par une mesure.** `deploy/server/compose.data.yml` épingle
  `getmeili/meilisearch:v1.16`, comme `docker-compose.yml`. Aucune instance déployée n'a été
  interrogée : pas d'accès depuis cet agent.
- **« Un locataire sans relation n'a personne à inviter, et l'écran ne le lui dit pas » : démontré
  faux.** À l'ouverture, la liste affiche « Vous n'avez encore personne à inviter. », distinct du
  « Personne ne correspond à cette recherche. » d'une recherche vide. Aucun test ne le tenait ; un
  test `NewGroupDialog` le tient désormais (message unique : 1 rouge).
- **Les tests de disposition restent des contrôles de classes en jsdom.** Le risque demeure par
  nature. Mesure au navigateur de cette reprise, étape 2 : 320 (fr), 360 (en), 390 (wo) et
  1366 px (fr), sans défilement horizontal (chiffres dans TCK-576).
- **Défaut trouvé en reprenant : la garde de contexte laissait passer un contexte SUPPRIMÉ.**
  `exists:properties,id` accepte la ligne, `find()` la masque, et `null` passait son tour. Mesuré :
  201 pour un groupe rattaché au bien supprimé d'une autre agence. Corrigé dans
  `GuardsConversationScope`, pour le groupe comme pour la directe
  (`GroupConversationCreationTest::test_un_contexte_supprime_ne_peut_pas_etre_rattache`, rouge
  sans le correctif).
- **Réparation 1 (vérificateur du 2026-09-24) — la restriction X8 ne tenait pas pendant un
  chargement : corrigé.** Reproduit au navigateur par le vérificateur puis par un test rouge : le
  sélecteur de bail gardait la liste précédente (tous les biens, ou un autre) le temps de la
  requête du bien choisi, et le serveur, qui jugeait chaque contexte seul, acceptait la paire
  (`property_id=1` + `lease_id=363` → 201). Deux correctifs, chacun rouge sans lui : la liste
  précédente ne se garde que pour le même bien (`useGroupLeaseOptions`), et
  `GuardsConversationScope::guardLeaseMatchesProperty()` refuse un bail qui ne concerne pas le bien
  envoyé (422, groupe et directe). Même passe : `is_muted` des membres tenu par un test,
  `filter[property_id]` mal formé → 422 au lieu de 500, états vides propres aux sélecteurs, bail
  choisi avant son bien conservé, Sujet à 44 px comme les sélecteurs. Détail et mesures dans TCK-576.
- **Reprise des défauts mineurs (2026-09-24, TCK-576)** : « `is_muted` des membres tenu par un
  test » ci-dessus décrivait une **exposition** — le détail rendait la sourdine de chaque membre à
  tous. Elle est désormais privée (rendue au seul lecteur). `last_read_at` suit la même règle
  depuis la réparation 1 de cette reprise : rendu au seul lecteur, `null` pour les autres. Aucun
  consommateur ne lisait celui des autres (mesuré, front et API). La version précédente de cette
  ligne le gardait « pour les accusés de lecture de `docs/features.md` §1.7 », une fonction qui
  n'est pas construite. Même reprise : une demande d'intervention d'un autre bien
  que le contexte se refuse (422), l'ordre visibilité-puis-cohérence est tenu par un test, le
  passage d'un bien A à un bien B et « retirer le bien garde le bail » aussi. Détail dans TCK-576.
- Toujours ouverts : la mesure sur `preview.takussan.com` (session requise, Basic auth) et la suite
  entière, que lance la session.

## Hors périmètre

- `ConversationResource` ne renvoyait pas `participants`, si bien que la feuille d'infos du groupe
  listait zéro membre et cachait ses actions d'administration. Défaut préexistant, **soldé par
  TCK-576** (voir la reprise ci-dessus).
- `useCreateConversation` (`lib/queries/conversations.ts`) n'avait aucun appelant, et son type de
  corps (`recipient_id`) ne correspondait pas à ce que l'API valide. **Retiré par TCK-576.**
- Changement de comportement assumé : `POST /api/conversations` ne crée plus de conversation directe
  vers un inconnu ni vers plusieurs personnes. Aucun écran ne l'utilisait. Un client externe qui
  s'en servirait recevrait désormais une 422 avec une phrase.
- Les listes de bien et de bail étaient plafonnées à 100, sans recherche. **Remplacées par TCK-576**
  par deux champs à recherche serveur.
- La documentation des deux routes et de la règle de joignabilité dans `docs/features.md` §1.7 est
  laissée à `/sync-specs`.
