# ADR-0089 — Le menu de `/app` se dérive du profil actif : un catalogue des destinations, une disposition par persona, une composition pure

- **Statut** : Accepté le 2026-11-05 par le porteur (décisions de la session, une par une) ; **amendé le 2026-11-05** (§ *Amendement — modules par agence*) et **le 2026-11-10** (§ *Amendement du 2026-11-10 — l'accueil par persona, « Rapports » à onglets, les dispositions de l'audit*)
- **Date** : 2026-11-05
- **Tickets** : TCK-2477 → TCK-2483
- **Précise** : [ADR-0005](0005-contrat-http-conserve-roles.md) côté front (ce que le menu fait de `roles`), [ADR-0064](0064-l-administration-d-agence-vit-dans-app.md) §2 (la section d'agence reste dérivée de `PAGES_ADMIN`)

## Contexte

Relevé sur `dev` (0b7deae44) le 2026-11-05 :

- **Le menu est une procédure, pas une donnée.** `buildNavItems` (`takussan-web/src/components/layout/AppSidebar.tsx`)
  enchaîne ~250 lignes de `if (isAgent(roles)…) items.push(…)`, dédoublonne par `href` en gardant la
  PREMIÈRE poussée, puis trie la tête par une table unique `RANG_EN_TETE`. L'ordre, la section et
  jusqu'au libellé d'une entrée (`myBookings` / `bookings`) dépendent de l'ordre des `push` : la même
  destination est poussée jusqu'à trois fois (`/app/bookings`, `/app/visits`, `/app/messages`).
- **Il ne connaît pas le profil actif.** `User.roles` rend les types des profils ACTIFS de l'agence du
  profil actif, plus les types globaux (ADR-0005, amendement du 2026-10-23). Un admin d'agence qui est
  aussi bailleur de la même agence reçoit l'union des deux menus, quel que soit le profil choisi dans
  le `ProfileSwitcher`.
- **Il ne s'adapte à personne.** La tête du menu (`RANG_EN_TETE`, TCK-646) est la même pour un client,
  un agent et un admin d'agence ; les sections (`primary`, `discover`, `requests`, `engagements`,
  `manage`, `admin`) aussi.
- **Une page n'a pas d'entrée** : `/app/tasks` (« Mes tâches », TCK-591), atteinte par la seule tuile
  du tableau de bord. Rien ne garde l'accord entre les pages de `/app` et le menu.
- **Le bon patron existe déjà** : `src/lib/access/pages-admin.ts` (TCK-633, ADR-0064) — une table, d'où
  dérivent le menu de la section d'agence, les raccourcis, la carte du profil et la garde serveur.

Le **2026-11-05**, le porteur a demandé un menu « totalement dynamique dans sa manière de s'afficher —
ordre, mise en avant, regroupement — selon le profil de l'espace actif », et une configuration
ambitieuse. Arbitrages tranchés le même jour, dans l'ordre :

1. **Qui décide** : le produit, en code, par persona ; l'utilisateur personnalise (épingles, replis,
   icônes seules). L'admin d'agence ne configure rien dans ce projet (option reportée, TCK-2483).
   Le menu piloté par l'API est écarté.
2. **Plusieurs profils dans un même espace** : le profil actif décide de la disposition ; les
   destinations des autres profils de l'espace paraissent dans un groupe replié « Aussi … ». L'agence
   `individual` est un persona fusionné, « hôte ».
3. **Ce qui attend** : une bande de pastilles au-dessus du menu ; aucune entrée ne change de place
   selon la charge.
4. **Où vit la personnalisation** : épingles et replis sur le compte (`preferences.navigation`), le
   mode icônes seules sur l'appareil (cookie).

## Décision

**Le menu de `/app` est le résultat d'une fonction pure — `composerMenu` — appliquée à un catalogue
unique des destinations, à la disposition du persona du profil actif et aux préférences du compte.
Le composant n'affiche que ce qu'elle rend, et ne porte aucune condition de rôle.**

### 1. Le catalogue

Chaque destination de `/app` y est déclarée une fois : identifiant stable, `href`, icône, clé de
libellé, prédicat d'accès (rôles, capacités, `kind` de l'agence), compteur éventuel et `hrefATraiter`
(la page filtrée sur ce qui attend). Les pages d'administration d'agence n'y sont PAS réécrites : le
catalogue les reprend de `PAGES_ADMIN`, qui reste leur seul juge (ADR-0064). Le prédicat d'accès
reprend les gardes actuelles de `buildNavItems` (TCK-379, TCK-492, TCK-587, P152.03) ; il décide de
l'écran, jamais de la donnée.

