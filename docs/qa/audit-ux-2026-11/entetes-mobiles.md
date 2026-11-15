# En-têtes de page au téléphone — inventaire des maquettes et relevé des routes

> TCK-2568 · amendement d'[ADR-0091](../../adr/0091-la-navigation-mobile-du-site-public-suit-le-profil.md#amendement-du-2026-11-09--len-tête-de-page-au-téléphone)
> du 2026-11-09. Mesuré le 2026-11-09, branche `feat/audit-ux-vague-2`, `next dev` chargé (plusieurs
> agents), Chrome par CDP, émulation 390 × 844 (et 360 × 780, 1440 × 900 où c'est dit).

**Ce qui fait foi** : la règle `enTeteAuTelephone(chemin)` de `takussan-web/src/lib/navigation/barre-publique.ts`,
gardée route par route par `barre-publique.en-tete.test.ts`. Ce tableau est le relevé qui l'a fondée,
daté : il ne se tient pas à jour à la main.

## Méthode

1. **Maquettes** : pour chaque page de `/fr/playground/maquettes` (sources `pages/*.tsx`, non versionnées),
   l'approche retenue (champ `retenue`, cité par les tickets TCK-2493 → TCK-2524), écran téléphone par
   écran téléphone : le premier élément de l'`Ecran` — barre du site (marque + recherche :
   `EnTeteMobile`), en-tête propre (retour, titre, action), boutons sur photo, coque de lien, ou rien.
2. **Routes** : chaque écran rattaché à sa route réelle, puis la route chargée dans un cadre de
   390 × 844 ; relevé : la `nav` fixe (hauteur ou absente), la cale `[data-cale-navbar]`, l'en-tête
   `[data-slot=en-tete-de-page]`, le premier `<h1>` et sa position, les liens « Retour » visibles en
   haut, `scrollWidth`.

## Le tableau

« Avant » : relevé du début de séance (2026-11-09, avant TCK-2568). « Après » : relevé de fin.
`nav 69` = la barre du site, 69 px ; `—` = absente.

