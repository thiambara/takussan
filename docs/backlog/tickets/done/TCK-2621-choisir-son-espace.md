---
id: TCK-2621
title: "Choisir son espace : à la connexion d'un compte de plusieurs agences, et dans le menu du compte (coché, rôle et ville, jamais le slug)"
status: done
phase: P1
family: front
estimate: S
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2620, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, profils, coque, audit-ux, app]
---

## Objectif utilisateur

Un compte de plusieurs agences sait toujours dans quel espace il travaille. À sa première connexion, il choisit ; ensuite, il arrive là où il était. Il change d'espace en deux gestes, sans jamais lire un identifiant technique.

## Contrat de données

Lectures et écritures, toutes existantes ou ajoutées par TCK-2620 :

- `GET /api/me/profiles` : profils, avec `agency.name`, `agency.city` (TCK-2620) et `kind`.
- `GET /api/auth/me` : `active_profile_id` (TCK-2620).
- `PATCH /api/me/active-profile` : `profile_id` et `remember` (TCK-2620).

Le changement d'espace passe par le chemin unique actuel (`useSwitchActiveProfile`, ADR-0004 amendé), qui vide le cache.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-coque&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Choisir un espace (connexion) » et « Compte et espaces ».
- **Choisir un espace** (repli de la décision 5 b de la famille) :
  - **Quand** : seulement pour un compte qui a des profils actifs dans au moins deux agences, et qui arrive sur `/app` sans profil lié (`active_profile_id` nul).
  - **Téléphone** : plein écran avec « Dans quel espace travaillez-vous ? » en 24 px, puis une grande carte par espace : nom de l'agence, rôle, ville. Viennent ensuite la case « Se souvenir de mon choix » (cochée), le bouton primaire « Continuer dans <agence> » et le lien « Continuer en tant que client ».
  - **Bureau** : un dialogue centré de 520 px, avec le même contenu et les cartes côte à côte.
- **Menu du compte** (feuille du bas au téléphone, menu au-dessus du pied au bureau) :
  - « Vos espaces » donne une carte ou une ligne par espace : agence, puis « rôle · ville » en sous-ligne ;
  - l'espace actif est coché ;
  - **jamais de slug** à l'écran.
- **Téléphone (360–390)** : deux cartes et le bouton tiennent sans défilement à 390 × 844. **Bureau (≥ 1280)** : le dialogue ne recouvre pas la colonne.

## Contraintes strictes (métier)

- **L'écran n'apparaît jamais** :
  - à un compte d'une seule agence (l'API l'auto-bascule) ;
  - pendant une impersonation ;
  - quand l'API a déjà lié un profil, par cookie ou par dernier espace retenu.
- **« Continuer en tant que client »** : le compte reste sans profil lié, et la question ne revient pas dans la même session.
- **Le persona de la coque suit le profil que l'API a LIÉ.** Sans cookie lisible, la coque lit `active_profile_id` de `/api/auth/me` avant de se rabattre sur l'ordre figé (`TYPE_DOMINANT`). Sinon, le menu d'un admin, aussi bailleur, retrouvé dans son espace d'admin serait celui du bailleur.
- **Pas de régression** :
  - la bascule actuelle (menu du compte, palette « Espaces ») ;
  - le regroupement des espaces par rôle ;
  - l'hôte présenté comme un seul espace (`espacesAProposer`, TCK-497) ;
  - le cache vidé au changement de profil.
- Le choix d'espace ne se mélange pas à la connexion de la famille 2 : il vient APRÈS elle, sur `/app`.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement (« Dans quel espace travaillez-vous ? »).

## Delta à produire

- [ ] L'écran « Choisir un espace » (plein écran au téléphone, dialogue au bureau) et ses conditions d'apparition.
- [ ] Le persona de la coque aligné sur `active_profile_id` quand aucun cookie n'est lisible.
- [ ] Le menu du compte : espace actif coché, rôle et ville en sous-ligne, slug retiré (`slugAAfficher` ne sert plus ici).
- [ ] Tests :
  - l'écran pour deux agences et aucun profil lié ;
  - aucun écran pour une agence, en impersonation, ou avec un profil lié ;
  - `remember` envoyé selon la case ;
  - aucun slug dans le menu du compte ;
  - le persona suit `active_profile_id`.

## Critères d'acceptation

