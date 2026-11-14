---
id: TCK-2601
title: "Le compte au moment de publier : numéro, code, prénom et nom dans une feuille, puis l'annonce en ligne sans détour"
status: done
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-14
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

- [x] AC1 — Un numéro inconnu, code juste, « Awa » / « Diop » : au réseau, `verify-code` → `PUT /api/auth/profile` (`first_name=Awa`, `last_name=Diop`, `phone_whatsapp`) → `auto-onboard` → création → `…/publish` ; le bien est `available` et le compte porte prénom et nom.
  - *Preuve (2026-11-14, joué au navigateur contre l'API locale)* : Chrome, `/publish` sans compte, numéro inconnu `+221 77 581 28 10` (absent de `users` avant), « Awa » / « Diop », case WhatsApp cochée → `/app/properties/593/en-ligne`, « Votre annonce est en ligne ». Ordre relevé côté serveur (`activity_log`, ids croissants) : 14591-14592 `User#200` créé, téléphone vérifié (`verify-code`, 13:05:07) → 14593 `User#200` mis à jour, champs `first_name,last_name` (`PUT /api/auth/profile`, 13:05:09) → 14594-14597 `Agency#12` créée (`individual`), `AgencyAdminProfile#16`, `OwnerProfile#37`, `host_individual_onboarded` (`auto-onboard`) → 14598 `Property#593` créé → 14599 `Property#593` mis à jour `status,visibility,published_at` (`…/publish`, 13:05:10). Lecture SQL : bien 593 `status=available`, `published_at` posé ; utilisateur 200 `first_name=Awa`, `last_name=Diop`, `phone_whatsapp=true`, téléphone vérifié. Pilote SMS vérifié avant l'envoi : `router`, aucune ligne `integrations` `sms_%`, aucune clé `SMS_*` dans `.env` ; le code est l'aperçu hors production.
- [x] AC2 — Entre le code et l'écran de sortie, aucun dialogue de bienvenue n'est monté et aucune page « Création de votre espace… » n'est rendue (DOM).
  - *Preuve* : `src/app/publish/__tests__/page.sans-detour.tck-2601.test.tsx` « AC2 — aucun dialogue de bienvenue, aucune page « Création de votre espace… » entre le code et « en ligne » » : rendu réel de `PublishPage` → `PublierSansCompte` → assistant → feuille, décision réelle (`usePublishIntent` sur `useMyProfiles`), session réellement ouverte en cours de route ; seules les frontières du réseau sont doublées. Un `MutationObserver` relève tout montage du clic « Publier l'annonce » à la navigation vers `/en-ligne` : un seul dialogue (la feuille), aucun texte « Création de votre espace » ni « Bienvenue » ; `autoOnboard` appelé une fois. **Ablation** : la règle d'avant TCK-2601 (`sansCompte = !verse && decision.status === 'anonymous'`) → rouge (« Création de votre espace » relevé, puis seconde création d'espace) ; fichier restauré, md5 vérifié. Retirer le seul loquet `assistantMonte`, ou le seul `brouillonLocal === true`, reste vert : sur ce chemin, chacun suffit (l'annonce est dans ce navigateur), deux gardes redondantes. **Au navigateur** (même parcours qu'AC1) : même relevé, posé avant le clic et maintenu à travers la navigation douce : seul « Dernière étape : votre numéro » s'est monté ; sur `/en-ligne`, `GET /api/me/welcome-seen` est parti et, 6 s après, aucun dialogue — le compte porte pourtant `OwnerProfile` (`OwnerWelcomeWizard` monté par `AppShell`), tenu fermé par `useAccueilSuspendu` (TCK-2615, écran plein).
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

### AC5 — le panneau de bureau, la feuille au-dessus du clavier (2026-11-13)

- **Dès 1280 px (`xl`)**, « Publier » ne monte plus de dialogue : le contenu de la feuille prend la place de l'étape et du pied dans la colonne gauche (`CadreDeLaFeuille`, portail dans `[data-wizard-panneau]` de `WizardShell`) ; « Revenir à l'annonce » au-dessus, surtitre « Votre annonce est prête », titre « Dernière étape : votre numéro » (« Dernière étape » pour un compte connecté à qui le numéro ne manque pas), le geste dans la carte, sans rappel (l'aperçu, à droite, le porte). Un seul point de montage : passer de part et d'autre de 1280 garde la saisie.
- **Ce que le voile donnait seul**, refait : focus au titre à l'ouverture, rendu à « Publier » à la fermeture (l'ouvreur relevé une fois — sous le Strict Mode, un relevé à chaque passage rendait le focus à `body`, mesuré) ; Entrée dans le numéro ne republie pas (la soumission du formulaire est ignorée feuille ouverte, sinon la feuille se remontait par `cle` et perdait la saisie) ; « Pour publier » de l'aperçu est inerte feuille ouverte (changer d'étape sous le panneau aurait versé ou publié depuis une autre étape).
- **Assurances** (sans compte seulement) : « Pas de mot de passe à inventer », « Annonce retirable à tout moment » (la publication rend `available`, que `PropertyPublication::UNPUBLISHABLE` retire). **« Gratuit, sans commission » n'est pas écrit** (retrait ratifié par la session principale, conforme au ticket) : un espace sans abonnement ne paie rien (`QuotaResolver::effectivePlatformFeePctForAgency` → 0 ; `auto-onboard` n'en crée pas), mais un espace particulier existant peut porter un abonnement posé par le super-admin (`AgencySubscriptionService::assign` : plan `pro` à 3 %, dérogation `platform_fee_pct_override`), inconnu avant le code.
- **Au téléphone**, la feuille remonte de ce que le clavier cache (`useDecalageDuClavier`, celui de la coque d'entrée) et sa hauteur s'en réduit ; son corps défile, son pied reste.
- **Mesure** (Chrome, `/publish` sans compte, Strict Mode de développement ; aucune écriture : `request-code` servi dans la page en 202 local, `verify-code` jamais résolu, les deux bloqués au réseau ; 0 requête autre que GET) : 1280 × 900 — panneau 114 → 806, aperçu 920 → 1280 aux états numéro et code, pied caché, débord 0, « Publier mon annonce » 605 → 641 ; focus au titre puis à « Publier l'annonce » après « Revenir » ; les cinq entrées de « Pour publier » désactivées. 390 × 844, clavier émulé de 336 px (zone visible 508) — « Recevoir un code » 408 → 448, « Publier mon annonce » 408 → 448.
- **Non mesuré** : le panneau connecté (`/app/properties/new`, `FeuilleDePublication`) au navigateur — l'ouvrir demande un compte à qui il manque quelque chose, et le parcours écrit ; couvert en vitest seulement. La tablette tactile dès `md` avec clavier (la hauteur réduite peut laisser un vide au-dessus du clavier).
- **Les sorties de `/publish` attendent** (décision de la session principale : le retrait du voile ne doit rien régresser) : feuille ouverte OU écritures en cours (`feuille.ouverte || isSubmitting || preparation`, remonté par `ModeAnonyme.surVerrou`), « Effacer ce brouillon » est désactivé, et « Quitter », « ✕ » et la marque de la coque sont inertes (`DeclarationDEntree.sortieBloquee` : `aria-disabled`, hors tabulation, clic retenu sans confirmation). Un assistant démonté rend la page. Mesuré à 1280 : panneau ouvert, « Quitter » `aria-disabled` et `pointer-events: none`, les trois marques inertes, « Effacer » désactivé ; refermé, tout revient.
- Restaient alors : la fidélité, Google, la phrase des CGU sous « Publier mon annonce » — cf. § Fidélité ci-dessous.

### Fidélité (AC-F1 à AC-F6) — 2026-11-13, terrain-9

Maquette `app-entree-publier`, approche a, écrans 6 (« Le compte, à la publication ») et 7 (« Code, prénom et nom »), gelés le 2026-11-11. Fiche : [`TCK-2601.json`](../../../qa/audit-ux-2026-11/fidelite/TCK-2601.json) (rôles « feuille de compte » au téléphone, « panneau de compte » au bureau ; alias de vouvoiement ; ce qui entoure la feuille ignoré, cf. `ignorer_motif` ; quinze écarts acceptés avec leur motif ; aucune zone déclarée, d'où AC-F4 sans objet).

**Ce qui a changé pour suivre la maquette** : titre « Dernière étape : votre numéro » au téléphone aussi ; le titre de section disparaît au profit du libellé visible « Votre numéro » et de l'aide de l'indicatif (ceux des écrans d'entrée) ; champs, gestes et case WhatsApp aux primitives des écrans d'entrée (`BOUTON_D_ENTREE`, `PhoneInput taille="grand"` au bureau, `Checkbox`) ; au bureau, 10,8 px entre le titre et le corps du panneau (`mt-3`, la maquette en a 10,7) ; « Code envoyé au **77 123 45 67** · Modifier » (sans l'indicatif national) ; aide sous le prénom et le nom ; la phrase des CGU passe SOUS « Publier mon annonce » à l'étape du code (`mention`), comme la maquette ; rappel de l'annonce en une ligne (« 250 000 F CFA /mois · prête à publier », pastille cochée) ; feuille à 80 dvh ; **« Revenir à l'annonce » retiré au téléphone** (décision de la session principale : le ✕ de 44 px suffit), gardé dès 768 px ; au bureau, « Pour publier » dit « Votre numéro · en cours », toutes les autres étapes franchies, panneau ouvert.

**Mesure** (`fidelite compare` contre la référence gelée ; `/publish` sans compte, l'assistant rempli comme la maquette ; `request-code` répondu dans la page, `verify-code` jamais résolu, les deux bloqués au réseau ; aucune écriture, seuls des GET) — `conformes · écarts · absents · % pixels` :

| Écran | Téléphone 390 | Bureau 1440 | Bureau 1280 |
|---|---|---|---|
| a-6 Le compte | 15 · 10 · 6 · 16,88 % (avant : 3 · 19 · 28 · 26,86 %) | 13 · 14 · 4 · 10,03 % (avant le cadre de TCK-2600 : 8 · 19 · 4 · 15,35 %) | 13 · 14 · 4 · 11,28 % (avant : 15,73 %) |
| a-7 Code, prénom, nom | 28 · 6 · 3 · 5,19 % | 23 · 13 · 1 · 9,66 % (avant : 15 · 21 · 1 · 15,17 %) | 23 · 13 · 1 · 10,87 % (avant : 15,48 %) |

Rideaux : bloc-notes de la session, `impl/lot2/2601/fidelite/cmp-a-{6,7}-{telephone,bureau-1440,bureau-1280}/rideau.html` (avec `rapport.md` et `cote-a-cote.png`). Le porteur valide sur le rideau (AC-F5).

- **Ce qui fait les pourcentages** : au téléphone sur a-6, l'absence de Google (TCK-2777 ; « Recevoir un code » 48 px plus bas, au pied collé) ; au bureau, la colonne d'aperçu de l'assistant sans compte autour du panneau (carte et « Pour publier », partagées avec /app/properties/new : écarts ouverts de la fiche TCK-2600). Depuis le cadre d'entrée de TCK-2600 (2026-11-13, `GabaritBureau` : colonne de 560 px), le panneau est à la position et à la largeur de la maquette — le décalage de +52 / +52,8 px et les 30 px de trop ont disparu ; reste −1,9 px après l'aide de l'indicatif (`PhoneInput`).
- **Écarts de primitive** : le ✕ de `FeuilleDuBas` rendait 40 px hors de la portée `/app` (en-tête de 48 au lieu de 52, d'où les y de −4 à −10) — corrigé dans la primitive (TCK-2688, `max-md:size-11`), les chiffres du téléphone ci-dessus sont pris après ; restent le préfixe et l'aide de `PhoneInput`, et le trait de `Checkbox` (2,5, TCK-2690).
- **Écart accepté par team-lead (2026-11-13)** : l'interligne de « Modifier » (20 au lieu de 22,5). C'est un `<button>`, inline-block, dont la boîte vaut l'interligne ; à 20, sa boîte et son texte coïncident avec le `<span>` de la maquette, sur une ligne qui garde ses 22,5.
- **AC-F6** : balayage 390, 768, 1024, 1280 et 1440, aux deux écrans — débord 0, dépassement 0, aucune coupe ; la feuille sous 1280, le panneau dès 1280 ; seule ellipse, le titre saisi à 390.
- **Ablations** (chacune rouge, fichier restauré, md5 vérifié) : « Revenir » rendu au téléphone ; « Pour publier » sans l'étape en cours ; le titre « Dernière étape » au téléphone ; l'indicatif dans « Code envoyé au » ; la phrase sous le geste, au téléphone et au bureau (`PanneauDeCompte`) ; la hauteur de 80 dvh.

### Données locales créées par les mesures (base de développement, rien n'est supprimé)

- `espace-apres-auto-onboard.py` (numéro neuf `+22177…` aléatoire → code → session → `auto-onboard` → création d'un bien) : utilisateur **185**, agence individuelle **7**, biens brouillons **583** et **584** titrés « Mesure 2601 ».
- `plafond-brouillons.py` (forme du 422 au 21e brouillon et au-delà de 256 Ko) : un second compte de mesure à numéro aléatoire ; ses 20 brouillons `mesure-{0..19}` ont été effacés par le script, le compte reste.
- `cle-encodee.py` (la clé `property-create-wizard%3Apublication` = la clé brute) : un brouillon écrit puis effacé (PUT 201, DELETE 204) sur le compte de démo dont le jeton est gardé hors du dépôt ; rien ne reste.
- Les trois scripts sont dans le bloc-notes de la session (`impl/lot2/2601/mesures/`), lancés contre `http://127.0.0.1:8002/api` ; ils n'impriment que des statuts et des identifiants.
- Preuve d'AC1 au navigateur (2026-11-14, autorisée par la session, `migrate:fresh` de la démo prévu ensuite) : utilisateur **200** (Awa Diop, `+221775812810`), agence individuelle **12**, profils `AgencyAdminProfile` **16** et `OwnerProfile` **37**, bien **593** « Villa AC1 2601 à Dakar » `available`.

### Écarts au ticket

- **« Gratuit, sans commission »** n'est pas écrit sous le panneau de bureau (cf. § AC5) : la commission dépend de l'abonnement de l'espace qui publiera, inconnu avant le code. Retrait ratifié par la session principale.
- **Google** n'est pas dans la feuille : écart de parcours (décision de la session principale du 2026-11-13), ticket de suivi [TCK-2777](../todo/TCK-2777-google-dans-la-feuille-de-compte-de-publish.md) (écrit par redac-1).
- **Drapeau `auth.phone_login.enabled` éteint** : « Publier » mène à la connexion d'aujourd'hui, l'annonce restant dans ce navigateur ; revenu sur `/publish` avec elle, le visiteur connecté retrouve l'assistant et la feuille réduite à ce qui lui manque (numéro vérifié par le code sous session). La voie e-mail n'est pas DANS la feuille.
- **TCK-643, AC4 — nouvelle lecture** (confirmée par la session principale le 2026-11-13). Le ticket dit : « La publication reste possible exactement dans les mêmes cas qu'avant ». Elle se lit désormais : *la publication reste possible dans tous les cas où l'API l'accepte, et la feuille ne s'ouvre jamais pour un compte que l'API publierait ; un auteur dont le numéro principal n'est pas vérifié — cas où l'API refusait en 422 — reçoit la feuille AVANT toute écriture, au lieu de la création puis du refus.* Seule exigence plus stricte que `PublishReadiness`, et voulue : le nom (décision 1a du porteur) et la réponse WhatsApp d'un numéro vérifié qui n'en a jamais reçu (« question posée une fois », ce ticket). Gardé dans `PropertyWizard.publication.tck-633.test.tsx` par l'`it.each` « AC4 » et son inverse « AC4 inverse » : WhatsApp oui, WhatsApp non, second numéro saisi non vérifié, second vérifié sans réponse WhatsApp, CGU jamais acceptées → pas de feuille, `POST …/publish` part. Ablations rouges : exiger aussi le second numéro vérifié, tenir « non » à WhatsApp pour un manque, exiger les CGU dans la feuille.
- **Fidélité (AC-F1 à AC-F6)** : faite, cf. § Fidélité ; reste la validation du porteur sur le rideau (AC-F5).


- 2026-11-14 : clôturé — jugé au HEAD 0053d0bbd, tous les AC tenus avec preuve (verdict de clôture 2026-11-14-b).
