---
id: TCK-2482
title: Palette de commandes ⌘K / Ctrl K — destinations, action principale, files « À traiter », bascule de profil, pages récentes
status: done
phase: P2
family: front
estimate: M
wave: 82
created: 2026-11-05
updated: 2026-11-06
depends_on: [TCK-2479, TCK-2480, TCK-2481]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
  models: []
tags: [front, navigation, coque, adr-0089, clavier]
---

## Objectif utilisateur

Aller n'importe où dans son espace, ou changer d'espace, en tapant trois lettres — sans chercher
dans le menu.

## Contrat de données

- Le catalogue et la composition (TCK-2477, TCK-2478) : la palette liste toutes les destinations
  ACCESSIBLES, « Plus » et complément compris.
- Les pastilles « À traiter » (TCK-2479).
- `GET /api/me/profiles` et `PATCH /api/me/active-profile` (déjà utilisés par le `ProfileSwitcher`)
  pour « Passer à : Bailleur · Agence X ».
- Pages récentes : mémorisées sur l'appareil (`localStorage`, lecture et écriture sous `try/catch`).

## Direction UX / Artistique

- S'ouvre par ⌘K / Ctrl K et par un bouton de recherche de la barre haute.
- Résultats groupés : Actions (➊), À traiter, Aller à, Espaces, Récents.
- Recherche sur les libellés traduits ET sur des synonymes déclarés dans les messages (« loyer » →
  Paiements, « clients » → CRM).
- Clavier d'abord : flèches, Entrée, Échap ; aucune souris requise.

## Contraintes strictes (métier)

- **Aucune nouvelle dépendance**, et aucune dépendance Radix (`cmdk` est exclu) : `Dialog` de Base UI
  et motif ARIA combobox/listbox.
- N'affiche jamais une destination inaccessible ; ne cherche aucune donnée métier (biens, clients)
  dans cette version.
- Ne capture pas ⌘K quand le focus est dans un champ qui l'utilise déjà (à relever : éditeurs riches).
- Synonymes et libellés dans les trois langues (le wolof porte le français tel quel).

## Delta à produire

- [x] Palette, ouverture clavier et bouton.
- [x] Sources : catalogue composé, action principale, « À traiter », espaces, récents.
- [x] Synonymes i18n et recherche tolérante aux accents (`é` = `e`).
- [x] Tests : ouverture/fermeture et retour du focus ; filtrage ; synonymes ; bascule de profil ;
      inaccessibles absents ; rôles ARIA.

## Critères d'acceptation

- [x] AC1 — Ctrl K ouvre la palette, Échap la ferme et rend le focus à l'élément précédent.
- [x] AC2 — Chez un locataire, taper « loyer » propose Paiements en premier.
- [x] AC3 — Une destination sous « Plus » est trouvée ; une destination inaccessible au compte ne
      l'est jamais (ablation : lister le catalogue brut fait rougir le test).
- [x] AC4 — « Passer à : … » bascule le profil actif et recompose le menu.
- [x] AC5 — axe : aucune violation sur la palette ouverte.

## Hors périmètre

- Recherche dans les données (biens, clients, baux) — un ticket suivant, sur Meilisearch.
- Actions d'écriture autres que ➊ et la bascule de profil.

## Notes d'implémentation

Plan : [`docs/plans/2026-11-05-tck-2482-palette-de-commandes.md`](../../../plans/2026-11-05-tck-2482-palette-de-commandes.md).

### Notes de livraison

**Preuve des cases cochées.**
- Delta et AC1-AC5 : par les tests de la branche et leurs ablations (ci-dessous).
- AC1, AC2, AC4 et AC5 : aussi par les relevés au navigateur du 2026-11-06.
- AC3 : par les tests seuls. Le plan ne prévoyait pas de relevé au navigateur pour lui. Sa preuve est
  l'ablation T1-1 : le catalogue brut fait rougir 21 tests, sur les huit personas.
- Le ticket listait les groupes « Actions, À traiter, Aller à, Espaces, Récents ». L'arbitrage A2
  remonte « Récents » avant « Aller à », relevé au navigateur.

