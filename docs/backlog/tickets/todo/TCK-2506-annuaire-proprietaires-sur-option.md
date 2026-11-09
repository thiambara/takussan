---
id: TCK-2506
title: Annuaire public : les propriétaires particuliers n'y paraissent que s'ils l'ont choisi
status: todo
phase: P1
family: full
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#1-user"
tags: [back, front, directory, privacy, audit-ux]
---

## Objectif utilisateur

Un particulier qui confie son bien à une agence n'est pas exposé dans un annuaire public sans l'avoir voulu ; s'il le souhaite, il peut y paraître.

## Contrat de données

- Colonne `users.listed_in_public_directory` (boolean, défaut `false`, cf. `spec_refs.models`).
- `PublicAgentController::index` : un compte dont le `public_role` est `owner` n'est listé que si `listed_in_public_directory` est vrai. Un agent en exercice reste listé.
- `PublicAgencyController` (« L'équipe » d'une fiche d'agence) : ne liste que ses agents ; les compteurs du bandeau restent justes.
- La fiche `/agents/{slug}` d'un propriétaire non listé reste servie quand une de ses annonces publiques y mène, en `noindex`, absente du sitemap.
- `PATCH /api/me` (ou l'endpoint de préférences du profil existant) : la préférence est modifiable par le compte lui-même.

## Direction UX / Artistique

- Dans le profil du compte (console) : une bascule « Paraître dans l'annuaire public des propriétaires », avec une phrase sur ce qui devient public (nom, biens publiés).

## Contraintes strictes (métier)

- Défaut `false` pour **tous** les comptes existants : la migration n'en liste aucun d'office.
- Le sitemap et les données structurées `Person` suivent la même règle que l'annuaire.
- Seul le compte lui-même change sa préférence ; ni l'agence, ni la plateforme.

## Delta à produire

- [x] Migration `add_listed_in_public_directory_to_users_table`.
- [x] Filtre dans `PublicAgentController::index`, `PublicAgencyController` (équipe), sitemap.
- [x] `noindex` sur la fiche d'un propriétaire non listé.
- [x] Préférence modifiable par le compte (API + bascule du profil).
- [x] Tests : `PublicDirectoryOwnerOptInTest` (non listé par défaut, listé après choix, agent toujours listé), `PublicAgencyTeamAgentsOnlyTest`, `SitemapOwnerOptInTest` ; test front de la bascule.

## Critères d'acceptation

- [x] AC1 — Sur la base de démo, `/fr/agents` ne liste plus aucun propriétaire particulier tant qu'aucun ne l'a choisi.
- [x] AC2 — « L'équipe » d'une agence ne liste que ses agents, et son compte correspond au bandeau.
- [x] AC3 — Un propriétaire qui active la préférence apparaît dans l'annuaire et au sitemap.
- [x] AC4 — La fiche d'un propriétaire non listé, ouverte depuis son annonce, répond 200 avec `noindex`.

## Hors périmètre

- La refonte visuelle de l'annuaire et des fiches d'agence (maquettes du lot suivant).

## Notes d'implémentation

- **Mesure avant (2026-11-09, base de dev)** : `GET /api/public/agents?per_page=48` → 44 lignes, **44 `owner`, 0 `agent`**. Après : 0 ligne — l'annuaire de la démo est vide tant qu'aucun propriétaire ne l'a choisi et qu'aucun agent n'y publie (le seed ne rattache aucun bien public à un agent en exercice).
- **Règle « en exercice »** = celle de `PublicProfileFacts::rolesPublics()` écrite en SQL : `User::scopeVisibleDansLAnnuairePublic()` (AgentProfile actif, ou AgencyAdminProfile actif d'une agence `standard`, ou `listed_in_public_directory`).
- **Le sitemap n'a pas de source propre** pour les personnes : le front pagine l'index (`listerSlugsDeProfils`). Filtrer l'index suffit ; `SitemapOwnerOptInTest` joue le parcours côté API.
- **Durcissement de `show()` (délibéré)** : avant, `/api/public/agents/{username}` servait le nom de N'IMPORTE QUEL compte actif, client sans bien compris. Désormais une fiche existe si le compte est agent en exercice, OU inscrit à l'annuaire, OU a au moins une annonce publique (`publicPortfolio`) — c'est la lecture de « reste servie quand une de ses annonces publiques y mène ». Même résolution pour `…/properties` et `…/contact-lead` (`ficheOu404`). Fixtures existantes ajustées (compte sans bien → `listed_in_public_directory`).
- **`indexable`** est servi par la fiche (`agent` ou inscrit) ; le réglage lui-même ne sort que pour soi (`UserResource`, bloc « pour soi »).
- **Équipe d'agence** : filtrée sur `public_role === 'agent'` APRÈS le calcul existant (conjonction règle publique × profil actif ICI) — un propriétaire inscrit à l'annuaire n'entre pas pour autant dans l'équipe d'une agence dont il est client. Trois tests de `PublicRoleTest` et un de `PublicProfileTest` (TCK-276 « l'équipe inclut les publieurs ») renversés en conséquence.
- **Preuves des AC (2026-11-09, pile `./dev.sh`)** : AC1 `GET /api/public/agents?per_page=48` → `total 0` (44 propriétaires avant) ; AC2 `PublicAgencyTeamAgentsOnlyTest` (équipe = agents, `stats.agents` = compte) ; AC3 bascule cliquée au navigateur sur `owner4@dakarimmo.sn` → l'index rend `[('sokhna-g','owner')]` et la fiche perd son `noindex`, puis rebasculée (état de démo rendu) ; `SitemapOwnerOptInTest` joue la source du sitemap ; AC4 `curl /fr/agents/sokhna-g` → 200 + `<meta name="robots" content="noindex, follow"/>`.
- **Hors `$fillable`** : seul `MeController::update` écrit la colonne (`boolean:strict`).
- **Revue adverse (2026-11-09), corrigée** :
  - **(majeur) AC3 n'était prouvée que sur un compte de seed.** L'index (donc le sitemap) exigeait `username` non nul, héritage de « le slug EST le username ». Or `AuthController::register` ne pose aucun `username` : un propriétaire inscrit par le formulaire qui choisissait l'annuaire avait une fiche indexable, mais n'entrait ni dans l'annuaire ni au sitemap. La condition est devenue « a un slug de fiche » (`public_slug` OU `username`). Tests : `SitemapOwnerOptInTest::test_un_proprietaire_inscrit_par_le_formulaire_…` (compte créé par `User::create` comme `register`) et `PublicDirectoryOwnerOptInTest::test_un_agent_sans_username_…`. Ablation (condition `username` remise) : 2 rouges ; restauré, md5 identique.
  - **Angles morts fermés** : un brouillon ou un bien privé n'ouvre pas de fiche (fiche, portefeuille, contact → 404), rouge si `publicPortfolio()` est retiré de la règle de fiche. Le contact d'un client sans bien rend 404, rouge si `contactLead` résout sans la règle.
  - **Interrupteur (UI)** : gardé en case native `role="switch"` (aucune primitive Switch). Le masquer selon le rôle public GLOBAL n'est pas possible : `/api/me` n'expose pas de `public_role`, et `user.roles` vient du profil de l'agence ACTIVE (`UserResource`, `activeProfileTypesAt`). Un compte propriétaire dans X et agent dans Y voit donc l'interrupteur dans X. Sans conséquence : il est listé comme agent, quoi qu'il coche.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (règle de fiche publique, `noindex`, préférence par `PATCH /api/me`) ; `docs/models-spec.md` § 1 (`listed_in_public_directory`, `username`).
