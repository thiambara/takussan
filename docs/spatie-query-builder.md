# API Query Builder — spatie/laravel-query-builder

Le backend utilise [spatie/laravel-query-builder](https://spatie.be/docs/laravel-query-builder) pour exposer des filtres, un tri, des inclusions et la sélection de champs depuis le frontend.

---

## Query params disponibles

### Filtres

```
GET /api/properties?filter[status]=available
GET /api/properties?filter[status]=available&filter[type]=apartment
GET /api/customers?filter[pipeline_stage]=lead
```

**Filtre textuel (recherche multi-champs) :**
```
GET /api/properties?filter[search]=villa mermoz
GET /api/customers?filter[search]=Amadou
GET /api/users?filter[search]=Fatou
```

**Filtres de range (min/max) :**
```
GET /api/properties?filter[price_min]=50000&filter[price_max]=200000
GET /api/properties?filter[area_min]=80
GET /api/leases?filter[monthly_rent_min]=100000
```

### Tri

```
GET /api/properties?sort=-price        # décroissant
GET /api/properties?sort=price         # croissant
GET /api/leases?sort=-monthly_rent
GET /api/customers?sort=last_name
```

### Inclusions (eager loading)

```
GET /api/properties?include=address,owner
GET /api/leases?include=property,tenant
GET /api/customers?include=addresses,tags
```

**Compter les relations :**
```
GET /api/properties?include=bookingsCount,leasesCount,reviewsCount
```

### Sparse fieldsets (sélection de champs)

Réduit les données retournées aux seules colonnes nécessaires. Le nom de la ressource correspond au nom de la table (pluriel snake_case).

```
GET /api/properties?fields[properties]=id,title,price,status
GET /api/customers?fields[customers]=id,first_name,last_name,email,status
GET /api/leases?fields[leases]=id,property_id,monthly_rent,status,start_date,end_date
```

**`fields` et `include` ne valent que pour les listes. Un `show` rend la ressource de détail
entière** (P60.03, TCK-1067). Le front n'envoie donc aucun `fields[...]` à une route de détail
(`GET /api/<ressource>/{id}`) ; `src/lib/queries/__tests__/show-sans-fields.garde.test.ts` le
garde. Relevé du 2026-10-19 : les `show` chargent des relations fixes et ignorent `fields` ;
`CustomerController::show` est le seul à passer par `buildQuery`, et trois `show` lisent encore
`include=` (`Customer`, `MaintenanceRequest`, `BankStatement`).

**Exception : le locataire du show du bail** (TCK-2780). `GET /api/leases/{id}` ne rend `tenant` que
sous `include=tenant`, et `fields[customers]` en borne le bloc à `id` et aux clés demandées. Sans
`fields`, le bloc est entier. Les gardes de `CustomerResource` se jugent sur la fiche complète : une
clé demandée n'ouvre aucun droit. Le reste du bail n'est jamais borné (pas de `fields[leases]`). La
garde du front n'admet que `fields: { customers: CHAMPS_DU_LOCATAIRE_… }` vers ce show.

```
GET /api/leases/42?include=property,tenant&fields[customers]=id,first_name,last_name
```

**La liste des baux suit la même règle** (TCK-2803) : `GET /api/leases` ne rend `tenant` que sous
`include=tenant`, et `fields[customers]` borne le bloc de chaque ligne exactement comme celui de la
fiche — la liste et la fiche acceptent la même forme. Ce n'est pas spatie qui borne : il cherche les
champs d'une relation incluse sous le nom de la relation au pluriel (`fields[tenants]`, qu'`allowedFields`
refuse, 400) et charge donc le locataire entier ; c'est `LeaseController::index` qui borne le rendu,
après les gardes. Une requête qui demande `include=tenant` porte `fields[customers]` (garde du front :
`liste-des-baux-locataire.tck-2803.test.ts`).

```
GET /api/leases?include=tenant,property&fields[customers]=id,first_name,last_name
```

Les réponses des gestes sur un bail (création, modification, activation, résiliation, préavis,
signature, renouvellement, révision, restitution de caution) ne rendent **jamais** `tenant` : l'écran
relit la fiche ou la liste.

Pour une lecture légère d'une seule ligne (un titre d'onglet, un en-tête), passer par la liste
filtrée par id, avec ses `fields` :

```
GET /api/leases?filter[id]=42&fields[leases]=id,reference_number&per_page=1
```

### Pagination

```
GET /api/properties?per_page=50
GET /api/properties?per_page=10&page=2
```

---

## Filtres disponibles par ressource

