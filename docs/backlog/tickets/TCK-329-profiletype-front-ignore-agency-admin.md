---
id: TCK-329
title: "Le type `ProfileType` du front ignore `agency_admin` — la barre supérieure affiche « undefined · <agence> »"
status: doing
phase: P2
family: front
estimate: S
wave: null
created: 2026-08-17
updated: 2026-08-20
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#règle-5--profil--rôle
    - docs/models-spec.md#règle-4--active-profile-context
tags: [front, profils, rbac, i18n, bug, dette]
---

## Objectif utilisateur

Qu'un administrateur d'agence lise le nom de son rôle dans la barre supérieure, et non le mot
`undefined`.

## Contrat de données

Aucun endpoint à créer. `GET /api/me/profiles` (Règle 4) rend déjà tout ce qu'il faut ; c'est le
**typage côté front** qui a cessé de suivre ce que l'API émet.

| Source | Types de profil |
|---|---|
| `ActiveProfileResolver::TYPE_MAP` (back) | `agency_admin`, `owner`, `agent`, `broker`, `service_provider` — **5** |
| `ProfileType` (`takussan-web/src/types/profile.ts:1`) | `owner`, `agent`, `broker`, `service_provider` — **4** |

`agency_admin` manque côté front. La spec, elle, l'énumère bien (Règle 5, « Inventaire des profils
porteurs de rôle ») : c'est le front qui a dérivé, pas la spec qui est muette.

## Direction UX / Artistique

Aucune refonte. Le libellé manquant doit s'aligner sur les quatre voisins déjà présents
(`Propriétaire`, `Agent`, `Courtier`, `Prestataire`) — un mot, même registre.

⚠️ Ces cinq libellés sont **codés en dur en français** dans le composant, alors que le principe
non négociable n°5 dit que le front possède le texte affiché *via next-intl*. Passer les cinq par
next-intl est une bonne occasion, **mais c'est un choix à assumer** : la portée du ticket est la
correction du `undefined`. Cf. « Hors périmètre ».

## Contraintes strictes (métier)

- **Le correctif ne doit pas se limiter à ajouter une clé.** Un `Record<ProfileType, string>`
  complet aujourd'hui redeviendra incomplet au prochain type ajouté côté back, et `tsc` restera
  muet pour la même raison qu'aujourd'hui (cf. ⑵). Le ticket doit fermer le mode de panne, pas
  seulement l'occurrence.
- **`agency_admin` est un profil de plein droit** (Règle 5 : `AgencyAdminProfile ↔ rôle
  agency_admin, scope agency`). Il ne s'agit pas d'un cas limite à filtrer.
- Aucun changement de contrat HTTP : le back émet déjà la bonne valeur.

## Delta à produire

- [x] `takussan-web/src/types/profile.ts` : ajouter `agency_admin` à `ProfileType`.
- [x] `takussan-web/src/components/profile/ProfileBadge.tsx` : entrées `agency_admin` dans
      `TYPE_LABEL` **et** `TYPE_COLOR` (les deux sont des `Record<ProfileType, …>`, les deux ont le
      trou).
- [x] Rendre le trou **inexprimable** plutôt que comblé une fois : soit un repli explicite dans
      `profileShortLabel`/`profileTypeLabel` (ne jamais interpoler une valeur potentiellement
      absente dans un gabarit), soit une garde qui confronte `ProfileType` à
      `ActiveProfileResolver::TYPE_MAP`. Les deux valent mieux qu'aucune — la décision revient à
      l'implémenteur, cf. ⑵ et ⑶.
- [x] Tests : un cas par type de profil sur `profileShortLabel` — dont `agency_admin` avec et sans
      agence — et un cas sur `ProfileSwitcher` mono-profil vérifiant que le libellé rendu ne
      contient pas `undefined`.

## Critères d'acceptation

- [x] AC1 — Connecté avec un profil `agency_admin` rattaché à une agence, la barre supérieure
      affiche `<libellé> · <nom de l'agence>` et **jamais** `undefined`.
- [x] AC2 — Un profil `agency_admin` **sans** agence chargée rend le seul libellé de type, sans
      séparateur orphelin.
- [x] AC3 — Le regroupement du sélecteur multi-profil (`ProfileSwitcher`) porte un `aria-label`
      lisible pour `agency_admin` — aujourd'hui `profileTypeLabel()` y rend `undefined`.
