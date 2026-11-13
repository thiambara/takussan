---
id: TCK-2622
title: "Accueil de /app : un socle commun (salut, date, mise en service en une ligne, « Ce mois » cliquable) et une page par persona, sans raccourcis"
status: todo
phase: P1
family: front
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2618, TCK-2596, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2624, TCK-2625]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, accueil, dashboard, audit-ux, app]
---

## Objectif utilisateur

En ouvrant `/app`, chacun lit en trois secondes ce qu'il doit faire aujourd'hui, avec le geste pour le faire. Les chiffres du mois restent en bas, et chacun mène à la liste qu'il compte. L'agent arrive sur sa journée (« Aujourd'hui »), le prestataire sur ses interventions, le locataire sur son loyer.

## Contrat de données

Aucun endpoint neuf dans ce ticket.

- Le socle lit ce que l'accueil lit déjà : `GET /api/dashboard/me` (tuiles par rôle, `overdue_count` **et** `overdue_amount` pour l'admin et le bailleur), la mise en service de l'agence (TCK-777), les brouillons (`GET /api/me/wizard-drafts`) et la check-list d'entrée du locataire.
- Les blocs propres à chaque persona viennent avec TCK-2624 (admin, bailleur, hôte) et TCK-2625 (locataire, client, prestataire). Pour l'agent, l'accueil est la page « Aujourd'hui » de la famille 5.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-accueil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Admin d'agence », « Rien à faire (bailleur) », « Chargement et erreur (admin) », plus l'en-tête « Accueil » de `?p=app-coque&a=a`.
- **Arbitrage du porteur (décision 1 b, validée)** : `/app` est la journée ; le rapport vit dans « Rapports » (TCK-2628). **Pour l'agent, `/app` rend la page « Aujourd'hui » de la famille 5**, premier onglet. Les cinq autres personas gardent l'accueil A.
- **Socle, de haut en bas** :
  1. **Salut** : H1 « Bonjour Awa » (24 px), repli « Bonjour ».
  2. **Date** : sous-ligne de 13 px, « Mardi 10 novembre », suivie d'un résumé quand il y en a un (« · 2 visites, 1 rappel »). Elle remplace « Vue d'ensemble de votre activité », vrai pour personne.
  3. **Mise en service** (admin, tant qu'il reste une étape) : **un bandeau d'une ligne**, qui nomme l'étape suivante et y mène (« Activez la double authentification › »), avec le compte « 6 sur 7 ». Jamais la carte de sept lignes.
  4. **Bandeaux existants** : logo manquant, brouillons à reprendre, check-list d'entrée du locataire.
  5. **Blocs du persona** (TCK-2624, TCK-2625).
  6. **« Ce mois »** : 2 à 4 chiffres, **chacun un lien** vers la liste filtrée qu'il compte, avec son unité (« Impayés · 16 échéances · 33,7 M F CFA »). Au téléphone, une rangée défilante ; au bureau, la colonne droite.
- **« Tout est à jour »** : quand aucun bloc à faire n'a de ligne, un état positif par persona (écran « Rien à faire »), jamais un état vide qui invite à « explorer les biens ».
- **États par bloc** : chaque bloc a son squelette et son erreur (« Impossible de charger … · Réessayer »). Un bloc en échec n'éteint pas les autres (écran « Chargement et erreur »).
- **Plus de « Raccourcis »** : le menu et « Aller à… » les portent.
- **Téléphone (360–390)** : une colonne. L'en-tête est celui de la forme « accueil » (TCK-2617).
- **Bureau (≥ 1280)** : deux colonnes dès `lg`, « À faire » sur les 2/3, agenda du jour et « Ce mois » sur 1/3. Entre `md` et `lg`, une colonne.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md).

**Pas de régression.** Ce qui existe sur l'accueil et doit rester :

- le salut au prénom et son repli ;
- `NoAgencyState` du super-admin sans agence ;
- la mise en service de l'agence, étapes cliquables, disparue une fois l'agence prête (TCK-777) — seulement repliée en une ligne ;
- `BrandingBanner` ;
- `WizardDraftsBanner`, rien quand il n'y a rien ; son échec ne casse pas la page (un `500` intermittent a été relevé chez le prestataire, audit § 2) ;
- `TenantOnboardingChecklistWidget` ;
- les tuiles par rôle de `DashboardMeKpis`, déplacées dans « Ce mois », y compris les KPI personnalisés de l'agence quand ils existent (TCK-2373) ;
- la modale de bienvenue montée par la coque.

**Raccourcis retirés** : chaque destination d'un raccourci d'aujourd'hui reste dans le menu composé du persona (test). Les raccourcis faux du client (« Mes baux », « Paiements » sans bail) disparaissent avec eux.

**Autres règles :**

