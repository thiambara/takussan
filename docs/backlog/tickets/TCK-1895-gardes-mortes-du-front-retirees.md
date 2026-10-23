---
id: TCK-1895
title: "Retirer le schéma de conversation et la garde des documents de client, sans appelant"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [front, code-mort, pistes]
---

## Objectif utilisateur

Plus aucune garde du front ne prétend recopier une contrainte de l'API alors que rien ne l'appelle :
qui lit un seuil du front le trouve appliqué quelque part.

## Contexte

Réf : **P195.08** du fichier de pistes, `validé (délégué)`.

## Décision du porteur (déléguée)

> retirer `createConversationSchema` et `CreateConversationFormValues` (`message.ts`), `validateCustomerDocumentFile`, `CUSTOMER_DOCUMENT_MAX_BYTES`, `CUSTOMER_DOCUMENT_REJECTION_NAMESPACE` et son type (`customers.ts`), leurs tests de `properties.test.ts`, et les clés `serverActions.customerDocuments` des trois fichiers de messages si aucun autre lecteur n'est trouvé à la re-mesure

## Reste à faire

`isAllowedAttachment`, `MAX_ATTACHMENT_BYTES` et `ALLOWED_ATTACHMENT_MIME`, gardés tant que le trombone retiré « pour l'instant » (TCK-683) peut revenir

## Hypothèses (mode sans humain)

- « son type » désigne `CustomerDocumentRejection`, qui ne sert qu'à `validateCustomerDocumentFile`.
- L'import de `fr.json` dans `properties.test.ts`, qui ne servait qu'au test retiré, part avec lui.

## Delta à produire

- [x] `message.ts` : `createConversationSchema`, `CreateConversationFormValues` retirés.
- [x] `customers.ts` : `CUSTOMER_DOCUMENT_MAX_BYTES`, `CustomerDocumentRejection`,
      `CUSTOMER_DOCUMENT_REJECTION_NAMESPACE`, `validateCustomerDocumentFile` retirés.
- [x] `properties.test.ts` : le bloc `validateCustomerDocumentFile` retiré.
- [x] `serverActions.customerDocuments` retiré de `fr.json`, `en.json` et `wo.json`.

## Critères d'acceptation

- [x] AC1 — Re-mesure : aucun lecteur des symboles ni des clés hors d'eux-mêmes et de leurs tests
      (`grep -rn` dans `takussan-web/src`, `takussan-web/scripts` et `takussan-api/app`).
- [x] AC2 — `tsc --noEmit`, ESLint et `check:i18n` verts après retrait.

## Hors périmètre

- La clé `validation.message.initialRequired`, que seul `createConversationSchema` lisait : elle
  n'est pas citée par la décision, et reste.

## Notes d'implémentation

- Ablation sans objet pour un retrait de code mort : la preuve est la re-mesure par `grep`, puis
  `tsc --noEmit` vert, qui rougirait sur tout importeur oublié.
