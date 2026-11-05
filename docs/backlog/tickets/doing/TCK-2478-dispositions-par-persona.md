---
id: TCK-2478
title: Un menu par persona — dispositions, action principale, en-tête d'espace, complément « Aussi … », espace suspendu
status: doing
phase: P1
family: front
estimate: L
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: [TCK-2477]
blocks: [TCK-2479, TCK-2480, TCK-2481, TCK-2483]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
  models: []
tags: [front, navigation, coque, adr-0089, i18n]
---

## Objectif utilisateur

Chaque profil — client, locataire, bailleur, agent, admin d'agence, hôte, prestataire, plateforme —
trouve en tête de son menu ce qu'il fait le plus, rangé selon son métier, avec son geste principal à
portée de main.

## Contrat de données

- Endpoints existants seulement : `GET /api/me/profiles` (agence et type du profil actif, pour
  l'en-tête d'espace), `GET /api/me/capabilities`, lecture de l'agence par le layout (`kind`,
  `status`).
- ⚠ À relever avant d'écrire l'action principale de l'agent : un parcours de création de visite
  existe-t-il sous `/app` ? Sinon l'action de l'agent est « Publier un bien » (sous
  `properties.create`), et l'écart s'écrit dans les notes.

## Direction UX / Artistique

Dispositions validées par le porteur le 2026-11-05 (➊ = action principale ; *(replié)* = replié
par défaut). La charte reste `docs/design-guidelines.md` (palette Lin).

| Persona | ➊ | Groupes, dans l'ordre | Plus |
|---|---|---|---|
| client | Chercher un bien | — : Tableau de bord · Messagerie / Mes recherches : Favoris · Recherches sauvegardées / Mes démarches : Visites · Réservations | Documents · Mes avis · Statistiques ; carte basse « Mettre un bien en location » (`/publish`), sur le modèle de la carte « Passer en pro » |
| locataire | Payer mon loyer | — : Tableau de bord · Messagerie / Mon logement : Mon bail · Paiements · Interventions · États des lieux · Documents / Mes recherches *(replié)* : Favoris · Recherches · Visites · Réservations | Mes avis · Statistiques |
| bailleur | Proposer un bien | — : Tableau de bord · Messagerie / Mon patrimoine : Mes biens · Baux · Finances · États des lieux / Activité : Demandes · Visites · Réservations · Calendrier · Interventions | Clients · Avis reçus · Documents · Statistiques · Exports · Favoris · Recherches |
| agent | Nouvelle visite (repli : Publier un bien) | — : Tableau de bord · Messagerie · Mes tâches / Prospection : Demandes · Clients · Visites · Calendrier / Catalogue : Mes biens · Réservations / Gestion : Baux · Entrées en attente · États des lieux · Interventions · Commissions | Avis reçus · Documents · Statistiques · Exports · Favoris · Recherches |
| admin-agence | Publier un bien | — : Tableau de bord · Vue agence · Messagerie / Activité : Demandes · Visites · Réservations · Calendrier / Portefeuille : Biens · Propriétaires · Clients · Baux · Entrées en attente / Finances : Finances · Commissions · Crédits · Facturation / Agence *(replié)* : Équipe · Rôles · Agence · KYC · Modération avis · Modération biens · Journal · Intégrations / Pilotage *(replié)* : Statistiques · KPIs · Alertes · Exports | Interventions · Carnet prestataires · États des lieux · Documents · Avis reçus |
| hote | Publier un bien | — : Tableau de bord · Messagerie / Mes biens : Mes biens · Réservations · Visites · Calendrier · Demandes / Mes locations : Baux · Finances · États des lieux · Interventions · Carnet prestataires / Mon espace : Agence · KYC · Reversements · Crédits · Intégrations | Clients · Statistiques · Exports · KPIs · Alertes · Avis reçus · Documents ; carte « Passer en pro » conservée |
| prestataire | — (aucune) | — : Tableau de bord · Interventions · Messagerie · Documents (aucun titre) | — |
| plateforme | Publier un bien | la disposition d'admin-agence | + lien bas « Console plateforme » (`/super-admin`) |