### Property
| Param | Type | Description |
|---|---|---|
| `filter[id]` | exact | un ou plusieurs ids, séparés par des virgules (TCK-2524) — voir ci-dessous |
| `filter[status]` | exact | `draft`, `available`, `rented`, `sold`, ... |
| `filter[type]` | exact | `apartment`, `house`, `villa`, ... |
| `filter[contract_type]` | exact | `sale`, `rental`, ... |
| `filter[user_id]` | exact | ID du propriétaire |
| `filter[agency_id]` | exact | ID de l'agence |
| `filter[bedrooms]` | exact | Nombre de chambres |
| `filter[bathrooms]` | exact | Nombre de salles de bain |
| `filter[featured]` | exact | `1` ou `0` |
| `filter[currency]` | exact | `XOF`, `EUR`, `USD`, ... |
| `filter[price_min]` | range | Prix minimum |
| `filter[price_max]` | range | Prix maximum |
| `filter[area_min]` | range | Surface minimum (m²) |
| `filter[area_max]` | range | Surface maximum (m²) |
| `filter[search]` | search | Recherche dans title, reference_number, description |
| `filter[public]` | callback | `1` : les biens EN LIGNE (`Property::scopePublic`, ADR-0097) |
| `filter[occupancy]` | callback | TCK-2637 — `occupied` (bail courant, préavis compris), `notice` (bail courant en préavis), `vacant` ; autre valeur → 422 |
| `filter[listing]` | callback | TCK-2638 — l'état d'annonce, une partition : `online` (= `filter[public]=1`), `pending` (pas en ligne ; `pending` ou `pending_review`), `draft` (pas en ligne ; brouillon), `offline` (tout le reste, négation de `scopePublic`) ; autre valeur → 422 |
| `filter[rent_late]` | callback | TCK-2637 — `1` : le loyer du mois en retard sur le bail courant que l'appelant peut lire |
| `filter[tenant]` | callback | TCK-2637 — chaque mot dans le prénom ou le nom du locataire du bail EN COURS lisible par l'appelant (casse repliée, accents non) |
| `sort` | `-price`, `price`, `-created_at`, `area`, `bedrooms`, `featured`, `retard` | `retard` (TCK-2637) : loyers du mois en retard d'abord, le plus ancien en tête, puis les autres |

**`filter[id]`** (TCK-2524) — lire des biens par leurs ids, avec leurs `fields` : la vitrine de
l'agence nomme ainsi les biens de sa sélection, quel que soit leur rang dans la liste.

```
GET /api/properties?filter[id]=839,838&filter[agency_id]=1&fields[properties]=id,title,reference_number&per_page=6
```

- **Format** : une liste d'entiers séparés par des virgules, chacun de **18 chiffres au plus**. Une
  valeur non entière ou plus longue rend **400**, pas 500 (`ExactIdentifierFilter`, comme tout filtre
  `id` / `*_id`).
- **Le périmètre de l'appelant est inchangé** : le filtre restreint la liste que l'appelant voit déjà,
  il n'en ouvre aucune. Un id qu'il ne voit pas ne rend rien, sans erreur.
- **Où il vaut** : sur toute liste qui passe par `Property::buildQuery()`, c'est-à-dire
  `GET /api/properties` (`PropertyController::index`), `GET /api/properties/{property}/children`
  (`PropertyChildrenController::index`), `GET /api/me/owner-profiles/{owner_profile}/properties`
  (`Me\OwnerProfileController::properties`) et `GET /api/admin/agencies/{agency}/properties`
  (`Admin\AgencyDetailController::properties`). La liste se relit par
  `grep -rn "Property::buildQuery" takussan-api/app`.

**Occupation et présence en ligne** (TCK-2637, ADR-0097) — sur `GET /api/properties` et
`GET /api/properties/{property}` seulement :

```
GET /api/properties?include=occupancy,online&fields[properties]=id,title&sort=retard
GET /api/properties/portfolio-summary?filter[user_id]=42
```

- **`include=online`** → `is_online` (booléen), sur la liste comme sur la fiche ; absent sans
  l'inclusion. Ce n'est **pas** un champ de `fields[properties]` (`…,is_online` → 400) : un champ
  calculé derrière les sparse fieldsets est la voie écartée d'ADR-0021. Une requête pour la page,
  le même code que `filter[public]`.
- **`include=occupancy`** : `{state, vacant_since, lease, tenant, rent, current_month}` —
  `lease`, `tenant`, `rent` et `current_month` seulement si l'appelant peut lire le bail (la clause
  de `GET /api/leases`) ; `null` sur un bien vacant. `current_month.status` : `paid`, `late`,
  `partial`, `due` ou `none` (la règle du relevé du bailleur).
