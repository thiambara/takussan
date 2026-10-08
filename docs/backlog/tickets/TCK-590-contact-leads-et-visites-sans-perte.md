---
id: TCK-590
title: "Contact, leads et visites : une demande déposée sur le site public arrive chez quelqu'un, qui peut la lire, la prendre en charge et répondre"
status: done
phase: P0
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#16-crm--relation-client
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#67-propertycontactlead-
    - docs/models-spec.md#17-propertyvisit-
    - docs/models-spec.md#7-customer
tags: [back, front, leads, visites, contact, crm, notifications, i18n, securite, attribution]
---

## Objectif utilisateur

- **Visiteur (avec ou sans compte)** : quand il demande une visite ou écrit à l'agent depuis une
  fiche, avec son seul numéro de téléphone, il sait que sa demande est partie, il reçoit la
  confirmation de la visite à l'heure de Dakar, et le bouton WhatsApp ouvre bien WhatsApp.
- **Client connecté** : il choisit un créneau réellement libre et peut le déplacer sans annuler.
- **Agent et admin d'agence** : chaque demande de contact ou de visite déposée sur un bien de
  l'agence est lisible en entier, attribuée ou attribuable, convertible en client, et l'agent peut
  planifier lui-même une visite pour un prospect qui a appelé.

## Contexte

Analyse par acteur du 2026-10-06, vague 73 : points V2, V3, V4, V5, V11, V20 (visiteur), A2, A3,
A4 (agent), C13 (client) et la partie « visites » de A8 (confirmation au visiteur sans compte).
V2/A3 et V3/A2 décrivent le même trou vu des deux côtés : ils sont fusionnés. Chaque constat a été
re-mesuré sur `e3ab4a4e` ; les écarts avec les rapports sont dans les notes de rédaction.

### 1. La demande de visite publique n'arrive chez personne (V2 + A3, A8 visites)

- `PublicPropertyController::visitRequest` (`takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:596-619`)
  fait un `PropertyVisit::create` direct : **ni `agent_id`, ni notification, ni quota**. Le chemin
  authentifié, lui, passe par `VisitSchedulingService::createOrFail` puis `notifyRequested`
  (`app/Http/Controllers/Api/PropertyVisitController.php:82-88`).
- ⚠ Ce n'est pas un cas d'anonyme : depuis l'interface, **seul un utilisateur connecté** atteint
  cette route (`takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx:157-175`
  n'offre que « Se connecter » au visiteur ; `src/app/actions/property.ts:60-75`). Le chemin
  réellement emprunté par tous les clients est donc celui qui ne prévient personne et ne compte
  pas le quota de 3 visites actives (`app/Services/Visit/VisitSchedulingService.php:130-183`).
  L'API accepte pourtant l'anonyme (`app/Http/Requests/Public/VisitRequestPublicPropertyRequest.php:23-33`).
- `$user->customer` (l.601) est un `hasOne` sans unicité (`app/Models/User.php:378-381`) : la
  visite est rattachée à une fiche client arbitraire, potentiellement d'une autre agence.
- `PropertyVisitController::index` (l.30-49) ne montre une visite qu'au visiteur, à l'agent
  assigné, au créateur du bien et au client lié. La policy `view` l'ouvre à l'agence
  (`app/Policies/PropertyVisitPolicy.php`), le calendrier aussi (`app/Http/Controllers/Api/CalendarController.php:55-67`,
  `:126-130`) : **une même visite a deux périmètres**, et le collègue qui gère le bien ne la voit
  pas dans la liste. Aucun geste « prendre en charge » (`takussan-web/src/components/visits/VisitDetail.tsx:90-101`).
- `notifyConfirmed` sort dès que `visitor` est nul (`PropertyVisitController.php:286-298`) : un
  visiteur sans compte n'est jamais prévenu. `cancel` (l.165-182) ne prévient personne. `update`
  (l.95-129) déplace l'heure sans prévenir le visiteur, et `UpdatePropertyVisitRequest.php:38`
  (`'scheduled_at' => ['sometimes', 'date']`, sans `after:now`) accepte une heure **passée**.
- `$isStaff` de `store` (`PropertyVisitController.php:67-69`) et `$isAgent` de `feedback`
  (l.231-234) lisent `$user->agency_id`, le pont qui rend l'agence du profil actif **quel qu'il
  soit** (`User.php:228-251`) : un **bailleur** de l'agence passe pour du personnel — il réserve
  une visite sur un bien non public d'un autre bailleur en gardant l'`agent_id` qu'il envoie
  (l.72-76 sautés), et dépose l'avis « agent » sur les visites des biens d'un autre bailleur.
  TCK-587 exempte ces deux sites de sa garde **au nom de 590** (`TCK-587`, § Coordination) : s'ils
  ne sont pas corrigés ici, ils ne le sont nulle part.

### 2. Les leads sont enregistrés et illisibles (V3 + A2)

- `PropertyContactLead::create` n'a que deux appelants, `PublicPropertyController.php:915` et
  `app/Http/Controllers/Public/PublicAgentController.php:341`. **Aucune route ne les relit** :
  `grep -rn "PropertyContactLead\|handled_at" app routes` ne rend que ces écritures. `handled_at`
  n'est jamais écrit.
- Le lead d'un bien ne porte pas `agency_id` (`PublicPropertyController.php:915-924`), celui
  d'un agent si (`PublicAgentController.php:341-351`).
- L'agent reçoit une notification au titre français figé `'Nouveau lead anonyme'`, dont le corps
  est `nom (e-mail) : ` + **80 caractères** du message, **sans le téléphone**
  (`PublicPropertyController.php:926-934`, `PublicAgentController.php:353-359`).
- Si le contact principal est nul, le lead est stocké et personne n'est prévenu (l.926). Ce n'est
  pas un cas d'école : `DELETE /api/auth/account` (`UserAdminController::deleteOwnAccount` →
  `anonymize`, l.130-155) supprime en douceur le compte sans dépublier ses biens ; `owner` devient
  `null` (`User` est `SoftDeletes`) et un bien sans collaborateur `agent` n'a plus personne.
- Le contact principal peut être **quelqu'un qui n'est plus là** : `PrimaryPropertyContact::agentPrincipal`
  (`app/Services/Property/PrimaryPropertyContact.php:77-83`) ne filtre que `user !== null`. Un
  agent **bloqué** (`UserAdminController.php:73`, statut seul, pas de suppression) ou **retiré de
  l'agence** (`AgentInvitationService::remove` l.163-185 supprime le profil, jamais la ligne de
  `property_collaborators`) reste destinataire : le lead (nom, téléphone, message), la
  notification, le fil authentifié (`PublicPropertyController.php:793`, `:833`) et le **numéro
  affiché aux visiteurs** (`contact()` l.966) partent chez une personne hors de l'agence.
- `crm.view_all` et `crm.assign` sont accordées à l'agent (`app/Services/Membership/SystemRoleCapabilities.php:82-83`)
  et ne sont lues nulle part.

### 3. Les boutons WhatsApp et Appeler (V4)

- `WhatsAppButton` est rendu sans condition (`.../components/PropertyAgentCard.tsx:130`) et fait
  `res.phone.replace(...)` alors que `PublicPropertyController::contact` peut rendre `phone: null`
  (l.966) ; l'erreur finit en `alert()` (`src/components/contact/WhatsAppButton.tsx:23-29`).
  `window.open` est appelé après un `await` (l.23-27), hors du geste : Safari iOS bloque la fenêtre.
  « Appeler » finit aussi en `alert()` (`PropertyAgentCard.tsx:50,53`).
- Le message prérempli est écrit par l'API, en français quelle que soit la langue, signé
  « Vu sur Takussan.sn » (`PublicPropertyController.php:959-963`) — contraire au principe n°5.
- La fiche ne dit pas si le contact a un numéro : `buildPrimaryContact` → `buildUserLite`
  (`app/Http/Resources/PropertyResource.php:304-325`). Aucun de ces contacts n'est compté.

### 4. Le formulaire sans compte exige l'e-mail (V5)

- `ContactLeadPublicRequest` exige `email` et laisse `phone` libre (`string max:32`)
  (`app/Http/Requests/Public/ContactLeadPublicRequest.php:28-31`) ; la colonne `email` est
  `NOT NULL` (`database/migrations/2026_05_05_000001_create_property_contact_leads_table.php`).
  La demande de visite anonyme exige e-mail **et** téléphone, ce dernier non validé
  (`VisitRequestPublicPropertyRequest.php:31-33`). `TelephoneJoignable` ne sert qu'aux comptes.
- `src/components/public/AnonymousLeadDialog.tsx` : e-mail obligatoire (l.91, l.162-169), aucune
  mention d'information sur les données, et rien n'est envoyé au visiteur après l'envoi.

### 5. L'agent ne peut pas planifier une visite pour un client — et deux gardes manquent (A4)

- `src/lib/queries/visits.ts:166-222` n'expose aucune création ; l'API pose toujours
  `'visitor_id' => $user->id` (`PropertyVisitController.php:82-86`) : l'agent devient le visiteur.
