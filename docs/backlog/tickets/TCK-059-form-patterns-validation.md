---
id: TCK-059
title: "Form Patterns + Validation (Zod + RHF)"
status: todo
phase: P0
family: front
estimate: S
created: 2026-04-16
updated: 2026-04-16
depends_on: [TCK-054, TCK-057]
blocks: [TCK-043, TCK-044, TCK-045]
spec_refs:
  features: []
  models: []
tags: [front, infrastructure, forms, zod, react-hook-form, validation]
---

## Objectif utilisateur

Tout formulaire de l'application suit un pattern cohérent avec validation côté client et gestion d'erreurs uniforme.

## Contrat de données

- Validation Zod schemas alignés sur les FormRequest backend (TCK-051)
- Erreurs API backend (422) mappées vers les champs du formulaire
- Types dérivés des schemas Zod (`z.infer<>`)

## Direction UX / Artistique

- **Validation en temps réel** : erreur sous le champ dès que le champ est touched + dirty
- **Soumission** : bouton désactivé pendant le submit, spinner ou loading state
- **Succès** : toast de confirmation, redirection ou reset du form
- **Erreur serveur** : message d'erreur général + erreurs par champ sous les inputs

## Contraintes strictes (métier)

- React Hook Form + @hookform/resolvers/zod
- Chaque formulaire a un schema Zod validant les mêmes règles que le backend
- Les erreurs 422 du backend sont mappées vers les champs du formulaire
- Les formulaires sont des Client Components (useForm est un hook)
- Les composants Input/Select/Textarea de shadcn sont wrappés pour RHF

## Delta à produire

- [ ] `npm install react-hook-form @hookform/resolvers zod`
- [ ] Composants RHF : `FormInput`, `FormSelect`, `FormTextarea`, `FormCheckbox`
- [ ] Hook `useApiForm()` : combine useForm + useMutation + erreur mapping
- [ ] Schemas Zod communs : `phoneSchema`, `passwordSchema`, `emailSchema`
- [ ] Composant `FormError` pour affichage erreurs par champ
- [ ] Composant `FormSuccess` toast
- [ ] Migration du formulaire login/register existant vers RHF + Zod
- [ ] Tests : validation client, erreur mapping, soumission

## Critères d'acceptation

- [ ] Les formulaires valident côté client avec Zod avant soumission
- [ ] Les erreurs 422 du backend sont affichées sous les champs concernés
- [ ] Les composants FormInput/FormSelect/etc. sont réutilisables
- [ ] Le formulaire login existant utilise RHF + Zod
- [ ] Les types sont dérivés des schemas Zod

## Hors périmètre

- Formulaires métier spécifiques (→ tickets domaine)
- Upload de fichiers dans les formulaires (→ TCK-050 + tickets domaine)
