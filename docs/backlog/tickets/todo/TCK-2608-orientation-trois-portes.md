---
id: TCK-2608
title: "Orientation en trois portes, un geste : le chercheur repart avec une alerte, le professionnel avec son espace"
status: todo
phase: P1
family: front
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2598, TCK-2607]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#24-recherche--filtres"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#23-savedsearch-"
tags: [front, onboarding, saved-search, agency, mobile, audit-ux, app]
---

## Objectif utilisateur

Juste après avoir créé son compte, chacun dit d'un seul geste ce qui l'amène — chercher, publier son bien, s'installer en professionnel — et repart avec quelque chose tout de suite : une alerte et la liste filtrée, l'assistant de publication, ou son espace pro.

## Contrat de données

Existant, re-mesuré sur `dev` (1bce3798a) : `PATCH /api/me` (`entry_intent`, `professional` ajouté par TCK-2607), `POST /api/saved-searches` (`criteria.locations`, `contract_type`, `price_min`/`price_max`, `notification_frequency`), `GET /api/public/search-alerts/capabilities` (WhatsApp ouvert ou non), `PATCH /api/me/notification-preferences` (canal WhatsApp de `saved_search_match`), `GET /api/public/properties?locations=…` (le compte de « Voir les N biens », `meta.total`), `GET /api/public/geo/neighborhoods`, `POST /api/host/individual/onboard` (`agency.name`, `agency.primary_city`, `agency.currency`, `phone_otp`, `cgu_accepted` — code facultatif pour un numéro déjà vérifié), puis la demande de passage en agence `/app/settings/agency/upgrade` (RC, NINEA, RIB pro, raison sociale, adresse fiscale, statuts).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-orientation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Prénom », « Trois portes », « Chercheur : l'alerte », « Professionnel », « Professionnel : rejoindre ».
- Prénom : « Comment vous appelez-vous ? », prénom et nom (facultatif), plus de note de pied ; 760 px → colonne de 480 px au bureau, champs côte à côte.
- Trois portes : « Bienvenue, Awa », « Qu'est-ce qui vous amène ? », trois cartes-boutons (icône, titre, sous-titre, promesse) — « Je cherche un logement / Louer ou acheter », « J'ai un bien à louer ou vendre / Particulier · gratuit », « Je suis un professionnel / Agent, agence, gestionnaire » ; « Vous pourrez toujours faire les trois. » ; « Plus tard » dans la barre. **La carte touchée est la réponse** : pas de bouton « Continuer ».
- Chercheur : « Où et pour combien ? », Louer | Acheter, quartiers en pastilles multiples (+ Autre), budget par mois en F CFA (« Moins de 150 000 », « 150 000 – 300 000 », « 300 000 – 600 000 », « Plus de 600 000 »), « On vous prévient sur WhatsApp quand un bien correspond » (interrupteur), bouton collé « Voir les N biens », « Passer » dans la barre ; au bureau, les trois premiers résultats à droite, mis à jour avec les pastilles.
- Professionnel : « Votre agence sur Takussan », deux cartes « Je crée mon agence » / « Je rejoins une agence » ; créer = nom de l'agence, ville principale, téléphone (repris du compte), encadré « En deux temps » (« Tout de suite » / « Sous 48 h ») ; rejoindre = « Demandez le lien à votre agence », champ « Lien d'invitation », « Écrire à votre agence sur WhatsApp » ; au bureau, « Ce que vous aurez » à droite.
- **Téléphone (360-390 px)** : cartes pleine largeur ; bouton collé au-dessus du clavier. **Bureau (≥ 1280 px)** : trois cartes côte à côte (colonnes dès `lg`).
- Ton : **vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton**.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression — restent :

- Sans session, renvoi à la connexion avec la destination ; étape prénom quand il manque (prénom requis, nom facultatif) ; question posée une seule fois (`skipped` compte comme une réponse), jamais à un compte qui a un profil d'agence, jamais quand la destination est explicite (`doitPoserLaQuestionDIntention`, `estUneDestinationExplicite`) ; « Plus tard » vers la destination (par défaut `/app`) ; réponse écrite dans `entry_intent` ; erreur d'enregistrement annoncée ; marque et sortie vers le site.
- Chaque porte écrit son `entry_intent` (`search`, `publish`, `professional`).
- Chercheur : quartiers et budget sont facultatifs ; « Passer » mène à la liste sans créer d'alerte ; l'alerte n'est créée qu'au geste « Voir les N biens », avec un nom lisible et unique pour le compte ; l'interrupteur WhatsApp n'apparaît que si la capacité est ouverte ; le compte affiché est celui que l'API rend pour les mêmes critères.
- Publier : mène à `/publish` (décision d'aujourd'hui, sans écran de transit).
- Professionnel, « Je crée mon agence » : l'espace s'ouvre par l'assistant hôte côté API (`host/individual/onboard`, devise XOF, numéro vérifié du compte) puis la demande de passage en agence s'ouvre préremplie du nom. **Le texte ne promet que ce que l'espace sait faire avant validation** (pas d'équipe tant que l'agence n'est pas `standard`) ; un autre numéro d'agence que celui du compte se saisit dans la demande, pas dans l'ouverture (l'API refuse un numéro différent, `phone_mismatch`). Le compte qui a déjà un espace va directement à la demande.
- « Je rejoins une agence » : un lien collé n'est suivi que s'il est une URL `/invitations/accept?token=…` de Takussan (filtre anti-redirection) ; sinon un message.
- L'assistant hôte reste servi à `/onboarding/host` (repli `host_auto_space` éteint) ; « créer une vraie agence » devient « créer une agence » (TCK-2616).
- Libellés neufs en `fr`/`en`/`wo`.

## Delta à produire

- [ ] Écran prénom resserré ; trois portes en cartes-boutons.
- [ ] Porte chercheur : quartiers, budget, contrat, WhatsApp, compte en direct, création de l'alerte, ouverture de la liste filtrée.
- [ ] Porte professionnelle : créer (ouverture de l'espace + demande préremplie) ou rejoindre (lien collé, WhatsApp).
- [ ] Tests : une carte = une réponse écrite (`PATCH /api/me`) et une navigation ; chercheur Mermoz + Ngor, 150-300 000 → alerte `locations=[Mermoz,Ngor]`, `price_min=150000`, `price_max=300000`, liste `?locations=Mermoz,Ngor&price_min=…` ; « Passer » sans alerte ; WhatsApp absent capacité fermée ; pro créer → `host/individual/onboard` puis demande préremplie ; lien d'un autre site refusé ; compte à profil d'agence → pas de question.

## Critères d'acceptation

- [ ] AC1 — Toucher « J'ai un bien à louer ou vendre » émet `PATCH /api/me {entry_intent: "publish"}` puis navigue vers `/publish`, sans autre clic.
- [ ] AC2 — « Voir les 37 biens » : le nombre affiché est égal au `meta.total` de la requête de liste émise pour les mêmes critères, et l'alerte créée porte ces critères (réseau).
- [ ] AC3 — « Je crée mon agence » avec « Keur Immo » : la demande de passage en agence s'ouvre avec « Keur Immo » prérempli ; aucun texte de l'écran n'annonce « équipe » avant la validation.
- [ ] AC4 — À 390 px, les trois cartes et « Plus tard » tiennent sans défilement ; à 1280 px, elles sont sur une ligne.

## Hors périmètre

- Le contenu de la demande de passage en agence ; la validation par la plateforme.
- L'accueil de `/app` après « Plus tard » (famille 3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