- **`portfolio-summary`** : `{total, occupied, vacant, for_sale, vacant_over_60_days, notice, rent_late,
  rent_late_amount, online, pending_validation, drafts, offline, sold_or_rented, archived}` sous la
  portée et les filtres de la liste ; chaque compte égale le `meta.total` de la liste filtrée
  correspondante. TCK-2638 : `online + pending_validation + drafts + offline = total` (`filter[listing]`) ;
  `sold_or_rented` ouvre `filter[status]=sold,rented`, `archived` ouvre
  `include_archived=1&filter[status]=archived` et se compte toujours avec les archivés.
- Les autres listes de biens (`children`, `me/owner-profiles/…/properties`, `admin/agencies/…`)
  acceptent les filtres et `include=occupancy,online`, mais ne rendent ni `occupancy` ni `is_online`.

### Customer
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `active`, `inactive`, ... |
| `filter[pipeline_stage]` | exact | `lead`, `prospect`, `client`, ... |
| `filter[agency_id]` | exact | ID de l'agence |
| `filter[search]` | search | Recherche dans first_name, last_name, email, phone |
| `sort` | `-created_at`, `first_name`, `last_name`, `status` | |
| `fields[customers]=…,suggested_stage` | calculé | TCK-2591 — `{to, reason, at}` ou `null` : l'étape que propose le dernier fait postérieur au dernier changement d'étape (ADR-0103 § 5) ; jamais une colonne |

`GET /api/customers/pipeline-stats` (TCK-2591) accepte `scope=mine` (= `filter[referent]=me`, qu'aucun autre `filter[referent]` ne peut contredire : 422) ou `scope=agency` (CRM de l'agence active, 403 sans `crm.view_all`), et les MÊMES `filter[…]` que la liste des clients ; sans `scope`, la lecture de la fiche, comme avant. Rend aussi `median_days_in_stage` et `exits_last_30d` ; `conversion_rate` se lit dans le journal des étapes.

### Lease
| Param | Type | Description |
|---|---|---|
| `filter[id]` | exact | lecture légère d'un bail (TCK-1067) |
| `filter[status]` | exact | `active`, `expired`, `terminated`, ... |
| `filter[type]` | exact | `rental`, `sale` |
| `filter[property_id]` | exact | |
| `filter[tenant_id]` | exact | |
| `filter[currency]` | exact | |
| `filter[monthly_rent_min]` | range | |
| `filter[monthly_rent_max]` | range | |
| `filter[a_traiter]` | booléen | TCK-2642 — au moins un motif de la file « À traiter » ; `1`/`0`, autre valeur → 422 |
| `filter[motif]` | énuméré | TCK-2642 — `signature_pending`, `notice_received`, `rent_late`, `late_fee_unpaid`, `rent_review_open`, `deposit_to_refund`, `ending_soon`, `onboarding_incomplete` ; inconnu → 422 |
| `filter[onboarding_pending]` | booléen | TCK-2642 — l'ensemble de `GET /api/agencies/{agency}/tenant-onboarding-pending` (même règle, `TenantOnboardingChecklist::scopePending()`) ; personnel seulement, vide pour le bailleur |
| `filter[search]` | texte | TCK-2642 — référence du bail, prénom/nom et téléphone (chiffres seuls, ≥ 4) du locataire, titre et référence du bien ; chaque mot doit trouver un champ ; casse repliée (`CaseInsensitive`), accents non |
| `sort` | `-created_at`, `start_date`, `end_date`, `monthly_rent`, `attention`, `etat` | défaut : `etat`, puis `-created_at` (TCK-2642) |

<!-- TCK-2642 -->
- **La file « À traiter »** (`App\Services\Lease\LeaseAttention`, une règle SQL par motif) :
  `signature_pending` (en signature depuis plus de 3 jours), `notice_received` (préavis sur un bail
  en cours), `rent_late` (loyer échu au-delà du délai de grâce du bail, reste dû > 0),
  `late_fee_unpaid` (pénalité non réglée sur une échéance payée, bail en cours — `active`, `terminating`), `rent_review_open` (anniversaire
  passé, aucune révision depuis 12 mois), `deposit_to_refund` (terminé ou expiré, caution restante
  > 0), `ending_soon` (actif, fin dans moins de 4 mois, sans renouvellement), `onboarding_incomplete`
  (checklist ouverte depuis plus de 7 jours ; personnel seulement). ⚠ Le motif `rent_late` n'est pas
  le `filter[rent_late]` des biens, qui ne lit que l'échéance du mois.
- **`include=attention`** → `attention[]` : `{motif, since, amount?, due_date?}`, `since` et
  `due_date` en date calendaire, du plus grave au moins grave. Le filtre et la ligne lisent la même
  règle. Absent sans l'inclusion ; ce n'est pas un champ de `fields[leases]` (→ 400).
