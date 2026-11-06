---
id: TCK-2481
title: Barre d'onglets mobile par persona — quatre destinations et « Menu », qui remplace le burger sous md
status: doing
phase: P2
family: front
estimate: M
wave: 82
created: 2026-11-05
updated: 2026-11-06
depends_on: [TCK-2478, TCK-2479, TCK-2480]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, adr-0089, mobile]
---

## Objectif utilisateur

Au téléphone, les quatre destinations du quotidien de chaque profil sont sous le pouce, avec leurs
compteurs, et le reste du menu est à un geste.

## Contrat de données

Aucun endpoint neuf : la disposition de chaque persona porte ses quatre `onglets` (ADR-0089 §3),
et les compteurs sont ceux de la barre.

## Direction UX / Artistique

- Barre fixe en bas, sous `md` uniquement : quatre onglets choisis par persona, puis « Menu », qui
  ouvre le tiroir existant.
- Onglets proposés (à ajuster dans les notes si une destination n'est pas accessible au persona) :
  client : Accueil · Favoris · Visites · Messagerie ; locataire : Accueil · Paiements ·
  Interventions · Messagerie ; bailleur : Accueil · Mes biens · Demandes · Messagerie ; agent :
  Accueil · Demandes · Visites · Messagerie ; admin-agence et plateforme : Accueil · Demandes · Biens ·
  Messagerie ; hôte : Accueil · Mes biens · Réservations · Messagerie ; prestataire : Accueil ·
  Interventions · Messagerie · Documents.
- Les compteurs en pastille sur l'onglet ; l'onglet actif lisible sans la couleur seule.
- **Sous `md`, le burger de la barre haute disparaît** : « Menu » est la seule porte du tiroir.
  C'est le changement de chrome le plus visible du projet, validé par le porteur le 2026-11-05.

## Contraintes strictes (métier)

- Respecte `env(safe-area-inset-bottom)` ; le `<main>` réserve la hauteur de la barre (rien de la
  page n'est caché dessous, dernier bouton compris — cf. TCK-503).
- Absente en plein écran (`estPleinEcran`, TCK-631).
- Un onglet inaccessible au persona est remplacé par la destination suivante de sa disposition,
  jamais rendu cadenassé.
- Le lien d'évitement (TCK-905) et l'ordre de tabulation restent justes.

## Delta à produire

- [x] Champ `onglets` des dispositions, et sa garde (identifiants existants, au plus quatre).
- [x] Barre d'onglets ; « Menu » ouvre le tiroir ; retrait du burger sous `md`.
- [x] Réserve de hauteur du `<main>` et zone sûre. *(La réserve est mesurée. La zone sûre est écrite
      — `pb-[env(safe-area-inset-bottom)]`, gardée par `CoqueHauteur.test.tsx` — mais inerte tant que
      `viewport-fit=cover` n'est pas posé : arbitrage 2, report du porteur. Non mesurée sur iPhone réel.)*
- [x] Tests : onglets par persona ; remplacement d'un onglet inaccessible ; plein écran ; a11y
      (`nav` nommée, `aria-current`).

## Critères d'acceptation

- [x] AC1 — À 390 px, chaque persona voit ses quatre onglets et « Menu » ; à 768 px, ni barre ni
      réserve de hauteur. *(Sept personas mesurés ; plateforme, derrière la 2FA, prouvé par les
      tests — sa disposition est celle de l'admin d'agence.)*
- [x] AC2 — Mesure au navigateur à 360 et 390 px : le dernier élément focalisable de `/app/profile`
      et la pagination de `/app/properties` sont atteignables au-dessus de la barre.
- [x] AC3 — Sous `md`, aucun burger ; « Menu » ouvre le tiroir et rend le focus à l'onglet à la
      fermeture. *(Par Échap et par le voile, au clavier comme au doigt. Une fermeture par un LIEN du
      tiroir ne rend pas le focus à « Menu » : exception voulue, revue M1.)*
- [x] AC4 — Sur `/publish` (plein écran), pas de barre.

## Hors périmètre

- Choix des onglets par l'utilisateur.
- Toute modification du tiroir lui-même (il rend la barre latérale de TCK-2478).

## Notes d'implémentation

Plan : [`docs/plans/2026-11-05-tck-2481-barre-d-onglets-mobile.md`](../../../plans/2026-11-05-tck-2481-barre-d-onglets-mobile.md).

### Notes de livraison

**Arbitrages.** Les douze arbitrages du plan (A1-A12) ont été validés par la session le 2026-11-05,
par délégation du porteur, et retenus. Un seul est ajusté, par la revue : A10. Le tiroir rend le focus
à « Menu » quand on le ferme par Échap ou par le voile. Fermé par un lien, il ne le rend pas (M1
ci-dessous).

**Relevés et suppositions.**
- R1-R7 ont servi tels quels. TCK-2479 et TCK-2480 étaient sur `dev` : la branche « 2480 sur dev » de
  « Ce qu'on suppose » s'applique.
- R7 : la mesure dit « pas de doublement des requêtes », et non « à mesurer ». Voir plus bas.

**Écarts au plan.**
- **Tâche 1** (`20925d24f`) :
  - la réserve est un seul `Map` par identifiant, où le premier vu gagne. Elle sert à la fois de
    recherche et de réserve, et ne contient aucun doublon. Le `flatMap` + `Map` du plan pouvait
    remplir deux cases avec une entrée présente dans « Épinglés » ET dans son groupe (ablation 5) ;
  - deux cas TCK-2480 sont ajoutés : « Visites » épinglée reste le 3ᵉ onglet, et le dédoublonnage.
- **Tâche 2** (`1c0457d8f`, `4c1eeb7e4`) :
  - le persona vient de `personaDeLaCoque` (TCK-2480), pas de `resoudrePersona` ;
  - `useMenuDeLEspace` rend aussi `ctx`, que « Démarrer » relit (`cheminOuvert`) ;
  - `AppSidebar` garde son propre `usePreferencesDuMenu()` pour le rendu (icônes, épingles, replis) ;
  - le compteur des avis est déplacé tel que mergé (`COMPTE_DES_AVIS_EN_ATTENTE`), pas sous la forme
    de l'extrait du plan ;
  - `GroupeRendu` est un `Omit<…> &`, parce qu'avec l'intersection `locked` était invisible pour tsc ;
  - `groupesDeLaDisposition` est `composerMenu(ctx, persona)` SANS préférences, sous le même cadenas ;
  - test neuf `useMenuDeLEspace.test.tsx`, hors de la carte du plan.
- **Tâche 3** (`29061cea7`) :
  - les onglets se lisent sur `groupesDeLaDisposition`, pas sur `groupes` ;
  - le cas « épingle × remplaçant » prend `demandes` comme onglet déclaré que rien ne rend chez le
    client. `paiements` ne convenait pas : le catalogue l'ajoute sous « Plus » ;
  - les liens publics passent par `cheminLocalise`, comme dans `AppSidebar` ;
  - tests ajoutés hors plan : « 99+ », « sous md la barre sonde », « un lien du tiroir le referme »,
    `data-barre-onglets`, bouton flottant hors de `/app`, cinq `listitem`, `font-semibold` de
    l'onglet actif.
- **Tâche 4** (`5908144ca`) :
  - `MessagesPage` est écrit sans soulignés (`100dvh-5rem-var(…)`). Le CSS émis est le même, mesuré
    par postcss. La forme soulignée aurait fait rougir le test existant ;
  - le dock est gardé par un test ajouté à `CoqueHauteur.test.tsx` : une seule règle, plage
    `(width < 48rem)`.
- **Garde** (`45255d14d`) : le cliquet de `scripts/check-super-admin-tokens.mjs` (jetons de `/app`)
  descend à 14, parce que le burger a quitté la barre haute.
- **Test** (`573825a5e`) : la relecture ratée des files de modération de
  `AppSidebar.section-agence.test.tsx` s'attend par `waitFor`. Rouge intermittent sous charge.

**Tests.**
- Neufs :
  - `onglets.test.ts` (garde, table des huit personas, remplacement, Aussi, cadenas, épingles) ;
  - `useCompteursDuMenu.test.tsx`, `useMenuDeLEspace.test.tsx` ;
  - `BarreDOnglets.test.tsx` (AC1, a11y, compteurs, sondage sous md, région live) ;
  - `AppShell.barre-d-onglets.test.tsx` (AC3, AC4, ordre, focus) ;
  - `plein-ecran.test.ts` ;
  - `PipelineKanban.alerte-sur-la-barre.tck-2481.test.tsx`.
- Repris, du burger à « Menu » : `AppShell.menu-et-credits`, `AppSidebar.section-agence`,
  `AppTopbar.a11y`, `AppTopbar.responsive`, `portees-sombres`, `AppShell.accueils-vus…tck-1766`,
  `AppShell.bienvenue`, `ChatWidget`, `CoqueHauteur`, `MessagesPage`, `reserve.test.ts`,
  `mise-en-page-mobile.tck-644`.

**Ablations.** Toutes les mutations ont rougi, et chaque fichier a été restauré (`cmp`, puis
`git diff` vide) :

| Lot | Mutations |
|---|---|
| Tâche 1 | 8 |
| Tâche 2 | 6 |
| Tâche 3 | 12 |
| Tâche 4 | 9 |
| Correctif I1 | 5 |
| Correctif M1 | 4 |
| Correctif M2 | 1 |
| Correctif M3 | 3 |
| Correctif M5 | 2 |

Le détail est dans les rapports de tâche de la session.

**Revue adverse** (0 bloquant, 1 important, 5 mineurs). Cinq défauts sont corrigés, un commit par
défaut :
- I1 (`1ccd2215e`) — sous `md`, sur `/app`, plus aucune région live n'annonçait les nouveaux non-lus.
  La barre porte désormais `AnnonceDesNonLus`, une région `aria-live="polite"` avec le texte
  `messaging.widget.unreadInline` (aucune clé neuve) :
  - vide au montage ;
  - la ligne de base se pose à la première lecture RÉUSSIE (observateur passif, aucune requête de
    plus) ;
  - seule une hausse s'annonce ;
  - montée dans la barre `md:hidden`, elle n'est jamais en doublon avec le badge du lanceur de
    bureau.
- M1 (`cdda43f7b`) — fermé par un lien, le tiroir ne rend plus le focus à « Menu », qui est le dernier
  focalisable du document. Échap et le voile le rendent toujours. `finalFocus` de Base UI 1.7 ne
  reçoit que la modalité, pas la raison de la fermeture : une marque est posée par `onNavigate`.
- M2 (`bf0e50904`) — `RESERVE_SOUS_LANCEUR = 'md:pb-16'` : les 56 px vides sous « Mes biens » ont
  disparu sous md.
- M3 (`f5fe8b475`) — l'alerte d'erreur du pipeline lit `--floating-dock-base` sous md (elle passe
  au-dessus de la barre entre 640 et 767 px) et `md:bottom-4` dès md.
- M5 (`8fa4ad9b0`) — le seuil JS de la barre est `REQUETE_DE_LA_BARRE = '(width < 48rem)'`, la même
  chaîne que la règle du dock, gardée égale par un test. Avec une police par défaut au-dessus de
  16 px, une barre affichée sonde donc ses compteurs.
- **M4 — accepté sans code.** `porteLaBarreDOnglets(pathname)` décide du bouton flottant d'après le
  CHEMIN. Quand une page de `/app` lève une erreur, `src/app/(dashboard)/error.tsx` remplace le
  segment, `AppShell` et sa barre compris, et le bouton flottant reste retiré. C'est sans gravité :
  l'écran d'erreur porte ses propres actions de reprise (« Réessayer »), et la messagerie redevient
  accessible dès la reprise.

**Suite proposée (ticket à écrire, hors de ce lot).** `CorpsDuWidget` choisit encore le créneau de
dock du lanceur par `useMatchesMaxWidth(MD_BREAKPOINT_PX - 1)`, un seuil en px. C'est le même
décrochage que M5, antérieur à la branche. Il faut le porter en `rem`, comme `REQUETE_DE_LA_BARRE`.
Sur `/app`, il ne rend plus de bouton mobile : le défaut ne touche que les pages hors de `/app`.

**Pas de ticket de suite pour les compteurs** (arbitrage 8). La cadence réelle à 390 px est celle du
bureau. C'est mesuré au réseau ci-dessous, et la revue l'avait montré sous jsdom.

**Notes latentes et non vérifié.**
- `abreger` (`onglets.ts`) réécrit `labelKey` en `onglets.*` sans retirer `labelSpace`. Une
  destination `nav.admin` qui recevrait un jour un libellé court lirait une clé absente. Aucune ne le
  fait aujourd'hui.
- Non vérifié :
  - les annonces réelles par VoiceOver et TalkBack ;
  - la zone sûre sur un iPhone réel ;
  - l'alerte du pipeline déclenchée pour de vrai : aucune colonne du jeu de données ne passe 50
    cartes, la mesure est faite sur un témoin aux mêmes classes.

### Mesure au navigateur (2026-11-06, lot figé `f5fe8b475`)

**Banc**
- Code : HEAD `f5fe8b475`. Entre 03:43 et 04:03, un autre agent a commité un test seul (`573825a5e`).
  Le code EXÉCUTÉ (`takussan-web/src` et `takussan-api/app` hors tests) est resté identique à
  `f5fe8b475` pendant toute la mesure. Chaque passage relève l'empreinte avant et après ; le seul
  passage qui a vu l'arbre bouger a été jeté et rejoué.
- Serveurs : `next dev` sur :3000 et l'API sur :8002, déjà lancés.
- Navigateur : Chrome 156 headless, CDP direct (Node 24). Un contexte isolé par compte, session par
  jeton Sanctum.
- Charge entre 1,3 et 4,2 sur 8 cœurs.
- Comptes : client 86, locataire 104, bailleur 7, agent 3, admin-agence 2, prestataire 17, hôte 62.
  Plateforme n'est pas mesurable (2FA).
- Tours d'accueil passés par des lignes `welcome_views` posées en base, puis supprimées.
- Tout ce qui a été créé est supprimé. L'empreinte max(id) de toutes les tables est revenue à celle
  du départ.
- Le détail, les scripts et les captures sont dans le rapport de la session
  (`rapport-2481-mesure.md`, `mesures-2481/`).

**AC1 — `/app`, 390×844 puis 360 et 768**

| Persona | Onglets à 390 | Pastilles |
|---|---|---|
| client | Accueil · Favoris · Visites · Messagerie | — |
| locataire | Accueil · Paiements · Interventions · Messagerie | — |
| bailleur | Accueil · Mes biens · Demandes · Messagerie | Messagerie 99+ (113) |
| agent | Accueil · Demandes · Visites · Messagerie | Visites 17, Messagerie 99+ (181) |
| admin-agence | Accueil · Demandes · Biens · Messagerie | Messagerie 64 |
| hôte | Accueil · Mes biens · Réservations · Messagerie | Messagerie 54 |
| prestataire | Accueil · Interventions · Messagerie · Documents | Messagerie 99+ (114) |

- **7/7 conformes** à la table de la tâche 3, avec « Menu ». La `<nav>` s'appelle « Accès rapide ».
  « Accueil » porte `aria-current="page"`.
- Barre : 56 px, son bas = `innerHeight` (844). Cases de 78 × 55 px à 390 et 72 × 55 à 360, plus 1 px
  de bordure.
- Le `<main>` a `padding-bottom: 0`, et son bas (788) = le haut de la barre.
- Débordement 0 à 360, 390 et 768.
- Témoin `mobile:true` : innerWidth 390, scrollWidth 390.
- 0 burger.
- **À 768 :** la barre est en `display:none` (hauteur 0), et le bas du `<main>` = `innerHeight`
  (1024).
- Libellés coupés à 360 seulement : « Interventions » et « Réservations » (A7). Leur nom accessible
  reste entier.

**AC2 — défilement du `<main>` jusqu'en bas, puis clavier**
- La pagination existe : « Page 1 sur 11 · 211 résultats » (agent, admin).

| Compte, page | 360 : bas cible / haut barre | 390 : bas cible / haut barre |
|---|---|---|
| client, `/app/profile` (« Voir mes avis ») | 652 / 724 | 716 / 788 |
| agent, `/app/profile` (« Gérer les préférences ») | 631,7 / 724 | 705,7 / 788 |
| agent, pagination de `/app/properties` | 700 / 724 | 764 / 788 |
| admin-agence, pagination de `/app/properties` | 700 / 724 | 764 / 788 |

- **8/8** : la cible est au-dessus de la barre, et `elementFromPoint` au centre tombe sur elle.
- Le document ne défile pas (`docDefile` 0).
- Au clavier : focus sur la cible (« Suivant » pour la pagination), toujours visible et non
  recouverte. Une vraie tabulation mène au premier onglet, « Accueil » (A9).

**AC3 — agent, 390**
- 0 `header button[aria-label="Ouvrir le menu"]`.
- Au clavier :
  - depuis `body`, la première tabulation va au lien d'évitement ;
  - « Menu » est atteint en 14 tabulations ;
  - Entrée ouvre le dialogue (`role="dialog"`, `aria-expanded="true"`) ;
  - Échap le ferme, et le focus revient sur **« Menu »**.
- Au doigt (pointer + click émis sans focus préalable), puis fermeture par Échap → « Menu ».
- Fermeture par un vrai appui sur le voile → « Menu ».
- Fermeture par un **lien du tiroir** :
  - au clavier ou au clic, le focus va sur `body`, pas sur « Menu » (M1) ;
  - la tabulation suivante va au lien d'évitement ;
  - Échap après une navigation rend de nouveau le focus à « Menu ».
- Tiroir ouvert : 60 tabulations, 0 sortie du dialogue.

**AC4**
- `/app/properties/new` (agent) : aucune `[data-slot="barre-onglets"]`, aucun `[data-barre-onglets]`.
- `/publish` (client), mesuré avec toute requête non-GET refusée (voir l'incident ci-dessous) :
  - le HTML serveur ne contient ni barre ni coque ;
  - sur 528 images en 8 s, toutes sur `/publish`, on compte 0 barre et 0 coque.

**Ce que le ticket exige sans AC, et les correctifs**
- **Barre d'actions groupées de « Mes biens »** (une ligne cochée), à 390 et à 700 : son bas est à
  772, le haut de la barre à 788. Elle est donc 16 px au-dessus, avec `bottom` 72 px (A4).
- **M2** : sous md, la racine de la liste n'a aucun `padding-bottom` (`md:pb-16`). La pagination
  finit à 24 px de la barre, soit le `py-6` du contenu.
- **Messagerie compacte** (conversation 59, non-GET refusés pour ne pas la marquer lue) :
  - le composeur est 12 px au-dessus de la barre à 390 (776/788) et à 360 (712/724) ;
  - `main.scrollHeight − clientHeight` = 0, pour la conversation comme pour la liste.
- **Bouton flottant** :
  - absent de `/app` et de `/app/leases` à 390 ;
  - présent sur `/fr/properties` ;
  - présent sur `/publish` (hors de `/app`, inchangé).
- **M3** — un témoin aux classes exactes de l'alerte du pipeline, dans le `<main>` :
  - à 390 et à 700, `bottom` 72 px, bas 772, au-dessus de la barre (788) ;
  - à 800, 16 px, sans barre.
- **I1 — région live.** Le `meta.unread_total` a été réécrit à la réponse par interception CDP :
  181, puis 183, 183, 181, 183.
  - À 390 :
    - la région est vide au montage et après un sondage inchangé ;
    - elle dit « 183 non lus » à la hausse ;
    - elle ne change pas au sondage suivant (même compte) ;
    - elle se vide à la baisse ;
    - elle dit de nouveau « 183 non lus » à la remontée ;
    - la seule autre région, le badge du lanceur de bureau, est dans `hidden md:flex`.
  - À 1366, la région de la barre est en `display:none` et ne dit rien. Le badge du lanceur annonce.
  - Jamais deux régions exposées à la fois.
- **Tiroir ouvert** : Base UI ne pose pas `inert`. Il marque `aria-hidden` (onglets et « Menu »
  cachés), mais épargne la région `aria-live`. Une hausse s'annonce donc aussi tiroir ouvert, ce
  qui contredit la note des correctifs. Contrepartie mineure : le repère « Accès rapide », vide
  d'onglets, reste listé.
- **Coût des compteurs** (agent, 130 s, à 390 et à 1366) :
  - `property-visits` et `contact-leads` : 3 requêtes chacune, une par minute, **identiques aux deux
    largeurs** ;
  - `conversations?per_page=1` : 5 requêtes, une toutes les 30 s, aux deux largeurs ;
  - aucun doublement.
- **M5 — police par défaut à 20 px** (`Page.setFontSizes`) :
  - à 800 px, `(width < 48rem)` est vrai et `(max-width: 767px)` faux ;
  - la barre est affichée (70 px) et ACTIVE : la hausse des non-lus s'annonce, et le dock est à
    86 px ;
  - à 1000 px, et au témoin 16 px / 800 px : pas de barre, pas d'annonce.
- **TCK-2480** :
  - épingler « Visites » (un onglet) puis « Commissions » depuis le tiroir envoie 2 `PATCH` 200.
    Le tiroir les met en tête, et les **onglets ne changent pas**, ni avant, ni après, ni après
    rechargement ;
  - avec « Visites » épinglée, `/app/visits` allume « Visites » ;
  - `/app/customers` et `/app/commissions` n'allument aucun onglet (A12) ;
  - `menu_icones=1` ou `=0` ne change rien sous md : barre identique, et le tiroir reste `complet`
    (256 px).
- Console vide partout. Seule requête en échec : une vignette `ERR_BLOCKED_BY_ORB` sur
  `localhost:8002/storage`, déjà là avant.
- Artefact du banc : l'indicateur « N » de `next dev` se pose sur « Accueil » dans les captures.

**Incident du banc, réparé.** L'étape 6 du plan mesurait `/publish` avec le client 86, qui n'a pas
d'espace. `/publish` a donc lancé l'auto-onboard (TCK-633), qui a créé :
- l'agence 11 et les profils 51/16 ;
- 4 rôles et 66 capacités ;
- 4 activités et 1 job Scout.

Tout a été retiré, et la mesure rejouée avec les écritures refusées. **Pour une prochaine mesure :
`/publish` avec un compte sans espace écrit en base.**
