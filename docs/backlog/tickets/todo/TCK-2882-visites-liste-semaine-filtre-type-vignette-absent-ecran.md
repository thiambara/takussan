---
id: TCK-2882
title: "Visites, côté personnel : la bascule « Liste · Semaine » et le filtre « Type » au bureau, la vignette de carte au-dessus de l'adresse au téléphone, « Absent » qui prévient le visiteur et propose de replanifier"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2871]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [front, visits, agenda, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent voit ses visites en liste ou sur sa semaine, filtre par type de visite, repère le lieu sur une petite carte avant de partir, et sait qu'un « Absent » prévient le visiteur avec une proposition de replanifier.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-visites e0 à e3). Relevé :

- « Liste · Semaine » : la fiche de TCK-2587 l'a renvoyé à TCK-2597, qui n'a livré la semaine que dans l'Agenda ; aucune vue Semaine dans `components/visits/par-le-temps/` ;
- filtre « Type » : absent du produit et de la fiche (seuls Agent, Bien, Période, `VisitesParLeTemps.tsx:575-638`) ;
- vignette de carte (téléphone e1, e2, e3) : classée « technique » ; aucune tuile de carte dans le produit ;
- « Absent » enregistre seulement l'absence ; la maquette dit qu'il prévient et propose de replanifier — l'API le fait par TCK-2871 ;
- le filtre « Statut · Demandées » du mode « Par le temps » avait été écarté (« justifié ») : il est dessiné, il entre ici.

## Contrat de données

- `GET /api/property-visits` avec `filter[type]` et `filter[status]` (déjà dans `PropertyVisit::$requestFilterable`), période.
- Coordonnées du bien : `address.latitude`, `address.longitude` (`PropertyVisitResource::adresse`, personnel).
- `POST /api/property-visits/{visit}/no-show` (notification `visit.no_show`, TCK-2871).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-visites`, approche **a** — fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-visites-a.tsx` (bureau, `BureauListe`, l. 217-284) et `app-visites-a-mobile.tsx` (téléphone ; `CarteFictive` de `app-visites-pieces.tsx` ; l. 503 et 603 pour « Absent ») ; écrans **e0 Liste**, **e1 Détail — à confirmer**, **e2 Détail — jour J**, **e3 Détail — après l'heure**.

- **Téléphone (390)** — manque : e1, e2, e3, la vignette de carte au-dessus de l'adresse (toucher → itinéraire) ; e3, la phrase « « Absent » prévient {prénom} et propose de replanifier. » à la place de « … enregistre que {prénom} n'est pas venu ».
- **Bureau (1440)** — manque : e0, le segmenté « Liste · Semaine » (mode « Par le temps ») ; le filtre « Statut » (mode « Par le temps », défaut « Demandées ») et le filtre « Type » (mode « Par statut », défaut « Tous » ; En personne, Virtuelle, En autonomie, Hybride) ; e3, la même phrase pour « Absent ».
- **Semaine** : la vue semaine de l'Agenda (`SemaineDeLAgenda`, TCK-2597) réduite aux visites, mêmes filtres que la liste ; pas d'écran dessiné au-delà du segmenté (écart « hors maquette » motivé dans la fiche).
- **Vignette** : tuile statique (image de carte, sans bibliothèque de carte interactive) centrée sur le bien ; aucune vignette si les coordonnées manquent. Fournisseur de tuiles : celui que le site public utilise déjà pour la carte d'un bien s'il en a un, sinon OpenStreetMap avec attribution — à trancher par l'implémenteur, sans clé payante.

## Contraintes strictes (métier)

- La vignette n'est rendue qu'au personnel qui lit l'adresse (règle de `adresseLisible`, inchangée).
- La vue Semaine ne charge que la semaine affichée (une requête), sparse fieldsets.
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] Segmenté Liste · Semaine et vue Semaine des visites (bureau).
- [ ] Filtres Statut (Par le temps) et Type (Par statut).
- [ ] Vignette de carte (téléphone, e1-e3).
- [ ] Texte d'« Absent » et retour de la notification.
- [ ] Tests de composant : bascule Semaine conserve les filtres ; filtre Type → `filter[type]` ; vignette absente sans coordonnées ; texte d'Absent.

## Critères d'acceptation