**Arbitrages.** Les dix-sept arbitrages du plan (A1-A17) ont été validés par la session le 2026-11-05,
par délégation du porteur. Quatre sont ajustés par la revue : A6, A8, A9 et A11.
- A1 — la combobox est écrite à la main, sur le patron de `GlobalSearch`, dans le `Dialog` de
  Base UI. Pas de `Combobox` de Base UI, pas de `cmdk`.
- A2 — les groupes ont un ordre fixe : Actions, À traiter, Récents, Aller à, Espaces. « Récents »
  disparaît dès qu'on tape. La frappe ne réordonne qu'à l'intérieur d'un groupe. Aucun tri par usage.
- A3 — la pertinence se calcule par mot (4, 3, 2, 1), puis on fait la somme. Une option n'est
  retenue que si chaque mot correspond. À égalité, l'ordre du menu décide.
- A4 — chez le locataire, « loyer » rend d'abord l'action « Payer mon loyer », puis « Paiements » en
  tête de « Aller à ».
- A5 — la source est le menu rendu par `useMenuDeLEspace` (épingles, « Plus », « Aussi … »), sans
  les entrées cadenassées. « Démarrer » et le pied de barre n'y sont pas.
- A6 — le raccourci est ignoré sur un événement `defaultPrevented`, dans un `contenteditable`, sous un
  autre dialogue ouvert et en plein écran. Il fait `preventDefault`. Revue M2 : **⌘ K seul sur
  Apple, Ctrl K seul ailleurs**.
- A7 — la coque passe en `finalFocus` l'élément qui avait le focus. Revue I5 : **fermée par un
  choix, la palette ne rend pas le focus**.
- A8 — les pages récentes : huit chemins par compte, dans `localStorage`, résolus sur le menu du
  jour, cinq au plus, sans la page courante. Revue I3 : **le dédoublonnage par entrée du menu se
  fait à l'écriture**.
- A9 — les synonymes vivent dans `nav.palette.synonymes.<id>`, gardés par un test. Revue I4 :
  **« profil » n'est plus un synonyme d'espace**.
- A10 — le repli des accents est `replierPourRecherche`, importé tel quel.
- A11 — le bouton est le premier contrôle du groupe de droite, à toutes les largeurs. Sous `lg`,
  l'icône seule. Le nom accessible commence par le texte visible. Revue M2 : **`aria-keyshortcuts`
  vaut celui de la plateforme**.
- A12 — « Passer à : » suivi des mots du sélecteur (`profileShortLabel`). Le choix suit la chaîne
  `useSwitchActiveProfile().mutate`.
- A13 — la palette lit les mêmes compteurs que la barre (`useCompteursDuMenu`, `actif: ouverte`).
  Palette fermée, aucun sondage.
- A14 — la palette s'ancre en haut. La liste défile seule (`max-h-[min(60dvh,28rem)]`). La croix
  reste, et le champ porte `pr-8`.
- A15 — la politique de confidentialité nomme les pages récentes. La version passe au 2026-11-06,
  sur les trois fichiers. Revue I1 : **la même version nomme aussi les coordonnées retenues, le
  cookie `menu_icones` et la source d'arrivée**.
- A16 — `depends_on: [TCK-2479, TCK-2480, TCK-2481]`. TCK-2483 passe après.
- A17 — un seul objet `contexteDuMenu`, transmis intact. Depuis I3, `AppShell` le passe à la
  palette ET à `RetenirLaPageRecente` : TCK-2483 y ajoute `modulesMasques` à un seul endroit, en plus
  de la barre.

**Écarts au plan.**
- **Tâche 1** (`1bef38160`) — `GroupeDuMenuRendu` est un `Omit<GroupeCompose, 'entrees'> & {…}`, pas
  une intersection. C'est la même raison que `GroupeRendu` : sur une intersection, `entrees` restait
  lu `EntreeComposee`.
- **Tâche 2** (`baae6cfd9`) — aucun écart.
- **Tâche 5** (`ce5f700cc`) :
  - la même ligne nomme aussi les recherches récentes de TCK-2475, que la politique omettait
    (décision de la session sur A15) ;
  - un cas de test vérifie que la phrase est dans la ligne du stockage local. Sans lui, une phrase
    posée ailleurs dans le texte passait.