- **Persona et non rôle** : les blocs se choisissent par le persona du profil actif (ADR-0089), plus par les rôles. C'est la cause des raccourcis faux du client (`isTenant(roles) || isCustomerOnly(roles)`).
- **`/app/overview`** garde son aiguillage tant que TCK-2628 n'a pas livré « Rapports ». Le prestataire n'a jamais de tableau de bord (spec § 2.5).
- **Un seul H1** (TCK-2617). `<title>` « Accueil — Takussan », « Aujourd'hui — Takussan » chez l'agent.
- **Unités** : un compte et un montant ne se posent jamais côte à côte sans leur unité (« 16 échéances », et non « Impayés 16 »).
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement.

## Delta à produire

- [ ] Socle de l'accueil : salut, date et résumé, mise en service en bandeau, bandeaux existants, emplacement des blocs du persona, « Ce mois » en liens.
- [ ] Aiguillage par persona : agent → « Aujourd'hui » (famille 5) ; admin, bailleur, hôte → TCK-2624 ; locataire, client, prestataire → TCK-2625.
- [ ] États par bloc (squelette, erreur avec « Réessayer ») et « Tout est à jour ».
- [ ] Retrait des raccourcis.
- [ ] Tests :
  - les blocs choisis par persona, pas par rôles (client sans bail : ni « Mes baux » ni « Paiements ») ;
  - la mise en service en une ligne qui mène à l'étape suivante ;
  - chaque chiffre de « Ce mois » est un lien ;
  - un bloc en erreur n'empêche pas les autres de rendre ;
  - toute destination d'un ancien raccourci est dans le menu composé.

## Critères d'acceptation

- [ ] AC1 — Admin d'une agence à qui il reste la 2FA : à 390, la mise en service occupe une seule ligne (hauteur ≤ 56 px) qui dit « Activez la double authentification » et mène à son réglage. Le H1 « Bonjour … » est au-dessus du pli.
- [ ] AC2 — À 1280, le chiffre « Impayés » de « Ce mois » a un `href` vers la liste des impayés et porte les deux unités (« échéances » et « F CFA »).
- [ ] AC3 — Un agent sur `/app` voit la page « Aujourd'hui » de la famille 5 (son H1), et non l'accueil A.
- [ ] AC4 — Un client sans bail ne voit aucun lien vers `/app/leases` ni `/app/payments` sur l'accueil.
- [ ] AC5 — `GET /api/me/wizard-drafts` forcé en `500` : le reste de l'accueil rend, et aucun message d'erreur ne couvre la page.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2622.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les blocs « À faire » de chaque persona (TCK-2624, TCK-2625) et la page « Aujourd'hui » de l'agent (famille 5).
- Les graphiques et la « Vue agence » (TCK-2628).
- La modale de bienvenue au-delà de son libellé (TCK-2619).

## Notes d'implémentation

**Prémisse re-mesurée le 2026-11-13** : l'accueil portait encore `PageHeader` avec « Vue d'ensemble de votre activité », la carte `MiseEnService` de sept lignes, `DashboardMeKpis` (tuiles sans lien), `DashboardShortcuts` choisis par rôles. L'agent arrivait déjà sur sa journée (TCK-2596) : AC3 était acquis.

- **Le socle** (`components/accueil/SocleDeLAccueil.tsx`, composant serveur) :
  - au téléphone, la ligne de mise en service PUIS le salut (maquette `AccueilAdminMobile`) ;
  - au bureau, `PageHeader` avec la ligne en `bandeau` ;
  - puis les bandeaux existants, l'emplacement des blocs du persona (`blocs`), « Ce mois ».
  - Un H1 exposé par largeur : le salut du téléphone est `md:hidden`, l'en-tête de page `max-md:hidden`. L'en-tête de coque de forme `accueil` n'a pas de H1.
- **La date** : `jourEnClair(locale, jour)` (`lib/journee/jour-en-clair.ts`), calculée au serveur au jour de Dakar. `useJourEnClair` de « Ma journée » y délègue.
  - Le résumé (« · 3 demandes… ») viendra des blocs de TCK-2624/2625 : aucune source dans ce ticket.
- **La mise en service en une ligne** (`components/accueil/BandeauMiseEnService.tsx`) :
  - la règle des étapes est extraite de `MiseEnService` dans `components/dashboard/admin/etapes-de-mise-en-service.ts` : applicables selon le `kind`, 2FA en tête, total du serveur ;
  - la carte reste sur `/app/overview/agency` ;
  - l'étape nommée est la première connue qui reste à faire, et le lien y mène ;
  - sans étape connue à faire (clé inconnue seule), rien ne se rend ;
  - libellés impératifs neufs `accueil.miseEnService.etapes.*` et, au bureau, `enPhrase.*`.
