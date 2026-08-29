---
id: TCK-464
title: "Publication d'un bien — parcours guidé, champs conditionnés au type, et l'adresse qui n'était jamais enregistrée"
status: doing
phase: P0
family: full
estimate: L
wave: 51
created: 2026-08-29
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
tags: [front, back, properties, ux, mobile, i18n, bug, formulaire]
---

## Objectif utilisateur

Un bailleur ou un agent publie son bien depuis son téléphone sans jamais voir un champ qui ne
concerne pas ce bien-là, et sans qu'aucune information saisie ne soit perdue en chemin.

## Contrat de données

**Écriture — quatre champs spécifiés sont aujourd'hui injoignables ou irrécupérables :**

| Point d'entrée | Manque | Effet mesuré |
|---|---|---|
| `POST /api/properties` (`StorePropertyRequest`) | `title_type`, `address.postal_code` | `validated()` les jette. `title_type` est pourtant dans `$fillable`, casté en `TitleType`, exposé en lecture par `PropertyResource:69` — il n'a **aucun** chemin d'écriture |
| `PUT /api/properties/{id}` (`UpdatePropertyRequest`) | `title_type`, `floor_number`, `total_floors`, `address.postal_code` | `Store` accepte `floor_number`/`total_floors`, `Update` non : un étage saisi à la création est ensuite **ineffaçable** |
| `PropertyResource` | `available_from` | Le champ s'écrit (`StorePropertyRequest`, `UpdatePropertyRequest`) et ne se relit **jamais** — aucune édition ne peut le pré-remplir |

**Lecture — déjà disponible, rien à créer :** `title_type`, `title_type_label`, `floor_number`,
`total_floors` (`PropertyResource:69,70,75,76`) et `location.postal_code` sont déjà émis et déjà
typés côté front. Le trou est en écriture seule ; aucune migration n'est nécessaire.

⚠ **Une valeur du typage front est fausse.** `src/types/property.ts:10` déclare
`PropertyTitleType = 'bail' | 'titre_foncier' | 'deliberation' | 'other'`, quand
`TitleType::Autre` vaut `'autre'`. La quatrième valeur n'a jamais pu être émise par l'API.
Le défaut est resté invisible parce qu'aucun écran n'écrit ni ne discrimine `title_type` —
il devient visible dès qu'un sélecteur l'expose.

**Adresse — `POST /api/properties` accepte déjà `address` imbriquée** et la crée dans la même
transaction que le bien (`PropertyController::store()`). Le front ne s'en sert pas : il envoie
`city`/`quarter`/`region` au premier niveau — où aucune règle ne les déclare — puis rattrape par un
`PUT /api/properties/{id}/address`.

**Géolocalisation — aucun nouvel appel réseau.** `UserLocationProvider` est déjà monté site-wide et
expose la réponse ipapi (`city`, `region`, `country_code`, `postal`, `latitude`, `longitude`,
`currency`), en cache 24 h. Le précédent d'usage est `HostIndividualWizard`.

**Brouillon repris — endpoint existant.** `GET|PUT|DELETE /api/me/wizard-drafts/{key}` (TCK-250).

## Direction UX / Artistique

**Parcours guidé, pas formulaire.** Une seule question par écran, aucun défilement nécessaire sur
téléphone, six étapes : *le bien* → *où* → *caractéristiques* → *prix* → *photos* → *finition*.
Le formulaire actuel empile une vingtaine de champs sur environ 3 500 px de haut ; c'est ce qui est
remplacé.

**Le type de bien gouverne tout, et il passe en premier.** En pastilles tactiles, avant même le
titre. Un terrain ne demande ni chambres, ni meublé, ni année de construction ; il demande son
statut foncier. Un parking ne demande pas combien il a de places de parking.

**Le titre passe en dernier et arrive pré-composé.** Écrire un titre à froid est la chose la plus
dure du formulaire actuel, où c'est le premier champ. À la sixième étape, tout est connu pour le
proposer — l'utilisateur corrige au lieu d'inventer.

**Le certain est pré-rempli, l'incertain est suggéré.** La géo-IP dit où est *l'utilisateur*, pas
où est *le bien* : pays, devise et centrage de carte sont posés d'office, ville et région arrivent
comme une suggestion à accepter d'un geste. Une valeur pré-remplie ne se relit pas, elle se valide.
Sur mobile, proposer la position réelle de l'appareil, bien plus précise que l'IP.