| Maquette (approche) · écran | Route | Haut attendu au téléphone | Avant | Après |
|---|---|---|---|---|
| Accueil (A) · Accueil | `/fr` | **barre du site** : le **symbole seul** et la pastille « Où cherches-tu ? », 56 px — sans compte (`EnTeteMobile`, navigation A) | nav 69 | nav 69, pastille « Chercher » · `h1` 84 (sr-only) — inchangé ; hauteur et libellé : périmètre de TCK-2495, pas de TCK-2568 |
| Pages légales (A) · Haut de page | `/fr/legal/{terms,privacy,notice}` | **barre du site** (marque + recherche) | nav 69 | nav 69 · `h1` 93 — inchangé |
| Liste (A) · Liste, Galerie | `/fr/properties` | **← [la recherche en vigueur]** + puces (`EnTeteListe`) | nav 71, marque à gauche | nav 71, **retour** 44 × 44 à (10, 12) à la place de la marque, pastille « À louer » |
| Liste (A) · Filtres | (feuille, sans route) | « ✕ Filtres » | — | sans objet (feuille de la liste, TCK-2499) |
| Fiche d'un bien (A) · Fiche | `/fr/properties/<slug>` | **rien** : photo plein cadre, retour · partager · favori posés dessus | nav 69 au-dessus de la photo | **pas de nav**, cale 0, retour 44 px **sur la photo** (12, 12) ; `h1` 346 |
| Erreurs (A) · Bien retiré | `/fr/properties/<retiré>` | **barre du site** + barre d'onglets | nav 69, sans barre d'onglets | nav 69 (forcée : `auTelephone="barre-du-site"`) **et barre d'onglets** 784 + 60 (`<BarreDOngletsPublique presente />`, revue), `h1` « Ce bien a été loué » 101 |
| Erreurs (A) · Erreur serveur | `/fr/properties/<slug>` quand l'API est en panne | **barre de marque** | nav 69 | **barre de marque** (`auTelephone="marque"`, revue) — gardée par le test de branchement ; non provoquée au navigateur |
| Erreurs (A) · Page inconnue | `/fr/<inconnue>`, `/fr/properties/<inconnu>` | **barre de marque** (logo seul, 56 px) | non relevé (page lente) | `/fr/page-inconnue` : en-tête de marque propre de la page racine (TCK-2515) · `/fr/properties/<inconnu>` : **barre de marque** (`auTelephone="marque"`) — voir § Complément |
| Erreurs (A) · Erreur serveur | `error.tsx` du groupe public | **barre de marque** | — | **barre de marque** (`auTelephone="marque"`) |
| Visite (A) · Quand ? Qui ? Envoyée | (feuille de la fiche, sans route) | feuille « ✕ Demander une visite · 1 / 2 » | — | sans objet (TCK-2503) |
| Réservation (A) · Dates, Ta demande, Acompte… | `/fr/bookings?property=<court>` | **en-tête de tunnel** : « ✕ … Effacer », « ← Ta demande » | barre masquée sous `lg` par la page (TCK-2510) | pas de nav (règle + page d'accord), en-tête du tunnel |
| Réservation (A) · Bien au mois | `/fr/bookings?property=<au mois ou à vendre>` | le seul retour **« ← Retour au bien »**, puis le titre | nav 69 | **pas de nav**, cale 0, `EnTeteDePage` 0 + 56, « Retour au bien » → `/fr/properties/<slug>` (revue) ; 360 : `scrollWidth` 360 ; 1440 : nav 75, aucun en-tête de page. ⚠ le titre « Ce bien se loue au mois… » est un `h2` (`EmptyState` du tunnel), pas un `h1` : périmètre réservation |
| — (aucun écran) | `/fr/bookings` sans bien, slug inconnu | pas de maquette ; rien ne mène à une fiche | nav 69 | nav 69 (forcée : sa seule issue) |
| Favoris (A) · Anonyme, Connecté | `/fr/favorites` | **grand titre** « Favoris » + sous-titre + « Partager » | nav 69, `h1` 93 | **pas de nav**, cale 0, `h1` « Favoris » à 24 px |
| — (aucun écran) | `/fr/favorites/shared` | pas de maquette : **barre du site** gardée (on y arrive de WhatsApp sans connaître le site) | nav 69 | nav 69 — inchangé |
| Comparateur (A) · Ce qui diffère | `/fr/compare` | **← « 3 biens · 1 place libre »** au-dessus des colonnes collantes | nav 69, `h1` 115 | **pas de nav**, `EnTeteDePage` 0 + 56, retour 44 × 44, « 2 biens · 2 places libres » ; colonnes collées à 56 px |
| Navigation (A) · Compte, Moi | `/fr/account` | **grand titre** « Compte », ou l'identité « Bonjour Awa » (`EnTeteMoi` : `pt-6`, initiales 56 px, `h1` 24 px) | nav 69, `h1` 93 | anonyme : **pas de nav**, cale 0, `h1` « Compte » à 24 px · **connecté** (`customer@agency1.demo…`, revue) : pas de nav, cale 0, initiales à 24, `h1` « Bonjour Demo » à 26, courriel à 56, barre d'onglets 784 + 60 ; 360 : `scrollWidth` 360 ; 1440 : nav 75 |
| Annuaire (D) · Agences, Agents | `/fr/agencies`, `/fr/agents` | **grand titre** « Professionnels » + onglets + champ + villes | nav 69, `h1` 77 | **basculé avec la vague 3** (TCK-2521 → 2523, la règle les rend `en-tete-de-page`) : **pas de nav**, cale 0, `h1` « Professionnels » à 20 px (`/fr/agencies` et `/fr/agents`), `scrollWidth` 390 |
| Fiche d'agence (D) · Biens… | `/fr/agencies/<slug>` | **couverture**, retour + partager posés dessus | non relevé | **basculé avec la vague 3** (TCK-2522) : **pas de nav**, cale 0, `EnTeteDePage` sur la photo 0 + 68 « Retour · Partager », `h1` « Dakar Immo » à 216, `scrollWidth` 390. La couverture sortie (décision de la session, revue du 2026-11-09, maquette FicheDBiens) : **aucune rangée fixée** ; onglets collés à 0 (49 px), recherche collée de 49 à 165. `/fr/agencies/inexistant-zzz` et la panne : **barre de marque** (nav 57, `h1` « Agence introuvable » à 153) |
| Fiche d'agent (D) · Agent… | `/fr/agents/<slug>` | **« ← · partager »** (`EnTete`) | non relevé | **basculé avec la vague 3** (TCK-2523) : **pas de nav**, cale 0, `EnTeteDePage` 0 + 56 « Retour · Partager », `h1` « Moustapha Fall » à 84, `scrollWidth` 390 ; l'identité passée sous la rangée, rappel « Biens de … » et recherche collée dessous (`sokhna-g` défilé : rangée 0 → 56, recherche 56 → 172, comme `TeteFiltreeAgent`). 404 et panne : **barre de marque** |
| Paiement (A), Revendication (A), Liens (A) | `/fr/pay/*`, `/fr/claim/*`, `/fr/share/*`, `/fr/search-alerts/*`, `/fr/notifications/unsubscribe` | **coque de lien** : émetteur ou marque, mention (« Paiement sécurisé », « Lien personnel ») | coque, pas de nav | inchangé (TCK-2505) |
| Recherche (D) · Avant, Pendant | (écran de la barre, sans route) | champ actif plein écran | — | sans objet (`Navbar`, TCK-2497) |

## Bureau et étroit

- **1440 × 900** (après) : la barre du site est là, à sa hauteur d'avant — `nav 75` / cale 75 sur
  `/fr/favorites`, `/fr/compare`, la fiche et `/fr/account` (une ligne, hors découverte), `nav 127` /
  cale 136 sur la liste (rangée de catégories) ; aucun `EnTeteDePage` visible ; `scrollWidth` 1440.
- **360 × 780** : `scrollWidth − innerWidth = 0` sur la liste, la fiche, le comparateur, la réservation et les favoris.

## Ce que le relevé a appris

- **Trois éléments collants supposaient la barre de 69 px au-dessus d'eux** (`sticky top-[69px]`) :
  l'en-tête des colonnes du comparateur (corrigé : `top-14`, sous l'`EnTeteDePage`), les onglets de la
  fiche d'agence (`OngletsDeFiche`, vague 3 : `top-0`, aucune rangée au-dessus) et la barre de lecture des pages légales (qui
  gardent la barre : rien à faire).
