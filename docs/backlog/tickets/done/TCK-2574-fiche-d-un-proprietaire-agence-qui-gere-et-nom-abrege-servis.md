---
id: TCK-2574
title: Fiche d'un propriétaire — l'API sert l'agence qui gère ses biens et son nom abrégé
status: done
phase: P1
family: back
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [api, directory, privacy, audit-ux]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai.** La fiche (`PublicAgentController.php:285-287`) sert encore `last_name` et
`full_name` complets pour un propriétaire, et `agency` = `$agent->agency` (`:330-334`), nul pour lui ;
le front (`agents/[slug]/page.tsx:207-211`, renvoi `:270-278`) est prêt mais ne se déclenche jamais.
Rien n'a été fermé entre-temps (`git log --grep=TCK-2574` : création du ticket seulement).

À noter : la **liste** `GET /api/public/agents` sert déjà sous `agency` l'agence **majoritaire** des
biens publiés (`PublicProfileFacts::agences()`, `app/Services/Public/PublicProfileFacts.php:221-260`),
propriétaire compris — règle différente de l'AC2.

Reste à faire : clé distincte sur la fiche (point de départ naturel : `PublicProfileFacts::agences()`) ;
nom abrégé sur fiche et liste pour `public_role: owner` (AC3) ; front sur la nouvelle clé (AC1, AC4) ;
aligner la règle de la liste (à trancher par la session : garder la majoritaire ou passer à « `null` si
plusieurs », sinon liste et fiche se contrediront).

## Objectif utilisateur

Sur la fiche publique d'un propriétaire (`/agents/<slug>`, `public_role: owner`), le visiteur qui
veut écrire est renvoyé à **l'agence qui gère ses biens** (TCK-2523, décision 1b), et la personne
n'y est jamais exposée au-delà d'un nom abrégé (« Sokhna G. »).

## Constat (relevé du 2026-11-09, pile `./dev.sh`)

`GET /api/public/agents/sokhna-g` (propriétaire, 8 biens publics) rend :

- `agency: null` — `PublicAgentController` sert `$agent->agency`, le rattachement de la
  **personne** ; un propriétaire n'en a pas. L'agence qui gère ses biens (celle des biens publiés)
  n'est servie nulle part sur la **fiche**. (*2026-11-16 :* la **liste** `GET /api/public/agents` sert
  déjà, sous `agency`, l'agence majoritaire des biens publiés — `PublicProfileFacts::agences()` — pour un
  propriétaire comme pour un agent.) Le front (TCK-2523) sait déjà renvoyer le contact à cette
  agence quand elle est servie, et retombe sinon sur le formulaire anonyme du propriétaire.
- `full_name: "Sokhna Gueye"`, `last_name: "Gueye"` — le nom complet sort de l'API ; seul le front
  l'abrège (titre, `<h1>`, contact, données structurées). Un nom de famille servi à un endpoint
  anonyme et énumérable par slug reste lisible par quiconque l'appelle.

## Delta à produire

- [x] Sur la fiche d'un propriétaire, servir l'agence qui gère ses biens publics (`id`, `name`,
  `slug`) — sous une clé distincte de `agency` (qui reste le rattachement de la personne) :
  `managing_agency`. La règle de choix (réécrite le 2026-11-16, cf. AC2) est celle que l'annuaire
  servait déjà : l'agence la plus fréquente, `null` s'il n'y en a aucune.
- [x] Pour un propriétaire, ne plus servir `last_name` ni le nom complet : `full_name` abrégé
  (« Sokhna G. »), `last_name` absent ou réduit à l'initiale. L'agent (`public_role: agent`) garde
  son nom complet.
- [x] Même règle sur la liste `GET /api/public/agents` (ligne d'annuaire d'un propriétaire listé) —
  y compris dire s'il faut **remplacer** la règle majoritaire actuelle de la liste
  (`PublicProfileFacts::agences()`) par celle de l'AC2 (`null` si plusieurs agences), ou la garder.
- [x] Front : lire la nouvelle clé dans `agents/[slug]/page.tsx` (aujourd'hui
  `agenceDuProprietaire = !estAgent ? agent.agency : null`).

## Critères d'acceptation

- [x] AC1 — Un propriétaire dont tous les biens publics sont gérés par Dakar Immo : la réponse porte
  Dakar Immo comme agence de gestion, et la fiche rend « Écrire à l'agence » vers `/agencies/dakar-immo`.
