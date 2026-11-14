---
id: TCK-2589
title: "Fiche client : un résumé qui se lit (prochaine action, ce qu'il cherche, origine) puis un fil unique ; l'édition passe en feuille"
status: done
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-14
depends_on: [TCK-2582, TCK-2583, TCK-2588, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#33-customernote-"
tags: [front, crm, customers, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent qui ouvre la fiche pendant que le client parle sait sans toucher qui il est, ce qu'il cherche, d'où il vient et ce qui est prévu — et retrouve toute son histoire dans un seul fil.

## Contrat de données

- `GET /api/customers/{id}` avec `next_action`, `follow_up`, `last_contacted_at`, `referent`, `origin`, `interested_property`, `upcomingVisits` (TCK-2582, TCK-2588), `fields[…]`.
- Fil : `GET /api/customers/{id}/activity` (existant, enrichi des comptes rendus TCK-2578 et des gestes TCK-2583), notes (`GET|POST …/notes`), visites, réservations, baux, documents, relations (endpoints actuels des onglets).
- Gestes : `POST /api/customers/{id}/contacts` au toucher d'Appeler / WhatsApp (TCK-2583) ; étape, référent, étiquettes, invitation, documents, biens correspondants : routes existantes.
- « Écrire » : la messagerie existante, seulement si la fiche a un compte (`user_id`) — les conversations relient des utilisateurs.

## Direction UX / Artistique

- Maquettes de référence : `/fr/playground/maquettes?p=app-clients&a=a` — écrans « Fiche » et « Modifier » ; `?p=app-fil-commercial&a=a` — écran « La fiche, la veille » ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- De haut en bas : nom et menu `⋯` ; « Prospect ▾ · référent Khady D. » ; Appeler · WhatsApp · Écrire (48 px) ; **PROCHAINE ACTION** (visite avec « Confirmer » si elle est à confirmer, relance due) ; **CHERCHE** (Location · studio, F2 · Mermoz, Ouakam · ≤ 250 000 F, « 3 biens correspondent ▸ ») ; **ORIGINE** (« Demande du 3 nov. sur « Studio Mermoz » » et le message cité) ; **FIL** (notes, visites, comptes rendus, appels, changements d'étape, mêlés dans le temps, filtre Tout · Notes · Visites · Appels · Étapes, « Ajouter une note » en tête).
- Sections repliées en fin de fiche, avec leur compte, présentes seulement si non vides : Réservations, Baux, Documents, Relations ; Étiquettes en ligne dans le résumé.
- « Modifier » (menu `⋯`) ouvre le formulaire complet en feuille, par sections repliables (Identité, Contact, Ce qu'il cherche, Pièce d'identité), bouton collant « Enregistrer ».
- Barre collante du téléphone : + Note · + Tâche · Visite.
- **Téléphone (360-390 px)** : une colonne, le premier écran dit qui, l'étape, les gestes et la prochaine action (l'audit mesure 680 px avant le premier onglet aujourd'hui). **Bureau (≥ 1280 px)** : deux colonnes dès `lg` — résumé de 380 px à gauche, fil à droite ; « Modifier » en panneau latéral de 480 px.
- Vocabulaire : « Clients », « Étape », « Étiquettes », « Compte rendu » (décision 11a ; les libellés d'étape viennent de TCK-2592).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md).

**Pas de régression** (`customers/[id]/page.tsx`, `CustomerDetailTabs.tsx`, `components/crm/*`, audit § 2) :
- en-tête : « Client · #35 », nom, e-mail, téléphone, étape, statut ; Planifier une visite (client prérempli) ; Ajouter un document — **qui rafraîchit désormais la section Documents** (`onUploaded`, l'audit le relève absent) ; Inviter à créer son compte (fiche sans compte ; agent, admin d'agence, super-admin) ;
- Appeler / WhatsApp 44 px avec « pas de téléphone » / « numéro injoignable » ; sélecteur d'étape — **un seul** sur l'écran (l'audit en compte deux) —, Converti / Perdu exigent un motif devenu note épinglée ;
- Référent : « Me désigner », ou désigner un agent (capacité `crm.assign`) ;
- Étiquettes : ajout (Entrée, virgule), suggestions, retrait, 10 au plus, clic → liste filtrée ;
- Notes (5 000 car., épinglées en tête, sans modification ni suppression) ; Tâches (titre, échéance, cocher) ; Activité (« Voir plus ») ; Visites ; Réservations ; Baux ; **Biens correspondants** (cases à cocher, « Partager (n) par WhatsApp ») ; Documents (ajout, ouvrir) ; Relations (lecture) — chacun garde sa place, dans le fil ou dans une section ;
- l'édition garde **tous** les champs du formulaire actuel (`CustomerForm.tsx`) : prénom, nom, e-mail ou téléphone E.164, profession, langue des messages, étape, critères de recherche complets (16 types, villes, quartiers, chambres, budget), pièce d'identité ; erreurs 422 sur les champs, garde de sortie si modifié ;
- numéro de pièce masqué, révélé à l'admin seul après double facteur ;
- 404 vrai pour un identifiant invalide, « Fiche indisponible » pour un refus ;
- le bailleur lit les fiches qu'il a ajoutées, sans les gestes réservés au personnel.
- La section ouverte et le filtre du fil vivent dans l'URL (l'onglet actif est perdu au retour aujourd'hui).
- Téléphones formatés (« +221 70 648 20 56 ») ; i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Fiche en résumé + fil (téléphone et bureau), sections repliées, barre collante.
- [ ] Édition en feuille / panneau.
- [ ] « Écrire » pour une fiche à compte ; gestes de contact enregistrés.
- [ ] Tests : résumé (prochaine action, cherche, origine) rendu depuis la réponse ; un seul sélecteur d'étape ; motif exigé pour Converti / Perdu ; sections vides absentes ; `?section=` restauré au retour ; édition qui envoie les mêmes champs que le formulaire actuel ; pièce masquée hors admin ; bailleur sans gestes du personnel.

## Critères d'acceptation

- [ ] AC1 — À 390 px, la fiche de Mariama Fall montre sans défiler son étape, son référent, les trois gestes et « Visite jeu. 12 nov. 10:00 » en prochaine action.
- [ ] AC2 — Le fil de Mouhamed Dieng montre, dans l'ordre, « Demande reçue » (avec le message), « Réponse WhatsApp (Sokhna) », « Visite confirmée », « Compte rendu : Intéressé ».
- [ ] AC3 — Le DOM de la fiche contient exactement **un** contrôle de changement d'étape.
- [ ] AC4 — « Ajouter un document » depuis l'en-tête fait paraître le document dans la section Documents sans recharger.
- [ ] AC5 — Une fiche sans réservation, bail ni relation n'affiche aucune de ces trois sections ; « Biens correspondants » reste atteignable depuis CHERCHE.
- [ ] AC6 — À 1280 px, résumé et fil sont côte à côte ; à 1024 px dans la coque à colonne, rien ne défile horizontalement.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2589.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La liste et la création (TCK-2590).
- La suite d'une visite (TCK-2581) et la saisie d'une candidature (TCK-2580), atteintes depuis la fiche.
- La fiche par biens (approche C) et les onglets allégés (approche B).

## Notes d'implémentation

Livré en cinq lots, puis corrigé sur les réserves de verif-commercial. Les décisions ont été tranchées
par team-lead sous la délégation du porteur. Chaque lot a sa propre numérotation : « B 6a » est la
décision 6 du lot B.

**Décisions du ticket, avant le lot A** :
- 1a : le show des clients accepte dans `fields[customers]` les seuls noms de
  `CustomerCommercialAttributes::FIELDS`, lus dans la constante. C'est une exception étroite à la
  garde show-sans-fields.
- 2b : un endpoint du fil côté serveur.
- 3a : `bookings_count` et `leases_count` par `whenCounted`.
- 4a : l'étape sort de la feuille « Modifier » et se change depuis la tête. La règle du motif de
  Gagné et Perdu est gardée (test AC3).
- 5a : « Écrire » par le fil direct, remplacé ensuite par B 6a.
- 6a : une formulation neutre, avec les alias de fidélité « Sa recherche », « Référent » et « Client
  depuis ».

**Lot A — l'API du fil** (`06289fe4d`, `2e7130910`).
- `GET /api/customers/{id}/timeline?filter[type]=note,visit,contact,stage` mêle notes, visites,
  gestes de contact et changements d'étape côté serveur. Tri `occurs_at desc`, puis rang du type
  (note, visite, contact, étape), puis `id desc` : l'ordre est total, et deux lectures paginées
  rendent la même chose.
- L'autorisation passe par `CustomerPolicy::view` avant la validation. Un test de parité show/timeline
  couvre six lecteurs.
- Une visite n'entre que pour le personnel (`viewVisitReports`), et seulement parmi celles que
  `VisitesLisibles` rend au lecteur. La règle est extraite de `PropertyVisitController::indexScope`,
  pas recopiée. Une visite ne sert jamais ses notes, son compte rendu ni son visiteur.
- Un geste de contact n'entre que pour le personnel (lot A, point 1 a : « le bailleur lit sa fiche,
  pas qui l'agence a appelé »). `/activity` a été aligné par TCK-2754.
- `include=bookingsCount,leasesCount` rend `bookings_count` et `leases_count`, dans l'agence de la
  fiche, au même lecteur que `visits_count`.
- Le nombre de requêtes ne dépend pas du nombre d'entrées (test à 5 et 35 entrées).

**Lot B — le résumé** (`7b08cfeb3`, `8bbd3b91a`).
- La tête porte les initiales, l'étape en puce et le référent en carte.
- « Prochaine action » montre la prochaine visite, puis la tâche ouverte qui la suit, sur une seconde
  ligne (B 3a). Une visite `scheduled` se dit « À confirmer » (B 2a).
- « Confirmer » passe par `useConfirmVisit`, puis la fiche se relit (B 1a). Il ne paraît que si
  `upcoming_visits[].manage` (la règle de `PropertyVisitPolicy::gere()`, servie avec la fiche) et
  qu'une heure est fixée. Une demande par tranche renvoie à `/app/visits/{id}`, où l'heure se choisit
  (lot C2 : `preferred_window` et `manage` dans `upcoming_visits`).
- CHERCHE compte les biens correspondants par `meta.total` (B 4a). ORIGINE cite la demande, sans prix
  (B 5a).
- « Écrire » reprend le patron de TCK-2641, `useTrouverLeFilDirect` et `BrouillonDirect` (B 6a). Il
  est livré au lot E dans `components/messages/EcrireA.tsx`.
- Une visite donne une entrée par jalon : demandée, confirmée, annulée (B 7a). Une visite confirmée
  moins de 5 s après sa création a été créée confirmée, et ne donne qu'un jalon
  (`CustomerTimeline::CREEE_CONFIRMEE_SECONDES`).

**Lot C — le fil** (`f456af9c6`).
- Une entrée de contact dit si le geste a été posé sur la demande ou sur la fiche (C 1a,
  `on: lead|customer`, servi sur les seules entrées de contact).
- Les notes épinglées sont en tête, dans une liste à part, et aussi à leur date (C 2b).
- La saisie fait une note, épinglée ou non, ou une tâche. Une tâche prend le texte comme titre
  (255 caractères), sans échéance. Un refus se dit sous la saisie, le texte est gardé, et le double
  appui n'envoie qu'une fois (C 3a).
- Les filtres Tout · Notes · Visites · Appels · Étapes vivent dans `?fil=` (C 4a).
- Le fil a remplacé les onglets Notes et Activité dès le lot C (C 5a).
- Les entrées sont formulées « Visite demandée / confirmée / annulée », avec « Compte rendu » et
  « Étape ». Une visite mène à `/app/visits/{id}` pour qui peut l'ouvrir, et reste en texte simple
  pour les autres (C 6a).
- d1 a : le fil s'enrichit des entrées `record` (fiche créée, ou modifiée sur un champ de
  `CHAMPS_DE_LA_FICHE`, avec les noms des champs et jamais les valeurs) et `task` (créée, faite ; titre
  courant, jamais la description). Il est lu par tout lecteur de la fiche, comme `/activity`.
- d2 : l'épingle part dans le corps (`pinned: true`).

**Lot D — le dossier et « Modifier »** (`d062b67a4`, `33c7ea62e`).
- Les anciens onglets deviennent des lignes repliées en fin de fiche : biens correspondants,
  tâches, documents, relations, réservations, baux, pièce et compte (D 1a). Les étiquettes ne s'y
  répètent pas (D 1a).
- Réservations, Baux, Relations et Documents sont absents à 0, Tâches toujours présente (D 2a). Les
  tâches s'ouvrent dans leur ligne (D 3a).
- L'onglet Visites est retiré au profit du filtre du fil (D 4a).
- Une seule ligne est ouverte à la fois, et elle vit dans `?section=` (D 5a). Un document ajouté
  relit la fiche et ouvre `?section=documents` (D 6a). La rangée « N biens correspondent » de CHERCHE ouvre
  `?section=biens` et amène la ligne à l'écran (AC5).
- Au bureau, la tête porte « Modifier » et un « ⋯ » (Saisir, Ajouter un document). Au téléphone, les
  trois sont dans la feuille du « ⋯ ». « Inviter » vit dans la ligne « Compte client » (D 7a).
- « Modifier la fiche » s'ouvre en panneau de droite, en état local (D 10a). Le formulaire
  `CustomerForm` prend une `forme: 'feuille'`, avec les sections Identité, Contact, Ce qu'il cherche
  et Pièce (D 9a). L'étape n'y est pas, et le statut reste dans Identité (D 8a).
- Une garde de sortie protège la saisie modifiée : « Abandonner les modifications ? ».

**Lot E — le dernier lot** (`e91a3fd98`, `02b353ae6`).
- Décisions :
  - E 1a : a-1 est relevé PARTIEL sur les blocs sans donnée de la démo, que les tests de composants
    couvrent.
  - E 2a : « Statut » reste dans Identité.
  - E 3a : `CustomerTagPicker forme="ligne"`.
  - E 4a : la carte Référent reste en place au téléphone.
  - E 5 : `PlanifierUneVisite variant="default"`.
- « Écrire » ne paraît que si le serveur accepterait le fil direct. L'API sert pour cela
  `GET /api/conversations/contacts?filter[id]=…` (`MessagingContactController`), et le front le lit par
  `useEstJoignable`. « Écrire » ne s'adresse jamais à soi-même.
- Correctif trouvé au relevé : toucher « ⋯ » au téléphone faisait tomber la page (MISSING_MESSAGE).
  Les libellés sont désormais traduits dans l'arbre de la page.

**Réserves de verif-commercial (2026-11-12)**
- Clavier de `CustomerTagPicker` : le champ est un `combobox` et la liste un `listbox`. Les flèches
  désignent une suggestion, et Entrée prend la suggestion désignée.
- Après une fermeture (Échap, « Terminé »), le focus revient sur « + Étiquette ». Après un retrait,
  il va sur la croix voisine, ou sur le champ.
- Le fil n'envoie qu'une requête pour deux `requestSubmit` dans la même tâche (verrou `useRef` posé
  avant `mutate`).
- Un test épingle la rangée de CHERCHE vers `?section=biens` (AC5).
- Une visite confirmée se montre sans « À confirmer » ni « Confirmer » (test « a-3 « la veille » »).
- Groupe 2 de la décision a-3 (team-lead : a), dans « Prochaine action » de `ResumeDuClient` :
  « Visite demain · {jour} {heure} » quand le jour de Dakar de la visite est le lendemain de
  maintenant (`useMinuteCourante`), « Confirmée » sous le bien d'une visite `confirmed`, et
  « Rappeler la visite », un WhatsApp pré-rédigé au numéro du client (prénom, bien, jour, heure).
  Le geste n'existe que pour une visite confirmée et un numéro joignable. Il est noté comme un geste
  WhatsApp, pour le seul personnel (`lecteurDuPersonnel`), comme les gestes de la tête. Cinq tests
  « TCK-2589 (a-3, groupe 2) », ablations g1 à g6 rouges.
- Toutes les ablations ont rougi, puis ont été restaurées.
- Balayage au navigateur de `/app/customers/{120,90}`, la fiche puis « Modifier » ouvert. À 768 et
  à 1024, `scrollWidth − innerWidth = 0`, sans coupe ni ellipse dans la fiche.
- Fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2589.json` apparie a-1, a-2 et a-3. Pour a-3,
  « la veille », aucune visite confirmée n'existe sur la démo. Trois zones de pixels sont déclarées
  (la barre de filtres du fil au bureau, à 1440 et à 1280 ; la barre du bas au téléphone).

**Suivi** (décision a-3, team-lead, 2026-11-12) :
- Groupe 1 (b, exclu) : données que l'API ne sert pas à la fiche, soit l'adresse de la visite,
  « Itinéraire », « SMS envoyé » et « Déduit du bien de sa demande ». Elles vont à TCK-2761. Le
  texte cité d'une réponse WhatsApp est exclu pour de bon, car l'échange se fait hors de Takussan.
- Groupe 2 (a) : fait dans ce ticket, voir plus haut.

**Réserve « titres de tâches » de la contre-vérification de verif-commercial (2026-11-12).** Avant ce
correctif, le bailleur auteur d'une fiche et l'agent auteur sans `crm.view_all` lisaient au fil et
dans `GET /api/customers/{id}/activity` le titre de la tâche que l'admin s'était donnée sur leur
fiche, alors que `GET /api/tasks/{id}` leur rendait 403. Décision de la session : une entrée de tâche
du fil et du journal suit `TaskPolicy::view`. Une tâche que le lecteur ne peut pas ouvrir est omise,
sans entrée ni titre, et le total ne la compte pas.

- `Task::scopeLisiblesSurUnParentPar(User, ?int $parentAgencyId)` est la forme SQL de `view` pour
  les tâches d'un parent connu. Elle couvre le créateur membre, l'assigné personnel, le suppléant
  d'une absence en vigueur et le lecteur d'équipe. Les bornes d'agence se jugent une fois pour la
  requête, jamais par ligne : le compte de requêtes du fil reste constant.
- `Task::scopeAssigneAuPersonnelActifDe(int)` reprend la borne « assigné personnel actif » de
  `filter[team]=1`. `TaskController::teamScope` la lit désormais, si bien que la liste d'équipe et le
  fil n'ont qu'une seule définition.
- `CustomerTimeline::tasks()` et `CustomerActivityFeed::paginate()` reçoivent le lecteur. La
  signature du journal devient `paginate(Customer, User $reader, int $perPage, bool $withVisitReports)`.
- Tests : `tests/Feature/Crm/CustomerTimelineTachesLisiblesTest.php`.
  - L'admin lit sa tâche au fil et au journal. L'agent auteur sans vue d'équipe et le bailleur
    auteur ne la lisent pas, et leur réponse ne contient pas son titre. L'agent garde la tâche qu'il
    a créée et celle qu'on lui a confiée. Le lecteur d'équipe lit la tâche d'un collègue.
  - Un test de parité vérifie que la clause SQL rend exactement ce que `$user->can('view', $task)`
    ouvre, pour six lecteurs et neuf tâches : absence, suspension, tâche supprimée, tâche sans
    assigné. Le compte de chaque lecteur est épinglé.
- Fixtures de `CustomerTimelineFicheEtTachesTest` : les tâches de fabrique n'avaient ni créateur ni
  assigné, et personne d'autre que le super-admin ne les ouvre. Elles portent désormais un auteur
  réel. Le cas du bailleur auteur ajoute une tâche de l'admin, qui reste hors du fil comme du journal.
- Ablations : sept, une à la fois, toutes rouges puis restaurées. On retire la clause du fil, puis
  celle du journal. On neutralise chacune des branches équipe, absences, créateur et assigné. Enfin,
  on retire la borne « assigné personnel actif » de la branche d'équipe.