- **`include=due_summary`** → `next_due` (`{due_date, amount, status}` de la prochaine échéance à
  venir, reste dû ; `null` sinon), `overdue_count`, `overdue_amount` (au reste dû).
- **`include=landlord`**, **`include=agent`** → `{id, first_name, last_name, full_name}` ; le
  téléphone du bailleur pour le personnel de l'agence du bail et pour le bailleur lui-même.
- **`sort=attention`** : l'argent dû d'abord (`rent_late`, `late_fee_unpaid`), puis ce qui presse,
  puis l'information ; le plus ancien `since` en tête. **`sort=etat`** : en cours, en signature,
  brouillon, expiré, résilié, renouvelé.
- **`GET /api/leases/summary`** → `{a_traiter, active, onboarding_pending, ended, draft, motifs{…}}`,
  sous la portée et les paramètres de la liste ; chaque compte égale le `meta.total` de la liste
  filtrée (`filter[status]=active,terminating`, `expired,terminated,renewed`,
  `draft,pending_signature`).
- La fiche (`GET /api/leases/{lease}`) accepte les mêmes inclusions et sert `rent_review_cap_pct`.

### Booking
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `pending`, `confirmed`, `cancelled`, ... |
| `filter[kind]` | exact | `stay`, `application`, `offer` — la nature (TCK-2579, ADR-0102) ; liste admise (`stay,offer`) |
| `filter[property_id]` | exact | |
| `filter[customer_id]` | exact | |
| `filter[total_amount_min]` | range | |
| `filter[total_amount_max]` | range | |
| `filter[search]` | callback | TCK-2593 — référence, prénom et nom du client (casse repliée, accents non), titre du bien ; une saisie de chiffres et séparateurs (≥ 4 chiffres) cherche le téléphone de la fiche. SQL sous la portée de l'index, jamais Meilisearch |
| `sort` | `-created_at`, `start_date`, `end_date` | |

`GET /api/bookings/counts` (TCK-2593) rend `{data: {stay|application|offer: {pending, confirmed, rejected, cancelled, completed, expired}}}` sous la portée et les MÊMES filtres que l'index (`filter[managed_by]=me`, `filter[search]`…) : chaque case égale le `meta.total` de l'index filtré sur cette nature et ce statut. `include=customer` porte, pour le personnel de l'agence, `customer.phone`, `customer.pipeline_stage` et `visits_on_property` (visites terminées du client sur le bien) ; le bailleur du bien lit `customer.phone` et `customer.pipeline_stage`, pas `visits_on_property` (décision du porteur, 2026-11-11).

### Visites — `GET /api/property-visits` (TCK-2797)

Sous `fields[property_visits]`, la réponse ne porte que `id`, les clés nommées et les blocs de `include=`
(`property`, `visitor`, `agent`, `customer`). Sans `fields`, elle est entière. Le détail
(`GET /api/property-visits/{id}`) suit la même règle.

| Clé calculée | Ce qu'elle rend | Colonnes lues sans être demandées |
|---|---|---|
| `visitor_display` | la carte du visiteur `{name, phone, kind, visits_on_property}` ou `null` | aucune (`VisitReadContext`) |
| `report` | le compte rendu, `null` s'il n'est pas écrit ; clé absente hors du personnel de l'agence du bien | `reported_at`, `report_*`, `reported_by_id` |
| `abilities` | `{manage, feedback_customer, create_customer}`, au détail seulement | aucune |

Ces clés ne sortent que **nommées**. `PropertyVisit::buildQuery()` les retire avant spatie
(`PropertyVisitResource::FIELDS`), et un autre nom inconnu rend toujours 400. Une clé demandée n'ouvre aucun
droit : les règles de lecture de la ressource jugent chaque valeur sur la visite relue, jamais sur le `SELECT`.

### Agency
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `active`, `inactive` |
| `filter[is_verified]` | exact | `1` ou `0` |
| `filter[search]` | search | Recherche dans name, email, license_number |
| `sort` | `-created_at`, `name`, `founded_at` | |

### Invoice / Payout / MaintenanceRequest / Task / Document / Tag
Même pattern : `filter[status]`, `filter[search]` (selon le model), `sort`.

`MaintenanceRequest` ajoute une plage sur le créneau (TCK-2623, « mes interventions du jour ») :

| Param | Type | Description |
|---|---|---|
| `filter[scheduled_from]` / `filter[scheduled_to]` | date | `YYYY-MM-DD`, heure de Dakar, bornes incluses ; une intervention sans créneau n'entre dans aucune plage ; illisible ou liste → 422. Le périmètre reste celui de la Policy (`visibleTo`) |

### Conversations — `GET /api/conversations` (TCK-2630)