- [ ] AC1 — À 1440, « Semaine » montre les visites de la semaine en colonnes de jours, aux mêmes filtres que la liste ; « Liste » y revient.
- [ ] AC2 — À 1440, en mode « Par statut », le filtre « Type = Virtuelle » ne garde que les visites virtuelles (requête `filter[type]=virtual`).
- [ ] AC3 — À 390, le détail d'une visite confirmée d'un bien géolocalisé montre la vignette de carte au-dessus de l'adresse ; un bien sans coordonnées n'en montre pas.
- [ ] AC4 — À 390, « Absent » sur une visite passée dit « prévient Abdoulaye et propose de replanifier » et la notification `visit.no_show` part (TCK-2871).
- [ ] AC5 — Vérifier au navigateur, une journée avec deux visites confirmées et une visite passée sans compte rendu : la carte « prochaine visite », « Libre de … à … » et « À clore » s'affichent comme la maquette e0 (téléphone) ; corriger si non.
- [ ] AC6 — Vérifier au navigateur la barre « En cours » / « Heure passée » d'une visite commencée (`?fid=encours`) et d'une visite dont la fin est dépassée (e3, les deux formats) ; corriger si non.
- [ ] AC7 — À 1440, le bouton « Confirmer à HH:MM » d'une visite à confirmer porte son chevron, qui ouvre les autres heures libres du jour (même liste que « Proposer une autre heure ») ; l'écart « sans chevron » de TCK-2587 est retiré.
- [ ] AC8 — À 1440, la barre « En cours » d'une visite commencée garde la bulle « Je suis en route » (message WhatsApp prérempli, maquette e3) ; l'écart « vérité des données » de TCK-2587 est retiré.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2882.json` : écrans e0 à e3 de `app-visites` (a), téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- Le compte rendu (TCK-2880 ; `app-visites` e4 abandonné) ; le côté client (TCK-2883).

## Notes d'implémentation

### 2026-11-15 — implémentation (agent, vague 92)

**Prémisse re-mesurée.** Filtres du bureau à `VisitesParLeTemps.tsx` l. 575-641 (Agent, Bien, Période) : confirmé, ni « Statut » ni « Type ». Aucune vue Semaine dans `par-le-temps/`. « Absent » : `visits.fiche.enCours.absent` disait « enregistre que {prenom} n'est pas venu » ; `useMarkVisitNoShow` / `useAbsentDepuisLaListe` étaient typés sans le sort du SMS que `noShow` rend depuis TCK-2871. « Confirmer à 15:00 » sans chevron et bulle « en route » absente de la barre « En cours » : confirmés (écarts de TCK-2587). Coordonnées : `PropertyVisitResource::adresse` sert `latitude`/`longitude` en `float` (ou `null`).

**Ce qui est livré.**
- **Liste · Semaine** (bureau, mode par le temps) : segmenté `ListeOuSemaine` dans l'en-tête, `?affichage=semaine` ; `?semaine=AAAA-MM-JJ` porte le jour (navigation Précédent · Aujourd'hui · Suivant, `NavPeriode` de l'Agenda). `SemaineDesVisites` rend `SemaineDeLAgenda` (inchangé) avec les visites converties en `CalendarEvent` (demande par tranche → rangée « sans heure »). UNE lecture `GET /api/property-visits` : `scheduled_at_min` = lundi 00:00 Dakar, `scheduled_at_max` = dimanche 23:59:59, `per_page=100` (plafond `PER_PAGE_MAX`), mêmes sparse fieldsets que la liste (`VISIT_TIME_FIELDS`), mêmes affinages (agent, bien, recherche). Au-delà de 100 visites, l'écran le dit (« Les 100 premières sur N »). Sans statut choisi, la semaine montre tout sauf les annulées (`filter[status]=scheduled,confirmed,completed,no_show`), comme l'Agenda — contrat tenu côté API par `tests/Feature/Visits/VisitWeekStatusListFilterTest.php` (liste à virgules du filtre exact `status`, bornes de la semaine). Terminées et absentes se posent dans la grille avec la couleur des confirmées (la palette de l'Agenda ne connaît que « en attente » ou non) ; les annulées n'y entrent que sous « Statut = Annulées ». Le filtre « Agent » de la semaine suit la garde `crm.assign` de la liste. Sous « Semaine », les onglets de vue et le filtre « Période » s'effacent (la semaine est la période). Un créneau vide ouvre « Planifier » à son jour et son heure (personnel).
- **Statut** (mode par le temps) : `?statut=` ∈ requested · confirmed · completed · cancelled. Il FILTRE sous « Aujourd'hui » et « Semaine » (ajouté à la borne de la vue, jamais à `AffinageDesVisites`, qui nourrit `/counts`) ; sous « À confirmer » et « Plus tard », il MONTRE le statut que l'onglet fixe (« Demandées », « Confirmées ») sans menu ; sous « À clore » (confirmées passées et terminées sans compte rendu) il n'est pas posé. Sous « Aujourd'hui » filtré, la pastille « Aujourd'hui » se tait (son compte ne suit pas ce filtre).
- **Type** (mode par statut = « Toutes ») : `?type=` borné aux quatre types, passé en `filter[type]` aux six onglets de `VisitsList` (bureau seulement) ; un changement remet chaque onglet en page 1 ; « Toutes N » se tait sous un type ; revenir à une vue par le temps retire `type` ; au téléphone, où aucun contrôle ne le montre, `?type=` ne filtre pas. `Filtre`/`Option` sortis de `VisitesParLeTemps` dans `par-le-temps/filtres.tsx`.
- **Vignette de carte** (téléphone, fiche, e1-e3) : **fournisseur = OpenStreetMap** (`tile.openstreetmap.org`), celui des trois cartes Leaflet du dépôt (fiche publique d'un bien, carte des biens, choix d'un emplacement) ; aucune clé, aucune dépendance : 3 × 3 tuiles `<img>` au zoom 16 posées en décalage du point (`lib/carte/tuiles-osm.ts`, projection Web Mercator), épingle au centre, « © OpenStreetMap » lié à la page de copyright. Toucher la vignette ouvre l'itinéraire (`lienItineraire`). Rendue au personnel (`abilities.manage`) seulement, et seulement avec deux coordonnées finies dans leurs bornes. `next/image` évité : il exigerait l'hôte des tuiles dans `next.config.ts`.
- **Absent** : « « Absent » prévient {prénom} et propose de replanifier. » au téléphone (carte « En cours ») et au bureau (sous la plage de la barre du jour, une fois « Absent » possible). Le toast dit que le visiteur est prévenu ; `sms_sent === false` ajoute l'avertissement « Le SMS au visiteur n'est pas parti » (fiche et liste), comme « Confirmer » — et la phrase « prévenu » se tait alors (le SMS retenu la démentirait).
- **AC7** : `ConfirmerALHeure` — « Confirmer à 15:00 ▾ », le chevron ouvre les autres heures libres du JOUR — la lecture de « Proposer une autre heure » (`/slots`, même clé de cache que les heures proposées, aucune requête de plus), délai de prévenance compris —, chacune confirmable ; sans autre heure (heure fixée), pas de chevron. Docblock orphelin (l. 845) rattaché à son composant.
- **AC8** : pendant « En cours », la barre du bureau garde la bulle du message « je suis en route » ; elle est le lien WhatsApp prérempli (aucun bouton « Je suis en route » pendant la visite, comme la maquette).
- Fiche de fidélité `docs/qa/audit-ux-2026-11/fidelite/TCK-2882.json` ; dans `TCK-2587.json`, retrait des écarts « Liste · Semaine », « Statut · Demandées », « Confirmer sans chevron », « bulle en route absente » et du hors-périmètre « vue Semaine ».
- `src/i18n/namespaces.json` régénéré (`--update`) : la frontière `(dashboard)/app/visits` sert désormais `agenda`.

**Non mesuré (pas de navigateur dans ce lot).** AC5, AC6 : relus contre `app-visites-a-mobile.tsx` (`MobileAListe` : bloc « Aujourd'hui » noté du jour, `CarteProchaine` « dans 45 min », « Libre de … à … », « À clore » noté « compte rendu à faire », « À confirmer » et « Plus tard » avec « Tout voir », « Par statut » — mêmes blocs que `AujourdhuiDuTelephone`) et `BarreJourJBureau` (« En cours » / « Heure passée ») — le code de TCK-2587 les rend ; aucun écart trouvé à la lecture. AC-F2 : idem.

**Mesures.** `npx vitest run` : `semaine-et-filtres.tck-2882.test.tsx` (9), `fiche.tck-2587.test.tsx` (+8 TCK-2882, test « 5 » révisé pour AC7, un créneau libre du matin ajouté au double), `VisitesParLeTemps.tck-2587.test.tsx` (+1 : toasts d'« Absent »), `tuiles-osm.tck-2882.test.ts` (8) ; les 28 fichiers de test des visites : 233 verts ; `php artisan test tests/Feature/Visits/VisitWeekStatusListFilterTest.php` vert. 18 ablations une à une, toutes rouges, restaurées au md5. `tsc --noEmit` propre, ESLint propre, `check:i18n` vert, gardes `scripts/check-*.mjs` (racine et front) vertes sauf `check-valeurs-arbitraires-app` (ombre arbitraire de `components/messages/MessagesPage.tsx`, travail en cours d'un autre agent) ; `tsc` rouge seulement sur `PropertyReservationDialog.via-invitation.tck-2874.test.tsx` (TCK-2874, en cours).
