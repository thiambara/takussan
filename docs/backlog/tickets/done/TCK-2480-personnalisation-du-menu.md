---
id: TCK-2480
title: Personnaliser son menu — épingles et replis sur le compte, par persona ; barre réduite aux icônes sur l'appareil
status: done
phase: P2
family: full
estimate: L
wave: 82
created: 2026-11-05
updated: 2026-11-06
depends_on: [TCK-2478, TCK-2479]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#28-internationalisation--préférences"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, back, navigation, coque, adr-0089, preferences]
---

## Objectif utilisateur

Chacun remonte les entrées qu'il ouvre tous les jours, replie ce qui ne le concerne pas, retrouve
ce réglage sur tous ses appareils et pour chacun de ses profils — et réduit la barre aux icônes sur
un petit écran.

## Contrat de données

**Backend (prescriptif)** :

- `App\Http\Requests\Api\Me\UpdateMeRequest` : `navigation` rejoint `PREFERENCE_FIELDS`. Règles de
  FORME seulement (le catalogue appartient au front, ADR-0089 §6) :
  - `navigation` : `sometimes|nullable|array` ; `navigation.v` : `required_with:navigation|integer|in:1` ;
  - `navigation.personas` : `array`, clés parmi les huit personas
    (`client, locataire, bailleur, agent, admin-agence, hote, prestataire, plateforme`) ;
  - `navigation.personas.*.epingles` : `array|max:5`, éléments `string|max:64|regex:/^[a-z0-9-]+$/` ;
  - `navigation.personas.*.replies` et `.ouverts` : `array|max:20`, mêmes éléments ;
  - `navigation.personas.*.demarrer_masque` : `boolean`.
- `MeController::update` : la clé est remplacée en bloc (pas de fusion profonde), comme les autres
  clés de `preferences`.
- Tests : `tests/Feature/Api/Me/NavigationPreferencesTest.php` — forme valide enregistrée et relue
  par `GET /api/auth/me` ; persona inconnu → 422 ; 6 épingles → 422 ; identifiant hors motif → 422 ;
  `null` efface la clé ; les autres clés de `preferences` sont intactes.
- Parité : une fixture commune (formes valides et invalides) lue par le test Laravel ET par le test
  du schéma zod du front.

**Front** : `user.preferences.navigation` (déjà rendu par `getMe`) ; écriture par `PATCH /api/me`.
Mode icônes seules : cookie non `httpOnly` (`menu_icones=1|0`), lu par le layout de `/app`.

## Direction UX / Artistique

- Une épingle discrète dans chaque ligne, visible au survol ET au focus clavier ; l'entrée épinglée
  monte dans « Épinglés », juste sous la bande « À traiter » (c'est l'utilisateur qui la déplace :
  il doit voir où elle va).
- Tout groupe titré se replie d'un clic sur son titre ; le chevron dit l'état.
- Profil → section « Menu » : revenir à la disposition par défaut du persona actif.
- **Barre réduite aux icônes** : 64 px, infobulles au survol et au focus, titres de groupe réduits à
  un séparateur, la bande « À traiter » réduite à une icône portant le total. Un bouton en pied de
  barre bascule les deux modes.
- **Par défaut, icônes seules entre `md` et `lg`** (le contenu passe de 464 à 656 px à 768, TCK-505) ;
  un réglage explicite de l'appareil l'emporte.

## Contraintes strictes (métier)

- Rangement **par persona** : épingler chez l'agent ne touche pas le menu bailleur du même compte.
- Une épingle ne peut viser qu'une destination accessible ; un identifiant inconnu ou devenu
  inaccessible est ignoré au rendu, jamais affiché.
- L'action principale ne s'épingle pas. Cinq épingles au plus (contrôlé des deux côtés).
- Écriture optimiste, envoyée après un court délai ; un échec rétablit l'état et le dit (toast).
- Rendu serveur juste au premier octet : ni la disposition personnelle ni la largeur ne
  « sautent » à l'hydratation.

## Delta à produire

- [x] API : règles de `navigation`, enregistrement, `NavigationPreferencesTest`.
- [x] Fixture de parité + test zod côté front.
- [x] Épingles, replis, réinitialisation, appliqués par la composition (TCK-2477).
- [x] Section « Menu » du profil.
- [x] Mode icônes seules, cookie, défaut `md`–`lg`.
- [x] Tests front : épingler/désépingler au clavier ; persona isolé ; identifiant périmé ignoré ;
      échec d'écriture rétabli ; rendu serveur sans saut (largeur et épingles).