- **Sécurité** — `StorePropertyVisitRequest` accepte tout `customer_id` existant et `store` ne le
  retire pas à un non-personnel (seul `agent_id` est retiré, l.72-76) : un client rattache sa
  visite à la fiche client d'une **autre agence**, que `index` montre ensuite à l'utilisateur de
  cette fiche (l.40) et dont `PropertyVisitPolicy::view` (l.31) ouvre la lecture **et
  l'annulation** (`CancelPropertyVisitRequest.php:29` délègue à `view`). Le personnel, lui, peut
  passer la fiche client d'une autre agence. `UpdatePropertyVisitRequest.php:39` **et**
  `StorePropertyVisitRequest.php:35` acceptent `agent_id` = **n'importe quel utilisateur**
  (`exists:users,id`), y compris d'une autre agence — qui devient alors titulaire de `update`
  (`PropertyVisitPolicy.php:47`) : il confirme, termine, et lit le téléphone du visiteur.

### 6. Fuseau, créneaux et replanification (V11 + C13)

- `PropertyVisitDialog.tsx:140-143` : `setHours` puis `toISOString()` dans le fuseau du
  **navigateur**. Le serveur est en UTC (`config/app.php:70`) et Dakar est à UTC+0 sans heure
  d'été : un visiteur à Paris qui choisit « 10:00 » crée une visite à 9 h (hiver) ou 8 h (été)
  heure de Dakar. L'e-mail à l'agent affiche l'heure sans fuseau (`app/Notifications/VisitRequestedNotification.php`, `toMail`).
- La grille 9 h-19 h est inventée côté client (l.43-52) ; le chevauchement n'est contrôlé qu'à la
  confirmation, par bien (`VisitSchedulingService::assertNoOverlap`).
- Seul le gestionnaire peut replanifier (`VisitDetail.tsx:101`) : le client annule et redemande,
  et son quota peut le bloquer.

### 7. Partage (V20)

`src/lib/share.ts:5` construit `wa.me/?text=<titre> <url>` : ni prix, ni type, ni quartier, ni
source, texte non traduit ; l'URL est `window.location.href` (`PropertyDetailContent.tsx:115`),
qui repropage tels quels les paramètres reçus. Aucun paramètre de source n'existe dans le front
(`grep utm_` vide), aucune colonne de source en base. La canonique de la fiche ne dépend que du
chemin (`[slug]/page.tsx:94`) : des paramètres de source sont sans effet sur le référencement.
`src/components/share/ShareButton.tsx` (Web Share API) n'a aucun appelant.

## Contrat de données

**`property_contact_leads`** (spec `#67`, dont la dérive existante — `agency_id`, `property_id`
nullable — est relevée pour `/sync-specs`) : `name`, `email`, `message` deviennent nullables ;
ajout de `channel` (`form` | `whatsapp` | `call`, chaîne + contrôle applicatif, ADR-0007),
`source`, `medium` (chaînes ≤ 40), `locale` (≤ 5), `handled_by_id` (FK users), `customer_id`
(FK customers). Invariant applicatif : un lead `form` a un nom, un message, et un téléphone **ou**
un e-mail ; un lead `whatsapp`/`call` n'a aucune identité.

**`property_visits`** (spec `#17`) : ajout de `source`, `medium`, `locale`. Aucun nouveau statut :
`scheduled` **est** « demandée, à confirmer » (décision déjà prise, cf. TCK-075).

**Endpoints**

| Verbe | Route | Qui |
|---|---|---|
| GET | `/api/contact-leads` (`filter[handled]`, `filter[property_id]`, `filter[channel]` défaut `form`, `filter[mine]`, `sort`, `fields[property_contact_leads]`, `include=property,recipient`) | personnel de l'agence |
| GET | `/api/contact-leads/{lead}` | idem |
| POST | `/api/contact-leads/{lead}/handle` · `/assign` · `/convert` | idem ; `assign` exige `crm.assign` |
| POST | `/api/property-visits/{visit}/claim` | personnel de l'agence du bien |
| POST | `/api/property-visits/{visit}/reschedule` | le visiteur (compte ou client lié) |
| GET | `/api/public/properties/{slug}/visit-slots?date=AAAA-MM-JJ` | public, `throttle:public-read` |
| POST | `/api/public/properties/{slug}/contact-click` (`channel`, `source`, `medium`) | public, limiteur dédié |

`visit-slots` rend `{date, timezone: "Africa/Dakar", slots: [{start: ISO-8601 UTC, label: "HH:MM", available: bool}]}`
— jamais rien sur les visites qui occupent un créneau. `GET …/contact` ne rend plus que `phone` ;
la fiche expose `primary_contact.has_phone` (booléen). Les deux POST publics existants et la
demande de visite acceptent `source` et `medium`.

## Direction UX / Artistique

Charte « Ancrage Local Contemporain » (`docs/design-guidelines.md`). Ton : un guichet qui répond,
pas un formulaire administratif.