- [x] AC4 — La pastille de type (`ProfileBadge`, `TYPE_COLOR`) rend une classe valide pour
      `agency_admin`.
- [x] AC5 — Un type de profil ajouté côté back sans son pendant côté front est **signalé** : soit
      par un échec de compilation, soit par une garde, soit par un repli visible. Vérifié par
      ablation — retirer une entrée et constater le signal.

> **Sur quoi chaque case a été cochée — et sur quoi elle ne l'a PAS été.** Aucune case ci-dessus
> ne repose sur une lecture de code : chacune pointe un test **exécuté**, dont le rouge a été
> constaté par ablation (protocole complet dans « Notes d'implémentation »).
>
> | AC | Preuve exécutée | Ce que la preuve ne couvre pas |
> |---|---|---|
> | AC1 | `ProfileBadge.test.tsx` « AC1 » + `ProfileSwitcher.test.tsx` « AC1 » — rendu réel du composant de la barre supérieure sur une réponse `/api/me/profiles` portant `type: 'agency_admin'` | **pas une session navigateur.** C'est le composant qui a été rendu, pas l'écran d'un utilisateur connecté. |
> | AC2 | `ProfileBadge.test.tsx` « AC2 », `it.each` sur les 5 types sans agence : `toBe(profileTypeLabel(type))` et `not.toContain('·')` | — |
> | AC3 | `ProfileSwitcher.test.tsx` « AC3 » — `findByRole('group', { name: 'Administrateur' })` **et** présence de `profile-switcher-item-agency_admin:3` | l'annonce réelle d'un lecteur d'écran n'a pas été écoutée ; c'est l'attribut `aria-label` qui est vérifié. |
> | AC4 | `ProfileBadge.test.tsx`, `it.each` sur les 5 types, variantes `dot` et `pill` : la classe rendue matche `/\bbg-[a-z]+-\d{2,3}\b/` | que la couleur soit **jolie** ou distinguable des quatre autres. |
> | AC5 | trois signaux mesurés : parité rouge (ablation A), `tsc --noEmit` en sortie 2 (ablations A et C), repli rendant `agency_admin · Agence Teranga` au lieu de `undefined · …` | rien ne rejoue la garde de parité **en production** ; elle tient en CI (`web-ci.yml`) et en local. |

## Hors périmètre

- **Le passage des cinq libellés à next-intl.** Réel (principe n°5, dette D-24), mais c'est un
  autre delta : il touche `TYPE_LABEL`, les trois dictionnaires et le cliquet
  `scripts/check-i18n.mjs`. Le faire ici masquerait la correction sous une refonte.
- Toute modification du contrat de `GET /api/me/profiles` ou de `ActiveProfileResolver` — le back
  est juste.
- Le comportement du sélecteur pour les profils `platform` / super-admin (`ProfileSwitcher` a déjà
  sa branche « Admin Takussan » quand la liste est vide).
- La question ouverte du rôle d'agence d'un prestataire (TCK-315).

---

## Où c'est vu, et d'où ça vient

**Vu le 2026-08-17**, barre supérieure de `/admin/*`, connecté en `agency_admin` d'une agence
nommée « Agence Teranga » : `undefined · Agence Teranga`.

**Chaîne complète**, lue dans le code — ce n'est pas une hypothèse :

1. `ProfileResource` (back) émet `'type' => $alias`, où `$alias` vient de
   `ActiveProfileResolver::aliasFor()`, donc de `TYPE_MAP` — qui contient bien `agency_admin`.
2. `ProfileType` (`src/types/profile.ts:1`) ne déclare que **quatre** de ces cinq valeurs.
3. `TYPE_LABEL: Record<ProfileType, string>` (`ProfileBadge.tsx:4-9`) n'a donc pas de clé
   `agency_admin`.
4. `profileShortLabel` (`ProfileBadge.tsx:22-26`) :

```ts
const type = TYPE_LABEL[profile.type];              // undefined
if (profile.agency?.name) return `${type} · ${profile.agency.name}`;
```

La garde porte sur `profile.agency?.name`, **jamais sur `type`**. Le gabarit stringifie `undefined`
et l'affiche.

## ⑴ La portée dépasse la chaîne visible

Le même trou est lu à trois autres endroits, et deux ne se voient pas à l'œil :

- `profileTypeLabel()` (`ProfileBadge.tsx:18-20`) rend `undefined`, et il alimente
  `aria-label={profileTypeLabel(type)}` sur le regroupement du sélecteur
  (`ProfileSwitcher.tsx:117`) → **un lecteur d'écran annonce « undefined »**.
- `TYPE_COLOR` (`ProfileBadge.tsx:11-16`) rend `undefined` → classe absente sur la pastille.
- `profileShortLabel` sans agence rend `undefined` **seul**, sans séparateur pour attirer l'œil.

Corriger la seule ligne visible laisserait les deux autres.

## ⑵ Pourquoi TypeScript n'a rien vu — et c'est le vrai défaut

`Record<ProfileType, string>` **est** exhaustif : `tsc` vérifie qu'il couvre les quatre membres de
l'union, et il les couvre. L'erreur n'est pas dans la table, elle est dans l'union — `ProfileType`
est une liste **écrite à la main** qui prétend décrire un format de fil, et qui a cessé de le
faire. Le compilateur valide fidèlement une carte qui ne correspond plus au terrain.

C'est exactement le motif que ce dépôt a déjà payé ailleurs : `INDEX.md` maintenu à la main (D-15),
la liste des modèles indexables (D-44), `models-spec.md` (D-18). *Une liste écrite à la main est
juste le jour où on l'écrit.* La différence ici est qu'elle porte l'autorité d'un type.

## ⑶ Deux réponses possibles, et ce qu'elles couvrent

Ni l'une ni l'autre n'est prescrite — c'est une décision d'implémentation, mais elle doit être
prise en connaissance de cause :

| Réponse | Ce qu'elle attrape | Ce qu'elle laisse passer |
|---|---|---|
| **Repli explicite** dans `profileShortLabel`/`profileTypeLabel` (jamais d'interpolation d'une valeur absente) | tout type inconnu, y compris ceux à venir — le pire cas devient un libellé brut, pas `undefined` | le trou reste : personne n'apprend qu'il faut traduire le nouveau type |
| **Garde** confrontant `ProfileType` à `TYPE_MAP` (`scripts/check-*.mjs`, sur le modèle de `check-models-spec.mjs`) | la dérive elle-même, au moment où elle est introduite | rien en production si la garde n'est pas rejouée |

Les deux ensemble ferment le mode de panne : la garde empêche la dérive, le repli garantit qu'une
dérive non attrapée reste lisible. **AC5 n'exige qu'un signal, pas une forme précise.**

## ⑷ Ce que je n'ai pas vérifié

- **Depuis quand.** Pas daté : ni `git log` ni `git blame` n'ont été consultés sur
  `src/types/profile.ts`. La forme actuelle de `TYPE_MAP` date de TCK-138→TCK-141 (Règle 4) et
  `agency_admin` de TCK-271 (`models-spec.md:276`), mais **l'ordre d'apparition des deux listes
  n'a pas été établi**.
- **Les autres consommateurs de `ProfileType`.** Seuls `ProfileBadge` et `ProfileSwitcher` ont été
  lus. Un `grep -rn "ProfileType\|profile.type" takussan-web/src` fait partie du delta implicite —
  il peut révéler d'autres tables indexées par ce type.
- **Le rendu exact pour `broker`.** `BrokerProfile` est dans `TYPE_MAP` et dans `ProfileType` ; il
  n'a pas été observé à l'écran.

## Notes d'implémentation

_Implémenté le 2026-08-20. Machine 8 cœurs, `load average` 5-9, services natifs (MySQL 3306,
Meilisearch 7700, Redis 6379). Toutes les sorties ci-dessous ont été **exécutées**, aucune n'est
lue._

### La prémisse tient — mesurée, pas déduite du ticket

Le ticket datait du 2026-08-17 ; son constat a été re-mesuré avant d'écrire une ligne, en
interrogeant la constante PHP elle-même plutôt qu'un docblock :

```
$ php -r 'require "vendor/autoload.php"; echo implode("\n", array_keys(App\Services\Profiles\ActiveProfileResolver::TYPE_MAP)), "\n";'
agency_admin
owner
agent
broker
service_provider

$ sed -n 1p takussan-web/src/types/profile.ts
export type ProfileType = 'owner' | 'agent' | 'broker' | 'service_provider';
```

**5 côté back, 4 côté front.** `MeProfilesController::index()` charge bien
`agencyAdminProfiles.agency` et les émet via `ProfileResource` (`'type' => $alias`) : le trou est
entièrement côté front, le contrat HTTP n'a pas bougé.

### Ce que le `grep` a révélé en plus — la portée dépassait les trois points du ticket

Le ticket listait trois consommateurs (`profileShortLabel`, `profileTypeLabel`, `TYPE_COLOR`) et
notait, en ⑷, que le `grep -rn "ProfileType\|profile.type"` restait à faire. Il a été fait, et il a
sorti **un quatrième défaut, invisible à l'œil et plus grave que le libellé** :

`ProfileSwitcher.tsx:20` — `const TYPE_ORDER: ProfileType[] = ['owner', 'agent', 'broker',
'service_provider']` — n'omettait pas seulement un intitulé. `grouped` n'initialise la `Map` que sur
`TYPE_ORDER`, puis fait `const list = map.get(p.type); if (list) list.push(p)`. Un profil
`agency_admin` tombait donc dans le `undefined` avalé par le `if` : **il était retiré du menu sans
aucune trace**. Un administrateur d'agence possédant aussi un profil owner ne pouvait plus revenir
sur son profil admin — ce n'est pas un défaut d'affichage, c'est une fonction perdue.

`MyProfilesSection.tsx` portait par ailleurs un commentaire qui se disait « *Mirror the
ProfileSwitcher's filter* ». Il est devenu faux avec AC3 : le commentaire a été corrigé pour dire
que les deux listes divergent **volontairement** (les cartes KYC gardent leur filtre, le sélecteur
non), plutôt que de laisser un lecteur en déduire l'inverse.

### Le correctif, et les TROIS gardes qui ferment le mode de panne

Le ticket (⑶) laissait le choix entre « repli » et « garde ». Les deux ont été posés, plus un
troisième niveau que la refonte de l'union rend gratuit :

| Niveau | Où | Attrape |
|---|---|---|
| 1. Parité | `src/types/__tests__/profile-types.parity.test.ts` | la DÉRIVE : le test lit `ActiveProfileResolver.php` sur le disque et compare ses clés `TYPE_MAP` à `PROFILE_TYPES`. Rejoué par `web-ci.yml` à chaque PR. |
| 2. Compilation | `Record<ProfileType, …>` dans `ProfileBadge` (×2), `ProfileSwitcher` (`TYPE_RANK`), `MyProfilesSection` (`KYC_FIELDS`) | l'OUBLI : `PROFILE_TYPES` gagne un membre, `tsc --noEmit` sort en 2 tant que les quatre tables ne suivent pas. |
| 3. Repli | `profileTypeLabel` / `profileTypeColor` | ce que les deux premiers ratent, **en production** : le pire cas devient le jeton brut (`agency_admin · Agence Teranga`), lisible et diagnosticable, jamais `undefined`. |

`ProfileType` n'est plus une union écrite à la main : elle est **dérivée** de
`PROFILE_TYPES` (`as const`), qui est la seule liste et la seule chose que le test de parité
confronte au PHP.

⚠️ **Ce que la garde de parité NE prouve PAS** : que chaque alias soit bien libellé. Elle vérifie
que les deux ensembles coïncident, rien de plus — chercher un jeton ne mesure pas une propriété
(dette D-23). La justesse des libellés est portée par `ProfileBadge.test.tsx`.

### Ablation — protocole joué, sorties collées

Fichiers corrigés sauvegardés, correctif retiré, test relancé, correctif restauré, test relancé.

**État corrigé (avant tout retrait)** — `npx vitest run src/types/__tests__/profile-types.parity.test.ts src/components/profile/__tests__/ProfileBadge.test.tsx src/components/profile/__tests__/ProfileSwitcher.test.tsx` :

```
 Test Files  3 passed (3)
      Tests  35 passed (35)
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

**Ablation A — retrait de `'agency_admin',` de `PROFILE_TYPES`** (le correctif de l'union) :

```
 FAIL  …/profile-types.parity.test.ts > le front déclare exactement les alias que le back émet
AssertionError: expected [ 'agent', 'broker', 'owner', …(1) ] to deeply equal [ 'agency_admin', 'agent', …(3) ]
 FAIL  …/profile-types.parity.test.ts > n'oublie pas agency_admin — l'occurrence qui a motivé la garde
AssertionError: expected [ 'owner', 'agent', 'broker', …(1) ] to include 'agency_admin'
 FAIL  …/ProfileSwitcher.test.tsx > AC3 — le regroupement agency_admin existe et porte un aria-label lisible
      Tests  3 failed | 27 passed (30)
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=2      (7 erreurs)
```

**Ablation B — retrait du seul repli `?? String(type)` de `profileTypeLabel`** :

```
 FAIL  …/ProfileBadge.test.tsx > profileTypeLabel > replie sur la valeur brute pour un type inconnu du front
AssertionError: expected undefined to be 'notaire' // Object.is equality
      Tests  1 failed | 26 passed (27)
```

**Ablation C — `agency_admin` GARDÉ dans `PROFILE_TYPES`, son entrée retirée de `TYPE_LABEL`.**
C'est l'ablation la plus parlante : elle montre les trois niveaux à l'œuvre en même temps.

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
src/components/profile/ProfileBadge.tsx(19,7): error TS2741: Property 'agency_admin' is missing in type
  '{ owner: string; agent: string; broker: string; service_provider: string; }' but required in type
  'Record<"agency_admin" | "owner" | "agent" | "broker" | "service_provider", string>'.
tsc exit=2

 FAIL  …/ProfileBadge.test.tsx > AC1 — agency_admin avec agence rend le libellé, jamais undefined
AssertionError: expected 'agency_admin · Agence Teranga' to be 'Administrateur · Agence Teranga'
 FAIL  …/ProfileSwitcher.test.tsx > AC1 — mono-profil agency_admin : le libellé ne contient jamais « undefined »
AssertionError: expected 'agency_admin · Agence Teranga' to contain 'Administrateur · Agence Teranga'
 FAIL  …/ProfileSwitcher.test.tsx > AC3 — le regroupement agency_admin existe et porte un aria-label lisible
      Tests  3 failed | 30 passed (33)
```

Noter la valeur observée : `'agency_admin · Agence Teranga'`, **et non `'undefined · Agence
Teranga'`**. C'est le repli du niveau 3, mesuré en situation : même avec les deux autres gardes
retirées, l'écran reste lisible.

**Après restauration** (empreintes md5 identiques aux copies de référence) :

```
 Test Files  11 passed (11)
      Tests  71 passed (71)      # src/types/__tests__/ + tout src/components/profile/__tests__/
$ npx tsc --noEmit ; echo "tsc exit=$?"      → 0
$ npm run lint     ; echo "exit=$?"          → 0
$ npm run check:i18n ; echo "exit=$?"        → 0
$ for g in scripts/check-*.mjs; do node "$g" >/dev/null 2>&1 || echo "✗ $g"; done   → aucune sortie (22/22)
```

### Le libellé : « Administrateur », et le choix a été REFUSÉ une première fois

Premier essai : **« Admin agence »**, par cohérence avec la console super-admin
(`src/app/(super-admin)/super-admin/users/page.tsx:47`, `{ value: 'agency_admin', label: 'Admin
agence' }`). `npm run check:i18n` l'a refusé :

```
✗ 1 écart(s) i18n :
  · src/components/profile/ProfileBadge.tsx : 2 libellé(s) en dur pour un plafond de 1 — le compte a MONTÉ.
```

Le cliquet par fichier de `scripts/i18n-baseline.json` compte tout littéral **accentué ou de deux
mots** : `Propriétaire` était la seule occurrence comptée des quatre libellés existants, « Admin
agence » en aurait fait une seconde. Relever la ligne de base aurait désarmé un cliquet pour faire
passer un ajout — exactement ce contre quoi il existe.

Retenu : **« Administrateur »**, et pas pour contourner le compteur. C'est le mot que le
dictionnaire du dépôt emploie déjà pour cette même valeur de fil
(`src/messages/fr.json` → `admin.roles.assign.profile_types.agency_admin` = `administrateur`), et
c'est « un mot, même registre » que ses quatre voisins, ce que la section « Direction UX » demandait.

⚠️ **À dire franchement** : « Administrateur » passe le cliquet parce qu'il est d'un seul mot et
sans accent — c'est-à-dire par la LIMITE de l'heuristique, pas parce qu'il serait moins « en dur ».
Les cinq libellés de `TYPE_LABEL` restent une violation du principe non négociable n°5 (dette D-24,
lot TCK-292). Le hors-périmètre du ticket est respecté, il n'est pas résolu.

### Écart repéré, NON corrigé (hors périmètre)

`agency_admin` porte désormais **trois** libellés français différents dans le front :

| Fichier | Table | Libellé |
|---|---|---|
| `components/profile/ProfileBadge.tsx` | `Record<ProfileType, …>` | `Administrateur` ← ce ticket |
| `components/profile/ProfileHeader.tsx:25` · `ProfileAdminSection.tsx:15` | `Record<UserRole, …>` | `Admin agence` |
| `app/(super-admin)/super-admin/users/page.tsx:47` | filtre de liste | `Admin agence` |

Les deux dernières sont indexées par `UserRole`, une union **différente et complète** : ce n'est
pas le mode de panne de ce ticket, et les unifier ferait monter le cliquet i18n des fichiers
concernés. C'est un lot pour TCK-292 (passage à next-intl), pas un delta à glisser ici.

### Ce qui reste ouvert dans le ⑷ du ticket

- **« Depuis quand »** : toujours non daté — `git log` / `git blame` sur `src/types/profile.ts`
  n'ont pas été consultés. Sans conséquence sur le correctif.
- **`broker` à l'écran** : toujours pas observé en navigateur. Il est en revanche couvert par les
  `it.each(PROFILE_TYPES)` de `ProfileBadge.test.tsx` (libellé, couleur, forme courte avec et sans
  agence), ce qui n'est pas la même preuve — c'est une preuve de rendu, pas une preuve d'usage.
- **`PlatformProfile`** existe dans `app/Models/Profiles/` mais **n'est PAS dans `TYPE_MAP`** :
  `aliasFor()` lèverait sur lui. Il ne franchit donc jamais le fil comme `type`, et son absence de
  `PROFILE_TYPES` est correcte — c'est la branche « Admin Takussan » du sélecteur, explicitement
  hors périmètre.

## Vérification adverse (2026-08-20) — deux défauts trouvés et corrigés

Les trois ablations du rapport ont été **rejouées à l'identique** par un second agent (A : 3 échecs
/ 27 passés + `tsc` en 2 avec 7 erreurs ; B : 1 échec sur le repli ; C : 3 échecs + TS2741, valeur
observée `agency_admin · Agence Teranga`). Les empreintes md5 des trois fichiers corrigés sont
identiques avant et après. Deux ablations supplémentaires ont été jouées, et **deux défauts en sont
sortis** :

