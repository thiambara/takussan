# ADR-0089 — Le menu de `/app` se dérive du profil actif : un catalogue des destinations, une disposition par persona, une composition pure

- **Statut** : Accepté le 2026-11-05 par le porteur (décisions de la session, une par une)
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
