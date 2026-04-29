---
id: TCK-113
title: Fix runtime error — useToastManager hors Toast.Provider dans AuditTrail
status: todo
phase: P1
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#26-audit--traçabilité
tags: [front, bug, p1, base-ui, toast]
---

## Objectif utilisateur

L'administrateur peut consulter le journal d'audit `/admin/audit` sans erreur de rendu.

## Contrat de données

Aucun changement d'API. Correction de l'arborescence de providers React.

## Direction UX / Artistique

Aucun changement visuel — corriger uniquement l'erreur de contexte Base UI Toast.

## Contraintes strictes (métier)

Le journal d'audit est une fonctionnalité P1 réservée aux admins.

## Delta à produire

- [ ] Localiser dans `src/components/admin/AuditTrail.tsx:68` l'appel à `useToast()` (Base UI `useToastManager`)
- [ ] Vérifier la position du `<Toast.Provider>` dans l'arborescence layout — s'il est absent du layout admin, l'ajouter au bon niveau (layout ou page)
- [ ] Vérifier que `src/components/ui/toast.tsx:35` n'est plus en erreur
- [ ] Vérifier que la page `/admin/audit` charge et que les toasts s'affichent correctement lors des actions

## Critères d'acceptation

- [ ] `/admin/audit` ne renvoie plus l'erreur "Base UI: useToastManager must be used within <Toast.Provider>"
- [ ] Le journal d'audit affiche la liste des événements
- [ ] Aucune régression sur les toasts des autres pages admin

## Hors périmètre

- Enrichissement fonctionnel du journal d'audit (filtres, export — couverts par TCK-104)
- Migration vers un autre système de notification

## Notes d'implémentation

_(à remplir par implementing-specs)_
