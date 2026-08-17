---
id: TCK-329
title: "Le type `ProfileType` du front ignore `agency_admin` — la barre supérieure affiche « undefined · <agence> »"
status: todo
phase: P2
family: front
estimate: S
wave: null
created: 2026-08-17
updated: 2026-08-17
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

- [ ] `takussan-web/src/types/profile.ts` : ajouter `agency_admin` à `ProfileType`.
- [ ] `takussan-web/src/components/profile/ProfileBadge.tsx` : entrées `agency_admin` dans
      `TYPE_LABEL` **et** `TYPE_COLOR` (les deux sont des `Record<ProfileType, …>`, les deux ont le
      trou).
- [ ] Rendre le trou **inexprimable** plutôt que comblé une fois : soit un repli explicite dans
      `profileShortLabel`/`profileTypeLabel` (ne jamais interpoler une valeur potentiellement
      absente dans un gabarit), soit une garde qui confronte `ProfileType` à
      `ActiveProfileResolver::TYPE_MAP`. Les deux valent mieux qu'aucune — la décision revient à
      l'implémenteur, cf. ⑵ et ⑶.
- [ ] Tests : un cas par type de profil sur `profileShortLabel` — dont `agency_admin` avec et sans
      agence — et un cas sur `ProfileSwitcher` mono-profil vérifiant que le libellé rendu ne
      contient pas `undefined`.

## Critères d'acceptation

- [ ] AC1 — Connecté avec un profil `agency_admin` rattaché à une agence, la barre supérieure
      affiche `<libellé> · <nom de l'agence>` et **jamais** `undefined`.
- [ ] AC2 — Un profil `agency_admin` **sans** agence chargée rend le seul libellé de type, sans
      séparateur orphelin.
- [ ] AC3 — Le regroupement du sélecteur multi-profil (`ProfileSwitcher`) porte un `aria-label`
      lisible pour `agency_admin` — aujourd'hui `profileTypeLabel()` y rend `undefined`.
- [ ] AC4 — La pastille de type (`ProfileBadge`, `TYPE_COLOR`) rend une classe valide pour
      `agency_admin`.
- [ ] AC5 — Un type de profil ajouté côté back sans son pendant côté front est **signalé** : soit
      par un échec de compilation, soit par une garde, soit par un repli visible. Vérifié par
      ablation — retirer une entrée et constater le signal.

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

_(à remplir par implementing-specs)_
