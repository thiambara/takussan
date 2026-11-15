# ADR-0122 — Ce que le prestataire lit d'une intervention avant de l'accepter

- **Statut** : Accepté le 2026-11-15 — décision prise à l'implémentation de TCK-2943, « valide tes choix » du porteur, à confirmer à la revue
- **Date** : 2026-11-15
- **Tickets** : TCK-2943 (API), TCK-2946 (écran)
- **Amende** : la projection minimale de TCK-2613 (`GET /api/me/profiles/{sp}/intervention-d-origine`, « jamais le demandeur ») — elle sert désormais les mots du signalement, masqués
- **S'appuie sur** : [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md) (données personnelles), [ADR-0076](0076-le-socle-ia.md) § 5 (`PhoneMasker`)

## Contexte

Mesuré le 2026-11-15 : la route qui montre au prestataire invité la demande jointe à son invitation,
avant qu'il ne finisse son onboarding (donc avant qu'elle ne lui soit assignée), rend une projection
minimale — titre, catégorie, quartier et ville, une photo, un devis. La maquette validée de l'écran 2
de son assistant (`app-entree-assistants-a`, `CarteIntervention`) montre en plus « À traiter sous
48 h », « Signalée par le locataire le 9 nov. · réf. INT-2041 », la citation du locataire et « Voir le
détail ». Le prestataire juge l'intervention avant de l'accepter : pour quand, signalée quand et par
qui, et ce que le locataire en dit.

Trois de ces éléments n'avaient pas de source :

- aucun délai de réponse d'une intervention n'existe, ni dans les réglages d'agence
  (`AgencySettings`), ni dans la plateforme (`booking_pending_expiry_hours` est celui des
  réservations) ;
- `maintenance_requests` n'a aucune colonne de référence ;
- le texte du signalement (`description`) est une écriture libre du locataire : il y met son numéro,
  son nom, sa rue. Le servir à un tiers qui n'a encore rien accepté est une règle d'accès neuve.

## Décision

