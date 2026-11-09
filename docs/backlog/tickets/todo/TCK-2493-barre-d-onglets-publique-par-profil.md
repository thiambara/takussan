---
id: TCK-2493
title: Barre d'onglets publique au téléphone, dont les cases suivent le profil connecté
status: todo
phase: P1
family: front
estimate: L
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: [TCK-2494]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, mobile, adr-0091, audit-ux]
---

## Objectif utilisateur

Au téléphone, sur le site public, chacun trouve sous le pouce ce qui l'attend — le chercheur ses favoris et ses visites, le locataire son loyer, l'agent ses demandes — sans que trois couches flottantes recouvrent la page.

## Contrat de données

Aucun endpoint neuf. Les cases 2 et 3 se lisent dans `DISPOSITIONS[persona].onglets` (ADR-0089), les compteurs sont ceux du menu de `/app` ; le persona se résout comme dans la coque (profil actif). Règle complète : [ADR-0091](../../../adr/0091-la-navigation-mobile-du-site-public-suit-le-profil.md) § Décision 2 à 4.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=navigation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Par profil », « Anonyme », « Locataire », « Agent », « Compte », « Moi chercheur », « Moi agent », « Fiche ».
- Forme « barre classique » : cinq cases égales, icône et libellé toujours visibles ; la case active se lit par une forme et un poids, pas par la seule couleur.
- « Moi » porte l'avatar en initiales et ouvre l'espace du persona : sélecteur d'espace en tête s'il y en a plusieurs, « Publier un bien » en tête pour les pros, groupes de la disposition, puis langue, aide, légal, déconnexion. « Compte » (anonyme) : connexion par numéro, ce que le compte garde, publier gratuitement, réglages.
- Le comparateur devient une pastille « Comparer N » au-dessus de la barre ; le bouton « Messagerie » flottant disparaît.
- Accueil connecté : une carte de rappel du persona en tête (loyer dû pour le locataire, prochaine visite pour l'agent…), validée par le porteur le 2026-11-08.
- ⚑ Écart de charte accepté (ADR-0091) : la règle « une seule couche d'action en bas à la fois » s'écrit dans `docs/design-guidelines.md`.

## Contraintes strictes (métier)

- Sous `lg` seulement ; rien de la page n'est caché sous la barre (dernier bouton atteignable, cf. TCK-503), zone sûre respectée.
- Absente sur la fiche d'un bien (sa barre d'actions la remplace), dans les tunnels (visite, paiement, revendication, publication), sur les pages par lien et sur la carte plein écran.
- Une case inaccessible au persona cède sa place à la destination suivante de sa disposition, jamais un cadenas (même règle que TCK-2481).
- L'anonyme n'a pas de compteur sur Messages ; Messages et Moi demandent une session, Compte et Favoris non (favoris de l'appareil).
- Changer d'espace change la barre sans recharger la page.

## Delta à produire

- [x] Barre d'onglets publique, dérivée de la disposition du persona (une seule source avec `/app`).
- [x] Écrans « Compte » (anonyme) et « Moi » (connecté, par persona).
- [x] Règle des couches : pastille du comparateur, retrait du bouton Messagerie flottant, masquage de la barre là où une autre couche d'action vit.
- [x] Carte de rappel du persona en tête de l'accueil connecté.
- [x] Retrait du menu hamburger public (son contenu passe dans Compte / Moi).
- [x] Règle écrite dans `docs/design-guidelines.md`.
- [x] Tests : cases par persona (les huit lignes du tableau d'ADR-0091), case inaccessible remplacée, absence sur fiche et tunnels, `nav` nommée et `aria-current`.

## Critères d'acceptation

- [x] AC1 — À 390 px, chaque persona voit exactement les cases du tableau d'ADR-0091 ; à 1024 px, ni barre ni réserve de hauteur.
- [x] AC2 — Sur une fiche et sur `/pay/[token]`, aucune barre d'onglets ni pastille du comparateur.
- [x] AC3 — Avec trois biens au comparateur, la surface recouverte en bas de l'accueil mesure au plus la barre plus la pastille (mesure au navigateur, comparée au relevé de l'audit).
- [ ] AC4 — Un compte agent à deux espaces voit sa barre passer de « Demandes · Visites » à « Mes biens · Demandes » en changeant d'espace depuis « Moi ».
- [x] AC5 — Le dernier élément focalisable de l'accueil et de la liste est atteignable au-dessus de la barre à 360 et 390 px.

## Hors périmètre

- L'en-tête de bureau et le menu « Mon espace » (TCK-2494).
- Le contenu des pages Favoris, Messages ou Publier.
- Le choix des onglets par l'utilisateur.

## Notes d'implémentation

Mesures du 2026-11-09 (branche `feat/audit-ux-vague-1`, partie de `dev` @ 92b2a8937) :

- **Le persona se résout côté client** sur le site public : la racine (`app/layout.tsx`) lit déjà les
  cookies et passe `initialActiveProfileId` à `AuthProvider` ; `typeDuProfilActif(activeProfileId)`
  + `resoudrePersona` suffisent. L'agence `individual` (persona `hote`) n'est connue que par
  `GET /api/me/profiles` (`agency.kind` du profil actif) : lue seulement pour un compte qui porte
  un profil. Le layout de `/app` lit en plus les modules masqués de l'agence et sa suspension :
  **le site public ne les lit pas** (`modulesMasques: []`, `agencySuspended: false`) — une entrée
  masquée par l'agence peut donc paraître dans « Moi » / « Mon espace » ; sa page reste servie
  (`cheminOuvert` ignore le masque, TCK-2483 §6), ce n'est jamais un lien vers un refus.
- Les cases 2-3 passent par `ongletsDuMenu` (TCK-2481) sur les groupes de la DISPOSITION, privés de
  `tableau-de-bord`, `messagerie` et `chercher-bien` : la case inaccessible cède sa place à la
  destination suivante, jamais un cadenas — la même fonction que la barre de `/app`.
- « Loyer » n'existe dans aucun libellé de `/app` (`paiements` y vaut « Paiements » / « Finances ») :
  libellé court propre à la barre publique, `navigationPublique.onglets.loyer`.
- La « carte plein écran » de la liste n'a pas d'URL : c'est un état de `PropertiesDiscoveryPage`
  qui pose `.takussan-carte-plein-ecran` (`PropertyMap`). La barre s'en masque par CSS (`:has`),
  sans toucher à la page de liste.
- Aucun tunnel de visite n'a de route publique (la demande vit dans la fiche) ; les tunnels réels
  sont `/pay/[token]`, `/claim/[token]`, `/bookings` ; les pages par lien `/share/[token]`,
  `/search-alerts/*`, `/notifications/unsubscribe` ; `/publish` est hors du groupe public.

Relevés au navigateur du 2026-11-09 (chrome-devtools, `next dev`, contexte isolé, émulation mobile
facteur 3 sous `lg`, bureau facteur 1) :

- **AC1, cases par persona à 390 × 844** (comptes des seeds, mot de passe `password`) :
  | persona | compte | cases 2-3 relevées |
  |---|---|---|
  | anonyme | — | Favoris · Publier |
  | client | `customer@agency2.demo.takussan.sn` | Favoris · Visites |
  | locataire | `bineta-ndiaye-juei@example.com`, `aliou-sene-k3sd@example.com` | Loyer · Interventions |
  | bailleur | `owner4@dakarimmo.sn` | Mes biens · Demandes |
  | agent | `agent1@dakarimmo.sn` | Demandes · Visites (13) |
  | admin d'agence | `admin@dakarimmo.sn` | Demandes · Biens |
  | hôte | `admin@studio-aminata.sn` (agence `individual`) | Mes biens · Réservations |
  | prestataire | `provider2@dakarimmo.sn` | Interventions · Documents |

  Case 4 « Messages » (compteur dans le nom accessible : « Messages, 181 messages non lus »),
  case 5 « Moi » avec les initiales. **À 1024** : barre `display:none`, `padding-bottom` du corps
  0 px. Le profil de plateforme est hors du site public (ADR-0091 §2) : il garde la composition de
  `/app`, non relevé au navigateur.
- **AC2** — fiche (`/fr/properties/villa-avec-jardin-a-liberte-6-fjb0s5`, trois biens au
  comparateur) : ni barre, ni pastille, ni bouton Messagerie ; seule la barre d'actions de la fiche
  (sommet 771, 73 px). `/fr/pay/jeton-de-sonde` : ni barre, ni pastille, ni bouton, `padding-bottom`
  0. Carte plein écran de la liste : barre et pastille `display:none`, `padding-bottom` 0 — la
  pastille y restait visible avant la règle `body:has(.takussan-carte-plein-ecran)` de `globals.css`.
- **AC3** — accueil anonyme, trois biens au comparateur, 390 × 844 : seules couches basses la
  pastille (150 × 44, sommet 728) et la barre (390 × 60, sommet 784) — plus le bouton des devtools
  TanStack, propre à `next dev`. Surface couverte **9,1 %** (étendue verticale 13,7 %), contre
  **23 %** pour le dock seul au relevé de l'audit (`docs/qa/audit-ux-2026-11/01-site-public.md`).
- **AC4 — non vérifié au navigateur** : aucun compte des seeds ne porte deux profils. Le changement
  de barre au changement de profil actif, sans recharger, est éprouvé en test
  (`BarreDOngletsPublique.test.tsx`, bailleur → agent : « Mes biens · Demandes » → « Demandes ·
  Visites ») et le sélecteur d'espace de « Moi » (`aria-pressed`) dans `espace-public.test.tsx`.
- **AC5** — dernier focalisable (« Mentions légales », hors devtools) : bas à 628 px sous une barre
  au sommet 720 px à 360 × 780, sur `/fr` comme sur `/fr/properties` ; à 390 × 844, bas à 688 sous
  784 sur `/fr/account`. Aucun débordement horizontal (`scrollWidth − innerWidth = 0`).
- **Carte de rappel** (accueil connecté) : locataire en retard « Loyer en retard · 6 échéances ·
  6 343 953 F CFA · Payer » ; locataire sans retard « Visite le mar. 17 nov., 15:09 · Bureaux à
  Almadies · Voir » ; agent « 13 visites à confirmer · Voir » ; bailleur « 2 visites à confirmer » ;
  hôte « 16 visites à confirmer » ; admin d'agence et prestataire : aucune carte (rien en attente au relevé).
- **« Compte » emporte la page quittée** : la case pointe `/fr/account?depuis=<page>` et « Se
  connecter » y ramène (régression de TCK-568 sinon : le menu burger portait ce retour). Un `depuis`
  hors du site public est ignoré.
- **Garde zod des pages publiques** : la barre importait, par `useMenuDeLEspace` →
  `PreferencesDuMenu` → `preferences.ts`, le schéma zod des préférences — rouge sur les 21 pages
  publiques. Scindé : `lib/navigation/preferences-schema.ts` (le schéma) et
  `components/layout/contexte-preferences-du-menu.ts` (le contexte), sans changer le comportement
  de `/app`.
- **Pas de page d'aide** : « Moi » et « Compte » ne portent pas l'entrée « aide » de la maquette —
  aucune page d'aide publique n'existe.
- **Modules masqués** : le site public ne lit pas les modules masqués de l'agence (cf. plus haut).
- Tests retirés avec le menu burger : `Navbar.menu-modal.test.tsx`, `Navbar.menu-retour.test.tsx`
  (leur promesse — le retour après connexion — est reprise par `Navbar.connexion-retour` sur la
  case « Compte ») ; dix autres fichiers de `components/home/__tests__/` migrés vers la barre, le
  menu « Mon espace » ou l'écran « Compte ».
- Turbopack a servi un `globals.css` périmé après l'ajout de la règle de la pastille, jusqu'à un
  `touch` du fichier : relever une règle CSS neuve après rechargement forcé.
- Ablations (copie, retrait, rouge, restauration par `cp`, md5 identique) : exclusion des cases,
  règle de la fiche, case Compte `depuis`, filtre du `depuis` étranger, pastille sur la fiche,
  bouton Messagerie sur le site public, import zod, exclusion de la messagerie, priorité du rappel,
  action « Publier » de Moi, libellé « Loyer » et sa restriction au locataire.
- **Comptes de gardes relevés** : `sitemap-couverture` passe de 20 à 21 pages publiques (`/account`,
  `jamais`) ; le cliquet `ENCRES_INVERSES` de `surface-publique.contraste` de 270 à 276 (+14 dans
  `navigation-publique/`, −7 dans `Navbar`, −1 avec `LanguageSwitcher` sorti de la surface),
  mesuré fichier par fichier entre `HEAD` et l'arbre. En local, la page des maquettes (hors git)
  ajoute une 22ᵉ page : la CI en voit 21.
- `hooks/useEntreeSentinelle` (le retour arrière du menu burger, TCK-551) n'avait plus aucun lecteur
  : supprimé avec son test.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (navigation publique : barre, `/account`, pages sans barre, pastille, Messagerie, modules masqués non lus).
- **Corrections de revue (2026-11-09)** :
  - « Moi » tombait pour un admin d'agence ayant une file de modération (`nav.sidebar.counters.
    reviewModeration` n'existe pas) : un seul libellé de compteur, `useLibelleDuCompteur`, lu par la
    barre, « Moi » et « Mon espace ». Relevé : `admin@dakarimmo.sn` à 390, « Modération avis, 100 en
    attente », « Modération biens, 1 en attente », aucune frontière d'erreur.
  - Le filtre des entrées cadenassées de « Moi » / « Mon espace » est gardé par un test (admin dont
    l'agence n'est pas encore lue). Le cas de l'hôte `individual` y est aussi, mais il ne rougit pas
    à l'ablation : sa vue d'agence ne serait pas proposée de toute façon. Au navigateur, l'hôte n'a
    pas « Vue agence » dans « Moi ».
  - TCK-642 rétabli : la rangée « Crédits » de « Moi » porte le solde (« Crédits : 0 crédit » pour
    l'admin et l'hôte des seeds) et disparaît quand le solde est inconnu.
  - La route devient `/account`, comme les autres routes publiques. L'écran « Compte » vouvoie.
  - Le repère de l'en-tête est nommé « Navigation du site », à côté de « Navigation principale ».
