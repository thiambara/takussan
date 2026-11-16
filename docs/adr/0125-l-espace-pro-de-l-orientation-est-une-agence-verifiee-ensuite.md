# ADR-0125 — L'espace pro de l'orientation est une agence, ouverte tout de suite et vérifiée ensuite ; d'ici là, elle ne se montre pas au public et n'est pas reversée

- **Statut** : Accepté le 2026-11-15 — décision prise à l'implémentation de TCK-2937, « valide tes choix » du porteur (option la plus sûre à chaque point), à confirmer à la revue
- **Date** : 2026-11-15
- **Tickets** : TCK-2937 (API), TCK-2938 (écran)
- **S'appuie sur** : [ADR-0104](0104-l-identite-legale-de-l-agence-n-a-qu-une-source.md) (identité légale, vérification), [ADR-0039](0039-les-sorties-d-argent.md) (reversements), [ADR-0048](0048-effet-d-une-suspension-d-agence.md) (suspension)
- **Amende** : le chemin « espace individuel, puis passage en pro sur approbation » ([TCK-267](../backlog/tickets/done/TCK-267-form-upgrade-individual-to-standard.md)) n'est plus le SEUL chemin vers une agence `standard` ouverte par son propre administrateur.

## Contexte

Relevé sur `dev` (c7fe709af) le 2026-11-15 :

- Une agence `standard` naît par deux chemins seulement :
  - la console du super-admin (`AgencyProvisioningService`) ;
  - l'approbation d'un passage en pro (`AgencyKindFlipService`).
  
  Dans les deux, une personne de la plateforme a regardé avant. `POST /api/agencies`, qui ouvrait une agence `standard` à tout compte connecté, a été retirée ([TCK-2311](../backlog/tickets/done/TCK-2311-titre-d-administrateur-principal.md), P225.06).
- **Ces deux chemins laissent l'agence `is_verified = false`** jusqu'à la vérification du dossier KYC (`KycWorkflowService::verify`). Une agence non vérifiée publie déjà au public, et apparaît déjà dans l'annuaire. Seul le reversement lui est refusé : `PlatformPayoutService::approve` rend 422 `platform_payout.agency_unverified` pour une agence `standard` non vérifiée.
- La maquette de l'orientation (`app-entree-orientation`) promet : « Ton espace d'agence s'ouvre tout de suite : équipe, bailleurs, mandats », puis « Sous 48 h · Notre équipe vérifie l'agence (NINEA, registre du commerce) ».
- Le ticket dit « même refus que le passage en pro (TCK-601) » pour un NINEA déjà pris. **Ce refus n'existe pas** : `SharedLegalIdentifierDetector` est un signal pour la revue, jamais un refus.

## Décision

**`POST /api/me/agencies` ouvre, en une transaction :**

- une agence `standard`, `active`, non vérifiée ;
- son administrateur principal, qui est l'appelant ;
- son dossier de vérification.

**Jusqu'à la première vérification, l'agence travaille en interne mais ne se montre pas au public et n'est pas reversée.**

1. **Ce qui naît.**
   - L'agence porte le nom saisi, le téléphone saisi (à défaut, celui du compte) et, si elle est donnée, la ville principale du référentiel. La ville devient l'adresse « Siège » (`geo_city_id`).
   - L'appelant en est `primary_admin_id`, avec un `AgencyAdminProfile` **actif**, posé comme profil actif (cookie). Il a aussi un `AgentProfile`, comme l'admin de la console.
   - Le dossier KYC est ouvert, `pending`. C'est `KycWorkflowService::dossierForAgency`, le même que la page Vérification.
   - Aucun espace individuel, aucun `OwnerProfile`, aucune demande de passage en pro.
2. **Qui peut.**
   - 409 `agency.already_admin` si l'appelant est déjà `primary_admin_id` d'une agence, ou s'il tient un `AgencyAdminProfile` actif, de quelque sorte d'agence que ce soit.
   - Qui a déjà un espace individuel garde son chemin : le passage en pro.
   - La ligne du compte est verrouillée : deux clics ne font pas deux agences.
   - **Un numéro de téléphone vérifié** sur le compte, sinon 422 `agency.phone_unverified`. L'agence non revue envoie des invitations sous son nom : la plateforme doit savoir qui la tient. C'est la même exigence que l'espace individuel, qui demande l'OTP.
   - Un agent d'une autre agence peut ouvrir la sienne. Le modèle admet plusieurs profils dans plusieurs agences, et l'isolation se juge par le profil actif (principe 2). La clé `agency_member.already_in_other_agency` n'est lue par aucun code.
3. **NINEA déjà pris : refus** (règle neuve). Un NINEA saisi et déjà porté par une autre agence rend 422 `agency.ninea_taken`. « Porté » se juge par `agencies.ninea`, ou par une demande de passage `pending` ou `approved`. La comparaison est celle de `SharedLegalIdentifierDetector::normalize`.
   - Le passage en pro reste un signal pour le super-admin, qui regarde la demande.
   - Ici personne ne regarde avant l'ouverture : un refus est la seule garde.
   - Le RIB n'est pas demandé à l'ouverture, donc pas comparé.
   - **Une agence ouverte en libre-service et jamais vérifiée ne compte pas comme porteuse.** Le NINEA est public : sans cette exception, quiconque le saisit en premier bloquerait le vrai titulaire. Le doublon reste visible du super-admin à la vérification (`SharedLegalIdentifierDetector::forAgency`).
