---
id: TCK-2140
title: "Les sélecteurs de membre nomment un membre sans nom par l'assembleur commun"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2138]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-220--noms-de-comptes-rendus-par-le-front-sans-repli-face-aux-comptes-créés-par-téléphone"
tags: [front, equipe, crm, identite, pistes]
---

## Contexte

Réf : **P220.05** du fichier de pistes, `validé (délégué)` (V7 accordé). `fetchAgencyAgents`, le
sélecteur du bénéficiaire d'une délégation, la boîte des demandes de contact (destinataire et
collègue à qui attribuer) et le filtre d'agent de la liste des biens composaient le nom sans repli :
option ou ligne vide pour un compte créé par téléphone.

## Décision du porteur (déléguée)

> le même assembleur que P220.04 (un seul assembleur de nom affichable sous `src/lib` : prénom et nom, sinon e-mail, sinon numéro, sinon `#<id>`, avec les seuls champs que chaque écran charge déjà (aucun champ de contact neuf demandé à l'API)) dans `fetchAgencyAgents`, `CreateDelegationDialog`, `ContactLeadsInbox` (`nomComplet`, option et ligne destinataire) et le filtre d'agent de la liste des biens ; `fetchAgencyAgents` garde `fields[users]=id,first_name,last_name`, et retombe donc sur `#<id>`

## Objectif utilisateur

Aucun sélecteur de membre ne propose une option sans libellé.

## Contrat de données

Aucun changement : les champs demandés restent ceux d'aujourd'hui.

## Delta à produire

- [x] `nomAffichable()` (TCK-2138) dans `fetchAgencyAgents`, `CreateDelegationDialog`,
  `ContactLeadsInbox.nomComplet` et `buildAgentOptions` de `/app/properties`.
- [x] Tests : `agent-crm.agents-sans-nom.p220-05`, `CreateDelegationDialog.membre-sans-nom.p220-05`,
  `filtre-agent-sans-nom.p220-05`, un cas de `ContactLeadsInbox.test`.

## Critères d'acceptation

- [x] AC1 — `fetchAgencyAgents` rend `#<id>` pour un agent sans nom, et demande toujours
  `fields[users]=id,first_name,last_name`.
- [x] AC2 — le bénéficiaire d'une délégation se propose sous son e-mail, son numéro ou `#<id>`.
- [x] AC3 — une demande de contact adressée à un membre sans nom se lit « Pour #<id> », et le
  collègue sans nom se propose `#<id>` à l'attribution.
- [x] AC4 — le filtre d'agent de la liste des biens nomme l'utilisateur courant sans nom par son numéro.

## Hors périmètre

- Les noms des bailleurs et collaborateurs du même filtre (`property.owner.name`,
  `collaborator.user.name`) viennent de l'API déjà composés : non touchés.

## Notes d'implémentation

- Ablation : les quatre fichiers remis à leur version d'avant → les quatre cas neufs rougissent.