## Critères d'acceptation

- [x] AC1 — Épingler « Commissions » chez un agent la monte dans « Épinglés », la retire de
      « Gestion », et la retrouve après rechargement et sur un autre navigateur.
- [x] AC2 — Le même compte, profil actif bailleur, n'a pas cette épingle.
- [x] AC3 — `PATCH /api/me` avec six épingles → 422 ; ablation : retirer `max:5` fait rougir le test.
- [x] AC4 — Une épingle vers une destination devenue inaccessible n'est pas rendue.
- [x] AC5 — À 900 px sans réglage, la barre fait 64 px dès le HTML serveur ; avec `menu_icones=0`,
      256 px, sans saut à l'hydratation.
- [x] AC6 — La fixture de parité passe des deux côtés ; ablation : élargir une règle d'un seul côté
      fait rougir l'autre.
- [x] AC7 — `vendor/bin/pint`, lint, `tsc`, `check:i18n` verts ; suites par la CI.

## Hors périmètre

- Réordonner librement les entrées par glisser-déposer.
- La personnalisation par l'admin d'agence (TCK-2483).

## Notes d'implémentation

### Notes de livraison

**Arbitrages.** A1-A14 du plan retenus tels que validés par la session le 2026-11-05. Trois décisions
de session s'y ajoutent :
- `avecTitres` compte « Épinglés » comme une section. Dès qu'un persona à section unique épingle, le titre
  de sa section paraît. C'est voulu : sans ce titre, on ne voit pas où finissent les épingles. Le menu ne
  change que sous un geste (ADR-0089 §5).
- « Démarrer » est caché dans la barre réduite (`icones:hidden`). Ses étapes ne tiennent pas en 64 px, la
  barre s'élargit d'un clic, et pour l'agence la carte « Mise en service » du tableau de bord porte les
  mêmes étapes.
- Échec d'écriture : quand la ligne épinglée revient à sa place, son épingle n'existe plus à l'endroit où
  elle était. Si le focus était dessus, il retombe sur `<body>`. Ce cas n'est pas corrigé, et c'est assumé :
  il est rare, et le toast annonce l'échec (voir la mesure ci-dessous).

**Écarts au plan et aux suppositions.**
- S1-S8 vérifiées sur l'arbre réel, TCK-2479 mergé (#1648). Seul écart, mineur : S6.
  `DemarrerDeLEspace` reçoit aussi `ouverte` (correctif M6 de TCK-2479).
- TCK-2481 n'est pas sur `dev`. Tout se pose donc dans `AppSidebar` (pas de `useMenuDeLEspace`).
- T3 : le test des replis vise `pilotage`, parce que le groupe `agence` n'est pas rendu quand
  `cheminsAdmin` est vide.
- T4-5 : un groupe ouvert par la page active reste ouvert quand on la quitte par la navigation client. Le
  comportement de TCK-2478 est conservé (mesuré ci-dessous). L'ablation T5-4a est sans objet, car la ligne
  cadenassée sort avant l'épingle. Sur tactile, une épingle déjà posée reste à 100 %.
- API : `jsonb` réordonne les clés, d'où le `ksort` dans le test des clés intactes.
- `check:classes-emises` rejetait toute la chaîne de classes à cause de `[@media(hover:none)]`. La
  correction passe par une variante nommée `tactile` (globals.css), sans toucher au relevé.
- L'étape 12 de T6 (feuille servie par `dev.sh`) a été remplacée par une compilation `@tailwindcss/node`.
  La mesure ci-dessous la complète, ablation T8 comprise.

**Revue adverse** (0 bloquant, 2 importants, 2 mineurs), tout est corrigé :
- I1 (f47670841) : une seule écriture `PATCH /api/me` en vol à la fois. Un geste fait pendant le vol
  attend la réponse, puis part après ses 800 ms, ou tout de suite s'ils sont déjà écoulés. `confirmee`
  n'avance que dans l'ordre d'émission. Un échec n'est jugé que lorsque rien ne vole ni n'attend.
  `pagehide` et le démontage renvoient en `keepalive` l'état le plus récent non confirmé, y compris celui
  d'une requête ordinaire en vol, qui meurt avec la page. D'où, au plus, un doublon idempotent.
