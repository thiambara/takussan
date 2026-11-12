---
id: TCK-2639
title: "Fiche du bien : l'onglet Location d'abord, des onglets par métier et deux gestes collés au téléphone"
status: todo
phase: P1
family: front
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2637, TCK-2643, TCK-2644, TCK-2655, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2678]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#3-property"
tags: [front, properties, leases, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin ou l'agent qui ouvre un bien loué voit d'abord qui l'occupe, sous quel bail, si le loyer du mois est rentré et ce qui l'attend. Il agit (relancer, encaisser, signaler un problème, contacter le locataire) sans repartir par trois autres pages.

## Contrat de données

- `GET /api/properties/{id}` avec `include=occupancy,online` (`is_online`, TCK-2637).
- Interventions du bien : `GET /api/maintenance-requests?filter[property_id]=` (existant).
- Documents du bien et de ses baux : la lecture par cible du coffre (TCK-2655).
- États des lieux du bien : `GET /api/properties/{id}/inventories`. L'endpoint existe, le front ne l'appelle pas aujourd'hui.
- Gestes :
  - « Relancer » : relance WhatsApp d'un impayé (TCK-2644) ;
  - « Encaisser » : le dialogue de paiement reçu existant, sur l'échéance du mois ;
  - « Créer un bail » : `/app/leases/new?property={id}` (TCK-2643) ;
  - « Signaler un problème » : `/app/maintenance/new?property={id}`. Le paramètre existe déjà.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-biens&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écran « Fiche — onglet Location », au téléphone et au bureau.
- **En-tête** : bandeau photo (3:2), titre.
- **Onglets collants** :
  - « Location · Annonce · Interventions (n) · Documents (n) », plus « Historique », gardé ;
  - « Location » est ouvert par défaut pour un bien à louer ;
  - « Annonce » est ouvert par défaut pour un bien à vendre.
- **Location, bien occupé** :
  - « Occupé par … » avec boutons ronds Appeler / WhatsApp ;
  - « Bail LS-… · type · début → fin › » ;
  - « Ce mois » : loyer de novembre, payé le … ou « En retard de N j » avec la pénalité due, et les gestes « Relancer » / « Encaisser » ;
  - « À venir » : prochain loyer, révision possible, état des lieux ;
  - « Bailleur : … › ».
- **Location, bien vacant** : « Vacant depuis N j » (ou « Sans locataire »), « Créer un bail », « Publier l'annonce ».
- **Annonce** : tout ce qui sert la publication. C'est le contenu actuel des onglets Aperçu, Édition et Médias.
- **Téléphone (360-390 px)** :
  - barre collée à deux boutons : « Signaler un problème » (secondaire) + « Contacter le locataire » (primaire) pour un bien occupé ; « Planifier une visite » + « Créer un bail » pour un bien vacant ;
  - le reste passe dans « ⋯ », en feuille ;
  - aucune rangée de boutons avant le contenu.
- **Bureau (≥ 1280 px)** :
  - deux colonnes dès `lg` : à gauche la photo, les onglets et leur contenu ; à droite une carte collante « Occupation » (locataire, bail, loyer du mois, prochain loyer, bailleur) avec « Voir le bail », « Encaisser » et « Signaler un problème » ;
  - « Voir la fiche publique » et « Planifier une visite » restent dans l'en-tête.
- **Vocabulaire** : « En ligne » / « Hors ligne » lit `is_online`. La visibilité Public / Privé se lit comme un réglage dans l'onglet Annonce, et non comme une pastille d'état ([ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md)).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md).

**Rien ne se perd** (audit famille 4, § 1, *Fonctions existantes* 13-17, lues dans `properties/[id]/page.tsx` et `PropertyDetailTabs.tsx`) :

- en-tête : sur-titre « BIEN · référence », statut, type · contrat · ville, propriétaire et agent responsable, bailleur invité en attente (TCK-1000) ;
- gestes :
  - « Planifier une visite », au personnel actif de l'agence du bien seulement (`usePersonnelActif`) ;
  - « Changer le titulaire » (`abilities.transfer_owner`) ;
  - « Voir la fiche publique », « Booster », « Ajouter un document » ;
  - menu « ⋯ » avec les mêmes actions que la ligne de liste ;
- bannière de modération, question de disponibilité d'une annonce Radar (TCK-2432), **clients correspondants** (personnel) ;
- contenu actuel :
  - vues, favoris, note, disponibilité ;
  - adresse et « Modifier » ;
  - « À régler » avec « Compléter → » ;
  - historique des prix ;
  - agent principal, collaborateurs et désignation ;
  - formulaire d'édition complet et contacts sur place ;
  - médias ;
  - calendrier (location à la nuit ou à la semaine) ;