- **« Ce mois »** :
  - `lib/accueil/chiffres-du-mois.ts` (pur) choisit les chiffres, `components/accueil/CeMois.tsx` les rend : puces défilantes au téléphone, tuiles à flèche au bureau, chacun un `<Link>` ;
  - le choix se fait par **persona** : la vue `tenant` de `/dashboard/me` est servie à tout compte sans autre profil (TCK-595), donc les chiffres du locataire ne se rendent qu'au persona `locataire`. Un client avec une fiche mais sans bail n'a aucun chiffre, ni lien vers `/app/leases` ou `/app/payments` (AC4).
  - Les liens :

    | Chiffre | Admin d'agence standard | Hôte | Bailleur |
    |---|---|---|---|
    | Encaissé | `/app/agency/finances` (point du mois) | `/app/payments?status=paid` | `/app/payments?status=paid` |
    | Impayés | `/app/agency/finances?tab=impayes` (comme `AgencyQueues`) | `/app/payments?status=late` | « En retard » : `/app/payments?status=late` |
    | Occupation | `/app/properties?mode=gestion&occupancy=occupied` | idem | — |
    | Baux actifs | `/app/leases?status=active` | idem | idem |
    | Biens | — | — | `/app/properties` |

  - Le locataire : `/app/leases`, `/app/payments`, `/app/documents`.
  - Les **KPI personnalisés** (TCK-2373) remplacent les chiffres par défaut de l'admin quand l'agence en a activé, au plus quatre. Ils sont lus par `GET /api/kpi-configs` (activés, triés, `fields[kpi_configs]`), un endpoint existant. Leurs valeurs viennent de `/dashboard/me` (même `KpiResolver::flatten`), et une métrique non servie n'est pas rendue.
- **Un bloc en échec n'éteint pas la page** : une panne de `/dashboard/me` (qui faisait tomber tout l'accueil) est rattrapée. « Ce mois » dit « Impossible de charger les chiffres du mois. · Réessayer » (`router.refresh()`), et l'agent garde sa journée, chiffres en « — ».
  - AC5 : `WizardDraftsBanner` avale déjà un 500 ; c'est désormais éprouvé (`WizardDraftsBanner.panne.tck-2622.test.tsx`).
- **États livrés pour TCK-2624/2625** : `ErreurDeBloc`, `SqueletteDeCarte`, `SqueletteDesChiffres`, `ToutEstAJour` (`components/accueil/EtatsDeBloc.tsx`). **« Tout est à jour » n'est pas rendu tant qu'aucun bloc « À faire » n'existe** : il le dirait à un admin qui a 16 impayés.
- **Raccourcis retirés** : `DashboardShortcuts` et `DashboardMeKpis` sont supprimés, avec leurs tests et les clés `dashboard.shortcuts.*`, `dashboard.me.*`, `dashboard.pages.home.subtitle`.
  - `raccourcis-dans-le-menu.tck-2622.test.ts` fige l'ancienne table par compte et exige chaque destination au menu composé du persona. Toutes y sont.
  - Le menu du client ouvre délibérément « Baux » et « Paiements » (`catalogue.ts`, ADR-0089) : seuls les raccourcis de l'accueil disparaissent.
- **Client et prestataire sans chiffres** : `DashboardEmpty` est gardé en attendant leurs blocs (TCK-2625), décision de la session.
- **`<title>`** : « Accueil », et « Aujourd'hui » chez l'agent (`accueilNommeAujourdhui`).
- **Écarts au texte du ticket, la maquette faisant foi** :
  - deux colonnes dès `xl` et non `lg` (note de la maquette : « à 1024, une seule colonne », et AC-F6) ;
  - montants en « F » et non « F CFA » (décision du porteur, TCK-2685 : « F » dans `/app`) — l'AC2 est tenu par « échéances » et « F » ;
  - l'aplat sage de la ligne de mise en service et de « Tout est à jour » passe en `success` (`bg-accent/<n>` refusé par la garde des valeurs arbitraires : l'accent est réservé aux badges *featured*).
- **Vérification par ablation** (17 mutants, un à la fois) : 16 rougissent. Deux tests ont dû être durcis pour ça :
  - « étape inconnue seule : rien » restait vert sur un bandeau qui se rendait quand même — le test attendait l'appel parti, pas la réponse lue ; il attend désormais l'état `success` de la requête, sous une frontière d'erreur (un rendu qui plante n'est pas un rendu vide) ;
  - la panne des brouillons relancée rougit par un rejet non géré (sortie 1), pas par une assertion.
  - Le mutant « `!res.ok` ne lève plus » de `fetchKpisActifs` est équivalent : le `catch` rend `[]` dans les deux cas.
- **Fidélité** (`docs/qa/audit-ux-2026-11/fidelite/TCK-2622.json`) : relevés a-1 et a-6 aux trois largeurs. Le socle (ligne de mise en service, salut, date, « Ce mois ») est conforme ; les absents sont les blocs de TCK-2624. a-7 n'est pas relevé (les squelettes et la panne par bloc sont ceux de TCK-2624).