- I2 (278ced760) : après épingler ou désépingler, `flushSync` applique le geste, puis le focus va sur
  `button[data-epingle=id]` dans la même barre (ref de l'`<aside>`), sans effet. Même famille :
  - la croix de « Démarrer » (762ce4d2c) donne le focus au premier élément focalisable du menu qui suit,
    sans `flushSync` (la cible ne remonte pas, mesuré par ablation) ;
  - « Revenir au menu par défaut » (8eb18dbd1) passe en `aria-disabled` : le focus reste sur le bouton,
    et l'état est annoncé en `role="status"`.
- M1 (6a85e1e7e) : dans la barre réduite, la ligne cadenassée a une infobulle (libellé + « Réservé aux
  comptes pro ») au survol et au focus. Le `title` ne reste que barre dépliée. Aucune clé i18n neuve.
- M2 (76cee5464) : `prefsApresEpingle` — ajouter une épingle retire `epingles` des replis dans la même
  écriture.

**Ablations des correctifs.** 23 mutations, toutes rouges, fichiers restaurés :

| Script | Mutations |
|---|---|
| `i1.sh` | 7 |
| `i2.sh` | 3 |
| `m1.sh` | 4 |
| `m2.sh` | 3 |
| `demarrer.sh` | 3 |
| `reinitialiser.sh` | 3 |

Deux ablations sont restées vertes et ont fait retirer du code mort : `flushSync` et le filtre `[hidden]`
de la croix de « Démarrer ». Les ablations des tâches 1 à 7 sont dans les rapports de tâche.

**Laissé à après le merge.** `docs/models-spec.md#1-user` (ligne `preferences`) sera mis à jour par
`/sync-specs` (A14, règle 3 du backlog).

### Mesure au navigateur (2026-11-06, lot figé `8eb18dbd1`, 01:45-02:20)

**Banc**
- Code : HEAD `8eb18dbd1`, sans diff sur `takussan-web/src` ni `takussan-api/app`.
- Serveurs : `next dev` sur :3000 et l'API sur :8002, déjà lancés.
- Navigateur : Chrome 156 headless, CDP direct (Node 24). Un contexte isolé par scénario, session par
  jeton Sanctum. Charge entre 1,4 et 2,4 sur 8 cœurs (un pic à 6,4 pendant le relevé de la barre réduite).
- Comptes : aucun compte seedé n'est agent ET bailleur. On a créé le compte 315 (`AgentProfile` 23 +
  `OwnerProfile` 49, agence 1), supprimé depuis. Au départ, aucun compte n'avait de `preferences`.
- Le détail, les scripts et les captures sont dans le rapport de la session (`rapport-2480-mesure.md`,
  `mesures-2480/`).

**AC1 — « Commissions » épinglée au clavier (agent, 1366)**
- Focus sur le lien, puis une vraie tabulation : on arrive sur « Épingler Commissions »
  (`aria-pressed=false`). Après Entrée, le focus reste sur `button[data-epingle=commissions]`, désormais
  dans « Épinglés » (`aria-pressed=true`). « Gestion » ne la contient plus.
- Une seule requête part : `PATCH /api/me` → 200, **806 ms** après l'Entrée, avec le corps
  `{"navigation":{"v":1,"personas":{"agent":{"epingles":["commissions"]}}}}`. La base contient la même
  chose.
- Après rechargement, l'épingle est toujours là, et le rechargement n'envoie aucun PATCH.
- **Second navigateur** (autre processus Chrome, autre `user-data-dir`, nouvelle connexion) : l'épingle est
  là, et le HTML serveur porte déjà `data-groupe="epingles"` et l'épingle `aria-pressed="true"`.

**AC2 — même compte, profil bailleur.** Changement par `PATCH /api/me/active-profile`, le chemin du
sélecteur. Résultat : en-tête « Dakar Immo Bailleur » et **0** `[data-groupe="epingles"]` dans le document.

**AC4 — destinations non rendues**
- Posé en base : `["agence-finances", "commissions", "destination-inconnue"]`. `agence-finances` est une
  page d'agence, réservée à l'admin.
- Rendu : seule « Commissions » paraît. Ni le DOM ni le HTML serveur ne contiennent les deux autres. Console
  vide, aucune requête en échec.