- **➊** : bouton plein en tête, seule surface de couleur primaire du menu ; absent (jamais
  désactivé) si le profil ne peut pas l'accomplir.
- **En-tête d'espace** : carte compacte en haut de la barre — nom de l'agence et persona
  (« Agence Teranga · Admin ») —, qui ouvre le sélecteur de profil ; précieuse dans le tiroir mobile,
  qui recouvre la barre haute. Le sélecteur de la barre haute ne bouge pas.
- **Complément « Aussi bailleur » / « Aussi agent » …** : groupe replié en bas de la barre.
- **Entrée active cachée** : si la page ouverte est dans « Plus », un groupe replié ou le complément,
  ce groupe s'ouvre.

## Contraintes strictes (métier)

- Une entrée n'apparaît que si son prédicat d'accès l'autorise (TCK-2477) ; un groupe vidé disparaît.
- Le complément ne porte QUE des destinations accessibles par un autre profil ACTIF du même espace
  (union de `roles`, ADR-0005 amendé) et non par le persona ; il s'ouvre sans changer de profil.
- **Espace suspendu** (`agency.status === 'suspended'`, TCK-600) : ➊ disparaît, ainsi que les entrées
  dont le seul objet est une écriture (publier, proposer, inviter) ; la lecture reste.
- Le cadenas de l'agence `individual` (`isProRouteLocked`) est conservé.
- Libellés neufs dans les trois langues ; le wolof porte le texte français tel quel (pause du wolof).

## Delta à produire

- [x] Les huit dispositions ci-dessus remplacent les dispositions « miroir » de TCK-2477.
- [x] Action principale par persona, en tête de barre.
- [x] En-tête d'espace ouvrant le sélecteur de profil.
- [x] Complément « Aussi … » replié.
- [x] Règle de l'espace suspendu ; ouverture du groupe de l'entrée active.
- [x] Carte « Mettre un bien en location » du client ; lien « Console plateforme ».
- [x] Mise à jour d'`AppSidebar.test.tsx` : l'écart avec l'ancien menu, rôle par rôle, est écrit
      dans les notes de ce ticket.
- [x] Tests : disposition rendue par persona ; complément ; suspendu ; entrée active cachée ; a11y
      (axe) de la barre de chaque persona.

## Critères d'acceptation

- [x] AC1 — Pour chacun des huit personas, le menu rendu suit la table ci-dessus, aux entrées
      inaccessibles près (test par persona sur le composant monté).
- [x] AC2 — Un admin d'agence `standard` qui est aussi bailleur de la même agence, profil actif
      admin, voit « Aussi bailleur » replié, contenant les seules destinations que seul le profil
      bailleur ouvre ; ablation : calculer le complément sur l'union fait rougir le test (il serait
      vide).
- [x] AC3 — Espace suspendu : ni ➊ ni entrée d'écriture ; ablation : retirer la règle fait rougir.
- [x] AC4 — Ouvrir une page placée sous « Plus » rend « Plus » déplié avec l'entrée active
      (`aria-current="page"`).
- [x] AC5 — Le prestataire n'a ni ➊ ni titre de groupe.
- [x] AC6 — L'en-tête d'espace nomme l'agence et le persona, et ouvre le sélecteur au clavier.
- [x] AC7 — `npm run check:i18n` vert : chaque clé neuve en `fr`, `en`, `wo`.
- [x] AC8 — Mesure au navigateur à 390, 768 et 1366 px : aucun défilement horizontal du document,
      tiroir et barre fixe (méthode : `docs/qa/responsive-2026-09-02.md`). Relevé : « Mesure au
      navigateur (AC8) » ci-dessous — 0 sur 8 comptes × 3 largeurs ; plateforme non mesurable (2FA).

## Hors périmètre

- Bande « À traiter » et « Démarrer » (TCK-2479).
- Épingles, replis enregistrés, icônes seules (TCK-2480).
- Barre d'onglets mobile (TCK-2481), palette (TCK-2482), modules par agence (TCK-2483).