- **Tâche 3** (`0ef8bf958`) :
  - `actif: ouverte` sur les compteurs, à la demande de la session : le contenu survit à la
    fermeture le temps de l'animation ;
  - Début et Fin ont été ajoutés ;
  - une option a `tabIndex={-1}` et se choisit au `onMouseDown`, sur le patron de
    `SearchAutocomplete`. Le code du plan faisait rougir deux règles `jsx-a11y`, et aucune
    suppression n'a été ajoutée ;
  - le focus initial est attendu par `waitFor`, parce que Base UI pose `initialFocus` après le
    montage.
- **Tâche 4** (`7d200ed08`) :
  - deux ablations survivaient aux tests du plan, d'où deux assertions neuves : le raccourci n'est
    PAS annulé en plein écran (T4-7), et le cas « touché au doigt », où le bouton reçoit le focus au
    retour (T4-10) ;
  - le contexte du menu était un littéral, remplacé depuis par la constante d'I3.
- **Gardes** :
  - `e3b4123fb` — le bouton est peint par `--background`, plus par `white`. Le cliquet de
    `check-super-admin-tokens` reste à 14. Le `kbd` porte son encre explicitement, sinon
    `check-heritage-encre` mesurait 1,00:1 ;
  - `c967beeff` — l'état vide passe par `<EmptyState>` (`check-feedback-states`).

**Revue adverse** (0 bloquant, 5 importants, 4 mineurs). Huit défauts sont corrigés, un commit par
défaut ; M4 est laissé en suite.
- I1 (`68a9df216`) — la § 8 de la politique ne nommait pas tout ce que l'appareil garde. Elle
  nomme désormais les coordonnées retenues (`takussan.coordonnees`), le cookie `menu_icones` et la
  source d'arrivée (`takussan.arrivee`), en fr et en en. La version n'est pas avancée une seconde
  fois. Quatre cas neufs dans `textes.test.ts`.
- I2 (`87a85952e`) — l'option active passe en `bg-accent text-accent-foreground`, au lieu de
  `bg-muted` (1,18:1). L'icône et la précision prennent l'encre du fond : laissée en muted, la
  précision tombait à 1,04:1. Le test mesure le contraste sur les classes rendues, en clair et en
  sombre.
- I3 (`626715635`) — « Récents » se réduisait à une seule entrée après huit fiches d'une même
  section. Le dédoublonnage par entrée du menu se fait désormais à l'écriture, par
  `resolveurDesRecents`, la même résolution que l'affichage. L'écriture est faite par le composant
  `RetenirLaPageRecente`, monté dans `PreferencesDuMenuProvider`.
- I4 (`701c15e30`) — « profil » proposait une bascule d'espace, qu'Entrée exécutait. Il est retiré
  de `synonymesEspace` dans les trois langues, et un test le garde.
- I5 (`e123e7656`) — choisir une page rendait le focus au champ de recherche de biens, qui rouvrait
  son panneau. Un drapeau « fermée par un choix », lu par `finalFocus`, rend `false`. Échap et le
  voile rendent toujours le focus.
- M1 (`67781cd5a`) — l'option active est retenue par sa clé, plus par son rang : une pastille qui
  arrive ne déplace plus la cible d'Entrée.
- M2 (`a585c1c80`) — ⌘ K seul sur Apple, Ctrl K seul ailleurs : sous macOS, Ctrl K reste le « couper
  jusqu'en fin de ligne » de tout champ. `aria-keyshortcuts` suit la plateforme.
- M3 (`509784460`) — une bascule déjà en cours, lancée par exemple depuis le sélecteur, est vue par
  la palette : `useIsMutating` sur `CLE_DE_BASCULE_D_ESPACE` (`lib/cache-d-espace.ts`). Les
  « Passer à » sont alors désactivés, sans bascule concurrente et sans fermeture muette.
- M4 — **non corrigé**. Voir « Suites » (b) et le relevé ci-dessous.

**Tests.**
- Neufs :
  - `palette.test.ts` (AC3 sur huit personas, cadenas, récents, résolveur) ;
  - `pages-recentes.test.ts` ;
  - `palette-synonymes.test.ts` (garde, AC2, « profil ») ;
  - `PaletteDeCommandes.test.tsx` (AC2, AC3, AC4, AC5 en jsdom, ARIA, clavier, contraste, M1,
    M3) ;
  - `usePaletteDeCommandes.test.ts` ;
  - `AppShell.palette.test.tsx` (AC1, plein écran, A7, I3 de bout en bout, I5, M2) ;
  - `useSwitchActiveProfile.cle-de-bascule.test.tsx`.
