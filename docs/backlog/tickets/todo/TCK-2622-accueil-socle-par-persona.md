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
depends_on: [TCK-2618, TCK-2596]
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

## Hors périmètre

- Les blocs « À faire » de chaque persona (TCK-2624, TCK-2625) et la page « Aujourd'hui » de l'agent (famille 5).
- Les graphiques et la « Vue agence » (TCK-2628).
- La modale de bienvenue au-delà de son libellé (TCK-2619).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