1. **Le texte du signalement sort, masqué et borné, sous `tenant_quote`** — et seulement quand le
   demandeur est le locataire (`reported_by_role = tenant`) ; sinon `null` (la clé et l'écran le
   présentent comme les mots du locataire). Avant de sortir, le texte (`App\Support\MotsDuSignalement`) :
   - voit ses numéros de téléphone remplacés par `[TELEPHONE]` (`PhoneMasker::mask`, sénégalais et
     étrangers) et ses adresses électroniques par `[EMAIL]` (le motif d'`EvalCaseAnonymizer`) ;
   - voit les valeurs CONNUES du dossier remplacées, mot entier et sans égard à la casse : le prénom
     et le nom du demandeur tels que son compte ET la fiche client du bail rattaché les portent,
     entiers et mot à mot (« Mame Diarra » : « Diarra » seul aussi) (`[NOM]`), la rue du bien
     (`[ADRESSE]`) — une valeur de moins de trois lettres n'est pas cherchée (elle rongerait le texte) ;
   - est coupé à **280 caractères** (un mot entier, suivi de « … »).

   **Ce que ce masquage ne garantit pas** : un texte libre peut nommer autrement (surnom, voisin,
   numéro de porte seul). Le masquage retire ce que le dossier connaît et ce qui a la forme d'un
   contact ; il ne prétend pas anonymiser. C'est pourquoi le texte n'est servi qu'au prestataire
   titulaire de l'invitation, pour la seule demande que l'agence lui a jointe, tant que le lien n'est
   pas consommé (portes inchangées de TCK-2613).

   Le **titre**, écrit par le même auteur, passe par le même masquage (numéros, adresses
   électroniques, valeurs connues), quel que soit l'auteur : il était déjà servi tel quel.

2. **Jamais** le nom, le téléphone, l'adresse électronique ni l'adresse exacte du demandeur en clair,
   sous aucune clé ; ni la note vocale (TCK-2900), ni les consignes d'accès (`access_instructions`).

3. **`reported_by_role`** — `tenant` quand le demandeur est le locataire du bien (le titulaire du
   bail rattaché à la demande, à défaut d'un bail du bien en cours —
   `User::ACTIVE_TENANT_LEASE_STATUSES`, la règle de la création) ; `landlord` quand c'est le
   bailleur du bien ; `agency` sinon (le personnel) ; `null` sans demandeur. Un rôle, jamais une
   identité.

4. **`reported_at`** — la création de la demande (`created_at`), en ISO 8601.

5. **`reference`** — dérivée de l'identifiant, `INT-` suivi d'au moins quatre chiffres
   (`MaintenanceRequest::reference()`, `INT-0042`). Pas de colonne : l'identifiant est déjà dans la
   projection, la référence n'en dit pas plus.

6. **`respond_by`** — un **réglage d'agence** neuf, `maintenance_provider_response_hours` (entier
   0-168, défaut 48, `0` = aucun délai annoncé → `respond_by: null`), écrit par `PATCH
   /api/agencies/{id}` comme les autres réglages. L'échéance compte **depuis l'invitation**
   (`invitations.created_at`), l'instant où l'agence a demandé à CE prestataire : compter depuis la
   création de la demande donnerait une échéance souvent déjà passée à la première ouverture.
   **Indicative** : aucun job ne la fait respecter, rien ne se passe à l'échéance ; une échéance
   passée est rendue telle quelle (l'écran dit « en retard »). C'est le cas d'une invitation restée
   plusieurs jours sans réponse : l'échéance peut être passée dès la première ouverture de l'écran.

7. **`detail_url`** — le chemin de la fiche de l'intervention dans l'application,
   `NotificationTarget::of('maintenance', $id)->path()` (`/app/maintenance/{id}`). La fiche reste
   gardée par sa policy : avant l'acceptation (onboarding non fini, demande non assignée), `GET
   /api/maintenance-requests/{id}` rend 403 au prestataire, et le front le sait.

Les six clés suivent le sparse fieldset de la route (`fields[intervention_d_origine]`).

## Options écartées

- **Servir la description telle quelle** : la donnée personnelle du locataire (son numéro, AC1)
  partirait à un tiers non engagé.
- **Écrire « 48 h » en dur** : le délai est une promesse de l'agence, pas de la plateforme (même
  raisonnement que `booking_pending_expiry_hours`, TCK-575).
- **Colonne `reference`** : une migration et un remplissage pour une valeur que l'identifiant donne.
- **Servir `tenant_quote` quel que soit l'auteur** : la clé et l'écran disent « le locataire » ; un
  texte du personnel présenté ainsi tromperait.

## Conséquences

- Le prestataire invité lit une phrase du locataire avant d'accepter ; ce qu'elle contient au-delà
  des valeurs connues et des formes de contact n'est pas filtré (§ 1).
- Un réglage de plus dans `AgencySettings` (et dans la table de `docs/models-spec.md`), sans écran
  pour l'instant : sa valeur par défaut (48 h) est celle de la maquette.
- La référence `INT-NNNN` peut servir ailleurs (fiche, notifications) par la même méthode.

## Application

- `App\Http\Controllers\Api\Me\ServiceProviderProfileController::projectionDOrigine`,
  `ShowOriginRequestServiceProviderProfileRequest::CHAMPS`, `App\Support\MotsDuSignalement`,
  `MaintenanceRequest::reference()`, `ServiceProviderOnboardingService::echeanceDeReponse()`,
  `AgencySettings` (`maintenance_provider_response_hours`).
- Tests : `tests/Feature/ServiceProvider/InterventionDOrigineProjectionTest.php` (AC1 à AC3, les
  valeurs connues, la coupe, le réglage), `tests/Unit/Support/MotsDuSignalementTest.php`.
