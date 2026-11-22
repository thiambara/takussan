# Famille 3 — Coque de `/app`, accueil, tableaux de bord, messages, notifications, profil

> Audit du 2026-11-10 sur `dev` (1bce3798a). Méthode et limites : [README](README.md).
> Bureau 1440 × 900, téléphone 390 × 844 tactile, Chrome headless jetable connecté par jeton, `next dev`.
> Personas : `admin` (admin@dakarimmo.sn, admin d'agence standard), `agent` (agent1@dakarimmo.sn),
> `proprietaire` (owner1@dakarimmo.sn, bailleur rattaché à Dakar Immo), `prestataire`
> (provider1@dakarimmo.sn), `locataire` (customer@agency1.demo.takussan.sn) et `locataire-vrai`
> (ousmane-niang-wwd3@example.org).
> Captures : `scratchpad/audit-app/captures/f3/` (non versionnées).

> **Correction du 2026-11-10, 11 h** : les 20 premières captures (accueil, menus, cloche, compte,
> « Aller à… ») ont été prises sur `127.0.0.1:3000`, que le CORS de l'API refuse — les lectures
> côté navigateur y échouaient. Elles ont été refaites sur `localhost` (suffixe `-r`), ainsi que la
> messagerie, les notifications, les avis, les favoris et « Ma situation ». **Retirés** parce qu'ils
> venaient de lectures en échec : le « faux vide » de la messagerie (P1), le menu qui saute au
> chargement (P2), la mise en service qui arrive après la page (réécrit), le solde de crédits absent
> du menu du compte (P3, il y est). Corrigés : la palette a une section « À traiter » ; la bienvenue
> s'ouvre pour trois personas, non quatre. Tout le reste tient sur les nouvelles captures.

> ⚠ **La persona « locataire » des outils communs n'est pas locataire.** `GET /api/auth/me` rend
> `roles: ["customer"]`, sans bail actif : la coque la traite en **client** (menu « Mes recherches /
> Mes démarches », pied « Client »). Le vrai parcours locataire a été relevé sur un compte de la base
> de démo qui a un bail actif (`roles: ["customer","tenant"]`, clé `locataire-vrai`, jeton posé dans
> `outils/personas-famille-3.json`). Les deux sont décrits : « client » et « locataire ».

> **Hors jugement** : le bouton rond à palmier en bas à gauche de toutes les captures est l'outil de
> développement de TanStack Query (`next dev` seulement) ; il couvre l'avatar du pied du compte et la
> première case de la barre d'onglets. Les modales de bienvenue ont été masquées par CSS pour les
> captures des pages (sans `POST /api/me/welcome-seen` : l'état de la base n'a pas bougé), et
> relevées à part (§ 1).

**Qui vient ici, et pour quoi.** `/app` est l'espace de travail de six publics qui n'ont presque rien
en commun :

- **l'admin d'agence**, au bureau, sur un grand écran, plusieurs heures par jour — il pilote une
  équipe, un portefeuille et une trésorerie ; il veut savoir *ce qui ne va pas* avant *ce qui va* ;
- **l'agent**, sur le terrain, au téléphone, entre deux visites — il veut sa journée : qui rappeler,
  quelle visite confirmer, quelle tâche est en retard ;
- **le bailleur**, une ou deux fois par semaine, souvent au téléphone — il veut savoir si ses loyers
  sont rentrés et si un bien a un problème ;
- **le prestataire** (plombier, électricien), au téléphone, les mains prises — il veut ses
  interventions du jour et l'adresse ;
- **le locataire**, une fois par mois — il veut payer, et signaler une panne ;
- **le client** (chercheur connecté) — il veut retrouver ses favoris et suivre ses visites.

**La mesure de succès de la coque et de l'accueil est le temps jusqu'à la première action utile**
(confirmer une visite, rappeler une demande, payer un loyer), pas le nombre de tuiles affichées.
Chaque fiche ci-dessous se juge à ça.

## Pages

1. [La coque de `/app`](#1-la-coque-de-app) — colonne de bureau, en-tête et barre d'onglets du
   téléphone, menu, « Aller à… », cloche, compte et bascule d'espace, bouton flottant, bienvenue
2. [Accueil — `/app`](#2-accueil--app)
3. [Tableaux de bord — `/app/overview/*`](#3-tableaux-de-bord--appoverview)
4. [Pilotage — `/app/overview/kpis`, `alerts`, `exports`](#4-pilotage--indicateurs-alertes-exports)
5. [Messagerie — `/app/messages`](#5-messagerie--appmessages)
6. [Notifications — cloche et `/app/notifications`](#6-notifications--cloche-et-appnotifications)
7. [Profil — `/app/profile`, `profile/notifications`, `profile/reviews`, `account/privacy`](#7-profil-et-compte)
8. [Favoris et recherches sauvegardées — `/app/favorites`, `/app/saved-searches`](#8-favoris-et-recherches-sauvegardées)
9. [Page introuvable de `/app`](#9-page-introuvable-de-app)

Puis : [Navigation de la famille](#navigation-de-la-famille--bureau-et-téléphone),
[Transversal](#transversal), [Synthèse](#synthèse).

---

## 1. La coque de `/app`

Code : `takussan-web/src/app/(dashboard)/app/layout.tsx`, `components/layout/AppShell.tsx`,
`AppSidebar.tsx` (922 lignes), `EnTeteMobile.tsx`, `BarreDOnglets.tsx`, `MenuDuCompte.tsx`,
`PaletteDeCommandes.tsx`, `NotificationBell.tsx`, `AujourdhuiDeLaBarre.tsx` ; données :
`lib/navigation/dispositions.ts`, `catalogue.ts`, `onglets.ts`, `personas.ts`. Décisions : ADR-0089
(menu composé par persona), ADR-0090 (colonne pleine hauteur, plus de barre du haut dès `md`).

**Rôle business.** La coque est ce que chaque persona voit **à chaque écran, des heures par jour**.
Elle décide combien de gestes coûte une tâche courante et si l'utilisateur sait où il est. Elle a été
refaite il y a quatre jours (ADR-0090, 2026-11-06) : cet audit ne la remet pas en cause, il relève ce
qui reste et ce qui manque au téléphone.

**Fonctions existantes — à garder** (relevées au navigateur et dans le code)

- *Bureau, colonne de 272 px* (`AppSidebar.tsx:764`) : marque · cloche à pastille (« 9+ ») · « Réduire
  la barre » ; action primaire de la persona (« Publier un bien », « Proposer un bien à mon agence »,
  « Payer mon loyer », « Chercher un bien » ; aucune chez le prestataire) ; « Aller à… » avec
  `⌘ K` / `Ctrl K` ; bloc « Aujourd'hui » (compteurs `priorites` non nuls, libellés par l'action :
  « Demandes de contact 1 », « Visites à confirmer 99+ », « Messages non lus 1 », « Biens à valider 1 »,
  « Avis à modérer 55 ») ; « Démarrer » (« 1 sur 2 · Envoyer vos pièces d'identité », masquable) ;
  groupes titrés repliables ; « Plus › » ; « Récents » (4 au plus) ; ligne de statut (« Mettre un
  bien en location · En quelques minutes ») ; pied du compte (avatar, nom, « Dakar Immo ·
  Administrateur »).
- *Menu du compte* : nom + courriel ; **« Changer d'espace »** groupé par rôle (« Propriétaire ·
  Thiès Properties », « Agent · Dakar Immo ») quand le compte en a plusieurs (relevé sur un compte
  créé pour l'audit, `audit-ux-f3-deux-espaces@exemple.test`) ; solde de crédits (si portefeuille) ;
  Mon profil ; Préférences de notification ; Administration (si accès) ; Langue FR / EN / WO ;
  Déconnexion. La bascule d'espace fonctionne : après clic sur « Dakar Immo », le menu agent, le
  pied « Dakar Immo · Agent » et l'accueil agent se rendent.
- *Épingles* (5 au plus), replis de groupe, mode « icônes seules » (rail de 60 px), préférences
  enregistrées sur le compte, réinitialisables depuis le profil (TCK-2480).
- *« Aller à… »* (palette) : sections « Actions » (« Publier un bien », « Chercher un bien sur
  Takussan »), « À traiter » (« 1 demande non traitée », « 138 visites en attente », « 1 message non
  lu ») et « Aller à » (le menu de la persona, épingles comprises), « Récents », espaces ;
  dialogue centré en bureau, feuille au téléphone ; retour du focus sur l'élément d'origine.
- *Cloche* : 16 non lues, « Tout lire », « Marquer lu » par ligne, date, « Voir tout l'historique »
  → `/app/notifications` ; popover sous la cloche (bureau et téléphone).
- *Téléphone* : en-tête de 56 px (logo · « Aller à » · cloche) ; barre d'onglets de 4 destinations
  + « Menu », par persona (`dispositions.ts`, champ `onglets`), pastilles de compte, trait primaire
  sur l'onglet actif, région `aria-live` des non-lus (`AnnonceDesNonLus`) ; tiroir « Menu » = la
  colonne de bureau en feuille gauche de 288 px.
- *Plein écran* (`plein-ecran.ts`) : certaines routes (tunnels) n'ont ni colonne ni onglets.
- *Bandeaux* : impersonation, agence suspendue, bandeaux du site (maintenance) dans la zone qui
  défile ; lien d'évitement « Aller au contenu principal » en premier focalisable.
- *Bienvenue* : une modale de 3 diapositives par profil à la première visite (client, locataire,
  bailleur, agent, admin d'agence passée en standard), persistée par `POST /api/me/welcome-seen`.
- *Bouton flottant « Messagerie »* (`ChatWidget`, layout racine) : visible en bureau sur `/app`,
  retiré au téléphone (TCK-2481).

**Ce qui marche**

- **La colonne est calme et lisible** : une seule hiérarchie, titres en casse de phrase, compteurs
  discrets, l'actif marqué par un fond et l'icône primaire. La direction « Atelier » tient.
- **Le menu suit vraiment la persona** : six menus relevés, six métiers reconnaissables (« Mon
  logement » du locataire, « Prospection » de l'agent, « Mon patrimoine » du bailleur, une seule tête
  de quatre lignes chez le prestataire). Un compte multi-espaces change de menu en un clic.
- **« Aujourd'hui » est la bonne idée** : des lignes libellées par l'action, dans l'ordre de la
  persona, qui disparaissent à zéro.
- **La barre d'onglets du téléphone** a le bon nombre de cases (4 + Menu), de vraies cibles (78 ×
  64 px à 390), et des onglets différents par persona.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | toutes personas, accueil | **« Aujourd'hui » n'existe pas au téléphone hors du tiroir.** C'est la liste la plus utile de la coque (que faire maintenant), et au téléphone il faut ouvrir « Menu » pour la voir ; l'accueil `/app` ne la reprend pas (§ 2). L'agent sur le terrain — le public le plus mobile — n'a jamais sa journée sous les yeux. |
| P1 | compte multi-espaces | **Un compte de deux agences arrive en « Client »** (pied « Client », menu « Mes recherches / Mes démarches », raccourcis « Mes baux, Paiements ») sans rien qui dise de choisir un espace : la bascule est cachée au fond du menu du compte. Cause documentée : pas d'auto-bascule côté API pour plusieurs agences (`personas.ts`, commentaire de `resoudrePersona`). Relevé : `deux-compte-d.png`. Dans le menu, aucune coche ne marque l'espace actif, et la seconde ligne de chaque espace est le **slug technique** (`thies-properties`, `dakar-immo`). |
| P1 | bureau, `/app` | **Le bouton flottant « Messagerie » (134 × 50 px) couvre le contenu** en bas à droite : il chevauche l'axe du graphique d'occupation de « Vue agence » (`admin-ov-d-2.png`) et couvrira la dernière colonne de tout tableau. Il double l'entrée « Messagerie » du menu, toujours visible à 1440. TCK-2481 l'a retiré du téléphone, pas du bureau. |
| P2 | bureau et téléphone, marque | **Le logo mène au site public** (`EnTeteMobile.tsx` : `<Link href="/">`, idem colonne). Dans un espace de travail, la marque est le chemin du retour à l'accueil : ici elle fait sortir de `/app` sans prévenir. |
| P2 | téléphone, en-tête | **L'en-tête ne dit pas où l'on est** : logo, loupe, cloche sur toutes les pages ; le titre est dans le contenu, en 32 px, et disparaît au premier défilement. La convention du site public (TCK-2568 : titre ou retour dans l'en-tête) ne s'applique pas à `/app`. |
| P2 | téléphone, tiroir | **Une punaise « Épingler » sur chaque ligne du tiroir** (36 × 36, grise) : bruit visuel sur 20 lignes, et touche voisine du lien au pouce. L'épinglage est un réglage rare ; il n'a pas à être une cible permanente. |
| P2 | admin et agent | **« Demandes de contact » paraît deux fois** dans la même colonne (dans « Aujourd'hui » et dans « Activité » / « Prospection »), sans que l'œil comprenne la différence. Voulu par ADR-0090 §3 (« aucune entrée ne change de place »), mais le libellé d'« Aujourd'hui » devrait être celui de l'action (« Demandes à traiter »), pas celui de la destination. |
| P2 | agent, bailleur | **Le vrai tableau de bord est rangé sous « Plus › Statistiques »** : `/app/overview/agent`, `/app/overview/owner`, `/app/overview/tenant` allument « Statistiques » dans « Plus » (`agent-ov-d-2.png`), pendant que l'entrée « Tableau de bord » mène à la page pauvre `/app` (§ 2, § 3). |
| P2 | libellés | **Anglicismes dans la coque et sur l'accueil** : « Onboardings en attente » (menu admin et agent), « Vos leads » (bienvenue agent), « Pipeline » (tuile agent), « Cashflow du mois » (tuile bailleur), « Leads » (graphique agent). |
| P2 | première visite | **La bienvenue bloque l'accueil en plein écran au téléphone** pour l'agent, le bailleur et le client (`agent-bienvenue-m-r.png`, sans masquage) : trois diapositives génériques (« Vos leads — Retrouvez vos prospects… »), sans action. Elle passe avant la seule chose utile (la journée). |
| P3 | téléphone, onglets | L'icône de l'onglet actif prend la couleur du texte, pas la primaire : l'actif se lit au trait et au gras seulement. « Messagerie » (11 px) est le libellé le plus long de la barre et touche les bords de sa case à 360. |
| — | `next dev` | Le bouton de TanStack Query Devtools (palmier, `QueryProvider.tsx:34`) couvre le pied du compte et la 1ʳᵉ case des onglets : outil de développement, non compté. |

**Proposition — téléphone** *(la coque se lit au pouce, une main, en marchant)*

1. **En-tête qui dit où l'on est** (56 px) : sur une page racine, le **titre** à gauche (20 px), à
   droite 0–1 action de page + « Aller à » + cloche ; sur un détail, « ← » + titre court + « ⋯ » ;
   sur l'accueil seulement, l'**espace** en bouton (« ● Dakar Immo ▾ ») qui ouvre la feuille « Mon
   compte / Changer d'espace ». Le logo sort de `/app` au téléphone.

   ```
   Accueil                              Liste                               Détail
   ┌──────────────────────────────┐     ┌──────────────────────────────┐    ┌──────────────────────────────┐
   │ (AD) Dakar Immo ▾     🔍  🔔9+│     │ Demandes            ⊕  🔍  🔔 │    │ ←  Visite · Villa Ngor     ⋯ │
   └──────────────────────────────┘     └──────────────────────────────┘    └──────────────────────────────┘
   ```
2. **« Aujourd'hui » entre dans l'accueil** (§ 2) : la page d'accueil du téléphone EST la liste
   d'« Aujourd'hui », en grand, avec une action par ligne.
3. **Tiroir sans punaises** : un lien « Modifier le menu » en bas fait paraître punaises et poignées ;
   lignes de 44 px ; le pied du compte ouvre une **feuille du bas** (pas un menu déroulant posé dans
   le tiroir).
4. **Onglets** : inchangés pour cinq personas ; le bailleur échange « Demandes » contre **« Loyers »**
   (décision 2) ; libellé « Messages » au lieu de « Messagerie ».
5. **Compte multi-espaces** : à la connexion d'un compte sans espace actif, une feuille « Dans quel
   espace travaillez-vous ? » (une carte par espace : nom de l'agence, rôle, ville, compteur
   « 3 demandes ») ; l'espace actif est coché dans le menu du compte ; jamais de slug à l'écran.

**Proposition — bureau**

- **Retirer le bouton flottant « Messagerie » de `/app`** (le ChatWidget reste sur le site public).
- **Marque → `/app`** ; « Voir le site public » rejoint le menu du compte.
- Libellés d'« Aujourd'hui » au verbe : « Demandes à traiter », « Visites à confirmer », « Messages
  non lus », « Biens à valider », « Avis à modérer ».
- Renommer les entrées anglaises : « Entrées en attente », « Prospects », « Flux du mois ».

**Ambition**

- **Une coque qui sait l'heure** : le matin, « Aujourd'hui » de l'agent commence par ses visites du
  jour (« 10:57 · Local commercial, Plateau — Ndeye Wade ») ; le 1ᵉʳ du mois, celui du bailleur par
  « Loyers attendus : 8 sur 14 reçus ». C'est la même liste, triée par ce qui presse — et la seule
  raison d'ouvrir l'application chaque jour.
- **Notifications rangées dans « Aujourd'hui »** : une notification qui demande une action
  (« Visite demandée ») devient une ligne d'« Aujourd'hui » ; la cloche ne garde que l'information
  (« Mise en avant terminée »). Deux canaux qui se recouvrent deviennent deux canaux qui se partagent.

---

## 2. Accueil — `/app`

Code : `app/(dashboard)/app/(accueil)/page.tsx`, `components/dashboard/DashboardMeKpis.tsx`,
`DashboardShortcuts.tsx`, `DashboardEmpty.tsx`, `dashboard/admin/MiseEnService.tsx` ; données :
`GET /api/dashboard/me` (`lib/queries/dashboard-me.ts`).

**Rôle business.** C'est la page d'arrivée de chaque connexion et l'onglet « Accueil » du téléphone :
la page la plus vue de `/app`. Elle devrait répondre en trois secondes à « qu'est-ce que je dois faire
maintenant ? ». Ce qu'elle rapporte : des demandes rappelées plus vite (l'agence vend la réactivité),
des visites confirmées avant que le client parte ailleurs, des loyers payés à l'heure.

**Fonctions existantes — à garder**

- Salut au prénom (« Bonjour Sokhna »), repli « Bonjour » ; sous-titre « Vue d'ensemble de votre
  activité » ; `<title>` « Tableau de bord — Takussan ».
- Super-admin sans agence : état « Tableau de bord » sans agence (`NoAgencyState`).
- **Mise en service de l'agence** (admin d'agence, individuelle comprise) : barre de progression
  « 6 sur 7 étapes terminées », étape restante cliquable (« Double authentification de
  l'administrateur activée › »), étapes faites barrées ; disparaît une fois l'agence prête (TCK-777).
- Bandeau « logo manquant » (`BrandingBanner`, admin d'une agence sans logo).
- **Brouillons de formulaires à reprendre** (`WizardDraftsBanner`, rien quand il n'y en a pas).
- **Check-list d'entrée dans les lieux** du locataire (`TenantOnboardingChecklistWidget`, rôle
  `tenant`, rien quand tous ses baux sont prêts).
- **Quatre tuiles par rôle** (`DashboardMeKpis`) : admin « Biens 214 · Baux actifs 92 · Revenus du
  mois 95 202 604 F CFA · Impayés 16 » ; bailleur « Portefeuille 69 · Baux actifs 14 · Cashflow du
  mois 11 437 597 F CFA · Impayés 0 F CFA » ; agent « Biens gérés 25 · Pipeline 38 · Tâches
  ouvertes 4 (4 en retard) · Commissions du mois 0 F CFA » ; locataire « Baux actifs 1 · Prochaine
  échéance — · Impayés 0 F CFA · Documents récents 0 ».
- État vide (`DashboardEmpty`) quand l'API ne rend pas de chiffres : « Aucune activité pour le
  moment · Explorez les biens disponibles ou complétez votre profil pour commencer · Explorer les
  biens » (ou, pour un admin, « Aller à l'administration »).
- **Raccourcis** dérivés des rôles (`DashboardShortcuts`) : admin « Administration · Statistiques ·
  Exports · Messagerie » ; agent « Mon CRM · Visites · Calendrier · Messagerie » ; bailleur « Mes
  biens · Mes baux · Mes paiements · Messagerie » ; locataire et client « Mes baux · Paiements ·
  Documents · Mes favoris · Messagerie » ; prestataire « Interventions · Calendrier · Messagerie ».
- Modale de bienvenue montée par la coque (§ 1).

**Ce qui marche**

- Une page par persona, déjà : les tuiles changent avec le rôle, et l'admin voit la mise en service
  en tête tant que l'agence n'est pas prête.
- Les tuiles sont lisibles au téléphone (2 colonnes, chiffres de 20 px), les raccourcis sont de vraies
  cibles (≈ 170 × 52 px).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | toutes personas | **L'accueil ne dit pas quoi faire.** Quatre chiffres de stock (« Biens 214 », « Baux actifs 92 ») et quatre raccourcis vers des pages : aucune ligne n'est une tâche, aucune n'a de bouton d'action. Pendant ce temps, la colonne de gauche porte « Visites à confirmer 99+ », « Demandes de contact 1 », « Avis à modérer 55 » — la page d'accueil, elle, n'en dit rien. Au téléphone, où la colonne est cachée, l'agent n'a **aucun** moyen de voir sa journée sans ouvrir « Menu ». |
| P1 | admin, agent, bailleur | **Deux tableaux de bord, et le pauvre est l'accueil.** `/app` montre 4 tuiles ; `/app/overview/agency` (« Vue agence »), `/agent`, `/owner` montrent la file « À traiter », les visites du jour, les tâches, les graphiques (§ 3). L'admin a les deux dans son menu (« Tableau de bord » et « Vue agence ») ; l'agent et le bailleur trouvent le riche sous « Plus › Statistiques ». |
| P1 | prestataire | **Accueil faux pour le métier** : « Aucune activité pour le moment — Explorez les biens disponibles ou complétez votre profil » + « Explorer les biens » (`prestataire-accueil-d-r.png`). Un plombier n'explore pas les biens : il veut ses interventions. La spec (§ 2.5) dit « pas de tableau de bord prestataire, sa vue de travail est la liste de ses interventions » — l'accueil lui en invente un, vide. Le raccourci « Calendrier » mène à une page qui n'est pas dans son menu. |
| P1 | client, compte multi-espaces | **Raccourcis faux** : un client sans bail voit « Mes baux » et « Paiements » (`DashboardShortcuts.tsx` : `isTenant(roles) \|\| isCustomerOnly(roles)`), deux pages vides pour lui, absentes de son menu. Les raccourcis sont dérivés des **rôles** alors que le menu l'est de la **persona** (ADR-0089) : ils divergent. |
| P1 | locataire | **Rien sur le loyer.** Tuiles « Prochaine échéance — », « Impayés 0 F CFA » ; ni montant du loyer, ni date, ni bouton « Payer » sur la page (le « Payer mon loyer » de la colonne n'existe pas au téléphone : seul l'onglet « Paiements »). Le locataire ouvre l'app une fois par mois, pour ça. (Que ce bail de démo n'ait aucune échéance à venir n'a pas été vérifié côté API.) |
| P2 | admin | **« Impayés 16 »** est un nombre d'échéances posé à côté de montants en F CFA, sans unité : on lit « 16 F » ou « 16 locataires ». « Vue agence » dit la même chose en « 33 715 000 F CFA ». Les tuiles ne sont pas des liens (`StatCard` sans `href`) : « Impayés » ne mène pas aux impayés. |
| P2 | admin | **La carte « Mise en service » occupe tout le premier écran pour une étape restante** : sept lignes dont six étapes faites barrées (« Fait »), au-dessus des tuiles (`admin-accueil-d-r.png`). |
| P2 | toutes personas | Sous-titre « Vue d'ensemble de votre activité » identique pour tous, et vrai pour aucun (le client n'a pas d'« activité »). |
| P2 | prestataire, téléphone | `HTTP 500` sur `GET /api/me/wizard-drafts` relevé une fois (`presta-ov-m.json`) : le bandeau des brouillons échoue en silence. Non reproduit au bureau : intermittent, à surveiller. |
| P3 | agent, bailleur | Libellés « Pipeline », « Cashflow du mois » (§ 1). |

**Proposition — téléphone** *(l'accueil est la journée, pas un rapport)*

L'accueil devient **« Aujourd'hui »** : la liste des choses à faire, chacune avec son action, puis
les chiffres en petit. Même squelette pour tous, contenu par persona :

```
┌──────────────────────────────────────┐
│ (SS) Dakar Immo ▾            🔍  🔔9+│
├──────────────────────────────────────┤
│ Bonjour Sokhna                       │  24 px
│ Mardi 10 novembre · 2 visites, 1 rappel│ 13 px muted
│                                      │
│ À FAIRE MAINTENANT                   │
│ ┌──────────────────────────────────┐ │
│ │ 📥 Moussa Diallo · il y a 2 h     │ │  une demande non traitée
│ │ Villa 4 ch. Ngor · « Dispo ? »    │ │
│ │ [ Appeler ]  [ Répondre ]         │ │  deux boutons 44 px
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 🕑 Visite à confirmer · jeu. 10:00│ │
│ │ Studio Mermoz · Awa Ndiaye        │ │
│ │ [ Proposer autre ]  [ Confirmer ] │ │
│ └──────────────────────────────────┘ │
│ + 4 autres visites à confirmer  ›    │
│                                      │
│ AUJOURD'HUI                          │
│ 10:57  Local commercial · Plateau    │  visites du jour (agenda)
│ 16:55  Terrain · Plateau             │
│                                      │
│ EN CHIFFRES                ce mois › │
│ [ 25 biens ] [ 38 prospects ] [0 F ] │  une rangée défilante
└──────────────────────────────────────┘
│ Accueil  Demandes  Visites  Messages  Menu │
```

- **Agent** : demandes non traitées (Appeler / Répondre), visites à confirmer (Confirmer / Proposer
  un autre créneau), tâches en retard (Fait / Reporter), visites du jour avec l'adresse (« Itinéraire »).
- **Admin d'agence** : mise en service réduite à **une ligne** tant qu'il reste une étape (« Activez
  la double authentification › ») ; puis « À valider » (biens, avis) avec action, « Impayés : 16
  échéances · 33 715 000 F CFA › », demandes non attribuées (« Attribuer »).
- **Bailleur** : « Loyers de novembre : 8 reçus sur 14 · 3 en retard › », visites à confirmer, une
  intervention en cours sur un de ses biens ; « Démarrer » s'il reste des étapes.
- **Locataire** : une carte en tête, **le loyer** : « Loyer de décembre · 250 000 F CFA · à payer
  avant le 5 » + « Payer » pleine largeur (Wave, Orange Money) ; puis « Signaler un problème », la
  dernière quittance, le contact de l'agence.
- **Prestataire** : ses interventions du jour et à venir, adresse et téléphone du locataire,
  « Commencer » / « Terminé » — c'est-à-dire la liste de la spec, posée sur l'accueil.
- **Client** : ses visites à venir, ses favoris dont le prix a baissé, ses recherches avec des
  nouveautés (« 3 nouveaux studios à Mermoz »).

**Proposition — bureau**

- Deux colonnes : à gauche (2/3) « À faire maintenant » — la même liste, en rangées denses avec
  actions au survol ; à droite (1/3) l'agenda du jour, puis 4 chiffres **cliquables** (« Impayés · 16
  échéances · 33,7 M F CFA » mène à la liste filtrée).
- La mise en service en bandeau d'une ligne au-dessus du titre, jamais en carte de 390 px.
- Plus de « Raccourcis » : le menu les porte déjà, et « Aller à… » au clavier.

**Ambition**

- **Une seule page « Accueil » qui absorbe les quatre « Vues »** (agence, agent, bailleur, locataire) :
  le haut est la journée, le bas est le rapport du mois (§ 3). Une entrée de menu de moins par
  persona, et la page la plus vue devient la plus utile.
- **Actions sans quitter l'accueil** : confirmer une visite, appeler une demande, payer un loyer se
  font dans une feuille posée sur l'accueil ; la liste se vide à mesure. Le compteur « 99+ » devient
  un objectif qu'on fait baisser.

---

## 3. Tableaux de bord — `/app/overview/*`

Code : `app/(dashboard)/app/overview/page.tsx` (aiguillage), `agency/page.tsx`, `agent/page.tsx`,
`owner/page.tsx`, `tenant/page.tsx` ; composants `components/dashboard/admin/*`,
`components/charts/*`.

**Rôle business.** Le rapport : ce que l'agence encaisse, ce qu'elle a en retard, comment travaille
l'équipe ; pour l'agent, ses commissions ; pour le bailleur, ce que son patrimoine rapporte. C'est ce
que l'admin regarde le lundi et ce qu'il montre à un associé — et l'argument de vente du plan
« agence standard ».

**Fonctions existantes — à garder**

- *Aiguillage* `/app/overview` : admin d'agence standard → `/agency` ; agence individuelle → `/owner`
  (si la vue bailleur est ouverte) ; admin d'agence non standard ou sans agence → `/agent` ; agent →
  `/agent` ; bailleur → `/owner` ; prestataire → `/app` (décision de spec : pas de tableau de bord) ;
  autres → `/tenant`.
- *Vue agence* (`agency`) : période « 1 nov. 2026 au 30 nov. 2026 » ; **Mise en service** ;
  **À traiter** (« Dossier KYC de l'agence · Ouvrir le dossier », « Biens en attente de modération ·
  1 bien à modérer · Modérer », « Invitations sans réponse · 31 · Voir l'équipe », « Échéances
  impayées · 16 · Voir les impayés ») ; tuiles (Biens 214 · 67 publiés ; Baux actifs 92 ; Taux
  d'occupation 73,33 % · 60 biens loués ; Revenus du mois · Commissions ; Impayés 33 715 000 F CFA ·
  Pénalités à recouvrer ; Taux d'impayés 3,91 %) — **les tuiles lisent les KPI personnalisés** de
  l'agence quand ils existent (TCK-2373) ; « Activité récente » (Réservations en attente, Interventions
  ouvertes, Clients, Membres, chacun avec son lien) ; graphiques « Revenus — 12 derniers mois »
  (total 742 593 407 F CFA) et « Occupation — 12 derniers mois » ; état dégradé
  (`AgencyDegradedState`) quand une lecture échoue.
- *Vue agent* : période ; **bascule « Moi / Agence »** sous la capacité `reports.view_agency`
  (`?scope=agency`) ; tuiles (Mes biens, Mes commissions du mois, Tâches ouvertes · en retard,
  Visites 7 j) ; « Priorités pipeline » (Demandes en attente → `/app/bookings?only_mine=1`, Baux à
  signer → `/app/leases?status=pending_signature`, Tâches du jour → `/app/tasks?filter[due]=today…`) ;
  « Commissions » (ce mois, cumul annuel, « Détail par bail ») ; « Visites du jour » (heure, bien,
  client, lien vers la visite) ; « Tâches assignées » (titre, échéance, priorité, lien vers le client) ;
  « Activité récente » ; graphiques « Pipeline CRM » (barres par étape) et « Commissions et baux
  signés sur 12 mois ».
- *Vue bailleur* : tuiles (Biens · loués · dispo ; Baux actifs ; Cashflow du mois · Attendu ;
  Impayés ; Taux d'occupation ; Réservations en attente) ; « Portefeuille » (Disponibles, Loués,
  Autres statuts) ; « Demandes en attente » (Réservations à traiter, Devis à valider, Visites à
  confirmer, Avis sans réponse) ; « Prochains reversements » ; graphique « Cashflow et occupation
  sur 12 mois ». Ouverte aussi à l'admin qui détient `reports.view_agency` (TCK-2260) ; enrichie pour
  l'hôte (réservations, visites, avis).
- *Ma situation* (locataire et client) : « Ce qui m'attend » (Prochaine visite → la visite ;
  Demandes d'intervention en cours → la liste filtrée) ; tuiles (Baux actifs, Prochain loyer,
  Impayés, Réservations en attente) ; « Échéances des 30 prochains jours » ; « Documents récents » ;
  **invitation à chercher** des biens de sa ville selon son intention (louer / acheter), 4 biens et
  « Voir la recherche » (TCK-595) ; une restitution de caution n'est jamais présentée comme une
  échéance à payer.
- Chaque vue a son `loading.tsx` (squelette) et son garde d'accès (`layout.tsx`).

**Ce qui marche**

- **« À traiter » de la Vue agence est le meilleur bloc de `/app`** : une ligne par file, son nombre,
  son verbe (« Modérer », « Voir les impayés »). C'est exactement ce que l'accueil devrait être.
- La Vue agent a les bons objets pour un agent : visites du jour avec l'heure, tâches, commissions.
- La bascule « Moi / Agence » de l'agent est juste (portée lisible, liens qui portent la portée).

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | bailleur | **Chiffres qui se contredisent sur un même écran** : « Biens 69 · 5 loués · 54 dispo », « Baux actifs 14 » et « Taux d'occupation 100 % » (`prop-ov-d-1.png`). Un bailleur qui lit 100 % d'occupation avec 54 biens disponibles cesse de croire la page. Cause non établie (périmètre de l'occupation ≠ périmètre des biens ?) : à mesurer côté API avant de corriger le front. |
| P1 | agent, bailleur, locataire | **Rangée sous « Plus › Statistiques »** (§ 1) : la page de travail de l'agent n'est pas dans sa tête de menu. |
| P2 | agent | **Comptes incohérents entre blocs** : « Tâches ouvertes 4 · 4 en retard » mais « Tâches du jour 0 » ; tâches listées avec des échéances de juin–septembre sans marque « en retard » ; « Demandes en attente 0 » quand « Aujourd'hui » dit « Demandes de contact 1 » (les deux ne comptent pas la même chose : réservations contre demandes de contact — le libellé ne le dit pas). |
| P2 | agence | **« À traiter » liste ce qui est fait** : « Dossier KYC de l'agence — Dossier vérifié » occupe une ligne de la file d'actions. |
| P2 | agence | **« Activité récente » n'est pas une activité** : ce sont quatre compteurs (« Clients (CRM) 141 », « Membres de l'agence 10 »), sans date ni événement. |
| P2 | agent, bailleur | **Deux séries d'unités différentes sur un même axe** : « Commissions et baux signés » (F CFA et nombre de baux, la courbe des baux écrasée à 0) ; « Cashflow et occupation » (F CFA et %, l'occupation plate en bas). |
| P2 | tous, téléphone | **Tuiles en une colonne** (une tuile = un écran de 200 px : 4 tuiles = 1 000 px avant le premier contenu, `agent-ov-m.png`), quand l'accueil les met en deux colonnes. Graduations non arrondies (« 101 394 241 F », « 2 859 399 ») illisibles à 390. |
| P2 | agence, téléphone | La **mise en service** occupe les 2 premiers écrans (`admin-ov-m-1.png`). |
| P3 | agence | Le bouton flottant « Messagerie » couvre la dernière étiquette du graphique d'occupation (§ 1). |
| P3 | agent | « Leads », « Pipeline CRM », « Priorités pipeline » (anglicismes) ; « Visites 7j » (abréviation). |

**Proposition — téléphone**

- Pas de « Vue » séparée au téléphone : la partie « journée » rejoint l'accueil (§ 2) ; la partie
  « rapport » devient un écran « Ce mois » ouvert depuis « En chiffres › » de l'accueil : chiffres en
  2 colonnes, chacun cliquable, puis **un** graphique à la fois (onglets « Revenus · Occupation ·
  Impayés »), graduations en « 100 M », « 50 M ».
- Bascule de période en puces collantes : « Ce mois · Mois dernier · 12 mois ».

**Proposition — bureau**

- « Vue agence », « Vue agent », « Vue bailleur » deviennent la **moitié basse de l'accueil**
  (décision 1), ou restent une page « Rapports » unique, à onglets par portée (« Agence · Équipe ·
  Moi »), qui remplace « Statistiques » et « Vue agence ».
- Une série par graphique, ou deux axes nommés ; graduations arrondies ; total et variation (« +8 %
  sur octobre ») au-dessus de chaque courbe.
- « Activité récente » devient un vrai fil (« Awa a signé le bail de la Villa Ngor · il y a 2 h »)
  ou disparaît ; « À traiter » ne liste que l'inachevé.

**Ambition**

- **Le rapport mensuel qui s'envoie seul** : le 1ᵉʳ du mois, un PDF « Novembre chez Dakar Immo »
  (encaissé, impayés, occupation, meilleur agent) par e-mail et WhatsApp à l'admin et à chaque
  bailleur. Le bailleur qui reçoit son relevé sans le demander est celui qui reste.
- **Balance âgée en tête des impayés** (spec § 2.5, P2) : « 1–30 j : 9 · 31–60 j : 4 · > 90 j : 3 »,
  chaque tranche cliquable vers la relance.

---

## 4. Pilotage — indicateurs, alertes, exports

Routes : `/app/overview/kpis` (`KpiConfigList.tsx`), `/app/overview/alerts` (`AlertList.tsx`),
`/app/overview/exports` (`ExportForm.tsx`). Menu admin : groupe « Pilotage » replié (Statistiques,
Indicateurs, Alertes, Exports) ; bailleur et agent : « Exports » sous « Plus ».

**Rôle business.** Les outils de l'admin qui veut **son** tableau de bord (KPI), être prévenu avant
que ça dérape (alertes de seuil) et sortir ses chiffres pour le comptable ou la banque (exports). Peu
fréquentés, mais ce sont des arguments du plan payant.

**Fonctions existantes — à garder**

- *Indicateurs* : formulaire « Ajouter un KPI » (Métrique parmi le catalogue de l'API, Libellé,
  Format Nombre / Montant / Pourcentage, « Ajouter ») ; liste « KPIs configurés » avec
  « Supprimer » ; état vide « Aucun KPI configuré · Ajoutez un premier indicateur ci-dessus : il
  apparaîtra sur le tableau de bord de l'agence » ; les tuiles de la Vue agence lisent ces KPI
  (TCK-2373). Ouvert aussi en agence individuelle (arbitrage TCK-284).
- *Alertes de seuil* : « Ajouter une alerte » (Métrique, Opérateur « > supérieur à »…, Seuil,
  Sévérité « Attention »…, « Délai entre deux alertes (h) » 24) ; « Alertes actives » avec
  suppression ; évaluées toutes les heures.
- *Exports* : Type de données selon les capacités (Paiements, Baux, Clients, Biens, Reversements,
  Factures, Commissions, Balance âgée, Cautions ; bailleur : Paiements, Baux, Biens), Format CSV /
  Excel / PDF, période Du / Au, « Télécharger » (nom de fichier rendu par l'API) ; « Les exports
  respectent votre rôle » ; « 5 000 lignes au plus, 200 en PDF » ; chaque export est journalisé
  côté API (TCK-587).

**Ce qui marche** : trois formulaires courts, lisibles au téléphone (champs pleine largeur), des
limites dites avant l'échec.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P2 | indicateurs | **Rien ne montre l'effet** : on ajoute « Biens (total) » sans voir sa valeur ni où il paraîtra ; pas d'ordre, pas de modification, pas d'activation (la spec parle d'indicateurs « activés, par rang ») — supprimer puis recréer. L'exemple du libellé (« Taux d'impayés ») contredit la métrique choisie par défaut (« Biens (total) »). |
| P2 | alertes | **Aucune trace des déclenchements** : la page ne dit ni quand une alerte a sonné, ni la valeur actuelle de la métrique, ni qui est prévenu et par quel canal. On règle un seuil à l'aveugle. |
| P2 | exports | **Pas d'historique ni de raccourci de période** (« Mois dernier », « Année 2026 ») : deux sélecteurs de date à remplir pour l'export le plus courant. Au téléphone, le PDF de 200 lignes est la seule sortie lisible, et rien ne le recommande. |
| P3 | les trois | « KPIs personnalisés », « Ajouter un KPI » : anglicismes (« Indicateurs »). Les trois pages vivent sous `/overview/` mais n'ont aucun lien entre elles ni vers la Vue agence. |

**Proposition — téléphone** : une seule page « Rapports » avec trois onglets (« Indicateurs ·
Alertes · Exports ») ; exports en **cartes prêtes** (« Paiements du mois dernier · Excel ›
Télécharger ») plutôt qu'un formulaire ; l'alerte affiche sa valeur actuelle (« Taux d'impayés :
3,91 % · seuil 10 % · jamais déclenchée »).

**Proposition — bureau** : les KPI se règlent **sur la Vue agence elle-même** (« Personnaliser les
tuiles » : glisser, retirer, ajouter, aperçu en direct) ; les alertes deviennent une colonne de la
même page (« Surveillé : Taux d'impayés > 10 % ») avec historique des déclenchements ; exports avec
préréglages de période et la liste des 10 derniers exports (date, type, lignes, « Retélécharger »).

**Ambition** : **l'export comptable du mois en un clic**, au format attendu par l'expert-comptable
sénégalais (plan SYSCOHADA), et l'envoi programmé le 1ᵉʳ du mois.

---

## 5. Messagerie — `/app/messages`

Code : `app/(dashboard)/app/messages/page.tsx`, `components/messages/*` (2 666 lignes :
`MessagesPage`, `ConversationList`, `ChatView`, `ConversationInfoSheet`, `NewGroupDialog`,
`ParticipantPicker`, `GroupContextPicker`, `VoiceNoteRecorder`, `PropertyDraftChatView`,
`SystemMessageBubble`) ; données `lib/queries/conversations.ts` (`GET /api/conversations`, paginé).

**Rôle business.** C'est par ici que passe la relation : l'agent répond au client, l'agence parle
au bailleur, le prestataire au locataire. Une réponse dans l'heure fait une visite ; une réponse le
lendemain, un client parti chez le concurrent. Au Sénégal, la référence est WhatsApp : la
messagerie de Takussan est jugée à cette aune, et elle a ce que WhatsApp n'a pas — le bien, le bail,
l'intervention rattachés au fil.

**Fonctions existantes — à garder**

- Liste paginée à défilement infini (sentinelle), dédoublonnée ; squelette au chargement ; erreur
  « réessayer » ; vide « Pas encore de conversation · Une conversation commence quand vous écrivez
  au sujet d'une annonce… · Parcourir les annonces ».
- Ligne : vignette du bien ou icône de groupe avec « +3 » participants, titre (bien ou nom du
  groupe), badge « Groupe », aperçu du dernier message, date, pastille de non-lus, icône « en
  sourdine ».
- **Ouverture par URL** : `?conversation=ID` (depuis la cloche, le bouton flottant) et
  `?property=<slug>` (depuis la fiche d'un bien : brouillon de conversation `PropertyDraftChatView`,
  créée au premier envoi).
- **Nouveau groupe** (« + Nouveau groupe ») pour les espaces d'agence standard et les comptes sans
  agence (`peutProposerUnGroupe`) : participants choisis par nom dans le périmètre (TCK-565), bien et
  bail rattachés par recherche.
- Fil : en-tête (retour au téléphone, vignette, titre, « Voir le bien », « 3 participants »,
  sourdine, ⓘ « Gérer le groupe ») ; séparateurs de date (« Hier », « Mer. 1 juil. ») ; bulles
  (moi à droite, encre ; l'autre à gauche, carte, nom de l'auteur dans un groupe) ; messages système
  (`SystemMessageBubble`, fil d'intervention) ; chargement des anciens messages en remontant ;
  lecture seule quand on n'écrit plus (« chat.readOnly »).
- Composeur : champ « Écrivez un message… », **note vocale ≤ 60 s** (enregistrer, arrêter,
  écouter, envoyer, jeter ; refus du micro expliqué), bouton envoyer 44 px. Pas de pièce jointe
  (retirée par TCK-683 : la route n'existe pas côté API).
- Panneau d'info du groupe : renommer, participants, ajouter, sourdine, quitter (le dernier admin
  ne peut pas partir, et la page le dit).
- **Téléphone** : une chose à la fois (liste OU fil, glissement), en-tête compact « Messagerie ·
  + Nouveau groupe », hauteur en `dvh` pour que le composeur ne passe pas sous le pli (TCK-501) ;
  région `aria-live` des nouveaux non-lus dans la barre d'onglets.

**Ce qui marche**

- **Au téléphone, la liste et le fil se remplacent** comme dans toute messagerie ; le composeur est
  collé en bas, au-dessus des onglets ; la note vocale est là — c'est le geste naturel d'un agent
  dans la rue et d'un prestataire les mains prises.
- Le bien est dans l'en-tête du fil (« Terrain viabilisé à Kaolack · Voir le bien ») : le contexte
  que WhatsApp n'a pas.
- Le cadre de bureau tient la hauteur (liste 320 px + fil), sans défilement de page.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | téléphone, fil | **Deux en-têtes et la barre d'onglets autour du fil** : en-tête de la coque (56 px, logo · loupe · cloche) + en-tête du fil (72 px) + composeur + onglets (64 px) = 260 px de cadre sur 844 ; le fil n'a que 60 % de l'écran (`agent-conv-m.png`). Toutes les messageries mobiles donnent le plein écran au fil. |
| P2 | téléphone, fil | **L'en-tête du fil nomme le bien, pas la personne** : « Terrain viabilisé à Kaolack » — on ne voit qu'au corps des bulles qu'on parle à « Malick Seck ». Ni appel, ni WhatsApp depuis l'en-tête, alors que l'agent a le numéro. |
| P2 | liste | **Aucune recherche, aucun filtre** (« Non lus », « Groupes », « Par bien ») : avec 22 conversations (relevé de la revue 2026-09-16), retrouver le fil d'un client se fait en faisant défiler. La spec § 1.7 la note P2, non livrée. |
| P2 | vide | **L'état vide parle à un chercheur** (« …quand vous écrivez au sujet d'une annonce · Parcourir les annonces ») pour toutes les personas : un admin, un agent ou un prestataire n'ont rien à « parcourir ». |
| P2 | composeur | **Plus de pièce jointe** : impossible d'envoyer une photo de la fuite, une pièce d'identité, un plan. Le trombone a été retiré parce que l'API ne servait pas la route (TCK-683) ; le besoin reste entier. |
| P2 | bureau | Pas de « Nouvelle conversation » 1↔1 : seul « Nouveau groupe ». Pour écrire à un seul client, l'agent passe par sa fiche CRM. |
| P3 | bureau | En-tête de page « Messagerie / Vos conversations » + titre de liste « Conversations » : trois fois la même information au-dessus de la liste (le téléphone l'a déjà réduit, TCK-645). |
| P3 | bureau | Panneau droit vide « Sélectionnez une conversation pour afficher les messages » : 800 px de rien à l'arrivée ; ouvrir la plus récente non lue serait le geste attendu. |

**Proposition — téléphone**

```
Liste                                   Fil (plein écran, sans onglets)
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│ Messages              ⊕  🔍  🔔  │    │ ←  (MS) Malick Seck        📞  ⋯ │  56 px
├──────────────────────────────────┤    │     Terrain · Kaolack ›          │  13 px, lien
│ [ Tous ] [ Non lus 3 ] [ Groupes ]│    ├──────────────────────────────────┤
│ 🔍 Chercher un nom, un bien…      │    │  ……bulles……                      │
├──────────────────────────────────┤    │                                  │
│ (MS) Malick Seck        13:22  ● │    │                                  │
│ Terrain · Kaolack                │    │                                  │
│ Je suis intéressé, quels docu…   │    ├──────────────────────────────────┤
│ (👥) Suivi des impayés  25/01  1 │    │ 📎  [ Écrivez un message… ]  🎤/➤ │
└──────────────────────────────────┘    └──────────────────────────────────┘
```

- Le fil ouvert **cache l'en-tête de la coque et la barre d'onglets** (règle « conversation
  ouverte » de la clé `coque` du brief) ; en-tête du fil = la **personne** (ou le groupe), le bien en
  sous-ligne cliquable, « 📞 » (appel / WhatsApp du correspondant quand l'agence le permet), « ⋯ »
  (infos, sourdine, quitter).
- Liste : nom de la personne en premier, bien en deuxième ligne ; puces « Tous · Non lus · Groupes »
  collantes ; recherche dans la liste.
- Le bouton « ⊕ » de l'en-tête ouvre une feuille « Nouvelle conversation » (une personne ou un
  groupe), au lieu du seul « Nouveau groupe ».
- Trombone rendu dès que l'API sert les pièces jointes (photo, PDF), avec appareil photo direct.

**Proposition — bureau**

- Trois colonnes à partir de 1280 : liste (320) · fil · **contexte** (320, repliable) — le bien
  (photo, prix, statut), le client (fiche CRM, téléphone, étape), le bail ou l'intervention
  rattachés, avec leurs actions (« Planifier une visite », « Voir le bail »).
- Arrivée sur la plus récente non lue au lieu d'un panneau vide.

**Ambition**

- **Réponses rapides de l'agent** : « Le bien est toujours disponible », « Quand pouvez-vous
  visiter ? », « Voici les pièces à fournir » — un geste, au pouce, depuis le composeur. Mesurer le
  **délai de première réponse** par agent et l'afficher à l'admin : c'est le chiffre qui fait vendre.
- **WhatsApp comme canal de la conversation** : un client qui écrit depuis WhatsApp arrive dans le
  même fil (spec § 2.3, P3, webhook entrant non livré). Pour le marché sénégalais, c'est la
  différence entre une messagerie qu'on ouvre et une messagerie qu'on oublie.

---

## 6. Notifications — cloche et `/app/notifications`

Code : `components/layout/NotificationBell.tsx` (cloche, interrogée toutes les 30 s),
`components/notifications/NotificationsHistory.tsx`, `NotificationRow.tsx`, `LienDansLAgence.tsx`,
`texteNotification.ts` (rendu d'un code + paramètres, TCK-588).

**Rôle business.** Prévenir de ce qui arrive sans qu'on le cherche : une demande, une visite, un
paiement reçu, un loyer en retard. Une notification utile fait revenir dans l'app ; dix inutiles
apprennent à ignorer la cloche — et donc les vraies.

**Fonctions existantes — à garder**

- *Cloche* (colonne et en-tête mobile) : pastille plafonnée (« 9+ »), popover « Notifications ·
  16 non lues · Tout lire », lignes non lues sur fond lin avec « Marquer lu », date, « Voir tout
  l'historique » ; rafraîchie toutes les 30 s.
- *Historique* : sous-titre « Tout ce qui vous a été signalé, lu ou non » ; filtre segmenté
  « Toutes · Non lues (16) » ; « Tout marquer comme lu » ; par ligne « Marquer lu » / « Marquer non
  lu » ; **chaque notification ouvre son objet**, en changeant d'espace si l'objet relève d'une
  autre agence (`LienDansLAgence`) ; pagination de 20 (« Page 1 sur n ») ; chargement, erreur avec
  « Réessayer », vides « toutes » et « non lues ».
- Préférences par événement et par canal (§ 7).

**Ce qui marche** : le filtre « Non lues » avec son compte, le « marquer non lu » (rare et utile),
l'ouverture de l'objet dans le bon espace.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | cloche et historique | **Le bruit noie le signal** : les 16 non lues de l'admin sont 16 « Mise en avant terminée » (`admin-notifs-d.png`). Aucune icône, aucune catégorie, aucun regroupement (« 9 mises en avant terminées cette semaine »), aucune distinction entre ce qui demande une action et ce qui informe. Une « Demande de visite » arrivera entre deux « Mise en avant terminée » et se lira pareil. |
| P2 | ligne | **Rien ne dit qu'une ligne s'ouvre** (pas de chevron, pas de vignette du bien) ; « Marquer lu » en texte terracotta à droite est la seule chose qui ressemble à une action — c'est la mauvaise. |
| P2 | dates | Dates absolues « 06/11/2026 09:05 » : « il y a 4 jours » se lit plus vite ; aucun séparateur « Aujourd'hui / Cette semaine / Plus ancien ». |
| P2 | téléphone | La cloche ouvre un **popover** de 340 px sous l'en-tête, qui laisse la page derrière et ne défile pas assez (4 lignes) : au téléphone c'est une page ou une feuille pleine hauteur qu'on attend. |
| P3 | historique | Bouton « Tout marquer comme lu » sur sa propre ligne au téléphone (sous le filtre) : 60 px pour une action rare. |

**Proposition — téléphone** : la cloche ouvre une **feuille pleine hauteur** (ou la page) avec
puces « À traiter · Tout », groupes par jour, une icône par famille (📥 demande, 🕑 visite,
💳 paiement, ⚙️ système), vignette du bien, et le **verbe** de l'action quand il y en a une
(« Confirmer », « Voir le paiement ») ; « Tout lire » dans l'en-tête de la feuille.

**Proposition — bureau** : même regroupement, panneau de 400 px sous la cloche ; les notifications
de même type se replient (« Mise en avant terminée · 9 biens › »).

**Ambition** : la cloche ne garde que l'information ; tout ce qui demande une action entre dans
« Aujourd'hui » (§ 1) et en sort quand l'action est faite. Un résumé quotidien par WhatsApp (spec
§ 2.3, digest P2) pour le bailleur qui n'ouvre pas l'app.

---

## 7. Profil et compte

Routes : `/app/profile` (`profile/page.tsx`, `components/profile/*`), `/app/profile/notifications`
(`NotificationPreferencesMatrix.tsx`), `/app/profile/reviews` (`ProfileReviewsList.tsx`),
`/app/account/privacy`.

**Rôle business.** La confiance : un numéro vérifié, une fiche publique d'agent qui donne envie, une
double authentification pour l'admin qui manipule de l'argent, des préférences qui évitent le
désabonnement. Et l'obligation légale (portabilité, suppression du compte — loi sénégalaise
2008-12 et RGPD pour la diaspora).

**Fonctions existantes — à garder**

- *Profil* (`/app/profile`), une colonne de 600 px, dans cet ordre : en-tête (avatar, nom,
  courriel, badge du rôle « Agent immobilier », « Modifier le profil ») ; **Coordonnées** (courriel
  « Vérifié » non modifiable ici, téléphone E.164 « Non vérifié » + encart « Vérifiez votre numéro
  pour recevoir des notifications par SMS · Vérifier », bio 0/500, « Enregistrer ») ; **Fuseau
  horaire** (« Africa/Dakar ») ; **Menu** (« Revenir au menu par défaut », « Barre latérale sur cet
  appareil : Automatique… ») ; **Mes profils** (une carte par profil : agence, rôle, statut, « Profil
  actif », informations KYC propres) ; selon le rôle : **section client** (préférences de recherche,
  `SearchPreferencesForm`), **Profil professionnel** de l'agent (agence liée, licence,
  spécialisations), **Sur votre fiche publique** (langues parlées, quartiers couverts 0 sur 5 par
  ville, « Voir ma fiche publique »), **section bailleur** et **annuaire public** (inscription),
  **section admin**, **moyens de versement** (bailleur, prestataire), **section prestataire** ;
  **Sécurité** (courriel vérifié, double authentification TOTP « Activer la 2FA », vérification du
  téléphone « Envoyer le code », sessions actives avec « Courante » et révocation, **Supprimer mon
  compte** avec délai de grâce) ; liens « Mes données personnelles · Gérer mes données » et
  « Notifications · Gérer les préférences ».
- *Préférences de notifications* : fil d'Ariane « Profil / Notifications » ; une matrice par groupe
  (Messages, Réservations, Baux, Maintenance, Avis, Alertes, Biens) × canaux (In-app, Email, Push,
  SMS, WhatsApp) ; cases verrouillées qui disent pourquoi (canal sans transport, KYC critique) ;
  enregistrement à chaque case (« Enregistré ») ; WhatsApp actif par défaut pour échéance, retard,
  rappel de visite, statut de réservation (TCK-588).
- *Vos avis* : « Avis postés » ; « Avis à laisser » (une carte par intervention, séjour ou bail
  éligible : étoiles, commentaire facultatif, « Publier ») ; « Avis reçus » avec filtres (bien, type,
  statut, cible), pagination, statut « En attente de validation », note « 3/5 », **signaler** un avis.
- *Confidentialité* : « Mes données · Archive ZIP de portabilité · Demander mon export » ; liste des
  exports demandés (vide : « Aucun export demandé »).

**Ce qui marche**

- Rien ne manque au fond : vérification, 2FA, sessions, suppression, portabilité, fiche publique
  d'agent avec langues et quartiers (TCK-2518) — c'est complet pour une V1.
- Les cases verrouillées des préférences disent pourquoi elles le sont.

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | préférences, téléphone | **La colonne WhatsApp est inaccessible à 390 px.** Le tableau mesure 448 px dans une carte de 356 px en `overflow-hidden` (`NotificationPreferencesMatrix.tsx:290`) : l'en-tête « WhatsApp » commence à x = 373, la carte s'arrête à 374 (mesuré, `admin-wa-m.json`) — rien ne défile. Le canal par défaut au Sénégal ne se règle pas au téléphone. |
| P2 | profil | **Une page de 4 écrans au bureau, 6 au téléphone, sans sommaire** : dix sections dans l'ordre du code, la sécurité et la suppression du compte au milieu, « Mes données » et « Notifications » après. Pour vérifier son numéro on traverse tout ; « Supprimer mon compte » (zone rouge) précède des réglages anodins. |
| P2 | profil, « Mes profils » | Texte technique visible : « Carte professionnelle agence — license_number. » ; statut en anglais minuscule « · active » (`agent-profil-d-2.png`). |
| P2 | profil | **Trois boutons « Enregistrer »** (coordonnées, fuseau, fiche publique) plus « Modifier le profil » en tête : on ne sait pas ce que chacun enregistre. |
| P2 | avis | **L'ordre sert mal l'agent** : sa réputation (« Avis reçus », avec 3/5 « En attente ») est en bas après des formulaires à remplir ; aucune note moyenne ; 4 sélecteurs empilés pleine largeur au téléphone (`agent-avis-m-2.png`). Le bouton d'une carte seule dit « Publier mes avis » (pluriel). |
| P3 | profil | « Africa/Dakar » (identifiant IANA), « Authentification à deux facteurs (TOTP) », « Format international (E.164) » : vocabulaire d'ingénieur. |
| P3 | confidentialité | Page isolée (sous `/app/account/`) pour un seul bouton ; elle pourrait être une section du profil. |

**Proposition — téléphone**

- Le profil devient un **sommaire** (style réglages de téléphone) : en-tête identité, puis des
  rangées de 56 px qui ouvrent chacune sa page — « Coordonnées · téléphone à vérifier ● »,
  « Fiche publique », « Notifications », « Sécurité · 2FA désactivée ● », « Menu et affichage »,
  « Mes espaces », « Mes données », et en dernier, en rouge, « Supprimer mon compte ». Un point
  terracotta signale ce qui demande une action.
- Préférences de notifications **par événement**, pas en matrice : une rangée par événement
  (« Loyer en retard ») avec des puces de canaux (« Appli · E-mail · SMS · WhatsApp ») cochables ;
  les verrouillées grisées avec leur raison en sous-ligne.
- Avis : onglets « Reçus (12) · À laisser (2) · Publiés », note moyenne en tête des reçus, filtres en
  feuille.

**Proposition — bureau** : profil en deux colonnes (sommaire collant 240 px à gauche, section à
droite) ; un seul « Enregistrer » par section, collant en bas de la section modifiée ; matrice des
notifications conservée (elle a la place), en-têtes en français (« Appli », « E-mail », « Notif.
mobile ») ; « Supprimer mon compte » en dernière section.

**Ambition** : un **score de profil** pour l'agent (« Votre fiche est complète à 60 % : ajoutez vos
quartiers et vos langues — les fiches complètes reçoivent 2× plus de demandes ») — la fiche publique
d'agent est un actif commercial, le profil devrait la traiter comme tel.

---

## 8. Favoris et recherches sauvegardées

Routes : `/app/favorites` (`components/favorites/FavoritesList.tsx`), `/app/saved-searches`
(`SavedSearchesList.tsx`). Menu : client (« Mes recherches »), locataire (replié), bailleur et
agent (« Plus »).

**Rôle business.** Garder le chercheur connecté dans la boucle : un favori dont le prix baisse, une
recherche qui trouve un nouveau bien, c'est une visite demandée.

**Fonctions existantes — à garder**

- *Favoris* : liste des biens favoris, « Retirer », « Voir des biens similaires », bien retiré du
  marché signalé (`removedTitle`) ; vide « Aucun favori pour le moment · Parcourez les biens et
  cliquez sur le cœur… · Découvrir des biens » ; erreur.
- *Recherches sauvegardées* : « Relancer » (filtres rejoués), suppression, **alerte** par recherche
  (interrupteur, canaux) ; vide « Aucune recherche sauvegardée · Depuis la page de résultats,
  cliquez sur « Sauvegarder la recherche » · Lancer une recherche ».

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P1 | les deux | **Doublon avec le site public** : la famille 1 a retenu (TCK-2493 → 2524) une page `/fr/favorites` à onglets « Biens · Recherches · Nouveautés » (`PublicFavoritesPage.tsx`, 503 lignes : notes, nouveautés, suivi sur l'appareil ou le compte). `/app/favorites` et `/app/saved-searches` en sont l'ancienne version, coupée en deux, plus pauvre — et le même client y arrive selon qu'il clique sur l'onglet « Favoris » de `/app` ou sur le cœur du site. |
| P3 | vides | Les deux états vides renvoient vers la recherche publique sans proposer de biens (le tableau « Ma situation » le fait, lui : biens de sa ville). |

**Proposition** : **une seule page de favoris**, celle du site public, que `/app/favorites` et
`/app/saved-searches` ouvrent (redirection vers l'onglet voulu) ou rendent dans la coque — décision 4.
L'onglet « Favoris » du client au téléphone mène à la même page que le cœur de la barre publique.

---

## 9. Page introuvable de `/app`

Code : `app/(dashboard)/app/not-found.tsx`, `[...introuvable]/layout.tsx` (appelle `notFound()`),
`RetourVersLaListe.tsx`.

**Fonctions existantes — à garder** : 404 réelle (`HTTP 404`), `<title>` « Introuvable — Takussan »,
dans la coque (menu et onglets restent) ; « Cet élément n'existe pas, ou il ne relève pas de votre
agence. Vérifiez le lien, ou revenez à la liste » ; « Retour à la liste » quand l'URL a une liste
parente (`RetourVersLaListe`), « Retour au tableau de bord ».

**Constats**

| Sév. | Où | Constat |
|---|---|---|
| P2 | contenu | **Pas de H1** (le titre « Introuvable » est un H2) ; carte en pointillés en haut d'une page vide, sans « Aller à… » ni recherche, alors que la palette est le meilleur secours d'une URL fausse. |
| P2 | cas « autre agence » | Le même texte sert à « n'existe pas » et « relève d'une autre agence » : pour un compte multi-espaces, la bonne réponse est « Cet élément est dans l'espace Thiès Properties · Basculer », pas « introuvable ». |
| P3 | console | « Encountered a script tag while rendering React component » relevé sur cette page (`admin-404-d.json`). |

**Proposition** : H1 « Page introuvable », la phrase, puis **le champ « Aller à… » ouvert en ligne**
(les entrées du menu et les récents en dessous) ; quand l'API dit « autre agence », proposer la
bascule d'espace.

---

## Navigation de la famille — bureau et téléphone

**Aujourd'hui, au bureau** : une colonne de 272 px sans barre du haut (ADR-0090). On arrive sur
`/app` (4 tuiles + raccourcis) ; « Aujourd'hui » est dans la colonne ; le « vrai » tableau de bord
est une autre entrée (« Vue agence » pour l'admin, « Plus › Statistiques » pour les autres) ;
messagerie, cloche, profil et réglages sont chacun à un clic, plus un bouton flottant « Messagerie »
en double.

**Aujourd'hui, au téléphone** : en-tête logo · loupe · cloche, contenu, barre de 4 onglets +
« Menu ». La journée (« Aujourd'hui ») n'est que dans le tiroir ; le compte et la bascule d'espace
sont au fond du tiroir (pied du compte → menu déroulant dans le tiroir) ; la conversation ouverte
garde l'en-tête et les onglets ; la cloche ouvre un popover.

**Parcours relevés et leur coût (téléphone)**

| Tâche | Aujourd'hui | Proposé |
|---|---|---|
| Agent : voir les visites à confirmer et en confirmer une | Onglet « Visites » (liste de toutes les visites, famille 5) ou Menu → Aujourd'hui → « Visites à confirmer » → la visite → Confirmer : 4 gestes | Accueil → carte « Visite à confirmer » → « Confirmer » : 1 geste |
| Locataire : payer le loyer | Onglet « Paiements » → l'échéance → payer (famille 4) ; l'accueil n'en dit rien | Accueil → « Payer 250 000 F CFA » : 1 geste |
| Compte à deux agences : passer d'une agence à l'autre | Menu → pied du compte → menu → « Changer d'espace » → l'agence : 4 gestes, aucune indication au départ | En-tête de l'accueil « Dakar Immo ▾ » → l'agence : 2 gestes ; feuille de choix à la connexion |
| Admin : vérifier son numéro de téléphone | Menu → pied du compte → Mon profil → (défiler) → Vérifier | Profil (sommaire) → « Coordonnées ● » → Vérifier |
| Tous : lire un message reçu | Onglet Messages → le fil (en-tête + onglets gardés) | Onglet Messages → le fil plein écran |

**Proposé** — la clé `coque` du brief des maquettes (`scratchpad/audit-app/briefs/famille-3.json`)
fixe la coque que les maquettes des familles 4, 5 et 6 portent. En résumé :

```
BUREAU (1440)                                           TÉLÉPHONE (390)
┌──────────┬─────────────────────────────────────┐     ┌──────────────────────────┐
│ ⌂ TAKUSSAN 🔔 ⇤│ Biens › Villa Ngor               │     │ Titre de la page  ⊕ 🔍 🔔│ 56
│ ⊕ Publier un bien│ Villa Ngor          [⋯][Modifier]│     ├──────────────────────────┤
│ 🔍 Aller à…  ⌘K │ 214 biens · 12 brouillons        │     │                          │
│ Aujourd'hui      │                                  │     │   contenu                │
│  Demandes  3     │   contenu (tableau pleine        │     │                          │
│  Visites  12     │   largeur, formulaires ≤ 1200)   │     │                          │
│ Activité ˅       │                                  │     ├──────────────────────────┤
│ Portefeuille ˅   │                                  │     │ [ action collante ]      │ 64 (détail)
│ …                │                                  │     ├──────────────────────────┤
│ (AD) Awa Diop ⇕  │   (plus de bouton flottant)      │     │ ⌂  📥  🏢  💬  ☰         │ 64
└──────────┴─────────────────────────────────────┘     └──────────────────────────┘
```

---

## Transversal

- **Rôles contre persona** : le menu suit la persona (profil actif, ADR-0089), mais l'accueil
  (`DashboardShortcuts`, `DashboardEmpty`), l'aiguillage `/app/overview` et le profil
  (`profile/page.tsx`) décident encore sur l'union des **rôles** (`isOwner(user.roles)`…). D'où les
  raccourcis « Mes baux » d'un client, et l'accueil « Client » d'un compte multi-espaces. Toute page
  de la famille devrait lire la même persona que la coque (`personaDeLaCoque`).
- **Résilience sous charge** (machine à `load average` 26–45 pendant l'audit) : une lecture d'agence
  en échec a posé des **cadenas** sur « Vue agence » et « Propriétaires » (console : `[access]
  app/layout (cadenas) : fetchAgency(1)`, `admin-msg-d8.png`) ; un `HTTP 500` sur `/api/me/wizard-drafts`, un `504` sur `/api/announcements/active`.
  Un échec de lecture ne devrait jamais ressembler à « vous n'avez pas accès » ni à « vous n'avez
  rien ».
- **Anglicismes** : Onboardings, leads, Pipeline, Cashflow, KPIs, In-app, Push, TOTP, `active`,
  `license_number`.
- **Un seul H1 par page** : l'accueil (« Bonjour Admin ») et la 404 (H2 seulement) ; au téléphone,
  le titre devrait vivre dans l'en-tête (clé `coque`).
- **Données de démo** (non comptées) : « Service Provider » comme nom de prestataire, avatars de
  dessin animé, mises en avant toutes terminées, « Revenus du mois 95 202 604 F » avec « Commissions
  0 F ».

---

## Synthèse

**Chantiers classés**

| # | Chantier | Pages | Sév. max | Effort | Pourquoi d'abord |
|---|---|---|---|---|---|
| A | **Accueil « Aujourd'hui » par persona** — la journée et ses actions en tête, les chiffres cliquables en bas ; prestataire = ses interventions ; locataire = son loyer | `/app` | P1 | L | La page la plus vue ; ferme 5 P1 |
| B | **Coque téléphone** — titre dans l'en-tête, espace en tête de l'accueil, fil de conversation plein écran, tiroir sans punaises, feuille du compte, choix d'espace à la connexion | coque | P1 | M | Cadre de toutes les maquettes des familles 4–6 |
| C | **Coque bureau** — retirer le bouton flottant, logo → `/app`, libellés au verbe et en français | coque | P1 | S | Petit, visible partout |
| D | **Messagerie** — fil plein écran au téléphone, personne en titre, recherche et filtres, nouvelle conversation 1↔1, contexte au bureau | `/app/messages` | P1 | M | La relation client passe par là |
| E | **Rapports** — une page « Rapports » (agence / équipe / moi) qui absorbe Vues, Statistiques, Indicateurs, Alertes, Exports ; chiffres cohérents (occupation du bailleur) | `/app/overview/*` | P1 | L | Argument du plan payant ; chiffres faux = confiance perdue |
| F | **Notifications** — familles, regroupement, « à traiter » contre « pour info », feuille au téléphone | cloche, `/app/notifications` | P1 | M | Le bruit fait ignorer le reste |
| G | **Profil** — sommaire, préférences par événement (correctif immédiat : WhatsApp au téléphone), avis reçus d'abord | `/app/profile/*`, `/app/account/privacy` | P1 | M | Correctif WhatsApp : S, à faire tout de suite |
| H | **Favoris** — une seule page, celle du site public | `/app/favorites`, `/app/saved-searches` | P1 | S | Décision plus que code |
| I | **404 de `/app`** — H1, « Aller à… » en ligne, bascule d'espace | `[...introuvable]` | P2 | S | — |

**Comptes** : 19 routes auditées (coque, accueil, 5 tableaux de bord dont l'aiguillage, 3 de
pilotage, messagerie, notifications, 4 de profil et compte, 2 de favoris, 404) ; **P0 = 0, P1 = 14**.

**Correctifs qui n'attendent pas de maquette** (P1 ou P2, sans choix de design) : colonne WhatsApp
coupée au téléphone (G) ; bouton flottant retiré de `/app` (C) ; raccourcis de l'accueil dérivés de
la persona (A) ; « Dossier vérifié » retiré de « À traiter » (E) ; libellés anglais (C) ;
`license_number` et `active` (G) ; cadenas posés sur une lecture d'agence en échec (transversal).

**Décisions qui reviennent au porteur**

1. **Un ou deux tableaux de bord ?**
   a) `/app` devient l'accueil « Aujourd'hui » (journée + chiffres du mois cliquables) et absorbe
   les quatre Vues ; « Vue agence » et « Statistiques » quittent le menu.
   b) `/app` = « Aujourd'hui » (journée seule) ; une page « Rapports » unique (portées Agence ·
   Équipe · Moi) remplace Vues, Statistiques, Indicateurs, Alertes, Exports.
   c) Garder les deux, et seulement mettre « Aujourd'hui » en tête de `/app`.
   **Recommandation : b** — la journée et le rapport n'ont ni le même rythme ni le même public
   (l'agent vit dans la première, l'admin consulte le second le lundi) ; a surcharge l'accueil de
   graphiques au téléphone, c laisse le doublon.

2. **Le 3ᵉ onglet du bailleur au téléphone.**
   a) « Loyers » (paiements) à la place de « Demandes ».
   b) Garder « Demandes ».
   c) « Loyers » pour un bailleur rattaché à une agence (l'agence traite les demandes), « Demandes »
   pour un bailleur seul (hôte).
   **Recommandation : c** — il suit qui fait le travail commercial ; un hôte a déjà ses onglets.

3. **L'en-tête de `/app` au téléphone.**
   a) Titre de page dans l'en-tête (56 px), espace sur l'accueil, logo retiré (clé `coque`).
   b) Garder logo · loupe · cloche, titre dans le contenu.
   c) Comme a, mais garder le symbole (sans le nom) à gauche du titre, cliquable vers `/app`.
   **Recommandation : a** — même règle que le site public (TCK-2568, titre ou retour dans
   l'en-tête) ; la marque n'apporte rien à un utilisateur déjà dedans, et menait hors de `/app`.

4. **Favoris connectés.**
   a) `/app/favorites` et `/app/saved-searches` redirigent vers `/fr/favorites` (onglets Biens ·
   Recherches), qui garde la barre publique.
   b) La page publique est rendue aussi dans la coque de `/app` (même composant, deux coques).
   c) Garder les deux pages.
   **Recommandation : b** — un client dans `/app` ne doit pas changer de coque en touchant
   l'onglet « Favoris » ; une seule page à maintenir.

5. **Compte à plusieurs espaces sans espace actif.**
   a) Feuille « Dans quel espace travaillez-vous ? » à la connexion, mémorisée.
   b) L'API lie le dernier espace utilisé (auto-bascule étendue aux comptes multi-agences).
   c) Rester en « Client » et afficher un bandeau « Choisissez un espace ».
   **Recommandation : b, avec a en repli** quand aucun espace n'a encore été utilisé — le compte
   arrive où il travaille, sans question, la plupart du temps.

6. **Bouton flottant « Messagerie » en bureau.**
   a) Retiré de `/app` (il reste sur le site public).
   b) Gardé, déplacé pour ne rien couvrir.
   **Recommandation : a** — l'entrée « Messagerie » et ses non-lus sont déjà dans la colonne, toujours
   visible à partir de `md`.

7. **Préférences de notification au téléphone.**
   a) Une rangée par événement avec des puces de canaux.
   b) La matrice, défilante horizontalement avec la 1ʳᵉ colonne figée.
   **Recommandation : a** — on règle un événement à la fois ; b corrige le défaut sans rendre la page
   plus lisible.

## Maquettes choisies le 2026-11-10

> **Le porteur a validé la recommandation de chaque page**, avec les compléments ci-dessous. Les
> maquettes ont été retouchées le jour même ; la visionneuse marque l'approche « retenue ». Elles
> sont la **référence de fidélité** des tickets à écrire (cf. README). Rien ne s'implémente avant
> que le porteur dise comment attaquer l'implémentation (qui se fera sur Opus 5.5).

| Page | Approche retenue | Visionneuse |
|---|---|---|
| Coque | A — Le titre en haut | `?p=app-coque&a=a` |
| Accueil | A — La journée d’abord | `?p=app-accueil&a=a` |
| Rapports | A — Une page « Rapports » à onglets | `?p=app-rapports&a=a` |
| Messagerie | A — Les personnes d’abord | `?p=app-messagerie&a=a` |
| Notifications | A — Familles et regroupement | `?p=app-notifications&a=a` |
| Profil | A — Le sommaire de réglages | `?p=app-profil&a=a` |

- **Accueil, A — sauf pour l'agent** : décision « Aujourd'hui = a » (famille 5). Pour l'agent,
  l'accueil EST la page « Aujourd'hui » (la chronologie), premier onglet ; les cinq autres personas
  gardent l'accueil A. Les chiffres de l'ancien accueil de l'agent sont repris au bas d'Aujourd'hui.
- **Coque, A** : barre d'onglets de l'agent « Aujourd'hui · Demandes · Clients · Messages · Menu » ;
  colonne : « Aujourd'hui » en tête, « Mes tâches » devient « Tâches », plus de « Tableau de bord ».
- **Rapports, A** : l'entrée « Rapports » remplace « Vue agence » chez l'admin et s'ajoute chez
  l'agent (groupe Gestion) et le bailleur.
- **Transversal (porteur)** : « les flèches de navigation back en mobile doivent être les mêmes dans
  toutes les pages » — une seule flèche de retour (`ArrowLeft`, comme `BoutonRetour` du produit) dans
  une cible de 44 px, et sa variante ronde sur photo. Cf. README.