**Le mouvement porte le sens.** Le changement d'étape glisse dans le sens de la marche — on avance,
ça entre par la droite ; on revient, par la gauche. Les champs d'une étape entrent en cascade. Un
champ conditionnel se déplie en hauteur, il ne surgit jamais sous le doigt. La barre de progression
finit après la transition, pour qu'on la voie avancer. Tout est neutralisé sous
`prefers-reduced-motion` : un glissement horizontal répété six fois est un déclencheur vestibulaire.

**Le ton : une question posée à quelqu'un, et ce qu'elle rapporte.** « Où se trouve-t-il ? / C'est
la première chose qu'on regarde sur une annonce. » Jamais de statistique inventée pour pousser à
remplir.

**L'édition ne devient pas un parcours.** On y vient pour atteindre un champ, pas pour être guidé :
elle reste une page dense, mais lit les mêmes règles de conditionnalité.

Référence obligatoire : [`docs/design-guidelines.md`](../../design-guidelines.md) — palette Lin,
Bricolage Grotesque / DM Sans, primitives `base-nova`.

## Contraintes strictes (métier)

1. **Aucune donnée saisie ne peut être perdue en silence.** Le chemin nominal (titre, type,
   contrat, prix, ville) doit produire une ligne `addresses`. Aujourd'hui il n'en produit aucune :
   la condition qui décide d'enregistrer l'adresse ne teste ni `city`, ni `quarter`, ni `region` —
   c'est-à-dire pas le seul champ d'adresse obligatoire du formulaire.
2. **Un champ non pertinent ne part pas au serveur.** Passer de « Louer » à « Vendre » doit purger
   `rent_period` ; le choix « Terrain » doit purger chambres, salles de bain, meublé et année. La
   règle de pertinence est unique et partagée par la création, l'édition et la validation — pas
   trois conditions écrites à trois endroits.
3. **Les écritures qui suivent la création sont vérifiées.** Tags et photos ont besoin de l'id et
   restent postérieurs, mais leur échec doit être affiché — et affiché pour ce qu'il est : le bien
   *est* créé. La reprise ne recrée pas le bien.
4. **La suggestion géographique n'écrit jamais à la place de l'utilisateur** pour la ville et la
   région : elle doit être acceptée d'un geste, et ce qu'elle a rempli doit être visible.
5. **Le brouillon ne porte aucune donnée sensible** (contrat `useWizardDraft`, TCK-250).
6. **Les libellés appartiennent au front** (principe non négociable n° 5) : `fr`, `en`, `wo`.
7. **Toute lecture d'API passe par des sparse fieldsets** (`docs/spatie-query-builder.md`).

## Delta à produire

**Backend — prescriptif**

- [ ] `StorePropertyRequest::rules()` : `+ 'title_type' => ['nullable', Rule::enum(TitleType::class)]`,
      `+ 'address.postal_code' => ['nullable', 'string', 'max:20']`
- [ ] `UpdatePropertyRequest::rules()` : `+ 'title_type'` (`sometimes|nullable`),
      `+ 'floor_number'`, `+ 'total_floors'` (`sometimes|nullable|integer`),
      `+ 'address.postal_code'` (`sometimes|nullable|string|max:20`)
- [ ] `PropertyResource` : `+ 'available_from' => $this->whenHas('available_from', …)` — `whenHas`
      et non un accès nu (TCK-336)
- [ ] Tests `tests/Feature/Api/Property/PropertyWritableFieldsTest.php` : `title_type` posé à la
      création puis modifié ; `floor_number`/`total_floors` modifiés ; `address.postal_code`
      persisté des deux côtés ; `available_from` relu dans la réponse

**Frontend — intentionnel**

- [ ] Une règle de pertinence des champs unique, dérivable du couple (type, contrat), lisible par
      la création, l'édition et la sérialisation du payload
- [ ] Parcours guidé de création en six étapes, validation par étape (ne jamais bloquer sur un
      champ non atteint), reprise du brouillon via l'endpoint existant
- [ ] Rendu desktop du parcours qui n'est pas une colonne mobile étirée
- [ ] Suggestion géographique acceptable d'un geste + position de l'appareil sur mobile
- [ ] Titre pré-composé à la dernière étape, côté client, modifiable
- [ ] L'adresse part imbriquée dans la création du bien, plus en écriture différée
- [ ] Résultats de l'association des tags et de l'envoi des photos vérifiés et affichés
- [ ] Écran d'édition aligné sur la même règle de pertinence, et exposant `title_type`,
      `available_from`, `floor_number` / `total_floors`