- [ ] AC1 — Un compte agent chez Dakar Immo et propriétaire chez Thiès Properties, sans cookie et sans espace retenu, arrive sur `/app` et voit deux cartes : « Dakar Immo · Agent · Dakar » et « Thiès Properties · Propriétaire · Thiès ». Choisir Thiès envoie `{profile_id, remember: true}` (vérifié au réseau) et rend le menu du bailleur.
- [ ] AC2 — Après déconnexion et reconnexion, le même compte arrive directement dans le menu du bailleur, sans écran de choix.
- [ ] AC3 — Le menu du compte de ce compte ne contient aucun des deux slugs (`thies-properties`, `dakar-immo`), et la ligne de l'espace actif porte une coche.
- [ ] AC4 — Un compte d'une seule agence ne voit jamais l'écran : test, plus contrôle au navigateur à la connexion.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2621.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les compteurs par espace de la maquette (« 3 demandes · 2 visites aujourd'hui »), que l'API ne sert pas sans une lecture par espace.
- Le bouton d'espace de l'en-tête de l'accueil au téléphone (TCK-2617) : il ouvre la feuille de ce ticket.

## Notes d'implémentation

- **Où l'écran se décide** : `espacesAChoisir(user)` (`src/lib/espaces-serveur.ts`) dans le layout de `/app`, qui rend
  `ChoixDEspace` À LA PLACE de la coque (ni colonne, ni modale d'accueil dessous). Conditions dans `doitChoisirUnEspace`
  (`src/lib/espaces.ts`) : au moins deux agences, `active_profile_id` nul, pas d'impersonation, pas de témoin
  « client » de la session (`COOKIE_CHOIX_CLIENT`, cookie de session sans durée).
- **Choisir** passe par `useSwitchActiveProfile` avec `{ profileId, remember }` ; le relais
  `PATCH /api/me/active-profile` transmet `remember` à l'API (TCK-2620) et pose le cookie.
- **Le persona de la coque** suit `active_profile_id` de `/api/auth/me` quand aucun cookie n'est lisible
  (`profilLieDeLaCoque`, `src/lib/navigation/personas.ts`).
- **Libellés décidés** (fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2621.json`, `_alias`) : « Se souvenir de mon
  choix » sans « sur cet appareil » (le choix est retenu sur le COMPTE), « Continuer en tant que client » (genre non
  connu). Une agence sans ville rend le rôle seul, sans séparateur.
- **Jeton neuf** : `shadow-carte-d-entree` (l'ombre exacte de la carte de la maquette au bureau), dans `OMBRES`.
- **Mesures au navigateur, 2026-11-11, compte 176** (agent chez Dakar Immo, propriétaire chez Thiès Properties, agences
  sans adresse en base) :
  - AC1 : deux cartes « Thiès Properties · Propriétaire » et « Dakar Immo · Agent » (sans ville : donnée), choix de
    Thiès → `PATCH /api/me/active-profile` `{"profile_id":"owner:29","remember":true}` → 200, puis onglets
    « Accueil Biens Loyers Messages Menu » et groupe « Mon patrimoine » (bailleur).
  - AC2 : jeton révoqué par `POST /api/auth/logout` (401 ensuite), puis un second jeton du compte, navigateur neuf,
    sans cookie d'espace : arrivée directe dans le menu du bailleur, à 390 et à 1440. La reconnexion est SIMULÉE par
    un jeton frappé d'avance (aucun mot de passe, aucun envoi de code).
  - AC3 : feuille (390) et menu (1440) sans `thies-properties` ni `dakar-immo` ; la ligne de Thiès porte
    `aria-current="true"` et la coche.
  - AC4 : un agent d'une seule agence arrive sur l'accueil, sans écran de choix.
  - « Continuer en tant que client » : coque du client, aucun `PATCH`, et l'écran ne revient pas au rechargement.
  - Sans défilement : 390 × 844 (bas des actions à 760 et 812) et 360 × 780 ; aucun débord de 360 à 1440.
  - Après les mesures, l'espace retenu du compte a été effacé (`remember=false`) : le compte est rendu dans son état
    de départ, l'écran de choix réapparaît à sa prochaine arrivée.
- **Vérification adverse (verif-patrimoine, 2026-11-11) : acceptée, aucun défaut** — 16 ablations rouges, AC1 à AC4
  tenus contre les correctifs faux (écran montré à tous, `remember` forcé, cookie front pour AC2). `remember` sur le
  profil d'autrui : 403 avant toute écriture (le test du dépôt ne vérifie pas l'absence d'écriture — trou hérité de
  TCK-2620). **Limite connue, à décider par le porteur s'il le veut** : en impersonation d'un compte de deux agences,
  rien n'est lié et la coque est celle du client ; l'opérateur ne voit pas les espaces d'agence de la cible (TCK-2620).
