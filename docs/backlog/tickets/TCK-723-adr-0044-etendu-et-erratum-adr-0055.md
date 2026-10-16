---
id: TCK-723
title: "ADR-0044 étendu à la pièce du locataire et de la caution, jobs échoués purgés à 30 jours ; erratum du code d'erreur d'ADR-0055"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#27-guarantor-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-19--rétention-des-tables-qui-grossissent
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads
tags: [adr, données-personnelles, chiffrement, impersonation, rétention, porteur, pistes]
---

## Objectif utilisateur

Que la décision du porteur sur la pièce d'identité du locataire et de la caution, et sur la durée
de vie des jobs échoués, soit écrite dans l'ADR qui porte la règle avant que le code ne l'applique ;
et qu'ADR-0055 écrive le code d'erreur que l'API émet réellement.

## Contexte

Réf : **P23.06** (reste : « la correction de l'ADR, hors agents »), **P23.03** et **P19.07** (reste :
« l'extension de l'ADR-0044, hors agents avec P23.03 ») du fichier de pistes. Décisions du porteur,
2026-10-15 et 2026-10-16 :

- P23.03 : la règle d'ADR-0044 §1 s'étend à `customers.id_number` et `guarantors.id_number`.
- P19.07 : les `failed_jobs` sont purgés à 30 jours, et `queue:prune-batches` est planifiée.
- P23.06 : ADR-0055 §3 écrivait `impersonation_read_only` ; `EnforceImpersonationReadOnly` émet
  `impersonation.read_only` (relu, l. 84). C'est l'ADR qui diffère.

## Contrat de données

Aucun. Ce ticket n'écrit que des ADR ; le contrat que l'extension d'ADR-0044 change (`id_number`
remplacé par `id_number_masked`, lecture claire dédiée) est celui du ticket d'application.

## Direction UX / Artistique

Sans objet.

## Contraintes strictes (métier)

- Aucun code applicatif : `takussan-api/` et `takussan-web/` ne bougent pas.
- La convention d'amendement du dépôt est suivie : en-tête daté et section `## Amendement du …` en
  fin d'ADR, comme [ADR-0029](../../adr/0029-medias-sur-r2-servis-par-cloudflare-transformations.md) ;
  la ligne de l'index le dit, comme pour ADR-0028 et ADR-0029.
- Un erratum se corrige en place, avec ce que disait la version antérieure, comme ADR-0044 §2
  (« corrigé après verif-601, m4 […] Une version antérieure de ce paragraphe disait […] : c'était
  faux »).
- Ce que le porteur n'a pas tranché ne se tranche pas ici. Les deux questions d'abord laissées
  ouvertes (`monthly_income`, et qui lit la valeur claire) ont été tranchées par le porteur le
  2026-10-16, dans la PR : points 6 et 7 de l'amendement.

## Delta à produire

- [x] `docs/adr/0055-…md` §3 : `impersonation.read_only`, avec la mention de la correction.
- [x] `docs/adr/0044-…md` : ligne d'en-tête « Amendement du 2026-10-16 », renvois depuis §1, §2 et
      §4, section « Amendement du 2026-10-16 » (A : la pièce du locataire et de la caution ;
      B : la purge des jobs échoués à 30 jours).
- [x] `docs/adr/README.md` : statut d'ADR-0044 « Accepté — amendé le 2026-10-16 ».

## Critères d'acceptation

- [x] AC1 — `grep -rn "impersonation_read_only" docs/adr` ne rend que la mention de la version
      antérieure, dans la note de correction d'ADR-0055.
- [x] AC2 — ADR-0044 nomme les deux colonnes et les cinq points de la règle : cast `encrypted` sur
      `text` ; migration idempotente au `down()` qui déchiffre, aller-retour testé ; `$hidden` et
      forme `id_number_masked` dans les listes, les fiches et les formes imbriquées ; sortie de
      `Customer::$queryFields` ; lecture claire dédiée sous `ProtectedActions::STEP_UP`, journalisée
      par `PersonalDataAccessLogger`.
- [x] AC3 — ADR-0044 dit que l'application de A suit dans un ticket à part, et que la planification
      de B est faite par l'implémenteur des pistes.
- [x] AC4 — le revenu mensuel (caution et bailleur) et le lecteur de la valeur claire sont écrits
      tels que le porteur les a tranchés (points 6 et 7), et rien d'autre n'est décidé.
- [x] AC5 — ADR-0044 §4 porte la durée de conservation des `failed_jobs` (30 jours).
- [x] AC6 — `node scripts/check-doc-links.mjs` vert (ancres de l'amendement comprises).

## Hors périmètre

- **L'application de P23.03** : migration de chiffrement, casts, `$hidden`, masques, routes
  `…/sensitive`, policies, surfaces de `PersonalDataAccessLogger`, front. Ticket à écrire.
- **La planification de P19.07** (`queue:prune-failed --hours=720`, `queue:prune-batches`), faite
  par l'implémenteur des pistes, avec le docblock de `SanitizingFailedJobProvider`.
- **La garde d'impersonation de P23.06** (balayage des `GET`), validée et laissée aux agents.
- Les occurrences de `impersonation_read_only` dans
  [TCK-600](TCK-600-console-plateforme-gouvernance-et-exploitation.md) (l. 206, 279, 347, 449, 590) :
  ticket clos, récit de son époque ; ses lignes 761, 764, 1353 et 1430 écrivent déjà le code émis.
- La ligne des jobs échoués dans la politique de confidentialité (`privacy.ts` §6) : TCK-537.

## Notes d'implémentation

- **Convention d'amendement** : en-tête `- **Amendement du AAAA-MM-JJ (TCK-NNN)** : … Voir [§ …]`
  et section `## Amendement du AAAA-MM-JJ — … (TCK-NNN)` en fin d'ADR, repris d'ADR-0029. Un ADR
  neuf (0068) n'a pas été retenu : la décision prolonge la règle d'ADR-0044 §1 sur deux colonnes de
  plus, et une durée de son §4, sans rien en remplacer. Les amendements portés par un ADR neuf du
  dépôt (ADR-0050 sur ADR-0023, ADR-0067 sur ADR-0012) prennent une décision propre qui en touche
  une autre.
- **Relu dans le code** (`pre-dev` `2bbc9956`) : `Guarantor` n'a pas de `$queryFields` —
  `fields[guarantors]` n'est pas ouvert, seul `fields[customers]` expose `id_number` ;
  `owner_profiles.monthly_income` est en clair et hors d'`OwnerProfile::SENSITIVE`, ce qui a été
  posé au porteur ; `OwnerProfilePolicy::viewSensitive` réserve la valeur claire à l'admin
  d'agence. Le porteur a tranché les deux le 2026-10-16 : le revenu suit la règle chez la caution
  et le bailleur, et seul l'admin d'agence lit la valeur claire.
- **Le docblock de `SanitizingFailedJobProvider`** dit encore « Écarté (ADR-0044) : une purge
  périodique ». L'amendement précise que l'écart visait l'exception, pas le `payload` ; le docblock
  est à reprendre avec la planification.