4. **Ce que l'agence non vérifiée peut faire** : tout le travail interne.
   - Inviter son équipe et ses bailleurs.
   - Saisir ses biens, ses mandats et ses baux.
   - Encaisser par la plateforme. L'argent reste chez la plateforme, voir le § 5.
   - **Aucun abonnement n'est posé** à l'ouverture, et rien n'est prélevé. L'agence lit `me/subscription` et `me/quota` comme toute agence sans abonnement. L'abonnement payant reste posé par un geste de la plateforme ([ADR-0104](0104-l-identite-legale-de-l-agence-n-a-qu-une-source.md) § 6 pour le passage en pro). Le poser à la vérification serait une autre décision, du porteur.
5. **Ce qu'elle ne peut pas faire, tant qu'elle n'a jamais été vérifiée (§ 6) :**
   - **Mettre un bien en ligne.** Toute sauvegarde qui rendrait un bien public rend 422 `agency.unverified_publication`. Le contrôle est au point commun de toute sauvegarde Eloquent, `PropertyObserver` : il couvre `publish`, `visibility`, `status`, `store`, `update`, les lots et l'approbation de la modération d'agence. Un bien en ligne déplacé vers l'agence se juge comme une mise en ligne. Un bien privé, un brouillon, un bien loué se gèrent sans restriction. Aucune écriture de l'application ne contourne l'observateur : relevé du 2026-11-15, aucun `saveQuietly`, `withoutEvents` ni `update` de requête sur `status`, `visibility` ou `published_at` hors des seeders.
   - **Paraître dans l'annuaire public des agences**, sur sa fiche publique ou dans son portefeuille public (404 comme une agence inconnue).
   - **Être reversée.** C'est la règle existante `platform_payout.agency_unverified`, qui vaut pour toute agence `standard` non vérifiée.
   - **Recevoir les crédits de bienvenue** : `SpaceCreated` n'est pas déclenché. Ce sont les crédits que TCK-2311 a retirés à l'ouverture libre d'une agence.
6. **Le marqueur.** La colonne `agencies.self_opened_at` date l'ouverture en libre-service. Elle n'est ni remplissable ni modifiable par aucune route. La restriction du § 5 se juge par `self_opened_at IS NOT NULL AND NOT is_verified AND verified_at IS NULL` (`Agency::awaitsFirstVerification()`) : c'est la **première** vérification qui la lève.
   - Elle ne touche donc aucune agence existante : les agences de la console et celles d'un passage en pro gardent leur comportement d'aujourd'hui.
   - Si la vérification expire plus tard, `kyc:expire-dossiers` retire `is_verified` mais garde `verified_at`. L'agence suit alors la règle commune de toute agence échue : pas de reversement, fiche et biens en ligne gardés. La restriction de l'ouverture ne revient pas.
7. **L'agence refusée.**
   - Le refus du dossier (`KycWorkflowService::reject`) ne supprime rien. L'agence reste ouverte, non vérifiée, sous les restrictions du § 5.
   - L'admin corrige ses pièces et soumet à nouveau.
   - Une agence frauduleuse se suspend par la modération existante (ADR-0048). Aucune suppression automatique : une agence a pu déjà saisir des baux.
8. **« Sous 48 h » n'est pas promis.** La plateforme ne mesure aucun délai de revue et n'a aucun engagement de service écrit. L'écran (TCK-2938) dit « Notre équipe vérifie l'agence (NINEA, registre du commerce) », sans délai.
   - Si un délai est promis un jour, il court à la **soumission** des pièces, pas à l'ouverture.
   - Cette promesse demande une décision du porteur et une mesure.

## Conséquences

- Un professionnel travaille dans son agence dès l'orientation. Ce qui touche le public et l'argent attend une personne de la plateforme.
- La vitrine d'une agence ouverte en libre-service n'existe qu'après sa vérification. Ses biens publiés avant ne le sont pas : ils restent privés, et l'admin les met en ligne une fois vérifié.
- **Résidu accepté** : l'annuaire des agents n'inscrit qu'un agent qui a un bien en ligne (`PublicAgentController::index`), ce qui est impossible avant la vérification. La fiche d'un membre, atteinte par son lien, peut nommer l'agence. Elle ne mène à aucun bien en ligne.
- `docs/models-spec.md` gagne `agencies.self_opened_at` (à la synchronisation des specs).

## Options écartées

- **Garder « individuel puis passage en pro »** : le professionnel attend une revue avant d'avoir une équipe, contraire à la promesse de l'écran.
- **Laisser l'agence publier comme les autres agences non vérifiées** : n'importe quel compte pourrait mettre en ligne des annonces sous un nom d'agence que personne n'a regardé. Les deux chemins existants ont une revue humaine avant, celui-ci n'en a pas.
- **Masquer à la lecture** (`Property::scopePublic` et l'index de recherche) au lieu de refuser à l'écriture :
  - il touche toutes les lectures publiques, réservations et visites comprises ;
  - il demande une réindexation à la vérification.
  
  Le refus à l'écriture est local et se lit dans un code.
- **Restreindre toute agence `standard` non vérifiée** : régression sur les agences de la console et les passages en pro, qui publient aujourd'hui.
- **Un signal au lieu d'un refus pour le NINEA** : il n'y a pas de revue avant l'ouverture pour le lire.

## Application

- `POST /api/me/agencies`, servi par :
  - `MeAgencyController@store` ;
  - `StoreOwnAgencyRequest` ;
  - `OwnAgencyOpeningService`.
- Champs : `name`, `geo_city_id`, `phone`, `ninea`. La liste des villes est `GET /api/public/geo/cities`, déjà servie.
- Migration `2026_11_15_2937…` : `agencies.self_opened_at`.
- `Agency::awaitsFirstVerification()`, et le scope `Agency::visibleInPublicDirectory()` lu par `PublicAgencyController`.
- Garde : `PropertyObserver` (422 `agency.unverified_publication`).
- Tests : `tests/Feature/Onboarding/OrientationCreateAgencyTest.php`.
