---
id: TCK-2601
title: "Le compte au moment de publier : numéro, code, prénom et nom dans une feuille, puis l'annonce en ligne sans détour"
status: todo
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-13
depends_on: [TCK-2600, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2602]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#3-property"
tags: [front, publish, auth, acquisition, mobile, audit-ux, app]
---

## Objectif utilisateur

Le propriétaire qui a fini son annonce touche « Publier », donne son numéro, le code reçu, son prénom et son nom, et son annonce est en ligne — sans modale, sans écran « Création de votre espace… », sans rien ressaisir.

## Contrat de données

Endpoints existants, consommés dans cet ordre (re-mesuré sur `dev`, 1bce3798a) :

1. `POST /api/auth/phone/request-code` puis `POST /api/auth/phone/verify-code` (TCK-589) : le compte naît au premier code d'un numéro inconnu ; la réponse porte `token`, `user`, `is_new_account`, ou `requires_2fa` / `requires_terms` (compte né du Radar).
2. Prénom, nom et case WhatsApp : `PUT /api/auth/profile` (`updateContactPreferencesAction`, `first_name`, `last_name`, `phone_whatsapp`) — ce qu'écrit aujourd'hui le bloc « Vos coordonnées pour les intéressés » (`CoordonneesPublication`, clés `property.form.publishContact.*`).
3. L'espace : la décision d'aujourd'hui (`decidePublishIntent`) appliquée au compte qui vient d'entrer — aucun espace → `POST /api/host/individual/auto-onboard` (drapeau serveur `host_auto_space`, 403 `disabled` → assistant hôte) ; un espace → bascule du profil actif si besoin ; plusieurs → « Où publier ce bien ? ».
4. Puis les écritures de l'assistant, inchangées : création du bien, équipements, photos une à une, contacts sur place, `POST …/publish` avec `acceptTerms` (`PublishReadiness` : prénom et téléphone vérifié du contact, CGU), statut rendu (`available` ou `pending_review`).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-publier&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Le compte, à la publication » et « Code, prénom et nom ».
- **Téléphone (360-390 px)** : « Publier » ouvre une feuille du bas (80 % de la hauteur) : rappel de l'annonce (vignette, titre, loyer, « prête à publier »), « Dernière étape : votre numéro », « Les visiteurs vous appelleront ou vous écriront sur WhatsApp. Nouveau ou déjà inscrit, un code par SMS suffit. », numéro (+221 hors du champ), case « Ce numéro reçoit WhatsApp », phrase des CGU, « Recevoir un code » collé au-dessus du clavier, Google discret. Second état, même feuille : « Code envoyé au … · Modifier », six cases, renvoi à rebours, **Prénom et Nom côte à côte** (décision 1a), « Publier mon annonce » et la phrase « En publiant, vous acceptez… ».
- **Bureau (≥ 1280 px)** : le même contenu dans un panneau qui remplace la colonne gauche, « Revenir à l'annonce » au-dessus ; l'aperçu reste à droite ; trois assurances sous le panneau (« Pas de mot de passe à inventer », « Gratuit, sans commission », « Annonce retirable à tout moment ») — la deuxième n'est écrite que si elle est vraie pour l'espace qui publiera (cf. contraintes).
- Ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md), [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).
- **La feuille remplace le bloc « Vos coordonnées pour les intéressés » dans l'assistant, sans perdre une donnée qu'il collecte** : prénom, nom, numéro vérifié par code, réponse WhatsApp (une case décochée est une réponse « non » et s'enregistre), acceptation des CGU par la phrase, affichage des numéros déjà vérifiés du compte (principal et second) et de leur WhatsApp, question WhatsApp posée une fois à un numéro vérifié sans réponse, message « le contact de ce bien est un autre » quand l'API le dit (`contactEstSoi`), réconciliation avec ce que l'API dit manquer (`manquantsServeur`).
- **Prénom et nom sont tous deux requis dans la feuille** (décision 1a du porteur) ; l'API ne change pas (`PublishReadiness` n'exige que le prénom). Un compte qui a déjà les deux ne les ressaisit pas ; un compte qui n'a que le prénom voit le nom seul.
- Le composant `CoordonneesPublication` reste servi tel quel par la boîte « Avant de publier » des boutons « Publier » de la liste et de l'en-tête d'un bien (`PublicationAvecCoordonnees`) : ce ticket ne touche que l'assistant.
- Un utilisateur **déjà connecté** qui publie depuis l'assistant voit la même feuille réduite à ce qui lui manque (`manquesLocaux`) ; rien à compléter → publication directe.
- **Tous les états de la connexion par téléphone d'aujourd'hui restent** dans la feuille : code faux, numéro invalide (422), indicatif refusé, trop de demandes (429), verrou (423), compte suspendu, second facteur (code d'application ou de récupération, « Annuler »), conditions d'un compte né du Radar, code affiché hors production (« Environnement de test », « Utiliser ce code »), renvoi à 60 s, changer de numéro. Session ouverte par `useAuth().openSession` seulement.
- **Drapeau `auth.phone_login.enabled` éteint** (ADR-0033 ; allumé en préproduction depuis le 2026-10-10 et dans `deploy/takussan/env.api.production.example`, faux par défaut dans `config/auth.php`) : la feuille ouvre la voie e-mail d'aujourd'hui (connexion ou inscription par adresse et mot de passe), puis la vérification du numéro par le code sous session d'aujourd'hui ; le numéro vérifié reste exigé, aucune donnée de la liste ci-dessus n'est perdue.
- **Où va l'annonce** : publication directe seulement pour un compte sans espace (espace personnel créé pendant la publication) ou avec un seul espace `individual`. Un compte qui a un espace d'agence `standard`, ou plusieurs espaces, ou un profil bailleur seul (mode proposition) : le brouillon est versé au brouillon serveur, l'espace est choisi (« Où publier ce bien ? » si plusieurs), et l'assistant connecté s'ouvre à la dernière étape, avec ses champs d'agence (bailleur, frais d'agence, quota, proposition) — rien n'est publié sans eux.
- Quota atteint, refus de publication, échec partiel (photos, équipements, contacts) : le bien créé n'est jamais recréé, les photos passées ne repartent pas (comportement d'aujourd'hui), le brouillon reste, et l'écran dit ce qui manque.
- Un brouillon serveur antérieur du compte (une autre annonce commencée connecté) n'est ni écrasé ni effacé par la publication du brouillon local ; il reste proposé à la reprise.
- Le brouillon local est effacé après la publication réussie, jamais avant.
- **Aucune modale de bienvenue et aucun écran de transit plein** entre le code et l'annonce en ligne (TCK-2615 garde la règle côté `/app`).
- « Gratuit, sans commission » : écrit seulement si la plateforme ne prélève rien à un espace particulier — à confirmer au code (quota, crédits) avant d'écrire la phrase ; sinon la ligne disparaît.
- Libellés neufs en `fr`/`en`/`wo` ; « Valider » n'apparaît plus sur le bouton du code.

## Delta à produire

- [ ] Feuille de compte (téléphone) et panneau (bureau) ouverts par « Publier ».
- [ ] Enchaînement : code → session → prénom, nom, WhatsApp → espace (auto-création, bascule, choix, ou retour à l'assistant connecté) → écritures de l'assistant → sortie (TCK-2602).
- [ ] Retrait du bloc `CoordonneesPublication` de l'étape Finition de l'assistant (le composant reste pour `PublicationAvecCoordonnees`).
- [ ] Tests : compte neuf publie en ligne (ordre des appels) ; numéro d'un compte à deux espaces → choix puis assistant connecté, rien de publié ; bailleur d'agence → proposition, pas de publication ; second facteur ; quota atteint garde le brouillon ; brouillon serveur antérieur intact ; case WhatsApp décochée enregistrée `false` ; connecté sans prénom ne voit que le prénom.

## Critères d'acceptation

- [ ] AC1 — Un numéro inconnu, code juste, « Awa » / « Diop » : au réseau, `verify-code` → `PUT /api/auth/profile` (`first_name=Awa`, `last_name=Diop`, `phone_whatsapp`) → `auto-onboard` → création → `…/publish` ; le bien est `available` et le compte porte prénom et nom.
- [ ] AC2 — Entre le code et l'écran de sortie, aucun dialogue de bienvenue n'est monté et aucune page « Création de votre espace… » n'est rendue (DOM).
- [ ] AC3 — Le numéro d'un agent d'une agence `standard` : aucun `POST …/publish` n'est émis ; l'assistant connecté s'ouvre sur la dernière étape avec le choix du bailleur et les frais d'agence, valeurs du brouillon reprises.
- [ ] AC4 — Un compte qui avait un brouillon serveur « Villa à Ngor » publie son brouillon local : le brouillon « Villa à Ngor » est toujours proposé à la reprise.
- [ ] AC5 — À 390 px, clavier émulé, « Recevoir un code » puis « Publier mon annonce » restent visibles ; à 1280 px, l'aperçu reste affiché à droite pendant tout le compte.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2601.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'écran de sortie « Votre annonce est en ligne » (TCK-2602).
- La boîte « Avant de publier » de la liste et de l'en-tête d'un bien (inchangée).
- La connexion par WhatsApp (P3, `features.md` § 2.3).

## Notes d'implémentation

### Ce qui est fait (2026-11-13, terrain-9)

- **La feuille connectée** (`FeuilleDePublication`, `manquesDeLaFeuille`) remplace `CoordonneesPublication` dans l'assistant ; `CoordonneesDeLAssistant` garde, à la Finition, les numéros vérifiés du compte (`ListeDesNumerosVerifies`, exportée de `CoordonneesPublication`, qui reste servi tel quel par `PublicationAvecCoordonnees`) et la phrase des CGU. Le contact jugé est l'auteur, sauf bailleur désigné (`TitulaireALaSaisie`, `PrimaryPropertyContact`) : un bailleur désigné n'ouvre pas la feuille. Les champs sont figés au montage ; un refus de l'API (`missing`) rouvre la feuille sur ce qu'elle dit manquer, ou dit « le contact de ce bien est un autre ».
- **La feuille sans compte** (`FeuilleSansCompte`) : numéro et case WhatsApp, puis code, prénom et nom côte à côte, « Publier mon annonce » qui vérifie. Les états de la connexion par téléphone sont ceux de `ConnexionParTelephone`, dont la logique est extraite telle quelle dans `useEntreeParTelephone` (option `auSixiemeChiffre`) : code faux, 422, 429, 423, suspendu, second facteur, conditions d'un compte né du Radar, code hors production, renvoi, changer de numéro ; session par `openSession` seulement. Après la session, `profilAEcrire` n'écrit que ce que le compte rendu n'a pas (un compte existant n'est pas écrasé).
- **L'espace** (`PublierSansCompte.preparerLEspace`, rejugé sur les profils RELUS à chaque tentative) : aucun → `auto-onboard` (`disabled` → `/onboarding/host`, l'annonce reste dans ce navigateur) ; un seul espace `individual` où l'on n'est pas que bailleur → bascule si besoin, publication en place (un profil bailleur seul, même dans un espace `individual`, est versé : lecture prudente de « bailleur seul », l'en-tête de `usePublishIntent` le compte hôte) ; sinon (AC3 : agence `standard`, bailleur seul, plusieurs espaces) l'annonce est **versée au brouillon serveur sous la clé `property-create-wizard:publication`**, puis « Où publier ce bien ? » (plusieurs espaces, `ListeDesEspaces`, partagée avec `/publish`) et `/app/properties/new?brouillon=publication`. Aucun `POST …/publish` n'est émis sur ce chemin.
- **Les quatre conditions de la clé à part** (décision de la session principale du 2026-11-13) : (1) avec `?brouillon=publication`, l'assistant connecté ne monte que `useWizardDraft('property-create-wizard:publication')` — `property-create-wizard` n'est jamais monté, donc ni lu, ni écrit, ni effacé (AC4) ; (2) un refus du versement (422 sur `key` : 20 brouillons ; sur `data` : 256 Ko) se dit et l'annonce reste dans ce navigateur, sans navigation ; (3) publié, la clé serveur ET le brouillon local s'effacent, après la publication, jamais avant ; (4) le bandeau de reprise a une ligne à elle (« Annonce commencée sans compte », règle exacte de `wizard-drafts.ts`). Relevé sur l'API locale : la clé encodée (`%3A`, comme le front) et la clé brute désignent la même ligne (PUT 201, GET 200, DELETE 204).
- **Les photos** d'une annonce versée vivent dans le navigateur où elles ont été ajoutées (ADR-0093) : l'assistant connecté les reprend d'IndexedDB ; absentes (un autre appareil), l'écran le dit — seulement quand l'annonce versée a bien été reprise (après une publication ou une purge, rien à dire). Toutes les sorties réussies (en ligne, en vérification, proposition du bailleur, « continuer quand même » d'un échec partiel) passent par `terminer`, qui efface les deux brouillons.
- Versé : les seules clés de l'annonce (`valeursDeLAnnonce`, la liste fermée d'ADR-0093) ; les contacts sur place ne passent pas la navigation (l'écran le disait déjà sous leur cadre).

### r1 — pas de second versement après « Précédent » (2026-11-13)

Décision de la session principale : au versement réussi, le brouillon local est **marqué** (`verse: { le, cle }`, troisième clé du magasin IndexedDB) sans être effacé — ses photos n'existent que là. Deux barrières indépendantes :

- `/publish` qui trouve un brouillon marqué (`useBrouillonLocalPresent` → `'verse'`) n'ouvre pas l'assistant sans compte et ne décide rien d'autre : `router.replace('/app/properties/new?brouillon=publication')`, connecté ou non (sans session, la connexion y ramène) ;
- une page gardée telle quelle par le routeur, ou remontée sur le même navigateur, ne reverse pas : `preparerLEspace` saute le `PUT` quand la marque existe, et mène à la même reprise (avec le choix de l'espace s'il y en a plusieurs).

L'effacement réel reste dans `terminer()` de l'assistant connecté, qui emporte la marque avec l'annonce. Un versement refusé (422) ne marque rien. Le repli en mémoire (quota) garde la marque. Non relevé au navigateur : il faudrait un compte d'agence et une écriture au brouillon serveur, à demander d'abord.

### Données locales créées par les mesures (base de développement, rien n'est supprimé)

- `espace-apres-auto-onboard.py` (numéro neuf `+22177…` aléatoire → code → session → `auto-onboard` → création d'un bien) : utilisateur **185**, agence individuelle **7**, biens brouillons **583** et **584** titrés « Mesure 2601 ».
- `plafond-brouillons.py` (forme du 422 au 21e brouillon et au-delà de 256 Ko) : un second compte de mesure à numéro aléatoire ; ses 20 brouillons `mesure-{0..19}` ont été effacés par le script, le compte reste.
- `cle-encodee.py` (la clé `property-create-wizard%3Apublication` = la clé brute) : un brouillon écrit puis effacé (PUT 201, DELETE 204) sur le compte de démo dont le jeton est gardé hors du dépôt ; rien ne reste.
- Les trois scripts sont dans le bloc-notes de la session (`impl/lot2/2601/mesures/`), lancés contre `http://127.0.0.1:8002/api` ; ils n'impriment que des statuts et des identifiants.

### Écarts au ticket

- **Panneau de bureau (AC5, 1280)** : non fait — la feuille reste la `FeuilleDuBas`, modale dès `md`. Les trois assurances sous le panneau, dont « Gratuit, sans commission », viennent avec lui.
- **Google** n'est pas dans la feuille.
- **Drapeau `auth.phone_login.enabled` éteint** : « Publier » mène à la connexion d'aujourd'hui, l'annonce restant dans ce navigateur ; revenu sur `/publish` avec elle, le visiteur connecté retrouve l'assistant et la feuille réduite à ce qui lui manque (numéro vérifié par le code sous session). La voie e-mail n'est pas DANS la feuille.
- **TCK-643, AC4 — nouvelle lecture** (confirmée par la session principale le 2026-11-13). Le ticket dit : « La publication reste possible exactement dans les mêmes cas qu'avant ». Elle se lit désormais : *la publication reste possible dans tous les cas où l'API l'accepte, et la feuille ne s'ouvre jamais pour un compte que l'API publierait ; un auteur dont le numéro principal n'est pas vérifié — cas où l'API refusait en 422 — reçoit la feuille AVANT toute écriture, au lieu de la création puis du refus.* Seule exigence plus stricte que `PublishReadiness`, et voulue : le nom (décision 1a du porteur) et la réponse WhatsApp d'un numéro vérifié qui n'en a jamais reçu (« question posée une fois », ce ticket). Gardé dans `PropertyWizard.publication.tck-633.test.tsx` par l'`it.each` « AC4 » et son inverse « AC4 inverse » : WhatsApp oui, WhatsApp non, second numéro saisi non vérifié, second vérifié sans réponse WhatsApp, CGU jamais acceptées → pas de feuille, `POST …/publish` part. Ablations rouges : exiger aussi le second numéro vérifié, tenir « non » à WhatsApp pour un manque, exiger les CGU dans la feuille.
- **Fidélité (AC-F1 à AC-F6)** : non faite.

