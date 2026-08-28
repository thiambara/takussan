---
id: TCK-448
title: "Les dialogues d'invitation avalent l'erreur de saisie : la soumission est bloquée et rien ne s'affiche — cause non identifiée"
status: todo
phase: P2
family: bug
estimate: M
wave: 50
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
tags: [front, forms, validation, admin, investigation]
---

## Objectif utilisateur

Quand une saisie est refusée, l'utilisateur lit **pourquoi**.

## Contexte

Mesuré par exécution le 2026-08-27 sur `/admin/team` : une adresse invalide bloque bien l'envoi
— l'action serveur n'est pas appelée — mais **aucun** message n'apparaît.
`document.querySelectorAll('[role="alert"]').length === 0`. `InviteMemberDialog` (TCK-292) se
comporte à l'identique.

**Ce ticket est une INVESTIGATION, pas un correctif connu.** Trois faits rendent le défaut
contre-intuitif, et aucun n'a encore été relié aux autres :

1. **Le balisage est là.** `InviteMemberDialog.tsx:114-116` rend bien
   `{errors.email.message}` dans un `<p role="alert">`. Ce n'est donc pas un oubli d'affichage :
   `errors.email` est vide au moment du rendu.
2. **Le schéma est bon pris seul.** `schema.safeParse()` sur la même valeur rend une issue unique
   et correcte.
3. **Le hook est bon pris seul.** Le même schéma passé à `useApiForm` **hors dialogue** affiche
   « Email invalide. ».

C'est la **combinaison** qui échoue, et c'est ce qui rend le défaut coûteux à chercher : chaque
pièce, éprouvée séparément, disculpe la suivante.

**Pistes relevées en lisant le code, à éprouver — aucune n'est établie :**

- **Identité instable du schéma, donc du résolveur.**
  `InviteMemberDialog.tsx:60` fait `const schema = buildSchema(t('emailInvalid'))` **dans le
  corps du composant** : un nouvel objet à chaque rendu. Il descend dans `useApiForm`, puis dans
  `useResolveurValidation(schema)` (`useApiForm.ts:256`), qui rend une **nouvelle fonction** à
  chaque rendu et reconstruit même `zodResolver(schema)` à l'intérieur de chaque appel
  (`useApiForm.ts:211-229`). Les formulaires qui marchent importent en général un schéma de
  module, d'identité stable — ce qui collerait au fait n°3.
- **Le cycle de vie du dialogue.** `useEffect(() => { if (!open) form.reset(); }, [open, form])`
  (`InviteMemberDialog.tsx:83-85`) remet le formulaire à zéro. `form` est stable en
  react-hook-form, donc l'effet ne devrait courir qu'au changement d'`open` — à vérifier plutôt
  qu'à supposer.
- **Le montage/démontage du contenu du dialogue**, qui peut jeter l'état de `formState` entre la
  validation et le rendu.

⚠ **Ne pas « corriger » en ajoutant un affichage d'erreur de plus.** Le balisage existe déjà : un
second canal masquerait la cause au lieu de la traiter, et le défaut reviendrait au prochain
formulaire monté dans un dialogue.

## Contrat de données

Aucun endpoint concerné : le défaut est **en amont** de tout appel réseau — l'action n'est jamais
invoquée. `POST /api/agencies/{agency}/members` et le chemin d'invitation ne sont pas en cause.

## Direction UX / Artistique

Le message se lit là où la saisie a eu lieu, sous le champ fautif, sans déplacer le reste du
dialogue ni le faire sauter. Un formulaire qui refuse en silence est pire qu'un formulaire qui
refuse : l'utilisateur re-clique, croit à une panne, et recommence.

## Contraintes strictes (métier)

- La soumission doit **rester** bloquée sur saisie invalide : le défaut est l'absence de message,
  pas la garde.
- Le message reste porté par `role="alert"` — c'est ce que la sonde mesure.
- La correction doit tenir pour **tous** les formulaires montés dans un dialogue, pas seulement
  les deux constatés ; sinon le ticket n'a traité qu'un symptôme.
- i18n fr/en/wo pour tout libellé neuf.

## Delta à produire

- [ ] **Reproduire d'abord** : un test qui monte `InviteMemberDialog`, saisit une adresse
      invalide, soumet, et asserte la présence du message — ce test doit **échouer** avant tout
      correctif
- [ ] Éprouver les pistes une par une, en isolant la variable (schéma stabilisé seul ; résolveur
      mémoïsé seul ; dialogue remplacé par un rendu nu)
- [ ] Corriger la cause une fois nommée
- [ ] Vérifier que `/admin/team` et `InviteMemberDialog` affichent tous deux le message
- [ ] Écrire dans le code ce que l'investigation a trouvé, à l'endroit où le prochain lecteur
      butera

## Critères d'acceptation

- [ ] AC1 — sur saisie invalide, `document.querySelectorAll('[role="alert"]').length >= 1` et le
      texte nomme le champ fautif, dans les deux dialogues constatés
- [ ] AC2 — un test reproduit le défaut et **échoue avant** le correctif ; l'ablation du
      correctif le refait rougir
- [ ] AC3 — la soumission reste bloquée : l'action serveur n'est pas appelée sur saisie invalide
- [ ] AC4 — la cause est **nommée** dans le ticket ou dans le code ; « corrigé en stabilisant le
      schéma » sans dire pourquoi cela suffisait ne referme pas ce ticket
- [ ] AC5 — un formulaire non-dialogue utilisant le même hook n'a pas régressé

## Hors périmètre

- Le fait que « Inviter » depuis `/admin/team` n'envoie pas d'invitation mais rattache un compte
  existant → [TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md).
- La refonte de `useApiForm` au-delà de ce qui ferme ce défaut.

## Notes d'implémentation

_(à remplir par implementing-specs)_