## Notes d'implémentation

Plan : [`docs/plans/2026-11-05-tck-2478-dispositions-par-persona.md`](../../../plans/2026-11-05-tck-2478-dispositions-par-persona.md).
AC8 (mesure au navigateur) : relevée le 2026-11-05, voir « Mesure au navigateur (AC8) » en fin de notes.

### Relevés qui ont décidé
- **Action de l'agent** : aucun parcours de création de visite sous `/app` (`app/(dashboard)/app/visits/`
  ne porte que `(liste)/page.tsx` et `[id]/page.tsx`, aucune occurrence de `visits/new`). L'action
  de l'agent est le repli du ticket, « Publier un bien » (sous `properties.create`).
- `/app/tasks` (« Mes tâches », TCK-591) entre au catalogue dès la tâche 1 (il était dans
  `HORS_MENU`) : même garde que son layout (`peutOuvrirMesBiens`).

### Arbitrages validés par le porteur (2026-11-05)
1. **Client pur** : Baux, Paiements, Interventions et États des lieux lui restent accessibles
   (prédicats inchangés) ; absents de sa disposition, ils tombent sous « Plus ».
2. **Locataire** : « Chercher un bien » ouvre son groupe « Mes recherches » (replié).
3. **Carte « Mettre un bien en location »** : client ET locataire (même prédicat, `isCustomerOnly`).
4. **Hôte** : « Finances » de « Mes locations » = `/app/agency/finances` ; les paiements du bailleur
   (`/app/payments`) tombent sous « Plus », libellés « Paiements ».

### Décision de la session : « Plus » et « Aussi … » sont des divulgations
Chez un vrai prestataire (`service_provider` + le plancher `customer`), `occupeUnLogement`
(TCK-379, inchangé) ouvre six destinations que la disposition ne place pas (réservations, visites,
favoris, recherches, baux, statistiques) : elles tombent sous « Plus ». Compté comme une section,
ce « Plus » faisait paraître des titres que l'AC5 refuse. Décision : « Plus » et « Aussi … » sont
des DIVULGATIONS, pas des titres de section — `avecTitres` les ignore (`GROUPES_DIVULGATION`), et ils
rendent toujours leur bouton de bascule. Le prestataire n'a donc ni action ni titre de section ; ce
que le plancher lui ouvre est sous « Plus », replié. Les autres groupes repliés (« Agence »,
« Pilotage », « Mes recherches » du locataire) sont titrés : leur titre est le bouton.

### Écart avec l'ancien menu par rôle (relevé de `dev` avant ce ticket → menu par persona)
Aucun droit ne change (prédicats du catalogue de TCK-2477) : seule la PLACE change, sauf `/app/tasks`
qui entre au menu.
- **Client** : la ligne « Publier un bien » (`/publish`) devient la carte basse « Mettre un bien en
  location » ; action « Chercher un bien » (`/fr/properties`, neuve) ; groupes « Mes recherches »
  (Favoris, Recherches) et « Mes démarches » (Visites, Réservations) ; Documents, Mes avis,
  Statistiques, Maintenance, Mes baux, Paiements, États des lieux sous « Plus » (arbitrage 1).
- **Locataire** : action « Payer mon loyer » (`/app/payments`) ; « Mon logement » avec les libellés
  « Mon bail » et « Interventions » ; « Mes recherches » replié, avec « Chercher un bien » ; carte
  `/publish` ; Mes avis, Statistiques sous « Plus ».
- **Bailleur** : « Proposer un bien à mon agence » devient l'action ; « Maintenance » devient
  « Interventions » ; Clients, Avis reçus, Documents, Statistiques, Exports, Favoris, Recherches et
  « Mes tâches » (neuve au menu) sous « Plus ».
- **Agent** : « Publier un bien » devient l'action ; « Mes tâches » en tête (neuve au menu) ;
  « Interventions » ; Avis reçus, Documents, Statistiques, Exports, Favoris, Recherches sous « Plus ».