- **Visiteur** : demander une visite ne demande pas de compte — nom et téléphone suffisent, avec la
  même saisie de numéro que le profil (+221 par défaut). Les créneaux pris sont visibles et non
  choisissables ; l'heure est toujours suivie de « heure de Dakar ». Après l'envoi, un écran dit
  ce qui va se passer (« l'agent confirme, vous recevez un SMS / un e-mail »). Une ligne discrète
  renvoie à la politique de confidentialité, sans case à cocher. Nom et téléphone sont retenus
  pour le contact suivant, sur cet appareil.
- **Fiche** : pas de bouton qui mène à une erreur — sans numéro, ni WhatsApp ni Appeler. Aucune
  boîte d'alerte native. WhatsApp s'ouvre dans le geste, y compris sur iPhone. Le message
  prérempli et le texte de partage sont dans la langue du visiteur, prix en F CFA.
- **Agent** : une boîte « Demandes » dans la console, avec le nombre de non traitées dans la
  navigation ; chaque demande se lit en entier et se traite en un geste (WhatsApp, appeler,
  convertir en client, marquer traitée, attribuer). Dans les visites, un filtre « Non attribuées »
  et « Prendre en charge ». « Planifier une visite » depuis la fiche bien, la fiche client et le
  calendrier, avec un repli nom + téléphone quand le prospect n'est pas encore client.
- **Client** : « Proposer un autre créneau » sur sa visite, qui repasse en attente de confirmation.

## Contraintes strictes (métier)

1. **Un seul destinataire** : `App\Services\Property\PrimaryPropertyContact::for()` reste la seule
   règle, pour le lead, la visite, `has_phone`, le numéro composé et le fil authentifié. Ce ticket
   n'y change **que l'éligibilité** : un collaborateur `agent` n'est retenu que s'il est joignable
   (statut ni `blocked` ni `deleted`) et, pour un bien d'agence, personnel de l'agence du bien ; le
   propriétaire n'est retenu que s'il est joignable. L'ordre (TCK-502) ne change pas. À défaut de
   tout destinataire, ce sont les admins de l'agence du bien ; à défaut d'agence, la demande est
   refusée (409, code `contact_unavailable`), rien n'est stocké.
2. **`agent_id` n'est posé que sur le personnel de l'agence du bien** (agent ou admin d'agence,
   jamais bailleur ni client) — à la création publique, en planification console, en prise en
   charge et en `PATCH`. Sinon la visite est « non attribuée ».
3. **`customer_id` appartient toujours à l'agence du bien.** Un non-personnel ne choisit ni
   `customer_id`, ni `agent_id`, ni `visitor_*` d'un autre : ils sont dérivés de lui.
4. **Anti-abus des envois au visiteur sans compte** : aucun SMS n'est envoyé au dépôt d'une demande
   (un numéro saisi par un tiers ferait de la plateforme un relais de SMS payants) ; l'accusé de
   réception immédiat part **par e-mail seulement**, et seulement si un e-mail est donné. Le SMS
   ne part qu'après un geste humain de l'agence (confirmation, replanification, annulation). Aucun
   envoi ne recopie un texte libre du visiteur (ni message, ni nom). Un seul envoi par visite et
   par événement.
5. **Aucune prose dans l'API** (règle 1 de la vague) : titres, corps, SMS et e-mails passent par
   `__('…', $params, $locale)` ; la locale est celle du destinataire (`preferredLocale()`) ou celle
   enregistrée sur la visite / le lead pour un anonyme. Le message prérempli WhatsApp et le texte
   de partage sont construits par le front (next-intl).
6. **L'heure se construit en `Africa/Dakar`**, côté front comme côté serveur ; le serveur refuse un
   `scheduled_at` qui ne tombe pas sur un créneau de la grille.
7. **Le numéro du contact n'est révélé qu'au geste** (`GET …/contact`, `throttle:20,10`, anti-
   moisson) ; `has_phone` est un booléen, jamais le numéro.
8. `ip` et `user_agent` d'un lead ne sortent jamais par l'API.
9. **Pas de prix en devise étrangère** (décision du porteur, 2026-10-06).
10. Migrations : index et FK nommés explicitement (< 63 caractères), `down()` réversible (les lignes
    sans e-mail ou de canal `whatsapp`/`call` sont supprimées avant de rétablir `NOT NULL`).
11. **Une heure de visite est toujours future**, à la création comme au `PATCH`, et tout
    déplacement d'heure par l'agence prévient le visiteur (contrainte 4 pour l'anonyme).

**Options retenues par défaut** (questions non tranchées par le porteur le 2026-10-06) :
- la demande de visite **sans compte** est ouverte dans l'interface (nom + téléphone, e-mail
  facultatif) — position produit du 2026-08-27 : la barrière est le limiteur, pas le compte ;
- un clic WhatsApp / Appeler est enregistré (canal + source, sans identité) et compté par bien,
  **hors** de la file « à traiter » ;
- un seul ticket, livrable en deux temps sur la même branche : (a) leads, contact de la fiche,
  partage ; (b) visites.

**Coordination avec la vague 73**

- **TCK-504** (ouvert) changera *qui* est le contact principal et touche aussi
  `PrimaryPropertyContact` : **seul le filtre d'éligibilité** (`agentPrincipal` et le repli
  propriétaire) est à 590 ; le choix explicite de 504 passe par le même filtre (un principal
  désigné puis bloqué ou retiré n'est plus retenu). Ordre de fusion indifférent. Si 590 fusionne
  d'abord, 504 ajoute « la demande de visite » aux surfaces de son AC1.
- **TCK-587** possède `PropertyVisitPolicy`. 590 aligne la clause d'`index` sur `view` et n'ajoute
  dans ce fichier qu'**une méthode nouvelle**, `reschedule`. Le prédicat « personnel » s'écrit
  `isAgentAt || isAgencyAdminAt` avec un commentaire `TCK-587` tant que 587 n'est pas fusionné.
  590 donne un lecteur à `crm.view_all` et `crm.assign` : la garde « capacité sans lecteur » de 587
  doit les compter comme lues. 587 exempte de sa garde `PropertyVisitController` l.69 et l.234 au
  nom de 590 : 590 y pose le prédicat et **retire ces deux exemptions** (si 587 a fusionné ; sinon
  587 ne les crée pas).
- **TCK-591** possède la passation (`AgentHandoverService`) : elle déplace les collaborations du
  partant ; le filtre d'éligibilité de 590 couvre le retrait avec `leave_unassigned` et les
  retraits déjà faits. Ordre indifférent.
- **TCK-588** possède les canaux et `Concerns/*`, et les rappels planifiés. 590 *implémente*
  `SupportsSms` sur ses notifications sans modifier l'interface, et n'ajoute pas WhatsApp.
- **TCK-591** possède aussi `Customer` : la conversion d'un lead emprunte `CustomerService::create`,
  et le dédoublonnage de 591 s'il est fusionné.
- **TCK-598** possède `PropertyResource` (hors `buildPrimaryContact`, seul bloc touché ici) et le
  cache de la fiche ; `has_phone` ne dépend pas de l'appelant.
- **TCK-537** possède les purges (leads : 3 ans) ; les nouvelles colonnes suivent la ligne.
  **TCK-347** possède la locale des formats : 590 n'introduit aucun format figé.
- `routes/api/public.php` et `lang/{fr,en,wo}/notifications.php` : ajouts seulement, dans un bloc
  `TCK-590`.

## Delta à produire

**Données**
- [x] Migration `alter_property_contact_leads_for_inbox` : nullables, colonnes du contrat, FK
      `pcl_handled_by_fk` / `pcl_customer_fk`, index `pcl_agency_handled_idx (agency_id, handled_at)`,
      et rattrapage de `agency_id` depuis `properties.agency_id` pour les leads de bien.
- [x] Migration `add_attribution_to_property_visits` (`source`, `medium`, `locale`).
- [x] `PropertyContactLeadFactory` (il n'en existe aucune).

**1. Visites publiques**
- [x] `visitRequest` passe par `VisitSchedulingService::createOrFail` ; `agent_id` selon la
      contrainte 2 ; `customer_id` = la fiche `(user_id, agency_id du bien)` ou `null` ;
      `source`/`medium`/`locale` enregistrés.
- [x] Extraire `notifyRequested`/`notifyConfirmed`/`managingUsers` dans `App\Services\Visit\VisitNotifier`,
      partagé par les deux contrôleurs. Destinataires d'une demande : agent assigné, contact
      principal, propriétaire ; si la visite est non attribuée, les admins de l'agence.
- [x] Visiteur sans compte prévenu à la confirmation, à la replanification et à l'annulation par
      l'agence (`Notification::route('mail'|'sms', …)`), `VisitConfirmedNotification` étendue,
      `VisitRescheduledNotification` et `VisitCancelledNotification` neuves ; le visiteur annulant,
      l'agence est prévenue.
- [x] `index` : clause = visiteur | agent assigné | client lié | créateur du bien | personnel de
      l'agence du bien ; `filter[unassigned]` et `filter[mine]` déclarés sur `PropertyVisit`.
- [x] `POST property-visits/{visit}/claim` + `ClaimPropertyVisitRequest` (409 si déjà attribuée à
      un autre, sauf `crm.assign`).
- [x] `UpdatePropertyVisitRequest` **et** `StorePropertyVisitRequest` : `agent_id` validé par une
      règle `App\Rules\PersonnelDeLAgence` (agence du bien) ; changer l'agent d'une visite déjà
      attribuée exige `crm.assign`. `UpdatePropertyVisitRequest` : `scheduled_at` `after:now`.
- [x] `StorePropertyVisitRequest` : `customer_id` validé par une règle `App\Rules\ClientDeLAgence`
      (la fiche appartient à l'agence du bien) ; `store` retire `customer_id` et `visitor_*` à un
      non-personnel (ils sont dérivés de lui, contrainte 3).
- [x] `store` (l.67-69) et `feedback` (l.231-234) : `$user->agency_id` remplacé par le prédicat
      « personnel de l'agence du bien » (contrainte 2) ; retrait des deux exemptions de la garde de
      587 qui les nomment.
      *Prédicat remplacé (`PersonnelDeLAgence::estPersonnel`, branché sur `isStaffAt` de 587 ; ablation A8 rouge). Les deux exemptions sont retirées de `check-agency-scope-clause.mjs` après la fusion de 587, CLIQUET 10 → 8 ; réintroduire `$user->agency_id` dans `feedback` (ablation Q05) rend la garde rouge.*
- [x] `update` : un changement de `scheduled_at` envoie `VisitRescheduledNotification` au visiteur
      (compte, ou route anonyme selon la contrainte 4).

**2. Leads**
- [x] `PrimaryPropertyContact` : filtre d'éligibilité (contrainte 1) dans `agentPrincipal` et sur
      le repli propriétaire ; `eagerLoads()` charge ce qu'il faut pour ne pas ajouter de requête par
      collaborateur. Effet attendu sans autre changement : carte, `has_phone`, `contact()`, fil
      authentifié, lead et visite suivent.
- [x] `App\Services\Lead\ContactLeadService` : création (les deux POST publics y délèguent),
      destinataire, repli vers les admins d'agence, 409 `contact_unavailable` sans destinataire ni
      agence (avant tout `create`), accusé de réception (contrainte 4). Le même repli sert
      `visitRequest` (via `VisitNotifier`).
- [x] `App\Http\Controllers\Api\ContactLeadController` (`index`, `show`, `handle`, `assign`,
      `convert`), `routes/api/contact-leads.php`, `App\Policies\PropertyContactLeadPolicy`
      (destinataire, ou personnel de l'agence titulaire de `crm.view_all`), `AssignContactLeadRequest`,
      `ConvertContactLeadRequest`, `PropertyContactLeadResource`.
- [x] `NewContactLeadNotification` (message complet, téléphone, e-mail, lien vers la demande) et
      `ContactLeadReceivedNotification` (accusé) ; plus aucun `'Nouveau lead anonyme'`.
- [x] Console : boîte « Demandes », compteur de non traitées dans la navigation.

**3. WhatsApp et Appeler**
- [x] `contact()` ne rend plus que `phone` ; `has_phone` dans `PropertyResource::buildPrimaryContact()`.
- [x] `POST public/properties/{slug}/contact-click` + `ContactClickPublicRequest` + limiteur
      `public-contact-click` : un lead `channel=whatsapp|call` sans identité.
- [x] Fiche : boutons absents sans numéro, ouverture dans le geste, message traduit côté front,
      erreurs en toast.

**4. Formulaires sans compte**
- [x] `ContactLeadPublicRequest` : `email` `required_without:phone`, `phone` `required_without:email`
      + forme E.164 + `TelephoneJoignable`, `source`/`medium` (`max:40`, `[a-z0-9_.-]`).
- [x] `App\Support\TelephoneSaisi` : la saisie est ramenée à E.164 avant `TelephoneJoignable` —
      séparateurs, `00`, indicatif sans `+`, format national sénégalais (70, 75-78, 33) — sur la
      piste (bien et agent), la demande de visite publique et la planification par le personnel ;
      migration `normaliser_les_telephones_saisis` qui rattrape `property_visits.visitor_phone` et
      `property_contact_leads.phone`. `customers.phone` hors périmètre (TCK-591).
- [x] `VisitRequestPublicPropertyRequest` : anonyme = nom + téléphone obligatoires, e-mail
      facultatif ; `scheduled_at` sur un créneau de la grille.
- [x] Front : boîte de visite ouverte au visiteur sans compte ; formulaire « téléphone ou e-mail »,
      mention d'information, écran de suite, mémorisation locale.

**5. Planification console**
- [x] `store` personnel : `visitor_id` = utilisateur du client s'il en a un, sinon `null` +
      `customer_id`/`visitor_*` ; `agent_id` = l'appelant par défaut ; créée confirmée après
      `assertNoOverlap`, visiteur prévenu. Non-personnel : contrainte 3.
- [x] Front : « Planifier une visite » (fiche bien, fiche client, calendrier).

**6. Créneaux et fuseau**
- [x] `VisitSchedulingService::availableSlots(Property, CarbonImmutable)` : grille 09:00-19:00 par
      30 min en `Africa/Dakar`, hors délai de 30 min, hors visites confirmées du bien et de l'agent
      pressenti ; `GET …/visit-slots` + `VisitSlotsPublicPropertyRequest`.
- [x] `POST property-visits/{visit}/reschedule` + `ReschedulePropertyVisitRequest` + méthode
      `PropertyVisitPolicy::reschedule` (coordination 587) : retour en `scheduled`, agence prévenue.
- [x] Notifications : heure formatée en `Africa/Dakar` et suivie du fuseau.
- [x] Front : créneaux tirés de l'API, heure construite en `Africa/Dakar`, « Proposer un autre
      créneau » pour le client.

**7. Partage et attribution**
- [x] Front : texte de partage traduit (type · prix F CFA · quartier — URL canonique +
      `utm_source=<canal>&utm_medium=share`) ; la source d'arrivée est retenue pour la session et
      envoyée avec le lead, le clic de contact et la demande de visite.

**8. Ajoutés après vérification adverse (VERIF-590, 2026-10-07)**
- [x] `StorePropertyVisitRequest::managesProperty()` = super-admin ou personnel actif de l'agence du
      bien — le créateur du bien n'y est plus (B1, B2). *Preuve : `PropertyVisitVerificationAdverseTest`
      b1 ×2, b2 ; ablation X01 (créateur réintroduit) → 3 rouges.*
- [x] Limiteur `visit-planning` sur `POST /property-visits` : 30/h par émetteur, 5/h par destinataire
      (numéro en E.164, ou fiche). *Preuve : b2 limiteur ×2 ; ablation X02 (middleware retiré) → rouge.*
- [x] `PersonnelDeLAgence::estPersonnel` : profil `active` et compte joignable — la seule définition,
      relue par `PrimaryPropertyContact` (M4, m1). *Preuve : m4 visites et demandes, agent suspendu
      non contact principal ; ablation X07 (statut retiré) → 3 rouges.*
- [x] Destinataire d'une demande : lecture, traitement, conversion et liste seulement s'il est encore
      personnel de l'agence de la demande, ou propriétaire du bien (M1). *Preuve : m1 ; ablations
      X03 (policy), X04 (clause d'`index`) → rouges.*
- [x] Repli des notifications quand l'agent assigné est injoignable ou retiré (M2). *Preuve : m2 ;
      ablations X05, X05b → rouges.*
- [x] Annulation et déplacement : seuls super-admin, agent de la visite, personnel actif ou
      propriétaire du bien préviennent le visiteur (M3). *Preuve : m3 ; ablations X06, X06b → rouges.*
      Le refus du geste (403) est désormais posé par le contrôleur, sans attendre TCK-587 (passe 2,
      écart b, section 9).
- [x] Conversion d'une demande sans agence : 422 `lead_without_agency` (m2). *Preuve : m2 ; X09.*
- [x] Sans destinataire (agence sans admin actif ni contact joignable) : 409 `contact_unavailable` sur
      la demande ET la visite publiques, message front `publicLeadErrors.contactUnavailable` fr/en/wo
      (m3, décision de la session). *Preuve : `test_une_agence_sans_personne_pour_lire_refuse_la_demande`,
      `property.contact-indisponible.test.ts` ; X10, X10b, FX1 → rouges.*
- [x] Drapeau SMS du dépôt figé (m4, X11), durée plafonnée à 240 (m5, X12), `bienDe()` à
      `contract_type` fixe.
- [x] Téléphone : fiche normalisée à la planification (M6, X13), `+77 …`/`00 77 …` refusés (m6, X14),
      fixe 33 accepté sans SMS (m7, X15).
- [x] Front : « Planifier une visite » montré au seul personnel. *Preuve : FX2.*

### 9. Ajoutés après la seconde passe de vérification (VERIF-590 passe 2)

- [x] **B2′** — Borne par numéro AU POINT D'ENVOI (`VisitNotifier::toVisitor`) : au plus 5 SMS de
      visite par heure et 10 par jour vers un même numéro E.164, toutes causes confondues
      (confirmation, déplacement, annulation, planification). Au-delà, le SMS est retenu
      (`VisitNotification::retenirLeSms()` ; depuis la fusion de TCK-588, `mobileBorne: false`),
      l'e-mail et le fil partent, et `visit.sms_retenu` est
      journalisé sous une empreinte HMAC — le numéro n'est ni dans le journal ni dans la clé du
      cache. *Preuve : `test_b2prime_*` ; ablations P01 (borne court-circuitée), P02 (drapeau
      ignoré), P03 (borne du jour retirée) → rouges.*
- [x] **M7** — `PrimaryPropertyContact::estProprietaire()` : `property.user_id` ne vaut propriétaire
      que joignable, et bien sans agence ou profil propriétaire ACTIF dans l'agence du bien. Branché
      sur le repli du contact principal, la boîte des demandes (`view`, clause d'`index`), la liste
      des visites, l'avis « agent », les destinataires d'une demande de visite. *Preuve :
      `ProprietaireDuBienTest` (N3, N4, S3-créateur, bailleur actif / inactif, particulier) ;
      ablations P04 à P08 et P10 → rouges.*
- [x] **Écart (b)** — Sur un bien d'agence, seul le personnel actif (et le super-admin) annule ou
      déplace une visite : 403 `visits.staff_only` (fr/en/wo) pour le bailleur propriétaire, le
      bailleur tiers et l'agent parti. Sur un bien sans agence, le propriétaire et l'agent joignable
      de la visite gardent le geste ; le visiteur garde l'annulation de la sienne. *Preuve :
      `test_b_*`, `test_m3_le_bailleur_tiers_ne_peut_ni_annuler_ni_deplacer` ; P11 à P13 → rouges.*
- [x] **n1** — La borne par destinataire de `visit-planning` porte sur le numéro normalisé, saisi ou
      lu sur la fiche. *Preuve : `test_n1_*` ; P14 → rouge.*
- [x] **n2** — Agent assigné injoignable : le repli suit la règle de la visite non attribuée (admins
      actifs, sinon contact principal), plus le contact principal d'abord. *Preuve : `test_n2_*` ;
      P15 → rouge.*
- [x] **n3** — `ContactLeadService::agencyReaders()` : admins actifs, à défaut personnel actif
      titulaire de `crm.view_all`. Le 409 ne vaut que si personne ne lirait. *Preuve :
      `test_sans_admin_le_personnel_qui_lit_toute_la_boite_recoit_la_demande`, et le 409 avec un
      agent sans `crm.view_all` ; P16 à P18 → rouges.*
- [x] **n4** — « Planifier une visite » jugé sur le profil ACTIF (agent ou admin, statut `active`,
      dans l'agence du bien), plus sur les rôles globaux. *Preuve : `PlanifierUneVisite.test.tsx` ;
      FX3, FX4 → rouges.*

### 10. Ajoutés après la troisième passe de vérification (VERIF-590 passe 3)

- [x] **B2″** — `confirm` et `complete` passent par `agitPourLeBien`, comme `update` et `cancel` :
      sur un bien d'agence, seul le personnel actif (`isStaffAt`) confirme ou clôt une visite. 403
      `visit.staff_only` et 0 SMS pour le bailleur actif, l'agent parti créateur du bien, l'agent
      suspendu encore assigné. *Preuve : `test_b2seconde_*` (×3) ; R01 (confirm), R02 (complete) →
      rouges.*
- [x] **M7′** — `PropertyVisitPolicy::view` lit `property.user_id` par la définition M7
      (`estProprietaire`) ; l'agent assigné ne lit que s'il est encore du personnel de l'agence du
      bien. Le propriétaire reconnu lit la visite d'un bien d'agence SANS la fiche client
      (`customer`, `customer_id` masqués par `PropertyVisitResource`), au détail comme à l'index.
      *Preuve : `test_m7prime_*` (×4) ; S01 à S05 → rouges.*
- [x] **R1** — Deux bornes au point d'envoi : par (numéro, émetteur) — l'agence du bien, ou le
      particulier d'un bien sans agence — 5 par heure et 10 par jour, et un filet de 20 par jour
      par numéro. L'action dont le SMS est retenu le dit : `sms_sent: false`, `sms_code:
      visit_sms_capped`, `sms_message` (fr/en/wo) ; l'interface du personnel l'affiche (toast).
      *Preuve : `test_r1_*` (×2), tests front de `VisitDetail` et `PlanifierUneVisite` ; T01 à T04,
      U01 à U03 → rouges.*
- [x] **R2** — Le front lit l'agence du bien par le bloc `agency` que l'API rend
      (`agenceDuBien()`), et non `agency_id`, que `PropertyResource` n'émet pas. Test front sur la
      forme RÉELLE capturée de l'API, test de contrat côté API, mesure au navigateur. *Preuve :
      `PlanifierUneVisite.contrat.test.tsx`, `test_r2_la_fiche_bien_rend_l_agence_par_son_bloc_agency`
      ; V01 → rouge ; CDP : agent `true`, bailleur `false` ; témoin 37210bac : agent `false`.*
- [x] **n1′** — Une borne par UTILISATEUR qui agit : 20 SMS de visite par jour, tous numéros.
      *Preuve : `test_n1prime_l_emetteur_est_borne_a_vingt_sms_par_jour` ; W01, W02 → rouges.*
- [x] **n3′** — `agencyReaders()` compte les délégués ACTIFS (`RoleDelegation::active()`) : admin
      délégué parmi les admins, agent délégué dans le repli `crm.view_all`. *Preuve :
      `test_n3prime_*` (×2) ; Z01, Z02 → rouges.*
- [x] **t1** — Le test adapté de 587 prouve le blocage par la LECTURE : bailleur bloqué dans A →
      403 ; actif dans B → 200 sans la fiche client, index = la visite de B. *Preuve :
      `test_un_bailleur_bloque_ne_lit_plus_la_visite_de_son_bien` ; AA1 (blocage ignoré) → rouge.
      AA2 (branche `landlordWrites` de `update`) reste vert : branche morte pour une visite de bien
      d'agence, l'écriture étant fermée en amont par `agitPourLeBien`.*
- [x] **Fusion de TCK-588** — Refus par `abort_code` (codes `visit.*`, `lead.*` dans
      `lang/*/errors.php`) ; notifications par codes et `send()` (`visit.requested`,
      `visit.rescheduled_by_visitor`, `visit.cancelled_by_visitor`, `visit.confirmed`,
      `visit.rescheduled`, `visit.cancelled`, `lead.received`, `lead.acknowledged`) ; une seule
      source de vérité pour le plafond des SMS de visite (`VisitNotifier`, `mobileBorne` transmis
      aux canaux, qui ne recomptent pas). *Preuve : `PlafondSmsDeVisiteTest` (bout en bout, vrais
      canaux) ; C01 à C03 → rouges ; `ProseLitteraleInterditeTest`,
      `check-notification-codes.mjs` verts.*

**Tests** — `tests/Feature/Api/ContactLeadInboxTest`, `ContactLeadConvertTest`,
`PropertyVisitAssignmentTest`, `PropertyVisitStaffCreateTest`, `PropertyVisitRescheduleTest`,
`PropertyVisitIsolationTest` (customer_id, agent_id, bailleur de l'agence, avis « agent »),
`tests/Unit/Services/PrimaryPropertyContactEligibilityTest`,
`tests/Feature/Public/VisitSlotsTest`, `ContactClickTest`, `AnonymousVisitorNotificationTest` ;
`PropertyVisitRequestTest`, `PropertyContactLeadTest`, `AgentContactLeadTest` étendus (dont
`test_anonymous_missing_contact_returns_422`, à adapter). Tests front de la boîte de visite, de la
carte de contact et du partage.

## Critères d'acceptation

Chaque test marqué **(R)** rougit sur `e3ab4a4e` et redevient rouge quand on retire le correctif.

- [x] AC1 **(R)** — Un client connecté demande une visite par la route publique sur un bien dont le
      contact principal est l'agent A : `agent_id` = A, et `VisitRequestedNotification` est envoyée
      à A et au propriétaire (`Notification::fake`).
- [x] AC2 **(R)** — Sa 4ᵉ demande active sur le même bien par la route publique rend 422.
- [x] AC2b **(R)** — Un client connecté qui a une fiche client dans l'agence Y (créée avant) et une
      dans l'agence X du bien demande une visite par la route publique : `customer_id` = la fiche
      de X. S'il n'a qu'une fiche dans Y : `customer_id` nul.
- [x] AC3 — Anonyme : nom + `+221771234567` sans e-mail → 201 ; `77 123 45 67` → 201, enregistré
      `+221771234567` ; `77 123 45` → 422 ; sans téléphone → 422. Lead : téléphone seul → 201 (le
      format national est enregistré en E.164), ni téléphone ni e-mail → 422.
      *Amendé le 2026-10-07 à la demande de la session, sur un relevé de TCK-588 : l'AC exigeait
      que `77 123 45 67` rende 422. Le visiteur sénégalais donne son numéro au format national ;
      le refuser lui renvoyait le défaut, l'enregistrer tel quel le privait de son rappel. Il est
      normalisé (`App\Support\TelephoneSaisi`) avant d'être jugé.*
- [x] AC4 **(R)** — L'agent B de l'agence X, ni assigné ni créateur, voit la visite d'un bien de X
      dans `GET /property-visits?filter[unassigned]=1` ; un agent de l'agence Y et un client de X ne
      la voient pas. Toute visite rendue par `index` passe `PropertyVisitPolicy::view`.
- [x] AC5 — B prend en charge : `agent_id` = B ; C (sans `crm.assign`) la reprend → 409 ; un agent
      de Y → 403.
- [x] AC6 **(R)** — `PATCH agent_id` vers un utilisateur d'une autre agence → 422 ; même chose pour
      `POST /property-visits` par un agent de X ; vers un **bailleur** de X → 422. Dans les deux cas
      l'utilisateur visé obtient 403 sur `POST …/confirm`.
      *Les trois 422 sont éprouvés (`PropertyVisitAssignmentTest`, ablation A5 rouge). Le 403 du bailleur visé sur `confirm` est vert depuis la fusion de 587
      (`test_le_bailleur_vise_ne_confirme_pas`, plus `incomplete`) ; ablation Q03 (clause
      `$user->agency_id` remise dans `PropertyVisitPolicy::update`) → rouge.*
- [x] AC6b **(R)** — `PATCH scheduled_at` à hier → 422. L'agence déplace une visite confirmée d'un
      visiteur avec compte : `VisitRescheduledNotification` lui est envoyée (une fois) ; d'un
      visiteur sans compte : à `visitor_email` / `visitor_phone`.
- [x] AC7 **(R)** — Un client qui envoie `customer_id` d'une fiche de l'agence Y — ou de la fiche
      d'un autre client de X — crée une visite sans ce `customer_id` ; l'utilisateur de cette fiche
      ne la voit pas dans `index`, et `GET /property-visits/{id}` et `POST …/cancel` lui rendent 403.
      Un agent de X qui envoie `customer_id` d'une fiche de Y → 422.
- [x] AC7b **(R)** — Un utilisateur dont le seul profil est bailleur dans l'agence X, non créateur
      du bien : `POST /property-visits` sur un bien **non public** d'un autre bailleur de X → 403 ;
      sur un bien public, l'`agent_id` envoyé est ignoré ; `POST …/feedback` `role=agent` sur une
      visite terminée d'un bien d'un autre bailleur → 403. `scripts/check-agency-scope-clause.mjs`
      (587) ne liste plus `PropertyVisitController` dans ses exemptions.
      *Les trois cas (403, `agent_id` ignoré, 403 sur l'avis) sont éprouvés
      (`PropertyVisitIsolationTest`, ablation A8 rouge). La garde `check-agency-scope-clause.mjs`
      (587) ne liste plus `PropertyVisitController` ; ablation Q05 → garde rouge.*
- [x] AC8 **(R)** — L'agent planifie pour un client sans compte : `visitor_id` nul, `customer_id` et
      `visitor_phone` du client, `agent_id` = l'agent, statut `confirmed`, un SMS à la demande
      part vers le téléphone du client.
- [x] AC9 **(R)** — Confirmer une visite anonyme envoie `VisitConfirmedNotification` à la demande,
      vers `visitor_email` et `visitor_phone`, dans la langue enregistrée, avec « 10:00 » suivi du
      fuseau de Dakar. Le dépôt de la demande n'envoie **aucun** SMS.
- [x] AC9b **(R)** — L'agence annule une visite anonyme : `VisitCancelledNotification` part vers
      `visitor_email` et `visitor_phone` ; le visiteur avec compte annule la sienne : l'agent assigné
      (ou, non attribuée, les admins de l'agence) reçoit `VisitCancelledNotification`. L'envoi au
      visiteur sans compte ne contient ni le nom saisi ni aucun texte libre.
- [x] AC10 — Navigateur réglé sur `Europe/Paris` (test front, fuseau forcé) : choisir 10:00 le
      2026-11-12 envoie `2026-11-12T10:00:00Z`, et 10:00 le 2026-06-15 envoie `2026-06-15T10:00:00Z`.
      Côté serveur, un `scheduled_at` à 07:30 heure de Dakar → 422.
- [x] AC11 — Avec une visite confirmée 10:00-10:30 sur le bien, `visit-slots` rend 10:00
      `available: false` et 10:30 `available: true` ; chaque créneau n'a que les clés
      `start`, `label`, `available`.
- [x] AC12 — Le client replanifie sa visite confirmée : statut `scheduled`, nouvelle heure, agence
      prévenue ; un autre utilisateur → 403.
- [x] AC13 **(R)** — `GET /contact-leads` : l'agent destinataire voit son lead ; un agent de X
      titulaire de `crm.view_all` voit tous ceux de X ; sans elle, les siens seulement ; un agent de
      Y, un bailleur et un client de X n'en voient aucun. Retirer le filtre d'agence rougit le test.
- [x] AC14 — Un message de 2 000 caractères est rendu entier avec le téléphone ; `ip` et
      `user_agent` n'apparaissent dans aucune réponse.
- [x] AC15 **(R)** — Un lead de bien porte `agency_id` = celui du bien ; la migration rattrape les
      leads existants.
- [x] AC16 — `convert` crée une fiche client dans l'agence du lead, étape `lead`, nom découpé,
      `customer_id` posé et lead traité ; un second `convert` → 409.
- [x] AC17 **(R)** — Un agent en anglais reçoit un titre anglais contenant le téléphone du
      visiteur ; `grep -rn "Nouveau lead anonyme" app/` est vide.
- [x] AC18 **(R)** — Propriétaire qui a supprimé son compte (`DELETE /api/auth/account`), bien
      d'agence sans collaborateur : les admins de l'agence sont notifiés du lead et de la demande de
      visite, le lead porte `agency_id`. Même bien **sans agence** : `contact-lead` → 409
      `contact_unavailable` et `property_contact_leads` reste vide.
- [x] AC18b **(R)** — Bien d'agence X dont le collaborateur `agent` le plus ancien est (a) bloqué,
      (b) retiré de X (profil supprimé, ligne de collaboration intacte) : le lead a pour
      `recipient_user_id` le collaborateur éligible suivant, sinon le propriétaire ; la notification
      part chez lui seul ; `GET …/contact` rend **son** numéro ; `primary_contact` de la fiche le
      désigne. Retirer le filtre d'éligibilité rougit les deux cas.
- [x] AC19 — `GET …/contact` n'a plus de clé `message` ; `has_phone` faux → ni WhatsApp ni Appeler
      sur la fiche (test front) ; aucun `alert(` dans les composants de contact de la fiche ; en
      anglais, le message prérempli de `wa.me` est en anglais (test front).
- [x] AC19b **(R)** — Test front : au clic WhatsApp, `window.open` est appelé **avant** que la
      requête `…/contact` ne se résolve (promesse laissée en attente), puis la fenêtre ouverte est
      dirigée vers `wa.me` — aucune fenêtre n'est ouverte après un `await`.
- [x] AC19c — Lead `form` déposé avec un e-mail : `ContactLeadReceivedNotification` part vers cet
      e-mail, une fois, sans recopier le message ; avec un téléphone seul : aucun envoi. Test front :
      les formulaires de contact et de visite sans compte portent un lien vers `/legal/privacy`.
- [x] AC20 — Un clic WhatsApp crée **un** lead `channel=whatsapp` avec sa source, absent du compte
      des non traités.
- [x] AC21 — Partage en anglais : le texte WhatsApp contient le type, le prix en F CFA, le quartier
      et une URL avec `utm_source=whatsapp&utm_medium=share` ; aucune devise étrangère ; la canonique
      de la fiche est inchangée. Arrivé par ce lien, un visiteur qui écrit crée un lead
      `source=whatsapp`, `medium=share`.
- [x] AC22 — Toutes les clés ajoutées existent en `fr`, `en` et `wo` (y compris les
      `notifications.visit_*` absentes aujourd'hui de `lang/wo`).

**Ajoutés après vérification adverse (VERIF-590)** — chacun vérifié par
`PropertyVisitVerificationAdverseTest` et les classes nommées, ablation rejouée.

- [x] AC23 **(R)** — Un bailleur propriétaire, ou un agent retiré créateur du bien, qui envoie le
      `customer_id` d'une fiche de l'agence : 403 sur un bien privé ; sur un bien public, visite
      pour lui-même, `customer_id` nul — aucune coordonnée de la fiche rendue, écrite ni prévenue.
- [x] AC24 **(R)** — Un bailleur ne crée aucune visite confirmée vers un numéro libre, et aucun SMS
      ne part ; la planification est bornée à 5/h par destinataire et 30/h par émetteur (429).
- [x] AC25 **(R)** — Un agent retiré de l'agence ne liste, ne lit, ne traite ni ne convertit plus la
      demande qui lui était adressée.
- [x] AC26 **(R)** — Agent assigné bloqué ou retiré : l'annulation et le nouveau créneau du visiteur
      partent vers le repli.
- [x] AC27 **(R)** — Agent suspendu : non attribuable (visite, demande), ne prend pas en charge, n'est
      pas contact principal. Un bailleur de X ne voit pas les visites non attribuées de X.
- [x] AC28 **(R)** — Un bailleur qui annule ou déplace la visite du bien d'un autre ne prévient pas le
      visiteur.
- [x] AC28b **(R)** — … et reçoit 403.
      *Posé par le contrôleur (passe 2, écart b) : `test_m3_le_bailleur_tiers_ne_peut_ni_annuler_ni_deplacer`
      n'est plus `incomplete`, vert ; ablations P12, P13 → rouges.*
- [x] AC29 — Sans destinataire possible : 409 `contact_unavailable` (demande et visite), rien
      d'écrit, message front honnête en fr/en/wo. Demande sans agence : conversion 422 codée.
- [x] AC30 — La demande de visite (`visit.requested`, code non mobile) ne prend jamais le canal SMS ; durée ≤ 240 ; téléphone
      d'une fiche normalisé à la planification ; `+77 …` refusé ; un fixe ne reçoit pas de SMS.

**Ajoutés après la seconde passe (VERIF-590 passe 2)** — vérifiés par
`PropertyVisitVerificationAdverseTest`, `ProprietaireDuBienTest`, `PropertyContactLeadTest` et
`PlanifierUneVisite.test.tsx`, ablation rejouée.

- [x] AC31 **(R)** — La séquence du vérificateur (demande anonyme au numéro d'un tiers,
      confirmation, 8 déplacements) fait partir 5 SMS, pas 9, et l'annulation qui suit aucun ; même
      chose sur un bien sans agence. 10 par jour au plus vers un même numéro ; un autre numéro n'est
      pas touché. Le journal ne porte pas le numéro.
- [x] AC32 **(R)** — L'agent parti qui a créé un bien d'agence n'en est plus le contact principal
      (ni numéro public, ni demande, ni demande de visite reçue), ne liste, ne lit ni ne convertit
      les demandes qui le visent, ne voit plus les visites du bien. Le bailleur ACTIF garde tout
      cela, le bailleur inactif le perd, le particulier d'un bien sans agence le garde.
- [x] AC33 **(R)** — Sur un bien d'agence, le bailleur propriétaire et l'agent parti reçoivent 403
      en annulant ou en déplaçant ; le personnel actif garde le geste. Sur un bien sans agence, le
      propriétaire le garde ; le visiteur annule toujours la sienne.
- [x] AC34 **(R)** — Alterner un numéro et des fiches portant ce numéro ne contourne plus la borne
      de 5 planifications par heure et par destinataire (429).
- [x] AC35 — Agent assigné bloqué : l'annulation et le créneau proposé par le visiteur vont aux
      admins actifs, pas au bailleur.
- [x] AC36 — Agence sans admin actif, avec un agent actif titulaire de `crm.view_all` : la demande et
      la demande de visite publiques rendent 201, l'agent est prévenu et lit la demande. Avec un
      agent sans `crm.view_all` : 409.
- [x] AC37 — Front : un agent suspendu, un profil actif d'une autre agence, ou un bien sans agence
      n'ont pas « Planifier une visite » ; l'admin actif de l'agence du bien l'a.

**Ajoutés après la troisième passe (VERIF-590 passe 3)** — vérifiés par
`PropertyVisitVerificationAdverseTest`, `ProprietaireDuBienTest`, `TeamMemberSuspensionTest`,
`PropertyContactLeadTest`, `PlafondSmsDeVisiteTest` et les tests front de la visite, ablation
rejouée.

- [x] AC38 **(R)** — Sur un bien d'agence, le bailleur actif, l'agent parti créateur et l'agent
      suspendu encore assigné reçoivent 403 sur `confirm` et sur `complete`, et aucun SMS ne part.
- [x] AC39 **(R)** — L'agent parti, créateur ou assigné, ne lit plus la visite d'un bien d'agence ;
      le bailleur actif la lit sans `customer` ni `customer_id`, au détail et à l'index ; le
      personnel lit la fiche client.
- [x] AC40 **(R)** — Un particulier qui épuise sa borne vers un numéro ne coupe pas l'agence
      légitime (SMS parti à +3 h et à +23 h) ; au-delà de 20 par jour, plus aucun émetteur. Un SMS
      retenu est dit à l'appelant (`sms_sent: false`, code, message fr/en/wo) et affiché.
- [x] AC41 — « Planifier une visite » apparaît pour le personnel de l'agence du bien et pas pour son
      bailleur, mesuré au navigateur sur la réponse réelle de l'API.
- [x] AC42 **(R)** — Un utilisateur ne fait pas partir plus de 20 SMS de visite par jour, quel que
      soit le nombre de numéros.
- [x] AC43 — Une agence dont le seul admin est délégué reçoit la demande publique (201) ; une
      délégation révoquée ou échue ne compte pas.
- [x] AC44 **(R)** — Un bailleur bloqué dans une agence ne lit plus la visite de son bien ; actif
      dans une autre, il lit la sienne sans la fiche client.
- [x] AC45 **(R)** — Un SMS de visite qui a passé la borne de `VisitNotifier` part même si la
      limite générique du canal pour ce numéro est épuisée ; un SMS retenu par la borne ne part par
      aucun canal. Les refus de 590 sont des codes (`abort_code`), ses notifications des codes
      rendus en fr/en/wo.

## Hors périmètre

- Rappels de visite planifiés et relances de loyer multicanal, canal WhatsApp : TCK-588.
- Choix explicite de l'agent principal : TCK-504.
- Périmètre de `PropertyVisitPolicy` (`view`/`update`) et prédicat « personnel » : TCK-587.
- Dédoublonnage et normalisation des fiches clients, ICS et calendrier : TCK-591.
- Purges et preuve de consentement : TCK-537. Formats selon la locale : TCK-347.
- Disponibilités déclarées par l'agent (agenda de travail), lien d'annulation signé pour le
  visiteur sans compte, prix indicatif en devise étrangère.

## Notes d'implémentation

**Étape 1 — API : boîte des demandes, éligibilité du contact principal, visites (2026-10-07).**

- Re-mesuré avant d'écrire : `PropertyContactLead::create` avait deux appelants et aucun lecteur ;
  `handled_at` jamais écrit ; `agentPrincipal` filtrait `user !== null` seul ; `/contact` rendait un
  `message` français figé ; `lang/wo/notifications.php` n'avait aucune clé `visit_*`.
- Prédicat « personnel » : `PersonnelDeLAgence::estPersonnel` = `isAgentAt || isAgencyAdminAt`
  (commentaire TCK-587), en attendant `isStaffAt`. Le personnel qui planifie n'est **pas** tenu à la
  grille 09:00–18:30 ; seules les routes du client (demande publique, `store` non gestionnaire,
  `reschedule`) le sont.
- Ablation AC13 (×2) : `agencyScopeFor` rendant l'agence du profil sans `crm.view_all` ni
  prédicat → `ContactLeadInboxTest` rouge ; clause d'`index` retirée → rouge ; restauré → vert.
- Ablation AC18b : `self::eligible(...)` remplacé par `$c->user !== null` → 3 tests rouges
  (bloqué, retiré, repli propriétaire) ; restauré → vert.

**Étape 2 — épreuves des visites et des pistes (2026-10-07).** Six classes neuves
(`VisitRequestRoutingTest`, `VisitSlotsTest`, `PropertyVisitAssignmentTest`,
`PropertyVisitIsolationTest`, `PropertyVisitNotificationTest`, `PropertyVisitRescheduleTest`) plus
`ContactLeadInboxTest`, `ContactLeadConvertTest`, `PropertyContactClickTest`. Chaque correctif a été
retiré, un à la fois, par un script qui restaure le fichier et vérifie la restauration ; **15 sur 15
rougissent** : notification de la demande publique (AC1, AC18), quota (AC2), fiche de l'agence du
bien (AC2b), clause d'agence d'`index` (AC4), `PersonnelDeLAgence` (AC6), prévenir au déplacement
(AC6b), `customer_id` dérivé (AC7), prédicat sur l'agence du bien (AC7b), `visitor_id` du client
planifié (AC8), envoi à la demande au visiteur sans compte (AC9, AC9b), annulation par le visiteur
(AC9b), `agency_id` du lead (AC15) et son rattrapage, repli sur les admins (AC18), téléphone dans le
titre (AC17).
- AC6 « le bailleur visé obtient 403 sur `confirm` » dépend de `PropertyVisitPolicy::update`, qui
  lit encore `$user->agency_id` — périmètre de TCK-587. Le test est écrit et s'active seul quand
  `MembershipCapabilityResolver::isStaffAt` existe (`markTestIncomplete` d'ici là).

**Étape 3 — front public : contact, WhatsApp, partage, visite sans compte (2026-10-07).**
- WhatsApp ouvre une fenêtre vide DANS le geste puis la dirige vers `wa.me` ; ablation (ouverture
  déplacée après l'`await`) → AC19b rouge. `has_phone` faux → ni Appeler ni WhatsApp ; ablation
  (`hasPhone = true`) → rouge. Les deux `alert()` de `PropertyAgentCard` sont des toasts.
- Heure à Dakar : `lib/visites/heure-de-dakar.ts`, éprouvé navigateur forcé à `Europe/Paris`
  (`process.env.TZ`, précondition vérifiée) ; ablation (`setHours` + `toISOString`, l'ancien
  calcul) → AC10 rouge. Les créneaux viennent de `visit-slots` ; un créneau pris est grisé.
- Partage : type · prix F CFA · quartier, lien signé par canal ; ablation (`urlDePartage` rend
  l'URL nue) → AC21 rouge. Source d'arrivée retenue en `sessionStorage` par le layout public.
- Garde de contraste : une dette d'ardoise devenue sans objet retirée (le lien « Se connecter » de
  la boîte de visite n'existe plus), cliquet des encres inverses 248 → 256, cause écrite.

**Étape 4 — console : boîte « Demandes de contact », visites non attribuées, planification
(2026-10-07).**
- `/app/leads` (agent, admin, bailleur) : message entier, téléphone, e-mail, destinataire, source ;
  répondre (WhatsApp pré-rempli, appel, e-mail), convertir, marquer traitée. Compteur de non
  traitées dans le menu (`meta.total`, comme TCK-377). « Attribuer » réservé à l'admin : la liste
  des collègues (`GET /agencies/{id}/members`) est gardée par `can('update', $agency)` — un agent
  détient `crm.assign` mais n'aurait qu'un menu vide. Ablation (message tronqué à 80) → rouge.
- Visites : onglet « Non attribuées » pour le personnel (`filter[unassigned]`) ; « Prendre en
  charge » sur une visite sans agent, 409 dit « un collègue l'a prise » ; le visiteur « propose un
  autre créneau » dans la grille de `visit-slots`. Ablations : condition `agent_id == null`
  retirée, onglet ouvert au bailleur, proposition construite dans le fuseau du navigateur → rouge.
- « Planifier une visite » sur la fiche bien, la fiche client et le calendrier ; heure à Dakar
  (ablation : `new Date(…)` → rouge). La replanification de l'agence (`datetime-local`) se lit
  aussi à Dakar : elle décalait d'une heure depuis Paris ; le test existant a été réécrit.
- `ContactLeadInboxTest` rejoue la requête exacte de la console (champs clairsemés sur trois
  tables, deux inclusions) : une colonne refusée y serait un 400 dans la boîte entière.

**Vérification (2026-10-07) — exécutions nommées qui cochent les cases.**
- API : `php artisan test` sur les 15 classes du ticket (`ContactLeadConvertTest`,
  `ContactLeadInboxTest`, `PropertyVisit{,Assignment,Isolation,Notification,Reschedule,Workflow}Test`,
  `Public/{PropertyContactClick,PropertyContactLead,PropertyContact,PropertyVisitRequest,
  VisitRequestRouting,VisitSlots}Test`, `Unit/Services/PrimaryPropertyContactEligibilityTest`) →
  88 verts, 1 `incomplete` (AC6, bailleur visé — TCK-587). Pint propre.
- Front : `npx vitest run` sur visits, leads, layout, calendar, console, `(dashboard)`, la fiche
  publique, contact, public, `src/lib`, `src/types`, `src/test` → 178 fichiers verts ; `tsc`, ESLint,
  `check-i18n` (parité fr/en/wo), `check-i18n-namespaces` verts. AC22 côté API : les clés ajoutées
  à `lang/{fr,en,wo}/{notifications,visits,leads}.php` sont toutes présentes dans les trois langues
  (les trois `types.role_delegation*` absentes de `wo` sont antérieures).
- Noms des classes : le ticket prévoyait `PropertyVisitStaffCreateTest`, `ContactClickTest`,
  `AnonymousVisitorNotificationTest` ; leurs cas vivent dans `PropertyVisitAssignmentTest`/
  `PropertyVisitIsolationTest` (planification, AC8), `PropertyContactClickTest` (AC20) et
  `PropertyVisitNotificationTest` (AC9, AC9b).
- Reste ouvert, et seulement par TCK-587 : AC6 (403 du bailleur visé sur `confirm`), AC7b (garde
  `check-agency-scope-clause.mjs`), et le retrait des deux exemptions. La suite entière est lancée
  par la session.

**Étape 5 — le téléphone saisi au format national (2026-10-07, relevé de TCK-588).**
- Re-mesuré : avant ce ticket, `visitor_phone` et le téléphone d'une piste étaient enregistrés tels
  quels (`string`, aucune règle) — d'où le rappel jamais reçu. Cette branche les faisait juger par
  `TelephoneJoignable`, qui REFUSAIT `77 123 45 67` (AC3 l'exigeait) : plus de numéro injoignable
  enregistré, mais un visiteur renvoyé à sa saisie. La saisie est désormais normalisée
  (`App\Support\TelephoneSaisi`), puis jugée ; rien d'autre n'est deviné (`61 …`, `06 …` → 422).
- Chaîne éprouvée de bout en bout : `77 123 45 67` saisi sur le site → `+221771234567` en base →
  la confirmation de l'agence part en SMS vers ce numéro. Même chose pour le prospect que l'agent
  planifie. La migration rattrape l'existant des deux colonnes ; `down()` vide, motif écrit.
- Ablations, toutes rouges puis restaurées : branche nationale retirée de `TelephoneSaisi` (AC3
  visite et piste), normalisation retirée de la demande publique, de la planification, et de la
  migration. `customers.phone` non touché (TCK-591).
- ⚠ **Corrigé après la vérification adverse (M6)** : cette note affirmait qu'« un client planifié
  par sa fiche reçoit son SMS au numéro de sa fiche, tel qu'enregistré ». C'était le défaut, pas
  une garantie : `SmsChannel` jette sans bruit un numéro non E.164. La planification recopie
  désormais `TelephoneSaisi::normaliser(customers.phone)` dans `visitor_phone` ; la fiche, elle,
  reste telle quelle (TCK-591).

**Étape 6 — corrections après vérification adverse (2026-10-07).** VERIF-590 refusait le ticket :
deux bloquants d'une même cause (`managesProperty()` comptait le créateur du bien), cinq majeurs,
cinq mineurs, puis une passe 1b sur `5701ad42`. Tous traités, chacun prouvé par un test qui
échoue sur le code d'avant et par une ablation rejouée (X01-X15, FX1, FX2 : toutes rouges, toutes
restaurées — liste dans la section 8 du Delta).
- Les sondes S1, S2 et S9 de la vérification sont devenues des tests (AC23, AC24) : sur le code
  d'avant — ablation X01, le créateur réintroduit — elles rougissent ; avec le correctif, 403 sur un
  bien privé, et sur un bien public une visite en attente au nom et au numéro de l'appelant.
- Une seule définition du personnel (`estPersonnel` : profil actif, compte joignable). Les
  `isAgentAt`/`isAgencyAdminAt` du dépôt ne lisent aucun statut ; ils restent tels quels hors du
  ticket — c'est le sujet de `isStaffAt` (TCK-587).
- Restent liés à la fusion de TCK-587 : AC6, AC7b, AC28b (403 du bailleur tiers).

**Étape 7 — seconde passe de vérification (2026-10-07).** VERIF-590 passe 2 refusait encore : le
relais de SMS rouvert par une autre porte (B2′), et `property.user_id` lu comme « propriétaire »
alors que c'est aussi l'agent créateur parti (M7), plus quatre mineurs. Un commit par point, chacun
prouvé par un test qui rougit sur le code d'avant et par une ablation rejouée (P01-P18, FX3, FX4 :
toutes rouges, toutes restaurées — section 9 du Delta).
- B2′ : la borne vit au point d'envoi, pas sur une route. Le limiteur de `POST /property-visits` ne
  voyait qu'une des quatre portes ; mesuré sur la séquence du vérificateur : 9 SMS avant, 5 après.
- M7 : la fabrique `bienDe()` donne désormais au bien d'agence un bailleur ACTIF de l'agence. Sans
  cela, le propriétaire par défaut — un compte sans profil — cessait d'être contact principal, et
  `test_le_numero_national_saisi_sur_le_site_est_joint_a_la_confirmation` rendait 409 : c'est
  exactement le défaut M7, vu depuis une fabrique.
- (b) : le 403 est posé dans le contrôleur (`agitPourLeBien`), avant les contrôles d'état, pour
  `update`, `cancel` et donc `destroy`. AC28b n'attend plus TCK-587. `confirm` n'est PAS concerné
  par la décision : un bailleur de l'agence confirme encore une visite de son bien (1 SMS par
  demande, borné par B2′) — relevé dans le rapport, « Pour la session ».
- n3 : `MembershipCapabilityResolver` ne lit pas le statut du profil ; `agencyReaders()` filtre donc
  lui-même les profils agent ACTIFS avant de demander `crm.view_all`.
- Restent liés à la fusion de TCK-587 : AC6, AC7b.

**Étape 8 — après la fusion de TCK-587 (2026-10-07).** `origin/dev` fusionné (`fd4bd805`) ;
conflits en fin de fichier seulement (`lang/*/notifications.php`, `messages/*.json` : les deux blocs
gardés), `INDEX.md` regénéré.
- **Une seule définition du personnel** : `estPersonnel` = compte joignable + `isStaffAt()` (profil
  agent/admin ACTIF ou délégation active). `estBailleur` lit `isOwnerAt()`, filtré sur le statut par
  587. La liste des visites et la boîte lue en entier passent par `staffAgencyId()`. Le
  `MembershipCapabilityResolver` filtre désormais le statut (587) : la réserve « un agent suspendu
  garde ses capacités » de l'étape 7 est levée.
- **Coût** : juger le personnel devient une requête. `PrimaryPropertyContact` trie d'abord et
  s'arrête au premier éligible ; le test de coût affirme un nombre de requêtes indépendant du nombre
  de collaborateurs (≤ 3), ablation Q01 (filtrer avant de trier) → rouge.
- **AC6** vert (Q03), **AC7b** et la case du Delta cochés (exemptions retirées, CLIQUET 10 → 8,
  Q05), **AC28b / M3** : la policy de 587 refuse désormais le bailleur tiers, ET le contrôleur
  (écart b) ; les deux gardes se recouvrent — ablation de la policy seule : vert ; des deux
  (Q04) : 2 rouges.
- `crm.assign` quitte `CapabilityEnforcementInventory::AWAITING` (lu par `canAssign` et la policy
  des demandes), CLIQUET de `check-capability-readers.mjs` 16 → 15.
- `TeamMemberSuspensionTest::test_un_bailleur_bloque_ne_modifie_plus_une_visite` (587) attendait
  qu'un bailleur ACTIF de B déplace la visite de son bien de B : 403 désormais, par la décision (b).
  Assertion adaptée et commentée.
- Sonde S1 de la vérification (`Verif590S1Test`) rejouée puis retirée : bien privé → 403 ×2,
  lecture de la visite du bien d'un autre bailleur → 403, aucune fuite ; bien public → 201 pour
  lui-même, `customer_id` nul (écart a accepté).
- Exécutions : 27 classes TCK-590 et voisines + `tests/Feature/Authorization` : 400 verts, 0
  `incomplete` ; front : 35 fichiers, 265 verts ; `tsc`, lint, gardes i18n et racine vertes.

**Étape 9 — troisième passe, puis fusion de TCK-588 (2026-10-08).** VERIF-590 passe 3 refusait :
`confirm` et `complete` sans la garde de l'écart (b) (B2″), `PropertyVisitPolicy::view` qui lisait
encore `property.user_id` (M7′), la borne globale par numéro, déni de service (R1), le bouton
« Planifier une visite » disparu (R2), plus trois mineurs. Un commit par point, chacun prouvé par un
test rouge sur `37210bac` et une ablation restaurée par `cp` (section 10 du Delta).
- R2 : choix de LIRE `agency.id` côté front (`agenceDuBien()`, module à part : une page serveur ne
  peut pas appeler une fonction d'un module client) plutôt que de faire émettre `agency_id` par
  `PropertyResource`. Le test front consomme des réponses capturées de l'API réelle.
- t1 : AA2 reste vert, et c'est attendu — la branche `landlordWrites` de
  `PropertyVisitPolicy::update` est morte pour une visite de bien d'agence.
- Fusion de `origin/dev` (TCK-588) : refus en `abort_code`, notifications en codes. Les sept classes
  `Notification` de 590 et `HeureDeVisite` disparaissent ; l'heure est rendue par le
  `NotificationRenderer` de 588 dans le fuseau du destinataire, suivie de ce fuseau (paramètre
  `timezone`). `ContactSansCompte` porte un e-mail (`fromVisit`, `fromLead`) et la langue
  enregistrée sur la visite.
- Plafond des SMS : une seule source de vérité, `VisitNotifier::borneLeSms`. Il transmet
  `mobileBorne` à `send()` : `true`, les canaux SMS et WhatsApp ne recomptent pas contre leur limite
  générique par numéro (5/h) ; `false`, aucun canal mobile. Compter deux fois rendait au numéro un
  plafond global, le défaut R1. Les autres codes gardent la limite de 588.
- La fixture de `SendLeasePaymentRemindersTest` (588) prenait pour contact principal un
  collaborateur sans profil dans l'agence ; la règle de 590 l'écarte. Fixture corrigée (commit à
  part).
