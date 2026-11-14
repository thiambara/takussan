---
id: TCK-2596
title: "Aujourd'hui, la journée de l'agent : « À régler » puis la chronologie, ses chiffres en bas — et les tâches logées sans perte"
status: todo
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-14
depends_on: [TCK-2578, TCK-2583, TCK-2585, TCK-2588, TCK-2595, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2622]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models:
    - "docs/models-spec.md#32-task-"
    - "docs/models-spec.md#17-propertyvisit-"
tags: [front, dashboard, tasks, visits, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent qui ouvre Takussan le matin, ou entre deux rendez-vous, voit sur un seul écran ce qu'il doit régler et où il doit être, dans l'ordre de la journée — et coche, reporte ou appelle sans changer de page.

## Contrat de données

Aucun endpoint neuf ; la page compose :
- visites du jour choisi : `GET /api/property-visits?filter[day]=&filter[mine]=1&include=property,customer` avec adresse et visiteur (TCK-2585) ;
- comptes rendus manquants : `filter[to_close]=1&filter[mine]=1` (TCK-2578) ;
- demandes qui attendent : `GET /api/contact-leads?filter[mine]=1&filter[handled]=0&filter[created_at_max]=<maintenant − 24 h>` (TCK-2583) ;
- tâches : `GET /api/tasks?filter[assigned_to]=me&filter[due]=overdue,today` (TCK-2595), et la page Tâches avec ses filtres ;
- relances : compte de `GET /api/customers?filter[follow_up]=1&filter[referent]=me` (TCK-2588) ;
- chiffres de l'ancien accueil : `GET /api/dashboard/me` (`properties_managed`, `pipeline_total`, `tasks_open`, `tasks_overdue`, `commissions_month` — `AgentMeMetrics.php:24-32`) ;
- gestes : `PATCH /api/tasks/{id}` (faite, échéance, assigné), `DELETE /api/tasks/{id}` (créateur), `POST /api/tasks`, `POST …/contacts` (TCK-2583).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-aujourdhui&a=a` — écrans « Ma journée », « Toutes les tâches », « Nouvelle tâche », « Tâche ouverte », « Journée libre » (deuxième retouche du 2026-11-10 : « Aujourd'hui » devient l'accueil de l'agent) ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- En-tête « Mardi 10 novembre » et bande de semaine défilante (L M M J V S D, chaque jour avec « 2 visites · 3 tâches » ou « Libre ») ; jour précédent / suivant ; « + » dans l'en-tête (Visite, Tâche, Client) — **aucun bouton flottant**.
- **À régler** (compté) : compte rendu manquant [Faire], demande qui attend depuis N j [WhatsApp], tâches en retard [✓][Reporter] — le retard sur sa propre ligne (« En retard depuis le 17 oct. »).
- **Chronologie** : ce qui a une heure dans l'ordre — « 10:57 · Visite · Local commercial · Dakar-Plateau · Abdoulaye Cissé » avec Itinéraire, Appeler, WhatsApp ; « 18:00 · Tâche · Relancer Yacine ».
- **Mes chiffres**, en petit au bas : une carte de quatre cases, chacune en lien vers sa liste — Biens gérés, Prospects (« N à relancer »), Tâches ouvertes (« dont N en retard »), Commissions du mois — et « Voir le rapport du mois » (pied de carte au téléphone, lien de l'intertitre au bureau).
- **Journée libre** : « Rien de prévu aujourd'hui. » + « N prospects à relancer ▸ ».
- **Toutes les tâches** (page Tâches) : pastilles En retard · Aujourd'hui · À venir · Sans échéance · Faites, avec compteurs, ouverture sur **En retard + Aujourd'hui** ; ligne : cercle à cocher, titre, **bien ou client nommé**, échéance (rouge si passée), gestes ; balayer à droite = Fait, à gauche = Reporter (Demain · Lundi · Choisir) ; toucher = « Tâche ouverte » (modifier, reporter, assigner, supprimer) ; « + » = feuille courte (titre, échéance en pastilles Aujourd'hui / Demain / Lundi / Date, rattachement prérempli quand on vient d'une fiche, d'une visite ou d'une demande).
- **Téléphone (360-390 px)** : une colonne, comme ci-dessus. **Bureau (≥ 1280 px)** : deux colonnes dès `lg` — chronologie à gauche, « À régler » et « Mes chiffres » à droite ; Tâches en trois colonnes En retard · Aujourd'hui · Cette semaine + « Plus tard » ; filtre « Assignée à » pour l'admin (TCK-2595).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md), [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md), [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md).

**Pas de régression** — l'ancien accueil de l'agent (`app/(dashboard)/app/(accueil)/page.tsx`) et « Mes tâches » (`MyTasks.tsx`, `tasks/page.tsx`, audit § 6) :
- les quatre chiffres de `DashboardMeKpis` (Biens gérés, Pipeline → « Prospects », Tâches ouvertes avec le retard, Commissions du mois) restent, chacun en lien ;
- le bandeau des brouillons d'assistant (`wizard-drafts`) reste en tête quand il y en a ;
- les raccourcis de `DashboardShortcuts` (clients, visites, calendrier, messages) restent atteignables : par les onglets, le Menu ou un lien de la page ;
- Tâches : `?filter[due]=` (Toutes, En retard, Aujourd'hui, À venir, Sans échéance) et `?filter[assigned_to]=me` (cible de la tuile « Tâches du jour ») gardés dans l'URL et conservés au changement d'échéance ; « Nouvelle tâche » (titre, date et heure, rattachement Client / Bien par recherche dès 2 caractères, 8 résultats, « Changer », bouton actif seulement avec titre et cible) ; cocher / décocher ; titre barré une fois faite ; lien vers le client ou le bien ; Appeler / WhatsApp pour un client ; « Voir plus » par 30 ; chargement, erreur avec « Réessayer », vide par filtre ; tâches d'un client toujours créées depuis sa fiche et visibles dans l'agenda ;
- une tâche ne s'assigne qu'au personnel de l'agence ; « Supprimer » n'est offert qu'au créateur.
- **Persona** : cette page est l'accueil de l'agent ; l'admin d'agence, le bailleur, le client gardent leur accueil (famille 3). La page Tâches sert tous les personas qui l'ont aujourd'hui.
- Heure de Dakar ; i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Contenu « Ma journée » (bande de semaine, À régler, chronologie, Mes chiffres, journée libre) pour l'agent.
- [ ] Page Tâches refaite (pastilles comptées, ouverture En retard + Aujourd'hui, balayage, feuille de tâche, édition, report, assignation, suppression).
- [ ] Tests : sources composées (requêtes émises avec leurs filtres) ; tri de la chronologie ; « Reporter · Demain » envoie `due_at` du lendemain 09:00 Dakar ; « Supprimer » absent pour une tâche créée par un autre ; chiffres en liens ; bandeau de brouillons présent ; `?filter[assigned_to]=me` conservé au changement d'échéance.

## Critères d'acceptation

- [x] AC1 — À 390 px, l'agent de démo voit en premier écran « À régler » (compte rendu de la villa Liberté 6, Mouhamed qui attend depuis 8 j, deux tâches en retard) puis la visite de 10:57 avec son adresse.
- [x] AC2 — Les quatre chiffres sont au bas de la page, chacun un lien (Biens gérés → « Mes biens », Prospects → la liste des clients filtrée sur les étapes vivantes et « Mes clients », Tâches ouvertes → Tâches, Commissions → la page des commissions ; mêmes cibles que les tuiles actuelles quand elles en ont une) ; « Voir le rapport du mois » mène à la page Rapports.
- [x] AC3 — La tâche « Faire signer l'état des lieux d'entrée » affiche le nom du bien (plus « Un bien »).
- [x] AC4 — Toucher le jour suivant dans la bande recharge la chronologie de ce jour (requête `filter[day]` du jour suivant au réseau).
- [x] AC5 — À 1280 px, chronologie et « À régler » sont côte à côte ; la page Tâches s'ouvre sur En retard + Aujourd'hui.

  *Preuves (re-jouées sur HEAD le 2026-11-14)* : AC1 `MaJournee.tck-2596.test.tsx` « AC1 — … » (la ligne « Mouhamed qui attend depuis 8 j » n'existe pas sur la démo : test seulement) ; AC2 même fichier, « AC2 — les quatre chiffres… » et « AC2 — pipeline_total (38) n'est jamais rendu… », `liste-des-clients.tck-2596.test.ts`, `CustomerListFilters.test.tsx` ; AC3 `PageDesTaches.tck-2596.test.tsx` « groupe par échéance : le bien nommé… » ; AC4 `MaJournee.tck-2596` « AC4 — … (`filter[day]`) » ; AC5 `MaJournee.tck-2596` « AC5 » et `PageDesTaches.tck-2596` « s'ouvre sur En retard + Aujourd'hui ».

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2596.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- **Le routage de `/app` par persona et la barre d'onglets de l'agent** (Aujourd'hui · Demandes · Clients · Messages · Menu, décision 10) : famille 3. Ce ticket livre le contenu ; sans le ticket de la coque, il est servi à l'agent sur `/app` en remplacement du contenu actuel de l'accueil, la coque restant inchangée.
- La page Rapports (famille 3) et la page Commissions (famille 6), cibles des liens.
- « 3 sans photo » et « 310 000 F à venir » (sous-lignes de la maquette sans donnée servie).
- Les tâches qui naissent seules des événements.

## Notes d'implémentation

**Lot 1 — « Ma journée » (contenu de l'accueil de l'agent).**

- `app/(accueil)/page.tsx` sert `MaJournee` quand le rôle du profil ACTIF (`dashboard/me`) est `agent` ; l'admin d'agence, le bailleur et le client gardent leur accueil. Le bandeau des brouillons d'assistant passe en tête de la journée. `DashboardShortcuts` n'est plus rendu pour l'agent : clients, visites, calendrier et messages restent atteignables par la coque (barre latérale, onglets, Menu).
- Lectures : visites du jour (`useVisitesDeLaVue`, `filter[day]`) et comptes rendus (`filter[to_close]`) du module des visites ; tâches en retard et du jour (`filter[assigned_to]=me&filter[due]=overdue,today`), demandes de plus de 24 h (`filter[created_at_max]`) et compte des relances (`per_page=1`) dans `lib/queries/journee.ts` ; la bande de semaine et les tâches d'un autre jour par `/api/calendar?mine=1&types[]=visit&types[]=task` (le modèle `Task` n'a pas de filtre d'échéance par intervalle).
- Règles pures dans `lib/journee/journee.ts` (heure de Dakar) : « Reporter » → `due_at` à 09:00 Dakar le lendemain, le lundi suivant ou à J+7 ; chronologie triée par instant, visite avant tâche à heure égale, sans les visites annulées ni les demandes à créneau souple.
- « Mes chiffres » : Biens gérés → `/app/properties?only_mine=1`, Prospects → `/app/customers?vue=mes-clients` (sans filtre « étapes vivantes », que la liste n'offrait pas — corrigé le 2026-11-14, voir « Décision du 2026-11-14 » plus bas), Tâches ouvertes → `/app/tasks?filter[assigned_to]=me`, Commissions → `/app/commissions`, « Voir le rapport du mois » → `/app/overview/agent`. *(Cibles du lot 1 ; sur HEAD au 2026-11-14 : Tâches ouvertes → `?filter[due]=overdue,today,upcoming,none&filter[assigned_to]=me` (lot 2), rapport → `/app/reports` — `CIBLES_DES_CHIFFRES` de `MesChiffres.tsx` fait foi.)*
- « + » de l'en-tête : Visite (dialogue de planification au jour choisi), Tâche (`/app/tasks` jusqu'au lot 2), Client.
- Fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2596.json`, écran a-0 relevé aux trois formats ; a-4 (journée libre) non reproductible sur la démo, couvert par test. Balayage 360 → 1440 : aucun débord.
- Donnée de la démo le jour du relevé (2026-11-13) : aucune demande de plus de 24 h pour Sokhna Sene, quatre tâches en retard et deux comptes rendus — la ligne « Mouhamed qui attend depuis 8 j » d'AC1 n'est pas reproductible, elle est couverte par le test de composant.

**Lot 2 — la page « Tâches » (`components/taches/`, `lib/taches/taches.ts`, `lib/queries/taches.ts`) ; `MyTasks.tsx` supprimé.**

- URL : `filter[due]` garde son contrat (une valeur, ou une liste `overdue,today` — TCK-2595), `all` pour « Toutes », `filter[status]=done` pour « Faites », `filter[assigned_to]=me` gardé à chaque changement. Sans échéance, la page s'ouvre sur En retard + Aujourd'hui (l'URL reste nue). `?nouvelle=1` ouvre « Nouvelle tâche » (le « + » de « Ma journée » y mène).
- Pastilles comptées par `meta.total` d'une lecture d'une ligne : ce qui RESTE à faire (`filter[status]=open,in_progress`) pour les échéances, les faites pour « Faites ». La liste, elle, garde les tâches faites du jour (cocher ne fait pas disparaître la ligne : titre barré).
- `fields[tasks]` porte `assigned_to_id` et `created_by_id` : sans eux l'API rend assigné et créateur nuls (mesuré). Tri `due_at` ; les faites, `-due_at` (pas de tri sur `completed_at`).
- Groupes au jour de Dakar : En retard (ouverte), Aujourd'hui, Cette semaine (jusqu'au dimanche), Plus tard, Sans échéance, Faites ; sections au téléphone, colonnes dès `xl`. Le compte d'un groupe est celui de l'API quand toutes les pages ne sont pas chargées.
- Tâche ouverte (feuille du bas, panneau droit dès `xl`) : titre modifiable, Reporter à Demain · Lundi · Dans une semaine (09:00 Dakar) · Choisir…, rattachement en lien, assigné (le personnel de l'agence ; la liste est réservée à l'admin, un 403 laisse « Moi » seul ; l'assigné affiché est celui que l'API rend — un absent est remplacé), Appeler / WhatsApp pour un client, « Supprimer » pour le seul créateur (confirmé). Gestes réservés à l'assigné et au créateur (`TaskPolicy::update`).
- Nouvelle tâche : titre, échéance en pastilles (Aujourd'hui · Demain · Lundi · Date…, « + Heure » ; sans heure 09:00 Dakar), Un client / Un bien par recherche (2 caractères, 8 résultats, « Changer »), assigné ; « Créer la tâche · demain » actif avec un titre et une cible.
- Balayage au doigt (pointeur tactile) : à droite « Fait », à gauche ouvre la tâche sur « Reporter à » ; seuil pur (`issueDuBalayage`).
- « Assignée à » (vue d'équipe, `filter[team]=1`, `filter[assigned_to_id]`) offert à l'admin d'agence qui tient `crm.view_all` ; l'agent la tient aussi (`SystemRoleCapabilities::agent`) mais garde « Assignées à moi », comme la maquette.
- « Ma journée » : « Tâches ouvertes » et « Toutes les tâches » mènent à `?filter[due]=overdue,today,upcoming,none&filter[assigned_to]=me` (ce que compte `tasks_open`), « + Tâche » à `?nouvelle=1`.
- Clés `agentCrm.myTasks.*` retirées (sans lecteur). Hors du lot : rattachement prérempli depuis une fiche (le formulaire l'accepte, aucune entrée ne le passe encore), « Grouper par » / « Rattachée à » du bureau.

**Décision du 2026-11-14 — « Prospects » ouvre ce qu'il compte (AC2).**

- Le lien mène à `/app/customers?vue=mes-clients&stage_group=active`. Le filtre est serveur : `filter[stage_group]=active` existait dans l'API (TCK-2588, `Customer::getAllowedQueryFilters`, testé par `CustomerFollowUpTest::test_groupe_d_etapes_vivantes`) — aucun delta d'API. La liste lit `stage_group` dans l'URL (`lireLaListe` ; toute autre valeur est ignorée, l'API la refuserait d'un 422), le passe à `fetchDashboardCustomers`, et le compte comme filtre posé. Les comptes des vues ne le portent pas (globaux, comme avant).
- Le filtre « Étape » offre « Prospects actifs » à côté de « Toutes les étapes » : le filtre posé se lit (« Étape · Prospects actifs »), compte dans « Filtres · N », et une étape précise ou « Toutes les étapes » le retire (les deux s'excluent).
- Le chiffre de la case suit sa liste. Mesuré en lecture seule sur la démo (Sokhna Sene) : `pipeline_total` de `dashboard/me` = 38 (fiches qu'elle a AJOUTÉES, toutes étapes, Gagné et Perdu compris), la liste cible = 7 (référent = elle, étapes vivantes) ; avant le correctif, la liste en montrait 17. La case lit donc `meta.total` de `filter[referent]=me&filter[stage_group]=active` (`useProspectsACompter`, le patron du « 6 à relancer » de la même case) ). Écart au contrat de données du ticket (qui nommait `pipeline_total`), **tranché par team-lead le 2026-11-14 : (b), sans aucun repli sur `pipeline_total`** — ni au chargement ni en panne, un repli afficherait un chiffre faux (38 pour une liste de 7). Au chargement comme en échec de lecture, la case rend « — », la valeur absente de ses voisines ; comme « à relancer » en panne, elle n'invente rien. Test « AC2 — pipeline_total (38) n'est jamais rendu… », ablation : le repli remis (en panne, ou toujours) → rouge.
- Aria : « Prospects : 7, ouvrir Mes prospects actifs » (`journee.chiffres.vers.prospects`).
- Limites connues : les comptes des vues et le sous-titre restent globaux (comme pour tout filtre de la liste) — « Mes clients · 17 » au-dessus d'une liste de 7, gardé tel quel par team-lead le 2026-11-14 ; « Prospects actifs » est une option absente de la maquette `app-clients` (motif : seule entrée lisible et amovible du filtre que « Prospects » pose ; écrit dans `docs/qa/audit-ux-2026-11/fidelite/TCK-2596.json`, `ecarts_acceptes`, sans relevé) ; la barre du bureau à 1280 avec le libellé long n'a pas été relevée.
- Page Tâches (lot 2, 693c5aa94) : ablations du 2026-11-14 sur l'ouverture par défaut (AC5) et le nom du bien sur la ligne (AC3) — voir le manifeste.
