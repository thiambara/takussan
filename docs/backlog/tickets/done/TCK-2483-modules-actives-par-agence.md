---
id: TCK-2483
title: Modules activés par agence — l'admin d'agence retire du menu de son équipe ce que l'agence n'utilise pas
status: done
phase: P3
family: full
estimate: M
wave: 82
created: 2026-11-05
updated: 2026-11-06
depends_on: [TCK-2478, TCK-2479, TCK-2480, TCK-2481, TCK-2482]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, back, navigation, coque, adr-0089, agence]
---

## Objectif utilisateur

L'admin d'une agence qui n'utilise pas, par exemple, les commissions ou les états des lieux les
retire du menu de toute son équipe, pour un menu à la mesure de l'agence.

## Décision

[ADR-0089, amendement « modules par agence (TCK-2483) » du 2026-11-05](../../../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md#amendement--modules-par-agence-tck-2483-2026-11-05)
— accepté par délégation du porteur à la session. Ce ticket en est le delta ; il n'en recopie pas
les raisons.

## Contrat de données

**Backend (prescriptif)** :

- **Enum** `App\Models\Enums\AgencyModule: string`, sept cas, dans cet ordre :
  `commissions`, `inventories`, `move_in_follow_up`, `provider_book`, `calendar`, `credits`,
  `analytics`.
- **`App\Domain\Settings\AgencySettings`** : un type `list` (constante `LIST = 'list'`) et une
  entrée
  - `hidden_modules` : `type` `list`, `default` `[]`, `enum` `AgencyModule::class`,
    `rules` `['sometimes', 'nullable', 'array', 'list', 'max:'.count(AgencyModule::cases())]`.
  - `rules()` émet en plus, pour une entrée `list`, `settings.hidden_modules.*` →
    `['string', 'distinct', Rule::enum(AgencyModule::class)]`.
  - `read($settings, 'hidden_modules')` : une liste PHP (`array_is_list`) → ses seules valeurs qui
    sont des cas de l'enum, sans doublon, dans l'ordre lu ; toute autre forme (absente, `null`,
    chaîne, tableau associatif) → le défaut `[]`. La vérification « scalaire » existante ne
    s'applique pas au type `list`.
- **`AgencyUpdateRequest::rules()`** : pour une agence `individual` (`isIndividual()`),
  `settings.hidden_modules` → `['prohibited']` (même motif que `legalRules()`). `null` et `[]`
  passent (`prohibited` = non requis).
- **`AgencyController::update`** : inchangé. La fusion `array_replace` est de premier niveau : la
  liste est remplacée en bloc ; `null` retire la clé (défaut `[]`) ; `[]` est enregistré tel quel.
- **Lecture** : inchangée — `AgencyResource` rend déjà `settings`, donc `settings.hidden_modules`,
  à quiconque voit l'agence (l'agent de l'agence compris).
- **Test** `tests/Feature/Api/Agency/AgencyModulesSettingsTest.php` (étend `Tests\ApiTestCase`) :
  1. l'admin (`primary_admin_id`) enregistre `['commissions', 'analytics']` → 200, la colonne les
     porte, et l'agent de l'agence les relit par `GET /api/agencies/{id}` (`data.settings.hidden_modules`) ;
  2. les autres clés de `settings` sont intactes (`watermark_enabled: false` reste) ;
  3. refusés en 422, l'erreur sur la clé dite : code inconnu `['payments']` (`.0`), doublon
     `['calendar', 'calendar']` (`.1`), objet `{"a": "calendar"}` (racine), chaîne `'calendar'`
     (racine), entier `[1]` (`.0`) — et la colonne n'a pas bougé ;
  4. `null` retire la clé, `Agency::setting('hidden_modules')` rend `[]` ;
  5. `[]` est accepté et relu `[]` ;
  6. agence `individual` : `['calendar']` → 422 sur `settings.hidden_modules` ;
  7. un agent de l'agence (sans `configure`) → 403, rien d'écrit ;
  8. `AgencySettings::read` : `['calendar', 'obsolete', 3, 'calendar']` → `['calendar']` ;
     `'calendar'` → `[]` ; `['x' => 'calendar']` → `[]` ; `null` → `[]` ;
  9. `(new AgencyUpdateRequest)->rules()` porte `settings.hidden_modules` et `settings.hidden_modules.*`.

**Front (intentionnel)** :

- Un module `src/lib/navigation/modules.ts` : les codes (parité avec l'enum PHP, par un test qui
  lit `AgencyModule.php`), leur table vers les identifiants du catalogue (celle de l'amendement),
  la lecture tolérante de `agency.settings.hidden_modules`, l'ensemble des destinations masquées.
- `ContexteDeMenu.masquees` ; `estOuverte` la refuse ; `composerMenu` ne la garde pour le persona
  que s'il est `agent` ou `admin-agence`, et toujours pour le complément « Aussi … ».
- Le layout de `/app` lit les modules sur l'agence qu'il lit déjà, et les passe à la barre.
- `web-ci.yml` se déclenche aussi sur `takussan-api/app/Models/Enums/AgencyModule.php`.

## Direction UX / Artistique

- Fiche de l'agence (`/app/agency`), une section « Menu de l'équipe » après « Sécurité », même
  encadré cliquable que la double authentification : une case par module, **cochée = affichée**,
  chacune avec une ligne qui dit ce qu'elle retire (« Indicateurs, alertes et exports — les
  statistiques restent »).
- Le chapeau de la section dit les trois choses qui rassurent : le menu de toute l'équipe, le vôtre
  compris ; aucun droit ne change, une page reste ouverte par un lien direct ; bailleurs et
  locataires gardent leur menu.
- Enregistré par le bouton de la fiche ; le menu change aussitôt (`router.refresh()` relance le
  layout).
- Absente pour une agence `individual`.

## Contraintes strictes (métier)

- Désactiver un module ne retire AUCUN droit et ne ferme aucune page : l'API ne lit pas
  `hidden_modules`, aucune garde de page non plus.
- Ce que le persona `bailleur`, `locataire`, `client` ou `prestataire` ouvre lui-même ne disparaît
  jamais ; un module ne masque que ce qu'un profil du personnel apporte (disposition de l'agent et
  de l'admin, complément « Aussi … »).
- Jamais masquables : tableau de bord, messagerie, biens, baux, paiements, demandes ; toute
  destination à compteur, d'écriture, jugée sur l'espace, page d'agence, ou action principale.
- Une destination appartient à un module au plus.
- Le wolof porte le texte français tel quel (wolof en pause).

## Delta à produire

- [x] API : enum `AgencyModule`, type `list` d'`AgencySettings`, refus en agence `individual`,
      `AgencyModulesSettingsTest`.
- [x] Front, navigation pure : `modules.ts`, `ContexteDeMenu.masquees`, `estOuverte`,
      `composerMenu` ; gardes (modules, parité, branchement) ; `web-ci.yml`.
- [x] Front, câblage : type `AgencySettings`, layout de `/app`, `AppShell`, `AppSidebar`.
- [x] Front, écran : schéma et normalisation du formulaire, section « Menu de l'équipe », libellés
      `fr`/`en`/`wo`.
- [x] Mesure au navigateur.

## Critères d'acceptation

- [x] AC1 — La décision est écrite (amendement d'ADR-0089) et validée par la session, par
      délégation du porteur, avant toute ligne de code.
- [x] AC2 — `AgencyModulesSettingsTest` vert. Ablations, chacune rougit son cas : retirer
      `Rule::enum` (code inconnu) ; retirer `distinct` (doublon) ; retirer `list` (objet) ; retirer
      le `prohibited` de l'agence `individual` ; retirer le filtre par l'enum de `read()`.
- [x] AC3 — Chez un agent dont l'agence masque `commissions` et `inventories`, ni « Commissions » ni
      « États des lieux » ne sont rendus — ni dans un groupe, ni sous « Plus », ni sous « Aussi … ».
      Ablation : `estOuverte` qui ignore `masquees` fait rougir.
- [x] AC4 — Même agence : le bailleur et le locataire gardent « États des lieux » dans leur groupe ;
      un bailleur qui est aussi admin de l'agence ne voit ni « Commissions » ni « KPIs » sous « Aussi
      administrateur » quand `commissions` et `analytics` sont masqués. Ablation : `composerMenu` qui
      garde `masquees` pour tout persona fait rougir le cas bailleur.
- [x] AC5 — « Rien n'est perdu » tient avec les modules : pour chaque persona et chaque combinaison
      de rôles, tous modules masqués, le menu rend exactement ce que la règle de l'amendement ouvre.
- [x] AC6 — Gardes : aucun module ne contient une destination interdite (liste ET règles de l'AC
      « jamais ») ni une destination citée deux fois ; les codes du front sont ceux de l'enum PHP ;
      aucun fichier de `src/` hors `lib/navigation/` (tests exclus) n'appelle `estOuverte(` ; tout
      appelant de `composerMenu(` pose `masquees` ; `hidden_modules` n'est lu que par les fichiers
      autorisés (aucune page, aucune garde). Ablations : ajouter `messagerie` au module `calendar` ;
      ajouter un code au seul front ; appeler `estOuverte` depuis un composant — chacune rougit.
- [x] AC7 — Le layout passe à la coque les seuls codes connus lus sur l'agence (admin et agent), `[]`
      sans agence lue. Ablation : ne pas les lire fait rougir.
- [x] AC8 — Formulaire : une agence sans la clé a les sept cases cochées ; décocher « Calendrier »
      et enregistrer envoie `settings.hidden_modules` dans l'ordre des codes ; une agence
      `individual` n'a pas la section et n'envoie pas la clé. Ablation : ne plus émettre la clé fait
      rougir.
- [x] AC9 — Au navigateur (`./dev.sh`) : l'admin décoche « Commissions », enregistre, l'entrée quitte
      son menu sans rechargement ; un agent de l'agence ne l'a plus ; `/app/commissions` ouvert par
      URL est servi ; un bailleur de l'agence garde « États des lieux » quand `inventories` est
      masqué. Relevés dans les notes.
- [x] AC10 — Si TCK-2481 ou TCK-2482 est sur `dev` à l'implémentation : un onglet ou une entrée de
      palette vers une destination masquée n'est pas rendu (test sur le composant réel).
- [x] AC11 — `./vendor/bin/pint`, `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n` verts ;
      suites par la CI. *(PR #1652 : API CI verte sur `570e32365` (run 42210407482, suite entière),
      attestée sur `775147e7e` ; Web CI verte sur `775147e7e` (run 42218672718) après un rouge sur
      `570e32365` : `promesses-de-delai.test.ts` (TCK-575) refusait la ligne d'aide « plus de 7 jours »
      du module `move_in_follow_up`, absente du registre — ajoutée, adossée à
      `TenantOnboardingPendingController.php:54`, `subDays(7)`, commit `775147e7e`.)*

## Hors périmètre

- Tout effet hors des surfaces de navigation (menu, « Plus », « Aussi … », onglets, palette) : tuiles
  du tableau de bord, notifications, e-mails, recherche, pages — et a fortiori tout droit.
- Masquer pour un membre ou un rôle personnalisé ; réordonner ou renommer des entrées (TCK-2480 pour
  la personne).
- Les agences `individual` (hôte) ; les personas `bailleur`, `locataire`, `client`, `prestataire`,
  `plateforme` pour ce qu'ils ouvrent eux-mêmes.
- Déduire un masquage d'un autre réglage (par ex. `tenant_onboarding_enabled = false` → masquer
  `move_in_follow_up`) : une piste, pas ce ticket.
- Journaliser le changement (la fiche d'agence ne l'est pas aujourd'hui).
- La mise à jour de `docs/features.md` et `docs/models-spec.md` : `/sync-specs` après la fusion.

## Notes d'implémentation

Plan : [`docs/plans/2026-11-05-tck-2483-modules-actives-par-agence.md`](../../../plans/2026-11-05-tck-2483-modules-actives-par-agence.md).

### Notes de livraison

**Preuve des cases cochées.**
- Delta et AC2-AC8, AC10 : par les tests de la branche et leurs ablations (ci-dessous).
- AC3, AC4 (bailleur), AC8 (agence `individual`), AC9 et AC10 : aussi par les relevés au navigateur
  du 2026-11-06.
- AC4 (locataire, bailleur aussi admin) et AC5 : par les tests seuls (`composer-menu.test.ts`,
  invariant sur chaque persona et chaque combinaison de rôles).
- AC11 : tenu en CI (voir la case).

**Écarts au plan.**
- **Tâche 1** (`6890d8545`) :
  - `AgencySettingAccessorTest` comparait toutes les clés `settings.*` des règles à
    `AgencySettings::keys()` et rougissait sur `settings.hidden_modules.*`. Il exclut désormais les
    règles d'élément (`.*`), avec un renvoi au test 9 du nouveau fichier ;
  - l'agent relit l'agence sans l'en-tête `X-Active-Profile-Hint` : le repli prévu n'a pas servi ;
  - `max:7` n'est pas ablatable seul (`distinct` + `Rule::enum` bornent déjà à sept). Il est gardé
    comme borne de forme, ce que la revue M1 a ensuite rendu utile.
- **Tâche 2** (`5fde1665f`) :
  - le seul appelant de `composerMenu` est `useMenuDeLEspace.ts` (TCK-2481), pas `AppSidebar.tsx`.
    Il compose la barre, les onglets (`groupesDeLaDisposition`) et la palette : `masquees` y est posé
    une fois ;
  - `cheminOuvert` ignore le masque. Il mime les gardes de PAGE pour « Démarrer », et une page masquée
    reste servie ;
  - la garde « jamais » refuse aussi un onglet mobile : masquer un onglet ferait monter un remplaçant
    que personne n'a choisi ;
  - le test AC4 « bailleur + admin » n'asserte plus `paiements` sous « Aussi » (hors sujet), et gagne
    un témoin sans masque.
- **Tâche 3** (`e19635c9e`) :
  - `modulesMasques` est REQUIS sur le crochet, `AppSidebar` et `BarreDOnglets` : `tsc` garde chaque
    maillon, y compris `contexteDuMenu` (palette, récents). Seule `AppShell` garde un défaut `[]` ; le
    lien layout → coque est gardé par `layout.modules.test.tsx` ;
  - l'étape 6 du plan (`masquees:` dans `AppSidebar`) est caduque ;
  - AC10 côté onglets : aucun onglet du dépôt n'est un module, donc le test déclare « Calendrier »
    parmi les onglets de l'agent (mock de `DISPOSITIONS`). Deux tests de coque montée sont ajoutés
    (`AppShell.palette`, `AppShell.barre-d-onglets`) : sans eux, l'ablation « coque → onglets à `[]` »
    n'était vue par aucun test.
- **Tâche 4** (`929ef8316`) :
  - les libellés des cases sont ceux du MENU : « Onboardings en attente », « Carnet prestataires »,
    et « Pilotage avancé » pour `analytics`, dont l'aide dit « KPIs, alertes et exports — les
    statistiques restent. » ;
  - `AgencyConfigForm.test.tsx` cherchait `getByLabelText(/Commission/)`, devenu ambigu avec la case :
    `getByRole('textbox', …)`, même intention.
- **Tâche 5** (mesure) :
  - le formulaire écrit par une ACTION SERVEUR (`updateAgencyAction`), qui transmet le payload tel quel
    au `PATCH`. Le `PATCH` ne passe donc pas par le navigateur : le relevé porte sur le corps de
    l'action serveur ;
  - l'écriture de la fiche exige un second facteur vu par le jeton (TCK-589, `RequireTwoFactor`). Le
    banc l'a posé en base sur le compte de mesure, puis l'a remis.

**Revue adverse** (0 bloquant, 0 important, 5 mineurs). Les cinq sont corrigés, un commit par point.
- M1 (`b96a22892`) — une liste de 20 000 éléments coûtait 29 s de CPU : Laravel validait chaque
  élément même après l'échec de `max:7`, y compris pour une agence `individual`.
  `AgencySettings::rules($input)` n'émet `settings.<clé>.*` que si la liste tient dans sa borne. Au-delà,
  `max` seul répond 422. Deux tests : 1 000 éléments → une seule erreur, sur la clé parente ; 7
  éléments → l'élément inconnu est toujours refusé sur `.6`.
- M2 (`8472b6ebe`) — la garde « `estOuverte` hors de `lib/navigation/` » ne voyait pas
  `lib/navigation/palette.ts`. Elle nomme désormais ses appelants (`catalogue.ts`, `composer-menu.ts`).
- M3 (`c1b6d1aa4`) — la garde « affichage seulement » ne cherchait que la chaîne `hidden_modules`.
  Elle recense aussi les appelants de `modulesMasquesDe(` et `destinationsMasquees(` : le layout, le
  crochet, le formulaire.
- M4 (`91cb9d0a3`) — la parité ignorait un cas PHP portant un chiffre (`reports_v2`). Elle extrait
  tout code entre apostrophes et compare le nombre extrait au nombre de `case`.
- M5 (`260704c4b`) — enregistrer la fiche sans toucher la section renvoyait la liste lue au
  chargement : deux admins s'écrasaient. `hidden_modules` ne part plus que si la liste (codes connus,
  ordre des codes) diffère de l'initiale. Patron du seuil (TCK-594) et du slug (TCK-1004), pas
  `dirtyFields` : après `router.refresh()`, la prop porte la liste enregistrée, rien ne repart.
- Couverture (`570e32365`) — `RetenirLaPageRecente` reçoit le masque : une fiche d'un module masqué
  n'est résolue sur aucune entrée du menu. Le test fige ce comportement ; sa conséquence est en
  Suites (c).

**Tests.**
- API : `AgencyModulesSettingsTest` (11 méthodes, 16 cas avec M1), `AgencySettingAccessorTest` repris.
- Front, neufs : `modules.test.ts`, `modules.parity.test.ts`, `layout.modules.test.tsx`,
  `AgencyConfigForm.modules.test.tsx`, `AppShell.barre-d-onglets.test.tsx`.
- Front, repris : `composer-menu.test.ts`, `useMenuDeLEspace.test.tsx`, `AppSidebar.test.tsx`,
  `BarreDOnglets.test.tsx`, `PaletteDeCommandes.test.tsx`, `AppShell.palette.test.tsx`,
  `admin-schemas.test.ts`, `AgencyConfigForm.test.tsx` et les montages de la barre (`modulesMasques={[]}`).
- Dernier passage ciblé (correctifs) : front 158 fichiers, 2 342 verts ; API `tests/Feature/Api/Agency`
  120 verts. Les suites entières sont jouées par la CI.

**Ablations.** Toutes les mutations ont rougi, et chaque fichier a été restauré (`cmp` ou md5, puis
`git diff`). Le détail est dans les rapports de tâche de la session.

| Lot | Mutations | Exemples de rouges |
|---|---|---|
| Tâche 1 (API) | 7 | sans `Rule::enum`, sans `distinct`, sans `list`, sans `prohibited` individuel, `read()` sans filtre, sans `array_unique`, liste lue après la garde scalaire |
| Tâche 2 | 12 | `estOuverte` ignore `masquees` (AC3, admin, « Aussi », épingle, onglets, crochet) ; masque pour tout persona (AC4 bailleur/locataire, AC5 ×6) ; jamais de masque ; `messagerie` dans `calendar` ; `agence-equipe` dans `analytics` ; code au seul front ; `estOuverte` dans `AppTopbar` ; crochet sans `masquees` ; `cheminOuvert` lit le masque ; doublon ; lecture non tolérante ; `hidden_modules` dans le layout |
| Tâche 3 | 10 + 4 `tsc` | layout ne lit rien (×3 variantes) ; colonne brute ; barre fixe, tiroir, `contexteDuMenu`, onglets à `[]` ; `AppSidebar` et `BarreDOnglets` → crochet à `[]` ; prop oubliée → `tsc` rouge ×4 |
| Tâche 4 | 7 | émission retirée (5 rouges) ; émise en `individual` ; `checked` inversé ; `toDefaults` à `[]` ; clé brute ; section en `individual` ; `z.array(z.string())` |
| M1 | 1 | fichiers de HEAD : les 2 cas hors borne rouges, le cas dans la borne vert |
| M2-M4 | 5 | `estOuverte(` dans `palette.ts` ; `modulesMasquesDe(` et `destinationsMasquees(` dans une page ; `'reports_v2'` ; cas entre guillemets doubles |
| M5 | 2 | schéma de HEAD : 5 rouges ; masque initial non transmis : 2 rouges |
| Récents | 3 | masque retiré des récents, de `contexteDuMenu`, de la seule palette |

### Relevés au navigateur — 2026-11-06, 11:28-11:39

**Banc.**
- Lot figé `570e32365`. L'empreinte de version est identique avant et après chaque passage
  (`diff:da39a3ee5e6b`). Le front `next dev` sert cet arbre : la section « Menu de l'équipe » est
  rendue.
- `next dev` :3000, API :8002. Chrome 156 headless piloté en CDP direct, un contexte isolé par
  compte, UA Windows. Charge entre 1,6 et 4,2 sur 8 cœurs.
- Comptes de l'agence 1 Dakar Immo (`standard`, `settings` NULL) : admin 2, agent 3, bailleur 7.
  Agence `individual` : admin 62 (agence 4). Aucun compte jetable.
- La 2FA exigée a d'abord bloqué l'enregistrement (dialogue « Activez la double authentification »,
  rien d'écrit). Le banc a posé `users.two_factor_enabled` sur le compte 2 et
  `two_factor_verified_at` sur son seul jeton de mesure.
- Nettoyage vérifié :
  - empreinte max(id) de 133 tables revenue à l'identique (sha `18e04fb0adef` avant et après) ;
  - lignes ENTIÈRES de l'agence 1 (`settings` NULL, `updated_at` d'origine), de l'agence 4 et de
    `users` 2 réécrites depuis la sauvegarde, puis comparées : identiques ;
  - jetons, `welcome_views`, préférences écrites pendant la mesure et 5 jobs Scout supprimés ou
    remis. Aucun `/publish` ouvert.

**AC9 (a) — l'admin, par l'écran.** `/app/agency`, 1366, clics réels sur la case puis sur
« Enregistrer ». Le non-rechargement se lit sur un marqueur posé sur `window`, `performance.timeOrigin`
et le nombre d'entrées `navigation`.

| Pas | `settings` envoyé | Barre de l'admin | Rechargement |
|---|---|---|---|
| décocher « Commissions » | `require_team_two_factor`, `late_fee_online_collection`, `hidden_modules: ["commissions"]` | `/app/commissions` quitte « Finances » (≤ 1,5 s après la réponse) | aucun |
| ré-enregistrer sans toucher la section | `require_team_two_factor`, `late_fee_online_collection` — **pas de `hidden_modules`** (M5) | inchangée | aucun |
| décocher « États des lieux » | `… hidden_modules: ["commissions","inventories"]` | `/app/inventories` quitte « Plus » | aucun |

- Message « Modifications enregistrées. » à chaque pas. En base : `["commissions", "inventories"]`.
- Le reste de la barre ne bouge pas. Console : vide, hors vignettes déjà connues.

**AC9 (b, c) et AC10 — l'agent 3.**
- 1366 : aucun lien vers `/app/commissions` ni `/app/inventories`, « Plus » compris. Les libellés
  « Commissions » et « États des lieux » n'apparaissent dans aucun `aside`, `nav`, `header` ni
  dialogue.
- Palette (Ctrl K réel) : « commissions » → 0 option ; « états » → 0 option.
- 390 : onglets Accueil · Demandes · Visites · Messagerie · Menu. Le tiroir « Menu », groupes dépliés
  par clics réels, rend 23 liens, sans les deux destinations.
- URL directe : `/app/commissions` → document **200**, h1 « Relevé des commissions », contenu rendu ;
  `/app/inventories` → **200**, h1 « États des lieux », liste rendue. La barre ne les reprend pas.
- Témoin, agence remise : même script, même compte. « Gestion » porte `/app/inventories` et
  `/app/commissions`, la palette propose « Commissions » et « États des lieux », le tiroir aussi.

**AC9 (d) — le bailleur 7.** `inventories` masqué : « États des lieux » reste dans « Mon patrimoine »
(1366 et tiroir à 390), et la palette le propose. `/app/inventories` → 200.

**La section à 390 px.** admin 2, deux cases décochées.
- `scrollWidth − innerWidth = 0`, en `mobile:false` comme `mobile:true`. Section 16-374 px.
- Une colonne : 7 encadrés empilés, 40-350 px. Aucun débord interne, rien hors de la section, aucun
  texte tronqué.
- axe-core 4.13.0 sur la section (WCAG 2.2 A/AA + bonnes pratiques) : **0 violation**, 0 incomplete,
  à 390 et à 1366.

**Agence `individual`.** admin 62, `/app/agency` : le formulaire est rendu sans « Menu de l'équipe »
(ni titre, ni case `module-*`).

### Suites

- (a) **Les 56 autres règles `.*` de `app/Http/Requests` valident leurs éléments sans borne
  préalable** : même amplification que M1 (≈ 1,45 ms par élément), dont des `ids.*` + `distinct`.
  M1 ne corrige que `hidden_modules`. Hors périmètre ; à écrire en ticket.
- (b) **TCK-589 renvoie toujours ses clés de `settings`** (`require_team_two_factor`,
  `late_fee_online_collection`) à chaque enregistrement, relevé au navigateur ci-dessus. Deux admins
  s'écrasent donc sur ces clés, comme M5 avant correctif. Le correctif est celui de M5 : n'émettre que
  ce qui a changé.
- (c) **Une fiche d'un module masqué ouverte par lien direct prend une place des 8 récents bruts.**
  Résolue sur aucune entrée, elle n'est pas dédoublonnée et peut chasser des récents visibles ; elle
  ne s'affiche jamais. Rare (notification, lien) : accepté.
- (d) **Après le merge : `/sync-specs`** — `features.md` (navigation de la console, § 11.2) et
  `models-spec.md` § 2 : la clé `hidden_modules` d'`agencies.settings`.
- Relevé sans ticket : la fiche d'une agence `individual` affiche « Sécurité de l'équipe »
  (double authentification de toute l'équipe) alors qu'elle n'a pas d'équipe. Préexistant, hors
  delta.