- **Admin d'agence `standard`** : « Mes biens » devient « Biens » ; la section « Administration »
  (dix pages) éclate — Finances et Abonnement dans « Finances » (avec Commissions, Crédits), les
  huit autres dans « Agence », replié ; « Pilotage » replié ; Maintenance, Carnet prestataires,
  États des lieux, Documents, Avis reçus, Mes tâches, Favoris, Recherches sous « Plus ». Les
  en-têtes Découvrir / Demandes / Engagements / Pilotage / Administration (TCK-377, TCK-646) sont
  remplacés par les groupes de la disposition.
- **Hôte** (admin `individual`, aussi bailleur) : « Mon espace » porte Agence, KYC, Reversements
  (ex-« Abonnement », `nav.admin.payouts`), Crédits, Intégrations ; « Finances de l'agence » dans
  « Mes locations » ; `/app/payments` sous « Plus », libellé « Paiements » (arbitrage 4) ; Vue
  agence et Propriétaires, cadenassées, sous « Plus ».
- **Prestataire** : tête inchangée (Tableau de bord, Interventions, Messagerie, Documents), sans
  titre ; sous le jeu de rôles réel (`customer` en plus), six entrées sous « Plus » replié — elles
  étaient déjà au menu de `dev` sous ce jeu, en sections. Conséquence mesurée : il sonde les visites
  en attente (elles sont au menu) ; la branche « pas de sondage » de l'AC6 de TCK-377 est désormais
  tenue par les demandes de contact (client, locataire, prestataire).
- **Plateforme** : la disposition de l'admin ; + lien « Console plateforme » (`/super-admin`).
- **Neufs** : complément « Aussi … », règle de l'espace suspendu, en-tête d'espace.
- **Surlignage** : « Publier un bien » est l'action principale, hors du `<nav>`, sans `aria-current`.
  Sur `/app/properties/new`, c'est « Biens » qui s'allume, seul (la règle « une seule entrée
  allumée » tient). À rouvrir si le porteur veut l'action allumée.