- panneau « accès refusé » rendu sur 403, jamais une redirection muette.

Autres contraintes :

- **Un compteur d'onglet compte ce que l'onglet montre** (P2 de l'audit : « Historique (2) » pour un bien à 3 interventions).
- **« Planifier une visite » ne décale plus la mise en page en arrivant** : sa place est réservée, ou le geste est rendu côté serveur.
- **Un bloc qui échoue le dit.** Aujourd'hui `PropertyCollaboratorsPanel` rend `null` sur erreur.
- **Le bailleur** voit la même fiche sans les gestes réservés au personnel (Encaisser, Planifier une visite, clients correspondants). Il voit son locataire selon la projection de TCK-2637.
- **i18n** : `fr` / `en` / `wo`, le `wo` portant le texte français tel quel ; vouvoiement ; loyer toujours avec sa période.

## Delta à produire

- [ ] Onglets par métier, et le contenu de l'onglet Location pour un bien occupé et pour un bien vacant.
- [ ] Onglets Interventions et Documents. « Ajouter un document » y est préattaché au bien, jamais par saisie d'un identifiant.
- [ ] Barre collée au téléphone. Colonne collante « Occupation » au bureau.
- [ ] Compteurs d'onglet justes. Place réservée de « Planifier une visite ». Erreur visible des panneaux.
- [ ] Tests :
  - bien occupé payé, occupé en retard, vacant, jamais loué, à vendre ;
  - bailleur sans gestes du personnel ;
  - compteurs ;
  - 403 rendu.

## Critères d'acceptation

- [ ] AC1 — Sur un bien loué dont le loyer est en retard de 6 jours, l'onglet Location, ouvert par défaut, montre :
  - le locataire, et la référence du bail en lien vers `/app/leases/{id}` ;
  - « En retard de 6 j » et la pénalité due.
  « Relancer » ouvre `https://wa.me/221…` avec le message prérempli de TCK-2644 (URL vérifiée).
- [ ] AC2 — Sur un bien vacant, « Créer un bail » mène à `/app/leases/new?property={id}`, et le bien y est préchoisi (TCK-2643).
- [ ] AC3 — L'onglet Documents liste les documents du bien **et** de ses baux (appel réseau de TCK-2655). « Ajouter un document » ouvre le dialogue préattaché, sans champ d'identifiant.
- [ ] AC4 — Sur un bien qui a 2 changements de prix et 3 interventions, les onglets affichent « Interventions (3) », et l'historique des prix 2 lignes. Chaque compteur égale le nombre de lignes rendues.
- [ ] AC5 — À 390 px :
  - aucun bouton ne précède le titre et l'occupation ;
  - la barre collée porte exactement deux boutons ;
  - la zone d'en-tête ne bouge pas quand « Planifier une visite » arrive : CLS de la zone égal à 0, mesuré au navigateur avec le profil chargé en différé.
- [ ] AC6 — À 1280 px, la carte « Occupation » reste visible quand on fait défiler l'onglet Annonce.
- [ ] AC7 — Ouverte par le bailleur, la fiche ne rend ni « Encaisser » ni « Planifier une visite », et rend le nom de son locataire.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2639.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La « Remise en location en un geste » et la « vue Portefeuille » (ambition de l'audit).
- La fiche d'un immeuble et de ses lots.
- Le contenu de la fiche du bail (TCK-2645).

## Notes d'implémentation

- **AC2 dépend de TCK-2643** : « Créer un bail » mène à `/app/leases/new?property={id}` (lien vérifié par test) ; le préchoix du bien sur cette page est le delta de TCK-2643 (entrée `?property=`), qui déclare déjà `blocks: [TCK-2639]`.
- **API** : `PropertyResource` rend `owner_profile_id` (fiche, appelant connu) au seul appelant qui ouvrirait la fiche du bailleur (`OwnerProfilePolicy::isInActorAgency` + `viewDetail`, profil du titulaire DANS l'agence du bien) ; `null` sinon. Tests `FicheDuBienProfilDuBailleurTest` (4), ablations rouges (sans `viewDetail`, sans le filtre d'agence). ⚠ /sync-specs : champ neuf à porter dans `models-spec.md` § Property et `features.md` § 1.1.
- **Deux colonnes à `xl`, pas à `lg`** : la maquette pose `xl:flex-row` (bureau 1280 et 1440) ; sous `xl`, la pile du téléphone (ADR-0106 § 4). Carte collante `xl:sticky xl:top-6`, 360 px (`xl:w-100`).
- **Téléphone en pleine largeur** (`PagePleineLargeur`, TCK-2691) : bandeau photo de 200 px bord à bord, identité (`type · surface · référence` + pastilles) ; le H1 de `PageHeader` reste lu par les lecteurs d'écran (`max-md:sr-only`), la copie visible leur est tue.
- **Propriétaire et agent responsable (TCK-603)** : pour un bien en location, dans « Mandat » (téléphone) et sous la carte « Occupation » (bureau, `BlocResponsable`) ; la ligne de l'en-tête ne s'y répète plus dès `xl`. Un bien hors location la garde partout.
- **« Ajouter un document »** quitte l'en-tête du BUREAU (la maquette a-2 n'y met que « Planifier une visite », « Voir la fiche publique » et « ⋯ ») ; il reste dans la feuille « ⋯ » du téléphone (`PropertyHeaderActions ajouterUnDocument`) et dans l'onglet Documents, préattaché au bien (AC3) — « Rien ne se perd ». Le « ⋯ » de l'en-tête est bordé (maquette).
- **Dictionnaire** : la relance réutilise `FeuilleDeRelance` (TCK-2644) et l'encaissement `LeasePaymentDialog` : la frontière `(dashboard)/app/properties` sert désormais `admin` et `payments` (`check-i18n-namespaces --update`, plafond 50 → 62 %). Sans eux, « Relancer » levait `MISSING_MESSAGE` au navigateur — la suite vitest ne le voit pas (mesuré : aucun dialogue, erreur `admin.finances.impayes`). Suite possible : sortir les clés de la relance de `admin` vers un espace à elles.
- **Omis faute de donnée** : la date de révision, l'avis d'échéance, le moyen de paiement par échéance, le nombre de collaborateurs, la ligne « intervention en cours » de la carte du bureau.
- **CLS** : la place de « Planifier une visite » (en-tête du bureau) est tenue pendant la lecture des profils (`placeReservee`), celle de « Relancer » / « Encaisser » pendant la lecture du bail (`gestesEnLecture`). Mesuré au navigateur le 2026-11-12 à 14:36 Z (load 6,6 / 8 cœurs), profils retardés de 3 s : CLS 0,0002 à 390, en-tête immobile ; 0,027 à 1440 (re-mesuré à 14:40 Z, chaque source rattachée à son `data-slot`) : 0,0204 hors de `<main>` — le menu de la coque (`menu`, `aujourdhui`) qui s'allonge — et 0,0069 dans la fiche : le tableau « Loyers » passe de sa ligne de chargement à ses échéances et pousse « À venir » / « Bail en cours » de 68 px. Non réservé : le nombre de lignes n'est connu qu'à la lecture (suite possible : réserver quatre lignes dès qu'un bail existe).
- **La place réservée restait parfois pour de bon** (relevé au repos : 2 essais sur 4 à 1280, requête des profils pourtant `success`). Le serveur rend la place ; la coque, hydratée avant la fiche, a souvent déjà lu les profils, et le client rendait le vrai bouton dès l'hydratation — même balise, même texte : React garde les attributs du serveur (`invisible`, `aria-hidden`, « won't be patched up »). `PlanifierUneVisite` lit désormais les profils APRÈS l'hydratation (`useSyncExternalStore`, comme `VisitesParLeTemps`) ; test d'hydratation dans `PlanifierUneVisite.place-reservee.tck-2639.test.tsx`, rouge avant le correctif ; 5 essais sur 5 au navigateur ensuite. Vaut pour tous les appelants : avant, une fiche client hydratée avec les profils déjà lus rendait un bouton là où le serveur ne rendait rien.
- **Preuves au navigateur** (2026-11-12, API locale, admin de démo, bien 6) : « Relancer » ouvre `https://wa.me/221…` avec le message de TCK-2644 (« Bonjour Aliou, le loyer de novembre (1 825 000 F CFA) reste à régler… ») ; à 1280, onglet Annonce défilé, la carte « Occupation » reste à l'écran (haut à 22 px) ; `scrollWidth − innerWidth = 0` à 390, 768, 1024, 1280 et 1440 (`fidelite balayer`).
- **Fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2639.json` (lignes, écarts acceptés, rideaux sous `takussan-web/.fidelite/TCK-2639/`).
