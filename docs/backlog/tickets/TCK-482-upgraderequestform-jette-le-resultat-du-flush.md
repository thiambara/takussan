---
id: TCK-482
title: "`UpgradeRequestForm` jette le résultat de `flush()` puis détruit le brouillon — 3ᵉ exemplaire du défaut de TCK-475"
status: todo
phase: P1
family: front
estimate: S
wave: 53
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-475]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, wizard, fiabilite, dette]
---

## Objectif utilisateur

Une agence qui soumet sa demande de passage au palier supérieur ne doit pas perdre son brouillon
parce que le réseau a lâché à la dernière seconde.

## Le défaut

`takussan-web/src/components/agency/UpgradeRequestForm.tsx:135` :

```ts
await flush();                                    // ← résultat jeté
await submitAgencyUpgradeRequest(token, agencyId, form, statutsDoc);
await clear();                                    // ← détruit le brouillon
```

Depuis TCK-465, `flush()` **rend** un `ResultatEcritureBrouillon` au lieu de `void`. Ici la valeur
est jetée : une écriture échouée est indiscernable d'une réussie, et la ligne suivante détruit le
brouillon.

⚠ **Le `try/catch` qui entoure ce bloc ne rattrape rien** : `flush()` **ne lève pas**, il rend
`{ ok: false, error }`. Le chemin d'échec passe donc par le `try` sans jamais toucher le `catch` —
la parade a l'air d'être là et n'est pas branchée.

⚠⚠ **C'est exactement le site 2 de TCK-475**, sur un composant que ce ticket ne pouvait pas voir :
`UpgradeRequestForm` n'emploie pas `WizardReprenable`, il appelle `useWizardDraft` en direct.

## Le fait qui compte le plus : la doublure et le défaut se protégeaient l'un l'autre

`agency/__tests__/UpgradeRequestForm.test.tsx:42` mockait `flush` sur `undefined` — un mensonge
sur le contrat, resté **vert** précisément parce que l'appelant ne lisait rien. La doublure était
verte parce que le code était faux ; le code restait faux parce que la doublure était verte.

La doublure a été rendue honnête pendant le lot de la vague 52 (intégration TCK-475). **Le défaut
du code, lui, reste entier** — et il n'est plus couvert par personne.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Lire le résultat de `flush()` et **ne pas poursuivre** vers la soumission puis `clear()`
      quand l'écriture a échoué — la forme tranchée par TCK-475 pour son site 2.
- [ ] Message d'échec par next-intl, qui **dit quoi faire**. Le chemin est un PUT réseau, pas un
      `localStorage` : les remèdes parlent de connexion et de session, jamais de quota.

## Critères d'acceptation

- [ ] **AC1** — `flush()` en échec → ni `submitAgencyUpgradeRequest`, ni `clear()`, un message
      d'échec, et le brouillon **toujours là**.
- [ ] **AC2** — `flush()` en réussite → le chemin nominal est inchangé, soumission et `clear()`
      compris. *Un correctif qui éteindrait les deux passerait un test qui ne regarde que
      l'échec.*
- [ ] **AC3** — un test assert que le brouillon **n'a pas été détruit** dans le cas d'échec — pas
      seulement qu'un toast est parti.
- [ ] **AC4** — ablation : rendre le résultat toujours-`ok` du point de vue de l'appelant fait
      rougir AC1, changement prouvé par `md5` **avant** lecture du résultat.
- [ ] **AC5** — la doublure de test de ce fichier reste honnête : elle rend un
      `ResultatEcritureBrouillon`, jamais `undefined`.

## Hors périmètre

- Les deux sites de `WizardReprenable`, livrés par TCK-475.
- Le garde mort de `WizardReprenable`, qui a son propre ticket.

## Notes d'implémentation

Trouvé par le balayage exhaustif des doublures de `flush` demandé à l'agent de TCK-475 après son
premier rendu — six sites, dont deux vertes et fausses et **un troisième exemplaire du défaut
lui-même**. ⚠ Le balayage a aussi montré qu'il existe **deux contrats homonymes** :
`useDebouncedValue.flush()` rend `void` pour de bon, et les `commit.flush()` de
`DebouncedSearchInput`, `FilterSidebar` et des deux écrans admin en relèvent. Ne pas les
« corriger » : ce serait les casser.
