---
id: TCK-2127
title: "Une garde exige au dictionnaire une clé par cas pour chaque statut de l'API qu'un écran traduit, et pour les réglages et décisions de modération"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-219--clés-next-intl-bâties-sur-une-valeur-venue-de-lapi"
tags: [front, garde, i18n, statuts, pistes]
---

## Contexte

Réf : **P219.03** du fichier de pistes, `retenu · autonome` (A5 : une garde ajoutée, sans seuil à
resserrer). `check-status-unions.mjs` tient la chaîne enum de l'API → union du front, et `tsc` tient
union → table de tons ; rien ne tient union → dictionnaire. Un cas ajouté à un enum, à son union et
à sa table de tons, mais pas au dictionnaire, passe toutes les gardes et s'affiche en clé brute (ou
lève `MISSING_MESSAGE` hors production). Même chose pour deux listes de l'API qui ne sont pas des
enums : les clés d'`EditablePlatformSettings::all()` et `UnifiedModerationService::DECISIONS`.

Hypothèse (mode sans humain) : la garde vérifie `fr.json` seul ; la parité `en`/`wo` est déjà
tenue par `check:i18n`.

## Objectif utilisateur

Un statut, un réglage ou une décision que l'API ajoute ne s'affiche jamais en clé brute dans la
console : la garde le voit avant la fusion.

## Contrat de données

Aucun changement d'API ni d'écran.

## Delta à produire

- [x] `scripts/check-status-labels.mjs` : une table `LIBELLES` (enum `*Status` de l'API → chemins
  du dictionnaire qu'un écran lit, avec le fichier qui les lit) et une table `SANS_LIBELLE`
  (enum → raison), bilatérales : chaque enum `*Status` est dans l'une des deux, toute entrée
  désigne un enum existant, chaque chemin porte une clé `fr` par cas, et le fichier lecteur lit
  encore ce chemin.
- [x] La même règle pour les clés d'`EditablePlatformSettings::all()`
  (`superAdmin.platformSettings.keys.<clé>.label` et `.description`) et pour
  `UnifiedModerationService::DECISIONS`
  (`superAdmin.moderation.decisionsByType.<type>.<décision>`).
- [x] Cas d'épreuve joués à chaque invocation, comme `check-status-unions.mjs`.

## Critères d'acceptation

- [x] AC1 — `node scripts/check-status-labels.mjs` est vert sur l'arbre.
- [x] AC2 — Retirer `commissions.status.due` des trois dictionnaires le fait rougir, alors que
  `check-status-unions` et `check:i18n` restent verts.
- [x] AC3 — Retirer une clé de réglage ou une décision de modération du dictionnaire le fait rougir.

## Reste à faire

- Brancher `scripts/check-status-labels.mjs` dans `.github/workflows/repo-ci.yml`, avec
  `check-status-unions.mjs` (TCK-1834, « Reste à faire ») : chemin fermé à l'implémenteur.

## Hors périmètre

- Le typage des messages par `AppConfig` de next-intl (V6 : contrat des ~670 fichiers qui
  traduisent).
- Les motifs de sonde de `HealthcheckService` (P219.02, à valider).
- Les espaces du dictionnaire auxquels il manque déjà un cas et que l'écran lit derrière `t.has()`
  (ex. `deleted` sous `admin.users.status`) : ils ne sont pas dans `LIBELLES`, et leur donner un
  libellé est un texte neuf.

## Notes d'implémentation

- Avant la garde : retirer `commissions.status.due` des trois dictionnaires laissait
  `check-status-unions` et `check-i18n` verts (sortie 0 tous deux).
- Ablation : la même suppression fait rougir la garde (« le cas « due » de l'API n'a pas de
  libellé fr ») ; de même `superAdmin.platformSettings.keys.boost.reserved_top_results.description`
  et `superAdmin.moderation.decisionsByType.suspected_duplicate.hide`. Retirer le contrôle des cas
  absents dans `juger()` fait échouer deux cas d'épreuve.
- Les clés de réglage contiennent des points (`currency.default`) : next-intl les lit en
  profondeur, la garde aussi (`auChemin`).
- `UserStatus`, `TaskStatus`, `AgencyAdminProfileStatus` sont dans `SANS_LIBELLE` : aucun espace
  lu ne porte tous leurs cas aujourd'hui, et les compléter serait un texte neuf.