- Repris : `AppTopbar.a11y.test.tsx` (anneau et fonds du bouton) et `textes.test.ts`.
- Le dernier passage ciblé (layout, navigation, legal, `chemin-api.garde`, clé de bascule) compte
  56 fichiers et 1208 tests verts, charge 2,84 sur 8 cœurs.
- Les suites entières sont jouées par la CI.

**Ablations.** Toutes les mutations ont rougi, et chaque fichier a été restauré (`cmp`, puis
`git diff` vide). Le détail est dans les rapports de tâche de la session.

| Lot | Mutations | Exemples de rouges |
|---|---|---|
| Tâche 1 | 6 | T1-1 catalogue brut : 21 rouges ; cadenas ; page courante ; hors `/app` ; synonymes ; accents |
| Tâche 2 | 1 | « loyer » retiré : AC2 |
| Tâche 3 | 6 | bascule retirée, espace actif gardé, Entrée sur la 1re, `role=option`, `actif: false`, Début/Fin |
| Tâche 4 | 12 | `finalFocus`, Alt, autre dialogue, `defaultPrevented`, mémoire, plein écran ×2, `preventDefault`, `contenteditable`, `depuis`, anneau, `aria-keyshortcuts` |
| Gardes | 3 | jetons `white` : 20 > 14 ; `<p>` ad hoc ; fond `bg-white/10` |
| Tâche 5 | 6 | pages fr, pages en, recherches fr, recherches en, phrase hors ligne, date |
| I1 | 1 | § 8 de HEAD : 4 rouges |
| I2 | 2 | `bg-muted` : 1,18 / 1,21 ; encre muted sur l'accent : 1,04 / 1,56 |
| I3 | 3 | sans dédoublonnage ; écrivain sans résolveur ; cadenas non filtré |
| I4 | 1 | messages de HEAD : 4 rouges |
| I5 | 2 | composant de HEAD ; drapeau non consommé |
| M1 | 1 | rang au lieu de clé : 2 rouges |
| M2 | 2 | « ⌘ ou Ctrl » partout : 4 rouges ; `aria-keyshortcuts` fixe : 2 rouges |
| M3 | 2 | clé retirée du crochet ; palette aveugle |

Piège relevé sur M3 : avant que la constante existe, `useIsMutating({ mutationKey: undefined })`
comptait TOUTES les mutations, et le test du crochet passait à tort. Le vrai rouge n'est apparu
qu'une fois la constante posée seule.

### Relevés au navigateur — 2026-11-06, 09:40-09:54

**Banc.**
- Lot figé `509784460`. L'empreinte de version est identique avant et après chaque passage
  (`diff:da39a3ee5e6b`).
- `next dev` :3000, API :8002. Chrome 156 headless piloté en CDP direct, un contexte isolé par
  compte. Charge entre 1,3 et 2,3 sur 8 cœurs.
- L'UA de Chrome headless sur macOS contient « Macintosh » : le banc est « Apple » par défaut.
  L'UA Windows est posé par `Emulation.setUserAgentOverride`.
- Aucun compte de la base n'a deux ESPACES. 306 et 307 ont deux profils, mais dans une agence
  `individual`, donc un seul espace. Un compte jetable agent + bailleur a été créé dans l'agence 1
  (standard), comme au banc de TCK-2480.
- Nettoyage vérifié par l'empreinte max(id) de toutes les tables, revenue à l'identique : compte,
  jetons, `welcome_views`, activités et un job Scout supprimés. Aucun `/publish` ouvert.

**Étape 1 — largeurs.** `/app` à 1366, 1024, 768, 390, 360 et 320 px, sur trois comptes.
- `scrollWidth − innerWidth = 0` partout. Le `header` ne déborde pas.
- Le bouton est visible partout : 36 × 36 sous `lg`, 120,6 × 32,4 dès 1024 avec « Aller à… » et le
  raccourci.
- Le témoin `mobile:true` à 360 rend innerWidth = scrollWidth = 360.
- 360 px, compte à deux espaces : le groupe de droite occupe 89,9-344 px avec 5 contrôles, sans texte
  tronqué. Palette 36 · sélecteur 48 · langue 54,1 · cloche 36 · menu 48.