Ne passe **pas** par `HasQueryBuilder` : la liste est cloisonnée par
`ConversationAccess::constrainListing` et filtrée dans `ConversationController::index`
(`ListConversationsRequest` ; saisie mal formée → 422).

| Param | Type | Description |
|---|---|---|
| `archived` | `0`/`1` | les fils archivés par l'appelant au lieu des autres |
| `filter[search]` | texte | chaque mot (6 au plus) trouve le prénom ou le nom d'un membre actuel autre que l'appelant, le titre ou la référence du bien, ou le sujet ; casse repliée (`CaseInsensitive`), **accents non repliés** (« thies » ne trouve pas « Thiès ») ; moins de 2 caractères → ignoré (TCK-2630) |
| `filter[unread]` | `1`/`0` | fils ayant au moins un message non lu (même définition que `unread_count`) (TCK-2630) |
| `filter[type]` | `direct` \| `group` | (TCK-2630) |

`meta.counts {all, unread, group}` : les compteurs des puces, sur tout le cloisonné **hors
archives**, sans aucun filtre ; `unread` compte des fils, sourdine comprise — `meta.unread_total`
compte des messages, hors sourdine (TCK-2630).

`GET /api/conversations/{conversation}/context` (garde de `show`) rend `property {id, slug, title,
reference_number, price, status, cover_url}`, `lease {id, status, reference, tenant_name}`,
`maintenance {id, status, title, scheduled_at}`, chacun `null` s'il est absent ou interdit, et —
au seul personnel de l'agence du fil, sur une directe — `customer {id, full_name, stage, phone,
assigned_agent {id, name}}` ; la clé `customer` est absente pour tout autre lecteur (TCK-2630). Il rend aussi
`participants` : pour chaque membre actuel, `{user_id, relation}` — `prestataire` (avec `category`, la
catégorie de l'intervention), `locataire`, `proprietaire` ou `agent`, une seule, dans cet ordre de
priorité —, dérivé et jamais stocké, chaque relation ne se lisant que si l'appelant lit l'objet dont
elle vient (bail, intervention, bien) (`RelationsAuFil`, TCK-2748).

### Contacts de messagerie — `GET /api/conversations/contacts` (TCK-2745, TCK-2830)

Liste blanche propre (`MessagingContactController`), tout autre paramètre → 400. Le périmètre est
celui de `MessagingReach` ; aucune coordonnée n'est rendue ni cherchable.

| Param | Type | Description |
|---|---|---|
| `filter[search]` | Scout | prénom et nom seulement ; ordre de pertinence restitué |
| `filter[exclude]` | ids | personnes déjà choisies (TCK-973) |
| `filter[id]` | id | une personne précise (TCK-2589) |
| `filter[relation]` | callback | une section de « Nouvelle conversation » : `equipe`, `proprietaire`, `client`, `prestataire` (la relation rendue, après priorité), ou `autre` — ni équipe, ni propriétaire, ni client : prestataire ou sans relation (TCK-2745, TCK-2830) |
| `sort` | `first_name`, `last_name`, `-last_exchange_at` | `last_exchange_at` : le dernier échange avec l'appelant (`LastExchangeSort`) ; sans recherche ni tri, ordre alphabétique |
| `fields[users]` | `id`, `first_name`, `last_name` | |

Chaque ligne porte `relation` (une seule, priorité équipe, propriétaire, client, prestataire ; aucune
pour un simple correspondant) et sa ligne de détail en données (bien et ville du dernier échange,
rôle, nombre de biens d'un propriétaire).

### Carnet des prestataires — `GET /api/agencies/{agency}/service-providers` (TCK-592, TCK-2772, TCK-2829)

| Param | Type | Description |
|---|---|---|
| `filter[collaboration_status]` | exact | le statut du couple (profil, agence de l'écran), appliqué par `scopeForAgency` ; absent : les collaborations `active` **et les invitations en attente de l'agence** (profil `draft`, collaboration `paused` avec elle, invitation `sent` de cette agence) — une collaboration `paused` d'un profil non `draft` (suspension) en est exclue (TCK-2829) |
| `filter[specialty]` | callback | un ou plusieurs métiers (OU) |
| `filter[zone]` | callback | une ou plusieurs zones de `service_areas` (OU) |
| `filter[search]` | search | `insurance_policy_id`, prénom, nom et téléphone du compte, sinon ceux de l'invitation (`metadata`), et les zones ; casse repliée ; un terme fait de chiffres cherche aussi le numéro sans séparateurs (TCK-2772) |
| `sort` | `id`, `created_at`, `status` | défaut `-created_at` |
| `include` | `user`, `agencyCollaborations`, `agencies`, `invitations` | |

`meta.zones` : les zones distinctes du carnet de l'agence (même périmètre de statuts), lues hors de la
recherche et du filtre de zone ; chaque ligne porte `response_delay_minutes` (délai médian de réponse
sur les interventions de l'agence, `null` sans mesure) et `pending_invitation_id` (TCK-2772, TCK-2371).

### Notifications — `GET /api/notifications` (TCK-2633)

Filtres cumulables, traduits en SQL depuis la table `App\Domain\Notifications\NotificationClassification`
(jamais recopiée côté front) :

| Paramètre | Valeurs | Effet |
|---|---|---|
| `filter[unread]` | `1`, `true`, `0`, `false` | les non lues seulement |
| `filter[famille]` | liste : `visite,demande` ou `filter[famille][]=…` ; `demande`, `visite`, `paiement`, `retard`, `bien`, `avis`, `systeme` | une ligne à code prend la famille de son code ; une ligne sans code (ou à code hors catalogue), celle du genre de sa cible stockée (`target.kind`), sinon celle de son `type` |
| `filter[a_traiter]` | `1`, `true`, `0`, `false` | les notifications qui demandent un geste au destinataire ; une ligne sans code ne l'est jamais |

Chaque ligne porte `famille` et `a_traiter` (demandables par `fields[app_notifications]=id,famille,a_traiter,…`).
`meta.counts = {a_traiter_non_lues, par_famille: {visite: 1, …}}` porte sur les **non lues** de l'appelant, filtres
ignorés ; une famille sans non-lue est absente de `par_famille` (`{}` si aucune). Une valeur mal formée rend 422.

```
GET /api/notifications?filter[a_traiter]=1&filter[unread]=1
GET /api/notifications?filter[famille]=visite,demande&per_page=20
```

### Historique des paiements — `GET /api/payments/history`

Lu **à la main** par `PaymentController::history` (loyers et réservations fusionnés en PHP, plafond
de 5 000 lignes, `meta.truncated`), pas par `HasQueryBuilder` : ni `fields[…]`, ni filtre inconnu
refusé. Une valeur en liste (`filter[x][]=…`) vaut une valeur absente (ADR-0075), sauf
`filter[status]` (422).

La sélection vit dans `App\Services\Payments\PaymentHistory` (TCK-2721), que lisent **deux** routes :
cette liste, et l'export du registre `GET /api/export/payment_history?format=csv&filter[…]&sort=…`
— mêmes filtres, même tri, mêmes lignes, sans pagination (`limit` des exports : 5 000 par défaut, 10 000 au plus ; au-delà, l'en-tête
`X-Export-Truncated` porte le nombre de lignes rendues ; le fichier coupé garde les **premières** lignes du
registre dans le tri demandé : chaque source est triée en SQL sur la clé même du tri avant d'être coupée,
`date`, `amount`, `created_at`, `remaining_amount` et `days_late` compris). L'export exige `payments.export` ; le 403
passe avant le 422 d'un filtre invalide. Colonnes : `paid_at`, `payer`, `property`, `payment_type`,
`period_start`, `period_end`, `payment_method`, `amount`, `currency`, `status`, `reference`.

| Param | Type | Description |
|---|---|---|
| `filter[entity_type]` + `filter[entity_id]` | exact | `property`, `lease`, `customer`, `booking` |
| `filter[status]` | liste | `pending,late,partially_paid` — inconnu → 422 `payment.filter_status_invalid` |
| `filter[date_from]` / `filter[date_to]` | date | `YYYY-MM-DD`, heure de Dakar — `paid_at` **ou** `period_start` dans la borne (une réservation : `paid_at` ou `created_at`) : les échéances de la période, payées ou non |
| `filter[paid_from]` / `filter[paid_to]` | date | `YYYY-MM-DD`, heure de Dakar — **l'encaissé** : `paid_at` seul, borné au jour (`DayRange`), le sens de la tuile « Encaissé en <mois> » de `finance/summary` ; une échéance jamais payée n'y entre pas ; illisible → 422 (refus de TCK-2659, M1) |
| `filter[payer_id]` | exact | le client payeur : `lease_payments.payer_id`, ou le client de la réservation (TCK-2657) |
| `filter[landlord_id]` | exact | `leases.landlord_id`, ou le titulaire du bien de la réservation (TCK-2657) |
| `filter[payment_method]` | liste | `wave,cash` — inconnu → 422 `payment.filter_payment_method_invalid` (TCK-2657) |
| `filter[search]` | search | chaque mot dans : nom du payeur, titre ou référence du bien, référence du paiement ; casse repliée (`CaseInsensitive`), **accents non repliés** (TCK-2657) |
| `filter[days_late_min]` / `filter[days_late_max]` | entier ≥ 0 | échéances dues et échues seulement ; exclut les réservations (TCK-2657) |
| `include` | `payer`, `property`, `landlord`, `reminders` | `payer {id, name, phone}`, `property {id, title, reference_number}`, `landlord {id, name}` — nom inconnu ignoré (TCK-2657) ; `reminders` : `last_reminder {at, source, channel, by}` (ou `null`) et `reminders_count`, relances notées et rappels automatiques confondus, `null`/`0` sur une réservation (TCK-2658), et sur toute ligne dont le lecteur n'est ni super-admin ni personnel de l'agence du bail — la règle de `LeasePaymentPolicy::remind`, jugée ligne par ligne (vérification adverse de TCK-2658) |
| `sort` | `-date` (défaut), `amount`, `remaining_amount`, `created_at`, `days_late` | `days_late` : les lignes sans retard en dernier, dans les deux sens |

⚠ **`days_late` n'est émis que si la requête porte un paramètre neuf de TCK-2657** (un `include`,
un des filtres ci-dessus marqués TCK-2657, ou `sort=days_late`) : sans eux, la ligne garde sa forme
d'avant, clé pour clé. `filter[status]=pending` seul ne le rend pas. Sa valeur : un entier ≥ 1 sur
une échéance due (`pending`, `partially_paid`, `late`) échue avant aujourd'hui (heure de Dakar),
hors restitution de caution ; `null` sinon, et toujours `null` sur une réservation.

### Point du mois d'une agence — `GET /api/agencies/{agency}/finance/summary`

`period=YYYY-MM` (défaut : le mois courant, heure de Dakar ; illisible → 422
`reporting.invalid_period`). Même Policy que `finance/aging` (`reports.view_agency`). Rend
`collected {amount, count, previous_amount}`, `overdue {amount, count, leases_count, by_age
{under_8, from_8_to_30, over_30} → {count, amount}}` (à date, `as_of`), `deposits_held`,
`payouts_awaiting_approval {count, amount, landlords_count}`, `payouts_pending {count, amount}`,
`invoices_draft {count, amount}`, plus `period`, `as_of` et `currency` (TCK-2657).
`payouts_open {count, amount, landlords_count}` : l'union des deux files, au net, avec les bailleurs
distincts qui attendent (`payee_role = landlord`, un bailleur présent dans les deux files compté une
fois) — la tuile « Reversements en attente » (TCK-2720).
`overdue.never_reminded_count` : les impayés sans aucune relance, notée (`lease_payment_reminders`) ni
automatique (`metadata.reminder_*_sent_at`) (TCK-2658).

### Relances d'une échéance — `GET|POST /api/lease-payments/{payment}/reminders`

Personnel de l'agence du bail seulement (`LeasePaymentPolicy::remind`). `POST {channel: whatsapp|call,
note?}` **note** une relance faite depuis le téléphone de l'agence — rien n'est envoyé (ADR-0105) ;
409 `lease_payment.not_overdue` hors d'une échéance due, non soldée et échue. `GET` rend toutes les
relances, de la plus récente à la plus ancienne : `{at, source: manual|automatic, channel, by {id,
name}, note, milestone}` — sans pagination ni filtre (TCK-2658).

### Grand livre des commissions — `GET /api/commissions` (TCK-595, TCK-2661)

Périmètre : `CommissionEntry::visibleTo` (l'agent ses lignes, `reports.view_agency` toute l'agence).

| Param | Type | Description |
|---|---|---|
| `filter[status]`, `filter[beneficiary_id]`, `filter[lease_id]`, `filter[origin]` | exact | |
| `filter[earned_from]` / `filter[earned_to]` | date | `YYYY-MM-DD`, heure de Dakar, bornes incluses ; illisible ou liste → 422 (TCK-2661) |
| `filter[paid_from]` / `filter[paid_to]` | date | idem sur `paid_at` ; une ligne non payée n'entre dans aucune plage (TCK-2661) |
| `include` | `lease`, `beneficiary`, `lease.property` | `lease.property` ajoute `lease.property {id, title, quarter}` (TCK-2661) |
| `sort` | `-earned_at` (défaut), `amount`, `paid_at`, `id` | |

`GET /api/commissions/summary?month=YYYY-MM&year=YYYY` (défaut : le mois courant de Dakar et son
année) rend, par bénéficiaire du même périmètre, `beneficiary {id, name}`, `due_amount`, `due_count`,
`oldest_due_earned_at`, `paid_month`, `paid_year`, `last_paid {at, method}` — le plus dû d'abord ;
`meta {month, year}` (TCK-2661).

### Mises en avant de l'espace — `GET /api/credits/boosts`, `GET /api/credits/suggestions` (TCK-2663)

Hors `HasQueryBuilder`, forme fixe comme `GET /api/credits` : même autorisation (`boost.spend` sur
l'espace actif, 403 avant 422), même 422 `credits.no_space` hors d'un espace (TCK-2663).

| Param | Type | Description |
|---|---|---|
| `filter[status]` | `active` \| `ended` | `active` : en cours ou en pause ; `ended` : terminé, annulé ou remboursé ; absent : en cours, plus terminé depuis 30 jours (TCK-2663) |
| `filter[id]` | entier | un boost de l'espace ; celui d'un autre espace rend une liste vide (TCK-2663) |
| `per_page` | 1 à 50 | défaut 20 ; tri fixe : en cours d'abord, puis le plus récemment terminé (TCK-2663) |

Chaque ligne porte `property {id, title, main_photo_url, quarter}` et `measures {impressions, clicks,
contacts, visits}`, mesurées de `starts_at` à `ended_at` (ou maintenant) : des comptes, aucune donnée
du demandeur ; `contacts` compte tous les canaux (TCK-2663). `GET /api/credits/suggestions?limit=N`
(1 à 10, défaut 10) : les biens publics de l'espace sans contact depuis 30 jours ni boost en cours,
du moins vu au plus vu, `{…property, views_count, last_contact_at}` et `meta.total` (TCK-2663).

### Équipe de l'agence — `GET /api/users`, chemin d'agence (TCK-2665)

| Param | Type | Description |
|---|---|---|
| `filter[role]` | liste | `agent,agency_admin` — un membre qui tient l'un des rôles ; une seule valeur garde son sens d'avant ; la console super-admin reste à une valeur (TCK-2665) |
| `include` | `team_summary` | ajoute à chaque membre `properties_followed_count`, `current_absence {starts_at, ends_at, substitute {id, name}}` ou `null`, `joined_at` (premier profil du membre dans l'agence, supprimés compris) et, pour un lecteur qui tient `payouts.approve` ou `reports.view_agency`, `commissions_due_amount` — clé absente pour les autres (TCK-2665) |

`meta.counts {agent, agency_admin, owner, absent}` est toujours rendu sur le chemin d'agence : les
comptes de la liste et de ses autres filtres, **hors** `filter[role]` — ce sont les pastilles (TCK-2665).

### Invitations — `GET /api/invitations`, `DELETE /api/invitations/expired` (TCK-2665)

| Param | Type | Description |
|---|---|---|
| `filter[customer_id]` | liste d'entiers | les invitations de locataire de ces fiches client ; valeur non numérique → liste vide (TCK-2665) |
| `filter[expired]` | `1` / `0` | expirées au sens de la purge et d'`is_expired` (`expired`, ou `sent` dont `expires_at` est passé) ou non ; autre valeur → liste vide. L'écran Équipe lit « En cours » par `status=sent&expired=0` et « Expirées » par `status=sent,expired&expired=1` : le nombre de « Tout effacer » est ce qui part (vérification de TCK-2668, D6) |

`DELETE /api/invitations/expired?filter[role]=agent,agency_admin` supprime les invitations expirées
(`expired`, ou `sent` dont `expires_at` est passé) de l'agence active, des rôles nommés — exigés et
connus, sinon 422. `team.invite` (403 avant 422) et second facteur de l'admin (`ProtectedActions`).
Rend `{deleted: n}`, journalise le nombre et les rôles, jamais une adresse (TCK-2665).

Une invitation née d'une fiche client porte `abilities: {resend, revoke}` quand la sélection lit
`agency_id`, `invited_by`, `invitable_type` et `invitable_id` : l'émetteur qui peut encore inviter ce
client la relance et l'annule sans `team.invite` (`InvitationPolicy`, vérification de TCK-2668, D1).

---

## Architecture interne

Tous les models héritent du trait `HasQueryBuilder` via `AbstractModel`. Chaque model déclare :

```php
protected static array $requestFilterable = [/* filtres exacts */];
protected static array $requestFilterablePartial = [/* filtres LIKE */];
protected static array $requestRangeFilters = [/* champs avec _min/_max */];
protected static array $requestSearchFields = [/* champs pour filter[search] */];
protected static array $requestSortable = [/* champs triables */];
protected static array $requestLoadable = [/* relations via include= */];
protected static array $requestCountable = [/* relations via include=XCount */];
protected static array $queryFields = [/* colonnes via fields[table]= */];
```

Dans les controllers, le pattern est :

```php
// 1. Base query avec contrôle d'accès (business logic)
$base = Property::query();
if (!$user->hasRole(['admin', 'super_admin'])) {
    $base->where('user_id', $user->id);
}

// 2. Spatie prend la main pour les filtres/tri/champs frontend
$paginator = Property::buildQuery($base, $request)
    ->defaultSort('-created_at')
    ->paginate();
```
