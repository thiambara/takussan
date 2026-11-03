---
id: TCK-922
title: "Étiquettes CRM du catalogue traduites par slug"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-16"
tags: [front, i18n, pistes]
---

## Contexte

Réf : **P30.06** du fichier de pistes, `validé` (V7 et V8 accordés). La piste réunit quatre
correctifs, un ticket chacun : celui-ci est le premier (TCK-922 à TCK-925).

Les cinq étiquettes CRM du catalogue (`TagCatalog::CRM` : `VIP`, `Prospect chaud`, `Étranger`,
`Famille`, `Étudiant`) s'affichaient par leur nom en base dans les trois langues :
`CustomerTagPicker`, `CustomerTagChips` et le filtre de `CustomerListFilters` rendaient `tag.name`,
et aucun message ne les traduisait. La liste servie aux filtres et aux suggestions
(`fetchCrmTags`, `TAG_FIELDS`) ne demandait même pas le slug.

## Décision du porteur

validé — les quatre correctifs, un ticket chacun : étiquettes CRM traduites par slug, options retriées sur le libellé affiché, otherTagNames par le même traducteur, nom tapé égal à un libellé traduit résolu vers l'équipement ; en wo, le texte français tel quel (wolof en pause depuis le 2026-10-16)

## Objectif utilisateur

Un agent anglophone lit « Hot lead », « Student », « Family » sur la fiche et la liste de ses
clients ; une étiquette qu'il a lui-même saisie s'affiche telle quelle.

## Delta à produire

- [x] Espace de traduction `crm.tagCatalog.<slug>` (fr, en ; wo = texte français tel quel).
- [x] `libelleEquipement` employé sous cet espace (`ESPACE_DES_ETIQUETTES_CRM`) par les pastilles,
  les suggestions, les noms accessibles et les options du filtre.
- [x] `TAG_FIELDS` demande `slug`.

## Critères d'acceptation

- [x] AC1 — Les clés `crm.tagCatalog` sont exactement les slugs de `TagCatalog::CRM`, dans les
  trois langues (le test lit le fichier PHP).
- [x] AC2 — En anglais, « Prospect chaud » s'affiche « Hot lead » sur les pastilles, la fiche et
  le filtre ; la valeur filtrée reste le nom en base.
- [x] AC3 — Une étiquette saisie par l'agence s'affiche telle quelle.

## Hypothèses

- Les libellés anglais sont un texte métier neuf (V7 accordé) : `Hot lead`, `Foreign national`,
  `Family`, `Student`, `VIP`. À relire à la PR.
- La recherche dans les suggestions de la fiche porte sur le libellé affiché, comme la combobox des
  équipements : un anglophone qui tape « stud » trouve « Student ».

## Notes d'implémentation

- **Reproduction** : `customer-dashboard/__tests__/etiquettes-crm.tck-922.test.tsx` → 7 rouges sur 8.
- **Ablation** : composants et `TAG_FIELDS` d'avant, traductions gardées → 4 rouges ; remis → 8 verts.
- `CustomerTagPicker.test.tsx` montait ses étiquettes avec `slug = name` : `vip` y devenait le slug
  du catalogue et s'affichait « VIP ». Le montage porte désormais un slug suffixé, comme
  `CustomerTagController::store` en crée.