Une page de `/app` est soit au catalogue, soit dans une liste `HORS_MENU` qui dit pourquoi (détail,
redirection, étape de parcours). Une garde le vérifie sur l'arborescence, dans les deux sens.

### 2. Le persona

`resoudrePersona` rend l'un de huit personas d'après le **profil actif** (type et agence), le `kind` de
l'agence et les rôles dérivés : `client`, `locataire`, `bailleur`, `agent`, `admin-agence`, `hote`,
`prestataire`, `plateforme`. Sans profil actif, un compte sans profil professionnel est `client` ou
`locataire`. Le persona fixe la disposition ; le prédicat d'accès, lui, se juge sur les rôles du
persona pour la disposition, et sur l'union de l'espace pour le complément « Aussi … ».

### 3. La disposition

`Record<Persona, Disposition>`, exhaustive (`tsc` refuse un persona sans disposition) : action
principale (facultative), groupes ordonnés (titre ou aucun, identifiants, replié par défaut),
libellés propres au persona, « Plus », et les quatre onglets mobiles.

### 4. La composition

`composerMenu` filtre par accès, efface les groupes vides, garde la règle des en-têtes de TCK-377
(`withSectionHeadings`), applique les préférences (épingles d'abord, replis), et **ne perd aucune
destination** :

- accessible au persona et placée nulle part → « Plus » ;
- accessible seulement par un autre profil de l'espace → le complément replié « Aussi … » ;
- un identifiant inconnu (préférence périmée, destination retirée) est ignoré.

### 5. Les zones vivantes

- **La bande « À traiter »** se dérive des compteurs ; un compteur n'est sondé que si son entrée est
  au menu (règle de TCK-377, `countersToPoll`). Elle ne se rend ni pendant le chargement ni sur une
  erreur (0 vaut « rien à traiter » : le menu n'est pas l'endroit où l'on apprend qu'un endpoint est
  tombé).
- **Le reste du menu ne bouge jamais seul.** Ni tri par fréquence d'usage, ni remontée d'une entrée
  selon sa charge. Seul un geste de l'utilisateur (épingler) déplace une entrée.

### 6. Les préférences

`preferences.navigation = { v: 1, personas: { <persona>: { epingles, replies, ouverts, demarrer_masque } } }`,
écrit par `PATCH /api/me`. L'API n'en valide que la **forme** (tableaux plafonnés, identifiants courts) :
le catalogue appartient au front (principe 5 du `CLAUDE.md` racine). Le mode icônes seules est un
cookie non `httpOnly`, lu par le layout pour rendre la bonne largeur au premier octet.

## Options écartées

- **Le menu servi par l'API.** Les routes, icônes et libellés appartiennent au front ; l'API donnerait
  un contrat de plus pour une décision que les capacités (`GET /api/me/capabilities`) et la table des
  pages permettent déjà de prendre côté front.
- **L'union des rôles comme aujourd'hui** (persona qui ne ferait qu'ordonner) : garde le mélange que
  ce projet corrige.
- **Le profil actif seul, sans complément** : oblige à basculer de profil pour des comptes cumulants,
  alors que le résolveur de capacités fait déjà un OR entre les profils d'une même agence.
- **Une entrée qui remonte selon sa charge, ou un tri par usage** : un menu qui se réordonne casse les
  automatismes.
- **Le mode icônes seules sur le compte** : il dépend de l'écran, pas de la personne.

## Conséquences

- `buildNavItems`, `RANG_EN_TETE`, `SECTION_ORDER` et `SECTION_LABEL_KEYS` disparaissent. Les tests
  qui figent le jeu d'`href` des sept rôles (`AppSidebar.test.tsx`) servent de filet au premier lot
  (aucun changement visible), puis changent EXPRÈS au second, l'écart écrit dans son ticket.
- Le layout de `/app` lit le profil actif (cookie `active_profile_id` ou `GET /api/me/profiles`) :
  une lecture de plus pour les comptes qui ne la font pas déjà.
- Le menu, la barre mobile et la palette se dérivent du même catalogue : une destination ajoutée sans
  sa place casse un test, au lieu de disparaître en silence.
- Le persona devient un concept du front. S'il doit un jour en sortir (API, e-mails), il demandera un
  amendement de cet ADR.
- Coût : ~870 lignes de `AppSidebar.tsx` réécrites en unités courtes ; une clé `navigation` ajoutée à
  `PREFERENCE_FIELDS` côté API ; trois langues pour chaque libellé neuf (le wolof porte le français tel
  quel tant que le wolof est en pause).

## Application

- `takussan-web/src/lib/navigation/` : `catalogue.ts`, `personas.ts`, `dispositions.ts`,
  `composer-menu.ts`, `a-traiter.ts` (noms indicatifs : le ticket front est intentionnel).
- Gardes : la garde d'arborescence (catalogue ⇄ `page.tsx`), « aucune destination accessible perdue »,
  « tout identifiant d'une disposition existe », `hrefATraiter` lu par sa page, parité du schéma de
  `preferences.navigation` entre zod et Laravel.
- Tickets : TCK-2477 (moteur, sans changement visible), TCK-2478 (dispositions, action principale,
  en-tête d'espace, complément), TCK-2479 (« À traiter », « Démarrer »), TCK-2480 (personnalisation),
  TCK-2481 (barre mobile), TCK-2482 (palette), TCK-2483 (modules par agence, hors de ce projet).

## Amendement — modules par agence (TCK-2483), 2026-11-05

- **Statut** : Accepté par délégation du porteur à la session (le porteur a reporté la décision le
  2026-11-05 — point 1 du Contexte — puis l'a déléguée ; la session la relit avant tout code).
- **Amende** : le point 1 du Contexte (« l'admin d'agence ne configure rien ») et §4 (ce que
  `composerMenu` retire). Rien d'autre ne change : ni le catalogue, ni les dispositions, ni les
  préférences du compte.

### Contexte (relevé le 2026-11-05 sur `feat/bande-a-traiter-tck-2479`, b837e053e)

- `agencies.settings` a déjà un catalogue typé : `App\Domain\Settings\AgencySettings` (TCK-970),
  sept clés, chacune avec son type (`bool`, `int`, `string`), son défaut et sa règle ;
  `AgencyUpdateRequest` en tire ses règles `settings.*` ; `AgencyController::update` fusionne
  `settings` **clé par clé**, sur la ligne relue sous verrou (TCK-593, P245.04) — une clé à `null`
  est retirée, donc rendue à son défaut. L'écriture est gardée par `AgencyPolicy::configure`
  (`update` ET `agency.update`, TCK-2024).
- `AgencyResource` rend `settings` (moins les clés d'onboarding) à quiconque voit l'agence, et le
  layout de `/app` lit déjà l'agence du profil actif pour l'admin, l'agent et le bailleur
  (`resolveAgencyOrNull`, mis en cache pour le rendu) : connaître les modules d'une agence ne coûte
  **aucune requête de plus**.
- `estOuverte` n'est appelée, hors tests, que par `composer-menu.ts`, et `composerMenu` que par
  `AppSidebar` : le menu, « Plus », « Aussi … » et — par leurs plans — les onglets mobiles (TCK-2481,
  lus dans le menu composé) passent par un seul point.
- `Agency` ne porte pas `LogsActivity` : aucun réglage de la fiche d'agence n'est journalisé
  aujourd'hui.

### Décision

**Un admin d'agence `standard` peut masquer, pour le menu de son personnel, des modules pris dans
une liste fermée. C'est un réglage d'AFFICHAGE : aucun droit ne change, aucune page ne cesse d'être
servie, et rien de ce qu'un profil hors personnel ouvre lui-même ne disparaît.**

1. **Stockage** — une clé de `agencies.settings`, `hidden_modules`, déclarée dans `AgencySettings`
   (type liste, défaut `[]`), écrite par `PATCH /api/agencies/{id}` sous `configure`, comme toute
   clé de la fiche. Nom anglais, comme les sept clés existantes. Ni colonne, ni ligne de la table
   `settings` (ADR-0065).
2. **Liste fermée, connue des deux côtés** — `App\Models\Enums\AgencyModule` côté API, qui VALIDE
   (`Rule::enum`, `distinct`, `list`) ; côté front, `MODULES_D_AGENCE` associe chaque code aux
   identifiants du catalogue qu'il retire. Une garde de parité lit l'enum PHP. Sept modules :

   | Code | Destinations retirées |
   |---|---|
   | `commissions` | `commissions` |
   | `inventories` | `etats-des-lieux` |
   | `move_in_follow_up` | `entrees-en-attente` |
   | `provider_book` | `carnet-prestataires` |
   | `calendar` | `calendrier` |
   | `credits` | `credits` |
   | `analytics` | `kpis`, `alertes`, `exports` |

3. **Jamais masquables** : le tableau de bord, la messagerie, les biens, les baux, les paiements, les
   demandes — et, par règle et non par liste, toute destination qui porte un **compteur** (ce qui
   attend ne disparaît pas), toute **page d'agence** (`PAGES_ADMIN` reste son seul juge, ADR-0064 :
   la fiche où l'on démasque ne peut pas se masquer), toute destination **d'écriture** ou jugée **sur
   l'espace**, et toute **action principale** d'une disposition. Une garde l'éprouve.
4. **Portée** — le masquage s'applique à ce qu'un profil **du personnel** (`agent`, `agency_admin`)
   apporte au menu :
   - la disposition, « Plus » et l'action des personas `agent` et `admin-agence` — l'admin compris :
     il voit le menu de son équipe ;
   - le complément « Aussi … » de **tout** persona, puisqu'il porte ce qu'un autre profil de l'espace
     ouvre.

   Il ne touche **jamais** ce que le persona `bailleur`, `locataire`, `client` ou `prestataire` ouvre
   lui-même : un bailleur de l'agence garde ses états des lieux, un locataire les siens (contrainte
   « parcours en cours »). Corollaire assumé : sous son profil d'admin, un admin qui est aussi
   bailleur ne retrouve pas une destination masquée dans « Aussi bailleur » (le complément se juge
   sur l'union, qui ne dit pas QUEL profil ouvre) ; il la retrouve en basculant sur son profil
   bailleur, dont la disposition n'est jamais masquée. Ni `hote` (agence `individual`, sans équipe : l'API refuse la clé,
   `prohibited`, et l'hôte arrange son menu par TCK-2480), ni `plateforme`.
5. **Mécanique** — `ContexteDeMenu.masquees` porte l'ensemble des destinations masquées par l'agence
   (un fait de l'agence, comme `agenceSuspendue`) ; `estOuverte` le refuse ; `composerMenu` ne le
   garde, pour juger le persona, que si le persona est du personnel, et le garde toujours pour juger
   l'espace (« Aussi … »). Une destination masquée est donc traitée comme fermée : elle ne tombe ni
   sous « Plus » ni sous « Aussi … », une épingle (TCK-2480) qui la vise est ignorée, un onglet
   (TCK-2481) aussi, et la bande « À traiter » ne la sonde pas (`countersToPoll` ne lit que le menu).
6. **Hors du menu, rien ne change** : la page masquée reste servie par lien direct, ses gardes et
   l'API ne lisent pas `hidden_modules`, et les tuiles du tableau de bord, les notifications et les
   e-mails continuent d'y mener. La palette (TCK-2482) liste le menu COMPOSÉ, jamais
   `CATALOGUE.filter(estOuverte)` : une garde refuse tout appel à `estOuverte` hors de
   `src/lib/navigation/`.
7. **Écran** — une section « Menu de l'équipe » dans la fiche de l'agence (`/app/agency`), une case
   par module, cochée = affichée ; absente pour une agence `individual`. Le texte dit qu'aucun droit
   ne change et que bailleurs et locataires gardent leur menu.

### Options écartées

- **Une colonne de `agencies`** : une migration et un `down()` pour une liste que le catalogue
  `AgencySettings` sait déjà typer, valider et fusionner clé par clé.
- **Une ligne de la table `settings` (portée `agency`, ADR-0065)** : cette table sert des réglages à
  repli GLOBAL ; « masquer les commissions pour toutes les agences » n'a pas de sens, et la route
  brute n'a pas de règle par clé.
- **Retirer les droits** (le module masqué refuse ses capacités, ou sa page rend 404) : un module
  n'est pas une permission (principe 1) ; on casserait en silence les liens des notifications, des
  e-mails et du tableau de bord, et des flux qui en dépendent (un état des lieux dû par un bail).
- **Valider la seule FORME, comme `preferences.navigation`** (§6) : ici la valeur est partagée par
  toute une équipe et écrite par un seul admin ; un code faux doit rendre 422, pas un réglage sans
  effet (l'esprit d'ADR-0065). La liste est courte et change rarement : la parité est une garde.
- **Choisir n'importe quelle entrée du menu** : exposerait les identifiants internes du catalogue à
  l'API et permettrait de masquer l'indispensable ; les modules sont des lots décidés par le produit.
- **Les réservations, les visites, la maintenance comme modules** : elles arrivent du dehors (client,
  locataire), avec des délais (une réservation en attente expire en 48 h par défaut) — masquer
  l'entrée, c'est rater le travail. D'où la règle « pas de compteur ».
- **Les entrées en attente dans le module des états des lieux** : leur liste suit la checklist
  d'onboarding du locataire (`tenant_onboarding_enabled`), pas les seuls états des lieux.
- **Un menu par membre ou par rôle personnalisé, fixé par l'admin** : la personne arrange son menu
  elle-même (TCK-2480) ; l'admin ne décide que de ce que l'agence n'utilise pas.
- **Masquer aussi pour le bailleur et le locataire de l'agence** : ce ne sont pas des outils de
  l'équipe, et leur parcours en dépend.

### Conséquences

- `AgencySettings` apprend un type `list` (éléments d'un enum, `.*` validé, lecture qui ignore un
  code inconnu) ; `AgencyUpdateRequest` rend la clé `prohibited` pour une agence `individual`.
- L'API connaît désormais les **modules**, pas les personas ni le catalogue : le persona reste un
  concept du front. Ajouter un module touche l'enum, `MODULES_D_AGENCE` et les libellés ; la garde de
  parité rougit si l'un manque (et `web-ci.yml` se déclenche sur l'enum).
- `ContexteDeMenu` gagne `masquees` ; `AppShell` et `AppSidebar` gagnent `modulesMasques` ; le layout
  le lit sur l'agence qu'il lit déjà.
- Un agent qui suit une notification vers une page masquée l'ouvre : c'est voulu.
- Le changement n'est pas journalisé, comme le reste de la fiche (`Agency` sans `LogsActivity`).
- `docs/models-spec.md` §2 et `docs/features.md` (navigation, agence) reçoivent la clé par
  `/sync-specs` après la fusion.
- Coût : ~1 enum, ~40 lignes dans `AgencySettings`, ~60 lignes de navigation pure, une section de
  formulaire, 16 clés de libellé × 3 langues.

## Amendement du 2026-11-10 — l'accueil par persona, « Rapports » à onglets, les dispositions de l'audit

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 4 (b) ; décisions n° 10 (a) et n° 12 (a) ;
  recommandation 2 c de la famille 3 ; compléments du 2026-11-10 : « Aujourd'hui », « Tâches », plus de
  « Tableau de bord » chez l'agent) — modalités : décisions de la session, à revoir.
- **Accompagne** : [ADR-0096](0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md) (l'accueil est
  la journée, « Rapports » est une page).
- **Amende** : le § 1 (le catalogue), la table des modules de l'amendement du 2026-11-05, et son point 6
  (« hors du menu, rien ne change ») pour les seuls onglets de « Rapports ». Les règles de composition (§ 4),
  les préférences (§ 6) et les gardes ne changent pas.
- **Tickets** : TCK-2618 (dispositions, onglets, favoris), TCK-2622 (aiguillage de l'accueil), TCK-2628
  (entrée « Rapports », module `analytics`), TCK-2644 (entrée « Entrées en attente »).

**Contexte.** Relevé sur `dev` (1bce3798a) le 2026-11-10. L'audit de la famille 3
([`03-coque-et-accueil.md`](../qa/audit-ux-2026-11/03-coque-et-accueil.md)) remplace cinq destinations
par une page à onglets, et les décisions du porteur changent les onglets mobiles de trois personas.
Trois des destinations retirées (`kpis`, `alertes`, `exports`) sont exactement celles que masque le module
`analytics`. Sans amendement, le module ne masquerait plus rien.

**Décision.**

1. **Le catalogue.**
   - Il perd `vue-agence`, `statistiques`, `kpis`, `alertes` et `exports`, et gagne `rapports`.
   - Leurs anciennes adresses deviennent des redirections, rangées dans `HORS_MENU` avec leur motif.
   - L'entrée « Rapports » n'est ouverte qu'aux personas qui ont au moins un onglet : admin d'agence, agent,
     bailleur et hôte. Le locataire, le client et le prestataire n'en ont pas
     ([ADR-0096](0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md) § 3).
2. **Les onglets de « Rapports » sont des sous-destinations déclarées** à côté du catalogue, avec leur
   prédicat d'accès. Le test « aucune destination perdue » porte aussi sur eux : une page qu'une persona
   ouvrait avant ce lot reste ouverte, comme entrée ou comme onglet.
3. **Le module `analytics` masque des onglets.** Dans la table des modules, sa ligne devient : onglets
   `exports` et `alertes` de « Rapports », et « Personnaliser les chiffres », l'ancien `kpis` (TCK-2629).
   - **L'entrée « Rapports » reste tant qu'il lui reste un onglet**, et la vue d'ensemble n'est pas
     masquable.
   - Une adresse ancienne qui mène à un onglet masqué mène à la vue d'ensemble, et non à une page vide.
   - C'est la seule exception au point 6 de l'amendement du 2026-11-05 : un onglet de page de navigation
     se masque comme une entrée. Les gardes et l'API ne lisent toujours pas `hidden_modules`.
4. **Le module `move_in_follow_up` n'a plus de destination.** L'entrée « Entrées en attente » quitte le
   menu, et sa route redirige vers l'onglet « En attente du locataire » de la liste des baux (TCK-2644).
   - Le module quitte la liste fermée (`AgencyModule`, `MODULES_D_AGENCE`), dans le ticket qui retire
     l'entrée.
   - Une valeur déjà enregistrée dans `hidden_modules` est ignorée à la lecture : c'est la règle « lecture
     qui ignore un code inconnu » de l'amendement du 2026-11-05.
   - La case disparaît de la section « Menu de l'équipe ».
5. **Les dispositions.**
   - **Agent** :
     - la destination de l'accueil se libelle « Aujourd'hui » (icône soleil) et ouvre la colonne : « Aujourd'hui · Messagerie · Tâches » ;
     - l'entrée « Tableau de bord » disparaît, puisque c'est la même destination, sous un libellé propre à la persona (§ 3) ;
     - « Mes tâches » devient « Tâches » ;
     - onglets mobiles : « Aujourd'hui · Demandes · Clients · Messages » ;
     - « Visites » quitte la barre et reste dans « Prospection ».
   - **Admin d'agence** : onglets « Accueil · Argent · Biens · Messages ». « Argent » mène à
     `/app/agency/finances`. Les demandes restent au menu.
   - **Bailleur** : onglets « Accueil · Biens · Loyers · Messages ». L'entrée « Finances » de « Mon
     patrimoine » prend le même mot, **« Loyers »**, décidé par le porteur le 2026-11-10
     ([ADR-0100](0100-une-page-paiements-par-public.md) § 3).
   - **Partout**, le libellé d'onglet est « Messages », et l'onglet actif porte son icône en couleur
     primaire. L'hôte, le prestataire, le locataire et le client gardent leurs onglets.
6. **Les épingles survivent.** Une épingle sur « Tableau de bord » chez l'agent vise la même destination,
   désormais « Aujourd'hui ». Une épingle sur une entrée retirée (`kpis`, …) est ignorée, selon la règle
   du § 4 sur l'identifiant inconnu, et l'utilisateur épingle « Rapports ».
7. **L'accueil se choisit par persona** (TCK-2622), par la même résolution que le menu (§ 2). La persona
   reste un concept du front.

**Conséquences.**

- Les tests qui figent les dispositions (`dispositions-validees.test.ts`) changent **exprès** pour
  l'agent, l'admin et le bailleur. L'écart est écrit dans TCK-2618.
- La table des modules perd une ligne et en change une. La garde de parité entre l'enum PHP et
  `MODULES_D_AGENCE` rougit si un seul côté change.
- Le catalogue gagne la notion de sous-destination pour une seule page. Si une autre page à onglets la
  demande un jour, elle suivra la même forme.

**Application.** `src/lib/navigation/` : catalogue, dispositions et sous-destinations de « Rapports ».
`App\Models\Enums\AgencyModule` sans `move_in_follow_up`. Gardes :

- « aucune destination perdue », étendu aux onglets ;
- « module `analytics` masqué : Exports et Alertes absents, Rapports présent » ;
- « une valeur `move_in_follow_up` enregistrée est ignorée » ;
- dispositions par persona.

