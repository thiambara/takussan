---
id: TCK-2601
title: "Le compte au moment de publier : numéro, code, prénom et nom dans une feuille, puis l'annonce en ligne sans détour"
status: todo
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-10
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

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