- Le geste suivant (épingler « Interventions ») envoie `["commissions","maintenance"]` : les deux
  inaccessibles sont oubliées (A7). Désépingler renvoie `["commissions"]`. Le focus reste sur l'épingle
  dans les deux sens.

**AC5 — largeur au premier octet**

Pour chaque cas, on lit :
- le HTML serveur brut, avec les cookies du contexte ;
- la page avec JavaScript coupé (`Emulation.setScriptExecutionDisabled`, lecture par `DOM.getBoxModel`) ;
- la page avec JavaScript actif : la largeur est relevée à chaque image pendant 8 s (~480 images) par un
  script posé avant le document, et un `PerformanceObserver` relève les `layout-shift`.

| Cas | `data-menu` serveur | JS coupé | JS actif (valeurs distinctes) |
|---|---|---|---|
| 900, sans cookie | `auto` | **64** | {64} |
| 900, `menu_icones=0` | `complet` | **256** | {256} |
| 1366, `menu_icones=1` | `icones` | 57,6 (4rem) | {57,59} |
| 1366, sans cookie | `auto` | 230,4 (16rem) | {230,39} |
| 768 / 1023, sans cookie | `auto` | 64 / 64 | {64} / — |
| 1024, sans cookie | `auto` | 230,4 | {230,39} |

- À partir de `lg`, `html { font-size: 90% }` (TCK-635) s'applique. `w-64` = 16rem = 230,4 px et
  `icones:w-16` = 4rem = 57,6 px.
- Diagnostic : forcer `flex-shrink: 0` dans la page ne change rien, et rien ne dépasse de la barre. Les
  64 et 256 px du ticket sont donc 4rem et 16rem.
- **Aucune différence entre JS coupé et JS actif. Aucune valeur intermédiaire** : la transition de largeur
  ne joue jamais au chargement.
- Les deux `layout-shift` attribués à la barre (≈0,003) sont verticaux. Le `<nav>` descend quand l'action
  principale (capacités lues côté client) puis la bande « À traiter » arrivent. On les retrouve à
  l'identique en `complet` : ils viennent de TCK-2478/2479, pas d'une largeur.
- **Ablation T8** : retirer le bloc `@media` de `@custom-variant icones` fait passer 900 sans cookie de 64 à
  **256** (JS coupé et actif, deux essais). Après restauration (`cmp` identique) : 64.
  `git diff -- takussan-web/src` vide.
- **Bascule du pied** (900, sans cookie) :
  - premier clic : 256 px, cookie `menu_icones=0` (`path=/app`, un an, `SameSite=Lax`), HTML serveur
    `complet`, toujours 256 après rechargement ;
  - second clic : `icones`, `menu_icones=1` ;
  - les bascules n'envoient **0 PATCH**.
- **Profil → « Automatique »** : le cookie est effacé, le HTML serveur repasse en `auto`, et la barre fait
  64 à 900.

**Barre réduite** (900, `auto`, cinq personas : bailleur, agent, admin-agence, hôte, locataire)
- Barre de 64 px, `padding-top` 20 px (`icones:pt-5`), aucun débordement. L'en-tête d'espace est caché.
- **« Démarrer »** reste dans le DOM mais en `display: none` (bailleur, admin-agence, hôte).
- **Action principale** : sur le lot figé, une tuile pleine de 40 × 32. Infobulle au survol et au focus
  clavier. **Corrigé par ef5a42370** (`icones:size-10 icones:items-center icones:py-0`), re-mesuré le
  2026-11-06 (agent 3, avant = la ligne de classes remise à `8eb18dbd1` le temps du relevé) :

  | Cas | Avant | Après | Icône de la bande |
  |---|---|---|---|
  | 900, `auto` | 40 × 32 | **40 × 40** | 40 × 40 |
  | 1366, `menu_icones=1` | 36 × 28,77 | **36 × 36** (4rem × 0,9) | 36 × 36 |
  | 1366, barre complète | 208,8 × 31,69 | 208,8 × 31,69, inchangée | — |

  L'icône est centrée (écart 0 / 0). L'infobulle « Publier un bien » paraît toujours au focus clavier
  (vraie tabulation) dans la barre réduite, et aucune infobulle ne paraît barre complète. Débordement 0,
  console vide.