- **320 px, compte à deux espaces : la cloche rétrécit à 23,9 × 36 px.** Le groupe est `shrink`, et
  la cloche cède. Les comptes à carte statique gardent 36 px.

**Étape 2 — AC1, par plateforme.** admin d'agence, 1366, touches réelles (`Input.dispatchKeyEvent`).
- UA Windows :
  - Ctrl K ouvre, le focus va au combobox (`defaultPrevented`) ;
  - ⌘ K n'ouvre pas ;
  - le bouton porte `aria-keyshortcuts="Control+K"` et « Ctrl K ».
- UA Mac :
  - ⌘ K ouvre ;
  - Ctrl K n'ouvre pas, que ce soit sur `body` ou dans le champ de recherche de biens. Dans ce champ,
    il n'est **pas annulé** (`defaultPrevented: false`) ;
  - ⌘ K ouvre depuis ce même champ ;
  - le bouton porte `Meta+K` et « ⌘ K ».
- Échap rend le focus à l'élément d'avant, `<button … data-slot="dropdown-menu-trigger"
  aria-label="Langue">`. Ouverte par un clic réel sur le bouton, la palette rend le focus au bouton
  (`data-slot="ouvrir-palette"`).
- Palette ouverte, le raccourci la referme.
- Console : 0 erreur d'hydratation (le serveur rend « Ctrl K », le client « ⌘ K »). Seules restent les
  vignettes `_next/image` 403, déjà connues.

**Étape 3 — AC2.** Chez le locataire, « loyer » rend `Actions › Payer mon loyer` (active), puis
`Aller à › Paiements`, première et seule de son groupe. Entrée mène à `/app/payments`.

**I5.**
- Le focus est dans la recherche de biens, et son panneau est ouvert. Échap le ferme.
- ⌘ K, « paiements », Entrée mènent à `/app/payments`.
- À +0,3 s et à +2,8 s : `activeElement` = `BODY`, pas le champ ; `aria-expanded="false"` ; aucune
  listbox visible dans la barre haute.

**Étape 4 — AC4.** Compte à deux espaces, en Propriétaire · Dakar Immo.
- Le champ vide propose `Passer à : Agent · Dakar Immo`. On tape « passer », Entrée :
  `PATCH /api/me/active-profile` `{"profile_id":"agent:25"}` rend 200. Le toast dit « Espace basculé
  sur Dakar Immo ».
- La barre est recomposée :
  - avant : `tete(2) mon-patrimoine(4) activite(5) plus(8) aussi(2)` et « Démarrer » ;
  - après : `tete(3) prospection(4) catalogue(2) gestion(5) plus(6) aussi(1)`, sans « Démarrer » ;
  - l'en-tête passe de « Bailleur » à « Agent ». L'action ➊ reste « Publier un bien ».
- Réouverte : `Passer à : Propriétaire · Dakar Immo` est l'espace quitté, et `Finances` porte la
  précision « Aussi bailleur ».
- Le retour par la palette (`owner:52`, 200) rend une barre identique au départ.

**Étape 5 — AC5 et I2.** axe-core 4.13.0 injecté, `axe.run` sur la palette.
- Résultats d'axe :
  - **0 violation**, champ vide et « zzzz », en clair et en sombre forcé ;
  - les `incomplete` `color-contrast` (6 à 390, 10 à 1366) sont tous des options HORS de la zone
    visible de la liste qui défile (`horsVue` vérifié pour chacune).
- Contraste réel de l'option active, couleurs résolues par canevas sur la surface calculée :
  - clair : fond #5d6e4f sur #ffffff à **5,51:1** ; libellé, icône et précision « Aussi agent » à
    5,25:1 ;
  - sombre : fond #7d8d6e sur #2a2018 à **4,48:1** ; encre à 4,93:1.
- Le thème sombre n'est atteignable par aucun réglage : aucun code de `src/` ne pose `.dark`. Il a
  été mesuré en posant la classe à la main.

**Étape 6 — coût.** admin d'agence, trois fenêtres de 30 s.
- Palette fermée : 1 GET (`conversations`).
- Palette ouverte : 6 GET — `conversations` ×2, et les quatre compteurs de files ×1 : visites,
  demandes, avis, modération.