### Tests supprimés et leurs remplaçants (aucune garde perdue)
| Supprimé | Remplacé par |
|---|---|
| `AppSidebar.proposition.test.ts` (8 cas, `buildNavItems`) | `catalogue.test.ts`, « proposer plutôt que publier (TCK-587) » : mêmes comptes, mêmes attentes, par `estOuverte` |
| `AppSidebar.acces-admin.test.tsx` (`avecSectionAgence`) | `catalogue.test.ts`, « la section d'agence se dérive toujours de la table » (libellé/icône/`nav.admin`, page sans menu, aucune page sans `cheminsAdmin`, deux compteurs) ; l'ordre, par `dispositions-validees.test.ts` |
| `AppSidebar.test.tsx` : `HREFS_PAR_ROLE`, « AC4 — le regroupement ne change AUCUN droit », ordre des en-têtes, `withSectionHeadings` | `dispositions-validees.test.ts` (pur), `composer-menu.test.ts` (`avecTitres`, divulgations), et « la barre montée suit la disposition du persona » (monté, × 8 : action, groupes et entrées dans l'ordre, repliés `aria-expanded="false"` + liste `hidden`) |
| `AppSidebar.test.tsx` : « TCK-646 — six entrées en tête » | idem (la tête est celle de chaque disposition) ; « aucune entrée n'apparaît deux fois » conservé par persona |
| `AppSidebar.test.tsx` : AC6 par rôle | AC6 par persona : `MENU_ATTENDU` × `COMPTEUR_PAR_LIBELLE`, écrits à la main, les trois compteurs |
| `AppSidebar.audience.test.tsx` : table des href par rôle | table des href par persona (ensemble action + groupes + carte), écrite à la main |
| `AppSidebar.section-agence.test.tsx` : « la section vient APRÈS les entrées de travail » | `dispositions-validees.test.ts` (la disposition décide de l'ordre) |
| `composer-menu.test.ts` (lot 1) : « le miroir place chaque destination du catalogue » | « rien n'est perdu » et « une destination non placée tombe sous Plus » |

Ajoutés sur le composant monté : AC2 (« Aussi bailleur »), AC3 (suspendu), AC4 (« Plus » déplié sur la
page active, et à la navigation), AC5 (prestataire), carte du client et du locataire, action du
client localisée, « Console plateforme », axe (WCAG A/AA, sans contraste) sur la barre des huit
personas, bureau et tiroir identiques (action, groupes, carte) dans `AppShell.menu-et-credits`.

### Écart au plan — la garde « rien n'est perdu » (tâche 2)
L'attendu du plan (`rendus == ouvert(union)`) rougissait pour les huit personas : (1) couples
impossibles (persona `agent` sur des rôles sans `agent` → `isCustomerOnly([])` vrai) ; (2) un couple
RÉEL — `agency_admin + owner`, capacités non lues, persona `bailleur` : « Proposer un bien » ouvert
sur les rôles du persona, fermé sur l'union (P152.03). ADR-0089 §2 juge la disposition sur les rôles
du persona : le moteur a raison. Attendu corrigé en `ouvert(persona) ∪ ouvert(union)`.

### Ablations (mutation, test, restauration dans un seul script ; chaque fois restauré sans diff)
- Tâche 1 — retirer la règle suspendue d'`estOuverte` → « espace suspendu : aucune entrée d'écriture »
  rouge (et, rejouée contre `composer-menu.test.ts`, « ni action principale ni entrée d'écriture »).
- Tâche 2 — groupes et « Plus » jugés sur `ctx` au lieu de `ctxPersona` (l'ablation de l'AC2 : le
  complément calculé sur l'union) → 9 rouges, dont « Aussi bailleur » et les 8 « rien n'est perdu » ;
  boucle « non placée → Plus » retirée → 13 rouges.
- Tâche 4 — `avecTitres` recompte les divulgations → 2 rouges (« Plus et Aussi sont des
  divulgations », « le prestataire réel n'a aucun titre de section »).
- Tâche 5 — la carte statique de l'en-tête reprend `hidden lg:inline-flex` → 2 rouges (AC6).
- Tâche 6 — (1) `useState(!groupe.replie)` sans l'entrée active → 11 rouges (dont « Plus déplié »,
  Maintenance, KPIs, Modération biens) ; (2) `AppSidebar` ignore `agencySuspended` → « espace
  suspendu » rouge ; (3) Prospection ⇄ Catalogue chez l'agent → « agent : les groupes… dans
  l'ordre » (monté) rouge.

### Divers
- `nav.sidebar.sections.*` et `nav.sidebar.groupeReplie` (jamais lue : le bouton porte
  `aria-expanded`, un « — afficher » serait faux une fois déplié) retirées de `fr`, `en`, `wo`.

### Revue adverse — correctifs (2026-11-05)

Une revue adverse en lecture seule (0 bloquant, 3 importants, 3 mineurs) a mesuré chaque défaut sur
le composant monté ; chaque correctif a son test rouge sans lui (ablation par script, restaurée).

- **I1 — les pages d'agence reviennent au profil d'admin.** `AccesAdmin.chemins` se calcule sur
  l'union de l'espace : un bailleur ou un agent qui est aussi admin voyait les dix pages sous « Plus ».
  Règle (`ouvreLesPagesDAgence`, `catalogue.ts`) : ouverte au persona s'il est admin (super-admin
  compris), **ou si aucun profil d'admin n'est dans l'espace** (`ContexteDeMenu.rolesDeLEspace`). La
  seconde branche garde l'agent délégué (TCK-1412, `ouvertePar`) : sans elle, « Équipe », « Rôles »
  et « KYC » ne paraissaient nulle part. **Écart avec `dev`** : chez lui, « Équipe » est sous « Plus »,
  et non plus dans une section d'agence.
- **I2 — créer un bien se juge sur l'espace** (`Destination.surLEspace`, sur `publier-bien` et
  `proposer-bien`), comme la page (`modeDeCreationDeBien`). Admin+bailleur au profil actif `owner` :
  « Publier un bien », sans doublon dans « Aussi ». Tant que les capacités ne sont pas lues, aucune
  action de création dans cet espace (P152.03).
- **I3 — suspension du bailleur.** Le layout lit la suspension de l'agence du profil actif pour le
  bailleur aussi : il perd « Proposer un bien » et voit le bandeau « lecture seule », comme l'API
  répond 423 (`EnsureAgencyWritable`).
- **M1** — l'action principale est courante sur sa page (`/app/properties/new` : « Publier un bien »,
  et non « Biens », son parent d'URL), sauf si une entrée rendue partage son `href` : le locataire
  sur `/app/payments` n'allume que « Paiements ».
- **M2 / M3** (hérités de `dev`) — « Statistiques » et « Calendrier » recopient la garde de leur page
  (`overview/page.tsx`, `assertCanReachCalendar`) : le prestataire non locataire perd « Statistiques »
  (une redirection) et reçoit « Calendrier » sous « Plus ». Garde : `gardes-des-pages.test.ts` joue
  ces gardes sur les 128 combinaisons de rôles.
- **Console** — « Console plateforme » suit `isSuperAdmin(user.roles)`, quel que soit le persona.
- **Action non tronquée** — « Proposer un bien à mon agence » sortait en ellipse à toutes les
  largeurs (mesure au navigateur) : l'action passe à la ligne, jamais d'ellipse (`429e6b757`).
- Le prestataire réel sonde les visites en attente (« Visites » sous « Plus », ouverte par le
  plancher `customer`) : c'était déjà le cas sur `dev`, rien ne régresse ; la garde « pas de
  sondage » s'éprouve sur les demandes de contact.

### Mesure au navigateur (AC8) — 2026-11-05, 21:08–21:13
**Version mesurée : `429e6b757`, arbre propre sous `takussan-web/src`** — HEAD et empreinte du diff
relevés avant ET après chaque passage, identiques (`429e6b757 diff:da39a3ee5e6b`, le diff vide).
Charge (`uptime`, 8 cœurs) : 8,03 8,19 6,27 au début, 2,23 5,01 5,42 à la fin.
Front `next dev` sur `localhost:3000`, API sur `127.0.0.1:8002`, base de dev.

**Banc.** Chrome 156 headless, profil jetable, CDP direct (WebSocket de Node 24), un contexte de
navigateur isolé par compte. Session par jeton Sanctum posé par `fetch('/api/auth/set-token')` (jamais
`POST /api/auth/login`). `Emulation.setDeviceMetricsOverride` en `mobile: false`, plus un témoin en
`mobile: true` à 390, qui relève `innerWidth` (piège du viewport élargi). Sonde lancée quand la page
est stable : plus de squelette (`animate-pulse`, `aria-busy`), quatre lectures identiques de la barre,
au moins 5 s. À 390, le tiroir est ouvert par le bouton « Ouvrir le menu » de la barre haute, et la
sonde lit DANS le tiroir. Tabulation : de vraies frappes Tab (`Input.dispatchKeyEvent`).

| Persona (user id) | 1366 : `sw − iw` (`iw`) | 768 : `sw − iw` (`iw`) | 390, tiroir ouvert : `sw − iw` (`iw`) · fermé · témoin `mobile:true` | Après l'en-tête, Tab → |
|---|---|---|---|---|
| client (86) | **0** (1366) | **0** (768) | **0** (390) · 0 · `iw` 390 | « Chercher un bien » ➊ |
| locataire (104) | **0** (1366) | **0** (768) | **0** (390) · 0 · `iw` 390 | « Payer mon loyer » ➊ |
| agent (3, Dakar Immo) | **0** (1366) | **0** (768) | **0** (390) · 0 · `iw` 390 | « Publier un bien » ➊ |
| admin-agence (2, Dakar Immo) | **0** (1366) | **0** (768) | **0** (390) · 0 · `iw` 390 | « Publier un bien » ➊ |
| prestataire (17) | **0** (1366) | **0** (768) | **0** (390) · 0 · `iw` 390 | « Tableau de bord » (pas de ➊, AC5) |
| hôte (62, Studio de Aminata) | **0** (1366) | **0** (768) | **0** (390) · 0 · `iw` 390 | « Publier un bien » ➊ |
| bailleur (7, Dakar Immo) | **0** (1366) | **0** (768) | **0** (390) · 0 · `iw` 390 | « Proposer un bien à mon agence » ➊ |
| hôte à deux profils (306, Espace de Awa) | **0** (1366) | **0** (768) | **0** (390) · 0 · `iw` 390 | « Publier un bien » ➊ |

À chaque largeur, sur les 24 relevés :
- **Barre ou tiroir** : barre fixe 0–230 px à 1366 (police racine à 14,4 px dès `lg`, `w-64` = 16 rem ;
  l'ablation `flex-shrink: 0` ne change rien, la barre n'est donc pas comprimée) et 0–256 px à 768 ;
  tiroir 0–288 px à 390. Débordement interne (`scrollWidth − clientWidth`) de la barre et de son
  `<nav>` : 0 ; aucun élément dont `right > innerWidth` hors d'un ancêtre qui défile.
- **Présents, dans la barre comme dans le tiroir** : l'en-tête d'espace (« Dakar Immo · Agent »,
  « Studio de Aminata · Hôte », « Client »…), l'action principale (sauf prestataire), les groupes de la
  disposition dans l'ordre (repliés : « Mes recherches » du locataire, « Agence » et « Pilotage » de
  l'admin, « Plus » partout).
- **Action ➊ jamais tronquée** (`scrollWidth ≤ clientWidth`) : « Proposer un bien à mon agence » passe
  sur deux lignes (49 px de haut à 1366, 55 px à 768, 59 px à 390, contre 32/35/39 pour une ligne). Au
  passage pré-correctifs, elle était tronquée à 1366, 768 et 390 : c'est ce relevé qui a mené à
  `429e6b757`.
- Seul texte tronqué dans la barre : la carte de profil du bas de l'hôte 62, « Admin Studio de
  Aminata ». Elle existait avant ce lot.

**Limites, dites telles quelles.**
- **Plateforme non mesurée** : `/app` renvoie le super-admin vers `/onboarding/securite`, où il doit
  poser sa 2FA. Limite acceptée par la session.
- **En-tête en bouton jamais vu au navigateur** : aucun compte de la base de dev n'a deux espaces, donc
  l'en-tête est partout la carte statique (`profile-switcher-static`), y compris pour l'hôte 306, dont
  les deux profils forment un seul espace (TCK-497). La tabulation a été mesurée depuis une ancre posée
  juste avant la carte. Le cas du bouton qui ouvre le sélecteur reste couvert par l'AC6, sur le
  composant monté.
- Seules erreurs réseau relevées : des vignettes de biens servies par `localhost:8002/storage/…`,
  bloquées par ORB (sans rapport avec la barre).

**Artefacts de mesure payés en route** (passages jetés, non retenus) :
1. Front chargé sur `127.0.0.1:3000` : l'API n'autorise que l'origine `localhost:3000`, donc
   `GET /api/me/capabilities` échouait en CORS (`PreflightAllowOriginMismatch`) et **l'agent n'avait
   aucune action principale**, alors que l'API lui rend `properties.create`. Ce n'est pas un défaut :
   sur la bonne origine, l'action paraît en environ 3 s.
2. Le tour de bienvenue (`WelcomeModal`) recouvrait la page : il a été passé par son bouton
   « Passer ». Les 7 lignes `welcome_views` ainsi écrites (la table n'en avait aucune pour ces comptes)
   ont été supprimées à la fin, comme les 10 jetons `mesure-2478`.
3. Deux passages ont vu le code changer pendant la mesure (commits de correctifs servis à chaud) : ils
   ont été jetés, puis la mesure a été reprise sur le lot figé.