- **Le haut d'une page ne dépend pas toujours de son chemin** : un bien retiré, une fiche introuvable,
  une panne, l'état « au mois » de la réservation vivent sous le chemin d'une page sans barre. Ils
  déclarent eux-mêmes leur haut (`auTelephone=…`, sur la barre ET sur sa cale, ou un `EnTeteDePage`),
  et le bien retiré son bas (`<BarreDOngletsPublique presente />`).
- **Une route ne quitte la barre qu'avec son en-tête** (revue du 2026-11-09) : passer `agencies` et
  `agents` dans la règle avant que leurs pages portent leur en-tête leur avait ôté la barre sans rien
  à la place — 404 sans haut, onglets collants à 69 px, titre à 8 px du haut. Ils ont basculé avec la
  vague 3 (relevé ci-dessus), une fois leurs pages, leurs 404 et leurs pannes pourvues de leur haut.
- **La liste ne perd pas la recherche** : sa maquette ouvre sur la recherche en vigueur, que la
  pastille de la `Navbar` porte déjà ; seule la marque cède sa place au retour.

## Complément du 2026-11-09 — la barre de marque des pages d'erreur

La maquette des erreurs (approche A) ouvre « Page inconnue » et « Erreur serveur » sur une **barre de
marque** : le logo seul, 56 px, sans recherche (`BarreDeMarque`). La `Navbar` gagne la forme
`auTelephone="marque"` — que la règle du chemin ne rend jamais, posée par la page : logo nom compris,
pastille de recherche masquée, rangée de 56 px, cale de 57 (avec la bordure) ; le bureau ne change pas.
Posée sur `properties/[slug]/not-found.tsx` et `(public)/error.tsx`. `[locale]/not-found.tsx`
n'existe pas ; la 404 racine (`app/not-found.tsx`) écrit déjà sa propre marque sans `Navbar`.

| Route | Taille | Relevé |
|---|---|---|
| `/fr/properties/inexistant-zzz` | 390 × 844 | `nav` 57, `data-en-tete-au-telephone="marque"`, logo 158 × 33 à 12 px (nom visible), pastille invisible, cale 57, `h1` « Bien introuvable » 153, `scrollWidth` 390 |
| idem | 360 × 780 | mêmes valeurs, `scrollWidth` 360 |
| idem | 1440 × 900 | `nav` 75, cale 75, recherche de bureau visible : inchangé |
| `error.tsx` | — | non relevé au navigateur (une exception de section ne se provoque pas d'une URL). Gardé depuis la revue par `erreur-publique.en-tete.test.tsx`, qui monte le VRAI `error.tsx` et la vraie `Navbar` sous cinq chemins (barre de marque, cale 57) |

## Corrections de la revue adverse du 2026-11-09

Relevé après corrections, mêmes cadres (390 × 844 sauf mention), contexte isolé « entetes-corrections ».

| Point de la revue | Correction | Relevé |
|---|---|---|
| 404, onglets, titre et fiche d'agent de l'annuaire | `agencies`, `agents` sortent de la règle jusqu'à la vague 3 | `/fr/agencies`, `/fr/agents` : nav 69, `h1` 81, barre d'onglets ; `/fr/agents/moustapha-fall` : nav 69 |
| Réservation au mois | `EnTeteDePage` « Retour au bien » → sa fiche, pas de barre | voir la ligne du tableau |
| Retour dans un nouvel onglet sans Navigation API | `peutRevenirSurLeSite` exige aussi `history.length ≥ 2` | `window.open('/fr/compare?ids=857,854')` (historique 1, référent du site), `navigation` retirée, clic → `/fr/properties` (le repli) |
| Bien retiré sans barre d'onglets | `<BarreDOngletsPublique presente />` posée par la page | barre d'onglets 784 + 60 ; 1440 : nav 75, aucune barre d'onglets |
| Fiche indisponible | `auTelephone="marque"` | test de branchement |
| `/fr/account` connecté | — (déjà conforme) | voir la ligne du tableau |