- [x] AC2 — *(réécrit le 2026-11-16 : la règle de la liste fait foi, cf. « Livré »)* La clé
  `managing_agency` vaut, sur la fiche ET sur la liste, la même agence : parmi ses biens publics qui
  ont une agence, l'agence active et `standard` la plus fréquente, à égalité la plus petite `id`.
  Les biens sans agence ne comptent pas. Aucune agence (ou seulement un espace `individual`) :
  `null`, et la fiche garde le formulaire anonyme du propriétaire.
- [x] AC3 — Le JSON de la fiche et de la liste d'un propriétaire ne contient pas son nom de famille
  (balayage de la réponse) ; celui d'un agent le contient.
- [x] AC4 — (front + API) La fiche d'un propriétaire géré par une agence propose de contacter l'agence :
  sur la vraie API, « Écrire à l'agence » mène à `/agencies/<slug>` de l'agence qui gère ses biens.
  _AC transféré de TCK-2523 (AC3) par la session le 2026-11-09 : l'API sert `agency: null` pour un
  propriétaire._

## Hors périmètre

- Le numéro du propriétaire : il n'est déjà jamais rendu par le front (TCK-2523, AC3).

## Notes d'implémentation

- 2026-11-09 — transféré par la session : l'AC3 de [TCK-2523](TCK-2523-fiche-d-agent-la-personne-d-abord.md)
  (« son bouton de contact vise l'agence ») devient l'AC4 ici, l'API servant `agency: null` pour un
  propriétaire. TCK-2523 est livré sans lui : la fiche d'un propriétaire garde son formulaire. Le
  front sait déjà rendre le renvoi (`agenceDuProprietaire`, `agents/[slug]/page.tsx`) ; il suffit d'y
  brancher la nouvelle clé.

## Livré (2026-11-16)

- **AC2 réécrit — la règle majoritaire de la liste est gardée** (décision de la session : cohérence
  liste ↔ fiche). « `null` si plusieurs » aurait retiré à la liste une agence qu'elle sert depuis
  TCK-436 et privé de renvoi un propriétaire dont une agence gère presque tout ; la majoritaire gère
  bien ses biens, ce qui tient l'objectif. Une seule source, `PublicProfileFacts::agences()`, lue par
  la fiche (`managing_agency`) et la liste (`agency`, inchangée, et `managing_agency`, même valeur).
  Conséquence assumée : 7 biens sans agence + 1 sous Dakar Immo → Dakar Immo.
- **`agences()` exclut désormais les espaces `individual`** : leur page `/agencies/…` rend 404, et le
  renvoi aurait remplacé le formulaire par un lien mort. Vaut aussi pour la liste.
- **Nom** : `PublicProfileFacts::nomPublic()` — propriétaire `last_name: "Z."`, `full_name: "Sokhna Z."` ;
  agent inchangé. L'initiale plutôt que l'absence : `nomAbrege` côté front la garde.
- **Recherche de l'annuaire** : `users.last_name` n'est plus cherchable que chez un agent en exercice
  (même prédicat que `rolesPublics()`) — sinon une recherche préfixe reconstituait le nom.
- Preuves : `tests/Feature/Public/FicheProprietaireAgenceDeGestionTest.php` (AC1, AC2 ×3, AC3 ×2,
  chaque cas lu sur les deux surfaces) ; ablations rouges : abréviation, `kind`, recherche, nom de la
  fiche seul, nom de la liste seul, `managing_agency` de la fiche. Front :
  `agents/[slug]/__tests__/page.server.test.tsx` (renvoi par `managing_agency`, pas par `agency` —
  ablation rouge).
- **AC4 coché le 2026-11-16 (voir la ligne suivante)** ; ancien texte :  la partie API et la partie front sont prouvées séparément, mais « sur la vraie
  API » n'a pas été mesuré (API locale éteinte au moment de livrer).
- 2026-11-16 — AC4 vérifié à l'écran sur la vraie API locale (`./dev.sh`, API :8002) : `curl -g localhost:8002/api/public/agents/mouhamed-s` → `public_role: owner`, `agency: null`, `managing_agency: {id:1, slug:dakar-immo, name:Dakar Immo}` ; `/fr/agents/mouhamed-s` (1280 et 500, aucun défilement horizontal) affiche « Ses biens sont gérés par Dakar Immo », un « Écrire à l'agence » dont le `href` est `/fr/agencies/dakar-immo` (cliqué : arrivée sur `/fr/agencies/dakar-immo`, titre « Dakar Immo — Agence immobilière »), et aucun formulaire propriétaire. Autres propriétaires de la base : bineta-n → saint-louis-habitat, yacine-f → thies-properties.