- [ ] Type `PropertyDetail` : `+ available_from` ; `PropertyTitleType` : `'other'` → `'autre'`
- [ ] Libellés `fr` / `en` / `wo`, dont le vocabulaire de `TitleType`, aligné **au caractère près**
      sur `takussan-api/lang/<locale>/properties.php` — puis `title_type` ajouté aux `GROUPES` de
      `src/types/__tests__/property-labels.parity.test.ts`, dont le commentaire dit aujourd'hui
      « n'a pas de pendant front ». Cela **resserre** la garde sans ajouter aucune tolérance ;
      la liste `DIVERGENCES_CONNUES` ne doit pas grossir d'une seule entrée.
- [ ] Neutralisation du mouvement sous `prefers-reduced-motion`, **portée aux animations de ce
      parcours seulement** : `globals.css` n'a aujourd'hui aucun bloc `prefers-reduced-motion`, et
      en poser un global neutraliserait aussi `fadeInUp`, `cardEnter` et `sectionEnter` sur tout le
      site — un changement qui ne s'instruit pas depuis ce ticket
- [ ] Tests : conditionnalité par type dans les deux modes, purge sur bascule de contrat,
      validation par étape, et **le test de non-régression de l'adresse** (cf. AC1)

## Critères d'acceptation

- [ ] **AC1** — Une création qui ne renseigne que titre, type, contrat, prix et **ville** produit
      une ligne `addresses` portant cette ville. *Ce test échoue sur le code actuel* — c'est la
      condition pour que le défaut soit corrigé et non contourné.
- [ ] **AC2** — Type « Terrain » : ni chambres, ni salles de bain, ni meublé, ni année de
      construction, ni équipements domestiques ne sont proposés ; le statut foncier l'est. Vérifié
      à la création **et** à l'édition.
- [ ] **AC3** — Type « Appartement » : chambres, salles de bain, étage et année sont proposés ;
      « nombre de niveaux » ne l'est pas.
- [ ] **AC4** — Une saisie de loyer suivie d'une bascule vers « Vendre » envoie un payload sans
      `rent_period` ni `available_from`.
- [ ] **AC5** — `title_type` saisi à la création est relu sur la fiche, puis modifié depuis
      l'édition et relu modifié. Même chose pour `floor_number` et `address.postal_code`.
- [ ] **AC6** — La suggestion géographique laisse ville et région **vides** tant qu'elle n'est pas
      acceptée ; une fois acceptée, les champs remplis sont distinguables à l'écran.
- [ ] **AC7** — Un échec d'envoi des photos affiche un message qui dit que le bien est créé, et la
      reprise n'en crée pas un second.
- [ ] **AC8** — Sous `prefers-reduced-motion: reduce`, aucune translation ne subsiste.
- [ ] **AC9** — Le parcours est utilisable à 360 px de large sans défilement horizontal, et le
      bouton d'action de chaque étape est hors de la zone défilante : il reste atteignable quel que
      soit le contenu de l'étape, clavier virtuel ouvert compris. *(Formulé sur la position du
      bouton, et non sur « aucune étape ne défile » : une étape peut légitimement défiler — ce qui
      ne doit jamais arriver, c'est que le moyen d'avancer sorte de l'écran.)*
- [ ] **AC10** — `npm run lint`, `npx tsc --noEmit`, `npm run test`, `./vendor/bin/pint --test` et
      `php artisan test` verts ; aucune chaîne affichée en dur hors dictionnaire.

## Hors périmètre

- Sélection d'un propriétaire dans le formulaire, et l'option « Inviter un propriétaire » qui en
  dépend (TCK-256 en porte la note).
- Hiérarchie de biens (`parent_id`, immeuble → lots) — TCK-086.
- Autocomplétion d'adresse par un service tiers (Google Places, Nominatim) : la suggestion reste
  la géo-IP déjà présente plus la carte existante.
- Modération et publication (`status`, `visibility`) : les intentions « brouillon » et « soumettre »
  du pied de formulaire sont reconduites telles quelles.
- Réorganisation et recadrage des médias après publication — `MediaManager` / TCK-071.
- Colonnes `lot_position` et `level`, hors du champ de ce parcours.
- Toute migration de schéma : les quatre champs concernés existent déjà en base.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