1. **La garde de parité n'était pas déclenchée par le côté qu'elle surveille.** Elle lit
   `takussan-api/app/Services/Profiles/ActiveProfileResolver.php`, mais elle vit dans la suite
   vitest, que `web-ci.yml` ne déclenche que sur `takussan-web/**`. Une PR qui ajoute un type de
   profil **uniquement côté back** — exactement la dérive visée par AC5 — ne faisait donc tourner
   aucune garde. `web-ci.yml` déclenche désormais aussi sur ce fichier PHP, aux deux événements.
   C'est la règle déjà écrite en tête de `repo-ci.yml` : *les deux côtés qu'une garde compare
   doivent la déclencher.*
2. **L'assertion d'AC4 ne distinguait pas une couleur déclarée d'un repli.** Ablation : retirer la
   seule entrée `agency_admin` de `TYPE_COLOR` laissait les 27 cas de `ProfileBadge.test.tsx`
   **verts** (le repli `bg-stone-100` satisfait `/\bbg-[a-z]+-\d{2,3}\b/`) ; `tsc` était le seul
   à rougir. Deux cas ont été ajoutés — aucun type déclaré n'utilise le repli, et les couleurs sont
   deux à deux distinctes — et la même ablation les fait rougir. 29 cas au lieu de 27.

Sens de la dérive vérifié **dans les deux directions** : simuler l'ajout d'un type
(`'notaire'` dans `PROFILE_TYPES`) fait rougir la parité **et** casse `tsc` sur les quatre
`Record<ProfileType, …>` (`ProfileBadge` ×2, `ProfileSwitcher`, `MyProfilesSection`).

Ce qui reste **non prouvé** et l'était déjà : AC1/AC3 au niveau composant seulement (aucune session
navigateur, aucun lecteur d'écran écouté), et la suite front entière non jouée.