- **Bande « À traiter »** : les pastilles sont cachées. Une icône 40 × 40 porte le total (« 17 », « 72 »,
  « 99+ » pour 198) avec le nom « À traiter : N éléments ». Un clic ouvre un `Popover` à droite de la barre
  avec les mêmes pastilles et leurs liens (admin-agence : visites, messages, 1 bien, 100 avis) et
  `aria-expanded=true`. Aucun débordement.
- **Compteurs** : sur l'icône, à l'intérieur du lien.
- **Infobulles** : entrée ordinaire au survol et au focus (5 personas sur 5), chevron d'un groupe (son
  libellé). **Ligne cadenassée** (hôte : « Vue agence », « Propriétaires ») : bulle « Vue agence Réservé
  aux comptes pro » au survol et au focus clavier, sans `title`.
- **Carte « Mettre un bien en location »** (locataire) : devient une icône `/publish`, avec infobulle.
- La console est vide pour les cinq.

**Replis**
- Replier « Prospection » envoie un PATCH `replies:["prospection"]`. Le groupe est toujours replié après
  rechargement.
- Charger `/app/leads` ouvre le groupe, **sans aucun PATCH**, et la base ne change pas. Après une
  navigation client vers le tableau de bord, le groupe reste ouvert (écart T4-5). Il est replié de nouveau
  après rechargement.

**« Démarrer » (bailleur)**
- Croix atteinte par une vraie tabulation, puis Entrée : le focus va sur « Tableau de bord », le premier
  élément du menu qui suit. Le PATCH envoie `{"bailleur":{"demarrer_masque":true}}`.
- Toujours masqué après rechargement.

**« Revenir au menu par défaut »** (profil, persona bailleur, au clavier)
- Après Entrée, le focus reste sur le bouton. `role="status"` affiche « Votre menu suit la disposition par
  défaut. » et le bouton passe en `aria-disabled="true"`. Le PATCH n'envoie plus que l'agent. Une seconde
  Entrée n'envoie aucun PATCH.
- Le bailleur retrouve « Démarrer », « Activité » ouvert, et perd ses épingles (épingle « Visites » posée
  puis effacée).
- L'agent garde « Commissions » épinglée et « Prospection » repliée : seul **ce** persona est réinitialisé.

**Impersonation**
- Vraie session `ImpersonationService::start` (super-admin 1 → compte 315), cookies posés comme le fait
  `poserLaSession`. La bannière « Lecture seule » s'affiche.
- Épingler et replier changent l'onglet. **0 requête non-GET** (ni `/api/me`, ni le relais), aucun toast.
  Au rechargement, rien n'a été écrit et la base est inchangée.

**Échec et `pagehide`**
- PATCH refusé (`Fetch.failRequest`) : l'épingle s'affiche d'abord, puis revient à sa place, avec un seul
  toast « Votre menu n'a pas pu être enregistré : il est revenu à son état précédent. ». Le focus tombe sur
  `<body>` (cas assumé, voir plus haut).
- Désépingler puis fermer l'onglet 165 ms après : la base reçoit la nouvelle liste, l'envoi `keepalive`
  est bien arrivé.

**Débordement horizontal**
- `scrollWidth − innerWidth` = 0 à 390 (tiroir ouvert, et fermé), 768, 900 et 1366, pour agent, bailleur,
  admin-agence et le compte 315 (avec épingle et repli). `innerWidth` égal à la largeur visée partout ; le
  témoin `mobile:true` à 390 donne `innerWidth` 390.
- **Le tiroir n'est jamais réduit** : `complet`, 256 px, sans bascule, même avec `menu_icones=1`.

**Défauts**
- Aucun bloquant.
- L'écart mineur relevé sur le lot figé (A11 dit « un carré plein », mais l'action principale réduite
  mesurait 40 × 32) est **corrigé par ef5a42370** et re-mesuré : 40 × 40 à 900, comme l'icône de la bande
  (voir « Barre réduite »).

**Non mesuré**
- Le rendu tactile (`hover: none`, épingle à 60 %, A13).
- `keepalive` sur iOS.

**Nettoyage**
- Ont été supprimés : le compte 315 et ses lignes, les jetons, la session d'impersonation, l'activité,
  les `welcome_views`, et 15 jobs Scout en attente sur les users 315 et 62.
- Les préférences du 62 sont remises à `null`.
- Vérifié : le max(id) de toutes les tables est revenu à sa valeur d'avant le banc, et `users.preferences`
  non nul vaut 0.
