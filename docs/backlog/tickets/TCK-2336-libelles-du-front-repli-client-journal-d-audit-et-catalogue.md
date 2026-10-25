---
id: TCK-2336
title: "Le front rend ses libellés : « Client #<id> » en français, l'événement d'audit traduit plutôt que la description brute, et le catalogue des enums métier par sa clé"
status: done
phase: P2
family: full
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo"
tags: [front, i18n, admin, super-admin, audit, pistes]
---

## Objectif

Le principe n° 5 (« le front possède le texte affiché ») vaut pour trois écrans de plus : le choix
du locataire d'un bail, les journaux d'audit de l'agence et de la console, et le catalogue des
enums métier de la console.

## Contexte

Réfs : **P06.06**, **P06.09** et **P06.12** du fichier de pistes, toutes `validé`.

- `lease.form.customerFallback` valait « Customer #{id} » en `fr` (P06.06).
- Le journal d'audit de l'agence affichait la description brute dans une colonne à part, la console
  affichait `description ?? event`, `event` brut ou `event` puis `description` : l'API écrit ses
  descriptions en français, en anglais ou en code (P06.09).
- Le catalogue des enums métier affichait le `name` et la `description` que l'API écrit en
  français, dans les trois langues (P06.12).

## Décision du porteur

- P06.06 :

  > validation du porteur (2026-10-25) : `lease.form.customerFallback` traduit en français ; reste : relecture wolof et cliquet wo == fr, à la levée de la pause du wolof

- P06.09 :

  > validation du porteur (2026-10-25) : la colonne du journal d'audit affiche l'événement traduit (`admin.audit.events.*`), avec repli sur la description brute pour un événement sans clé ; la description reste dans l'export

- P06.12 :

  > validation du porteur (2026-10-25) : l'API émet l'identifiant stable de chaque entrée du catalogue super-admin et le front rend `admin.businessEnums.<id>.name/description` ; `name` reste dans la réponse, en repli et pour l'objet de courriel

## Reste à faire

- P06.06 : relecture wolof et cliquet wo == fr, à la levée de la pause du wolof.
- P06.12 : les autres catalogues que cite la piste, les événements de notification
  (`EditableNotificationEvents`, écran `notification-templates.tsx`) et les champs de
  `MailProvider`, que la décision ne nomme pas.

## Hypothèses

- **P06.06** : « Client #{id} », la forme des replis voisins (« Bail #{id} », « Demande #{id} »).
  `en` garde « Customer #{id} » ; la valeur `wo`, anglaise, n'est pas touchée (pause du wolof).
- **P06.09, « la colonne »** : une seule colonne porte l'événement, sur chaque écran.
  - Journal de l'agence (`AuditTrail`) : la pastille « Action » rend le libellé, et la colonne
    « Description » quitte l'écran. Pour un événement qui a sa clé, l'API écrit une description qui
    répète le code (`->log('role_assigned')`) ou de l'anglais (`Exported audit trail`) ; pour un
    événement sans clé, la description est le libellé.
  - Console : la colonne « Événement » de `CrossTenantAuditTable`, l'activité récente de l'accueil
    et l'activité de la fiche utilisateur, qui perd sa seconde ligne (la description).
  - Le repli : l'événement traduit, sinon la description brute, sinon la valeur d'API, sinon le
    repli propre à l'écran (`—`, « Événement sans libellé », « Activité »). Aucune entrée n'est
    cachée.
  - Aucun libellé neuf : les treize clés `admin.audit.events.*` existantes. Les autres événements
    se lisent par leur description, comme la décision le prévoit.
  - L'export, produit par l'API, ne change pas.
- **P06.12** : l'API émettait déjà `key` (`BusinessEnumService::get`), l'identifiant de
  `EditableBusinessEnums::all()`. Le côté API se réduit à un test qui épingle ce contrat ; `name` et
  `description` restent dans la réponse. Le front lit `admin.businessEnums.<key>.name/description`,
  et retombe sur le `name` et la `description` de l'API pour une clé que le dictionnaire ne connaît
  pas. Les valeurs `fr` sont celles de l'API, `en` est neuf, `wo` = `fr`.
- **L'espace `admin` entre dans la frontière `(super-admin)/super-admin`** : les écrans de la
  console lisent `admin.audit.events` et `admin.businessEnums`. Sa part du dictionnaire passe
  d'environ 40 % à 47,8 %, et son plafond de 46 à 53 % (calcul de `--update` : part arrondie au-dessus,
  plus 5 points). Les plafonds des autres frontières, que `--update` aurait resserrés, sont laissés
  tels quels.

## Delta à produire

- [x] `fr.json` : `lease.form.customerFallback` → « Client #{id} ».
- [x] `src/lib/audit-events.ts` : la liste des événements traduits (sortie d'`AuditTrail`) et
      `libelleEvenementAudit`.
- [x] `AuditTrail`, `CrossTenantAuditTable`, `ConsoleRecentActivity`, `UserActivityTimeline` :
      l'événement traduit, avec repli sur la description ; la colonne « Description » d'`AuditTrail`
      retirée, et sa clé `admin.audit.columns.description` dans les trois langues.
- [x] `admin.businessEnums.<key>.name/description` (`fr`, `en`, `wo` = `fr`) et `business-enums.tsx`.
- [x] `src/i18n/namespaces.json` : `admin` dans la frontière super-admin.
- [x] Test d'API qui épingle `key`, `name` et `description` de `GET /api/admin/enums`.

## Critères d'acceptation

- [x] AC1 (P06.06) — Un locataire sans nom ni contact se propose « Client #7 », sans « Customer ».
- [x] AC2 (P06.09) — Journal de l'agence : `agent_suspended` se lit « Agent suspendu », un
      événement sans clé se lit par sa description, et sans description par sa valeur d'API ; la
      colonne « Description » n'existe plus.
- [x] AC3 (P06.09) — Console : la colonne « Événement », l'activité récente et la fiche utilisateur
      rendent l'événement traduit, ou la description pour un événement sans clé, jamais le code brut
      d'un événement qui a sa clé.
- [x] AC4 (P06.12) — `GET /api/admin/enums` émet, pour chaque entrée, `key` (dans l'ordre de
      `EditableBusinessEnums::all()`), `name` et `description`.
- [x] AC5 (P06.12) — En anglais, la liste et la fiche d'un enum connu rendent « Property types » et
      sa description anglaise ; une clé inconnue garde le nom et la description de l'API.

## Notes d'implémentation

- Ablations, chacune remise :
  - `customerFallback` remis à « Customer #{id} » → 1 rouge (AC1) ;
  - chaque composant remis à `HEAD` : `AuditTrail` → 2 rouges, `ConsoleRecentActivity` → 1,
    `CrossTenantAuditTable` → 1, `user-detail` → 1 ; `libelleEvenementAudit` sans la traduction → 6
    rouges sur les 42 tests des sept fichiers ;
  - `'key' => $key` retiré de `BusinessEnumService::get` → 1 rouge (AC4) ;
  - `business-enums.tsx` remis à `HEAD` → 1 rouge (AC5, le cas de la clé connue ; le repli est
    l'ancien comportement).
- Le test d'API est vert dès l'écriture : il épingle un contrat qui existait, et que le front lit
  désormais.
- L'ancien test d'`AuditTrail` « un événement inconnu reste lisible » attendait la valeur d'API
  quand une description existe ; il attend désormais la description (la décision).