- Refermée : 4 GET.
- Aucune clé neuve, et aucune clé lue plus de deux fois. Il y a pourtant un surcoût borné : les quatre
  compteurs sont relus à l'ouverture (un observateur neuf sur des données périmées), et `conversations`
  est lu une fois de plus par cadence (la minuterie propre à l'observateur). C'est ce que la revue
  avait prévu. Ce n'est pas un doublement.

**Étape 7 — 390 px.** Ouverte par le bouton.
- La palette tient : débord 0, dialogue 16-374 px, aucun libellé tronqué.
- La croix ne touche pas le champ : 4 px d'écart, intersection nulle.
- La liste défile seule : à la molette, son `scrollTop` passe de 0 à 400 et le document reste à 0.
  Sur le voile, le document reste à 0 (`body` en `overflow:hidden`).

**I3.**
- Parcours de l'admin d'agence : `/app/payments`, `/app/messages`, puis 6 fiches de biens.
- Stocké : `["/app/properties/11","/app/messages","/app/payments"]`, une seule fiche.
- Sur `/app`, Récents vaut « Biens », « Messagerie ». `/app/payments` n'est pas au menu de l'admin
  (il a `/app/agency/finances`) et ne s'affiche donc pas (A8).
- Depuis une fiche, la section Biens est exclue.

**M4 (constat).** Le panneau de messagerie flottante est ouvert, puis ⌘ K : la palette s'ouvre (le
panneau n'a pas `data-open`).
- **À 1024, le panneau recouvre 121,6 × 274 px de la palette, dont 110,8 × 259,6 de la liste.**
  `elementFromPoint` désigne le panneau (z 1000 contre 50), net au-dessus du voile. Le tiers droit
  de sept options passe dessous.
- À 1366, aucun recouvrement : 49,4 px d'écart.

### Suites

- (a) **`GlobalSearch.tsx` surligne son option active en `bg-muted`**, à 1,18:1 sur `--popover` :
  c'est le même défaut qu'I2, dans l'autre coque (console). La palette a recopié ce patron avant la
  revue. Le correctif est celui d'I2 : `bg-accent` et son encre. À écrire en ticket.
- (b) **M4 — le panneau de messagerie flottante (`CorpsDuWidget.tsx`, `z-[1000]` panneau ouvert)
  passe au-dessus de tout `Dialog` (`z-50`).** Mesuré à 1024 : 121,6 × 274 px de la palette
  recouverts. Rien à 1366. La garde « autre dialogue » ne le voit pas (`role="dialog"` sans
  `data-open`). Deux pistes :
  - fermer le panneau quand un dialogue s'ouvre ;
  - abaisser son z-index sous celui des dialogues tant qu'aucune carte Leaflet ne l'exige.

  À arbitrer en ticket.
- (c) **La politique de confidentialité passe au 2026-11-06** (A15, avec I1 dans la même version) :
  une connexion par téléphone et une prise du Radar redemandent l'acceptation des CGU
  (`PhoneLoginService.php:130`, `RadarClaims.php:202`). Accepté par la session : aucune production
  n'est servie. À rappeler à la mise en production (TCK-517).
- Relevé sans ticket : à 320 px, pour un compte à deux espaces, la cloche « Notifications » rétrécit à
  23,9 × 36 px. Elle reste visible, sans débord, sous la cible de 24 px de 0,1 px. À reprendre si la
  barre haute gagne un contrôle.
  **Arbitrage de la session (2026-11-06)** : accepté. WCAG 2.5.8 admet une cible sous 24 px par son
  exception d'espacement : avec 8 px d'écart de part et d'autre, un cercle de 24 px centré sur la
  cloche ne touche aucune autre cible. Un `shrink-0` sur la cloche déplacerait le rétrécissement vers
  le sélecteur ou la langue, qui portent du texte.
- Coût à l'ouverture (relevé, étape 6) : la palette ne double aucune lecture, mais les quatre
  compteurs de files sont relus une fois à l'ouverture et `conversations` une fois de plus par
  cadence tant qu'elle est ouverte (minuterie propre à chaque observateur, prévu par la revue).
  Accepté par la session : quelques secondes d'ouverture, mêmes clés de cache que la barre.
