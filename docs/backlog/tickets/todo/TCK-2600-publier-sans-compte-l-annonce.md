---
id: TCK-2600
title: "Publier sans compte : l'anonyme remplit toute l'annonce, gardée dans son navigateur"
status: todo
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2598, TCK-2599]
blocks: [TCK-2601, TCK-2603]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#3-property"
tags: [front, publish, acquisition, mobile, audit-ux, app]
---

## Objectif utilisateur

Le propriétaire qui touche « Publier » sans compte commence son annonce tout de suite et la remplit jusqu'au bout — le bien, le lieu, les caractéristiques, le prix, les photos, le titre — sans donner son numéro avant d'avoir vu ce qu'on lui demande.

## Contrat de données

Re-mesure sur `dev` (1bce3798a) :

- `/publish` (`app/publish/page.tsx`) n'a pas de formulaire : un anonyme y est renvoyé vers `/auth/login?redirect=/publish` (`usePublishIntent`, statut `anonymous`).
- L'assistant (`PropertyWizard`) n'est monté que sous `/app/properties/new`, gardé par le proxy ; son brouillon est **serveur seulement** (`useWizardDraft('property-create-wizard')` → `/api/me/wizard-drafts`, sous session). Aucun brouillon anonyme n'existe.
- Ce que l'assistant lit et qui est déjà public : `/api/public/geo/regions|cities|neighborhoods`, `/api/public/amenities` (mêmes identifiants que les équipements de la page connectée, `TagType::Amenity` approuvés). Ce qui ne l'est pas : `POST /api/geo/resolve-link` → TCK-2599.
- Aucune écriture n'a lieu dans ce ticket : la création du bien, l'envoi des photos, des équipements et des contacts, et la publication restent ceux d'aujourd'hui, déclenchés par TCK-2601.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-publier&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Départ : le bien », « Le lieu », « Les caractéristiques », « Le prix », « Les photos », « Le titre et la finition ». Les notes de maquette en pointillé (champs selon le type et le contrat) décrivent l'existant : elles ne se dessinent pas.
- Départ : « Publiez votre bien gratuitement » et sa ligne « En ligne aujourd'hui · 5 minutes · un code SMS suffit », puis la première question de l'assistant telle quelle (Louer / Vendre, types) ; sous le contenu, « Vous êtes une agence ou un agent ? Créer un compte pro » (vers la porte pro d'TCK-2608) et « Un brouillon vous attend déjà ? Me connecter ». La carte de preuves chiffrées n'est rendue que par TCK-2603.
- **Téléphone (360-390 px)** : un écran par étape, résumé collant en haut (« Studio · En location · Mermoz »), feuille « Aperçu », pied collant Précédent / Continuer (l'existant), avancement dans la barre de la coque (TCK-2598).
- **Bureau (≥ 1280 px)** : colonne de gauche ; à droite, l'aperçu de l'annonce et la liste « Pour publier », qui gagne une ligne « Votre numéro · à la fin » ; la mention « Brouillon gardé dans ce navigateur — il passera dans votre compte au moment de publier ».
- Ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md).

Pas de régression — **toutes** les étapes et tous les champs de l'assistant d'aujourd'hui restent, avec leurs conditions (`field-matrix.ts`, `CLES_PAR_ETAPE` de `PropertyWizard.tsx`) :

- Le bien : contrat Louer / Vendre et type (9 + « Plus de types (7) »), aucun des deux pré-sélectionné, « Continuer » inactif tant qu'ils manquent.
- Le lieu : « Utiliser Dakar, Dakar », région, ville requise, quartier libre vérifié ensuite, rue / code postal / pays repliés, « Utiliser ma position actuelle », coller un lien ou une position (TCK-2599), carte et repère ; les champs repliés se redéplient à chaque refus.
- Les caractéristiques selon le type et le contrat (chambres, salles de bain, étage ou nombre de niveaux, parking, année, surface, meublé, état, statut foncier, équipements avec ajout libre).
- Le prix : montant en F CFA, fréquence **Mois / Semaine / Jour / An**, « Disponible à partir du », coût d'entrée (mois d'avance, mois de caution, charges) et son total, seulement pour un loyer au mois ; en vente, le prix seul.
- Les photos : facultatives, prendre une photo ou choisir, limites de format et de poids d'aujourd'hui, première en couverture, retrait.
- Le titre et la finition : titre requis et titre proposé, description, lien de visite virtuelle ou vidéo, contacts sur place (jusqu'à trois).
- Aperçu en direct, « Pour publier » avec l'état de chaque partie, retour à une partie depuis la liste, Entrée qui ne soumet qu'à la dernière étape.
- **Les champs réservés aux agences ne paraissent pas pour l'anonyme mais ne disparaissent pas du produit** : choix et invitation du bailleur (`ChoixDuBailleur`), frais d'agence (`agency_fee_months`), mode proposition du bailleur, note de quota — tous restent servis, inchangés, par `/app/properties/new` à qui y a droit.
- **Le brouillon anonyme vit dans ce navigateur** : valeurs ET photos survivent au rechargement de la page et à la fermeture de l'onglet ; il ne quitte pas l'appareil avant la création du compte (TCK-2601) ; il ne contient aucune donnée sensible (ni code, ni jeton). Un navigateur qui refuse le stockage garde l'annonce le temps de l'onglet et le dit.
- `/app/properties/new` et son brouillon serveur restent tels quels pour l'utilisateur connecté ; un visiteur connecté qui touche « Publier » suit la décision d'aujourd'hui (`usePublishIntent`).
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel).

## Delta à produire

- [ ] `/publish` sert l'assistant à l'anonyme (départ + six étapes) au lieu de la redirection vers la connexion.
- [ ] Brouillon local (valeurs, étape, photos) relu à l'ouverture, avec l'annonce de reprise existante.
- [ ] Équipements lus sur `/api/public/amenities` ; position collée par TCK-2599.
- [ ] Liens « Créer un compte pro » et « Me connecter » du départ.
- [ ] Tests : les six étapes et leurs conditions (type × contrat, dont fréquence « An ») ; reprise après rechargement, photos comprises ; aucun appel à `/api/me/*` ni à une server action d'écriture avant TCK-2601 ; champs d'agence absents pour l'anonyme et présents pour un agent d'agence `standard` sur `/app/properties/new`.

## Critères d'acceptation

- [ ] AC1 — Anonyme, `/publish` affiche « Publiez votre bien gratuitement » sans redirection (statut 200, aucune navigation vers `/auth/login`, vérifié au réseau).
- [ ] AC2 — Après avoir rempli lieu, prix (fréquence « An ») et ajouté 3 photos, un rechargement rouvre à la même étape avec les mêmes valeurs et les 3 photos.
- [ ] AC3 — Pendant tout le parcours anonyme, aucune requête vers `/api/me/*`, `/api/properties*` ni `/api/me/wizard-drafts*` (vérifié au réseau).
- [ ] AC4 — Pour un studio en location au mois, l'étape caractéristiques montre exactement les champs que montre `/app/properties/new` pour le même couple (comparaison des libellés rendus).
- [ ] AC5 — À 390 px, chaque étape garde son bouton « Continuer » visible sans défilement de la page ; à 1280 px, l'aperçu est à droite et se met à jour à la frappe du prix.

## Hors périmètre

- La feuille de compte, la création du bien et la publication (TCK-2601) ; l'écran « En ligne » (TCK-2602) ; les preuves chiffrées (TCK-2603).
- Publier depuis WhatsApp (approche C, non retenue).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
