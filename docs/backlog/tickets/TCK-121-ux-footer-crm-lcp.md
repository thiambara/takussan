---
id: TCK-121
title: UX — footer liens cassés, filtres CRM __all__, LCP eager loading
status: review
phase: P2
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
    - docs/features.md#12-recherche--découverte-publique
tags: [front, bug, p2, footer, crm, performance]
---

## Objectif utilisateur

Les utilisateurs et visiteurs ont une expérience fluide : les liens du footer fonctionnent, les filtres CRM affichent des labels lisibles, et la page d'accueil ne génère pas d'avertissements de performance.

## Contrat de données

- CRM filtres : aucun changement backend — correction du mapping valeur interne → label affiché côté composant select.
- Footer : liens institutionnels à renseigner ou pointer vers les pages existantes.
- LCP : correction d'attribut HTML uniquement.

## Direction UX / Artistique

Cohérence avec le reste de l'interface française déjà en place.

## Contraintes strictes (métier)

Les liens footer doivent pointer vers des routes existantes ou du contenu réel — ne pas laisser de `href="#"` comme état final.

## Delta à produire

- [ ] **Footer** — Remplacer les `href="#"` par les vraies URLs (pages d'informations, réseaux sociaux, etc.) ou retirer les liens non encore implémentés
- [ ] **Filtres CRM `/app/customers`** — Corriger l'option "Tous" du select Pipeline et du select Statut : la valeur interne `__all__` ne doit pas être affichée ; utiliser le label traduit "Tous"
- [ ] **LCP homepage** — Ajouter `loading="eager"` (ou `fetchPriority="high"`) sur l'image identifiée comme LCP candidate dans la section hero/featured

## Critères d'acceptation

- [ ] Aucun lien du footer ne pointe vers `#`
- [ ] Les selects de filtre CRM affichent "Tous" (et non `__all__`) pour l'option par défaut
- [ ] La console ne génère plus d'avertissement LCP sur la page d'accueil
- [ ] Aucune régression sur les pages concernées

## Hors périmètre

- Création de pages footer (CGU, Politique de confidentialité) — contenu éditorial hors scope
- Refonte complète du footer
- Optimisations LCP supplémentaires (lazy loading général, WebP — couvert par TCK-105)

## Notes d'implémentation

- **Footer** : colonnes À propos et Aide supprimées (aucune page existante), icônes sociales supprimées. Grid réduit de 5 à 3 colonnes.
- **CRM selects** : même cause que TCK-117 — base-ui `Select.Root` requiert `items={options}` pour que `SelectValue` affiche le libellé au lieu de la valeur brute. Labels "Toutes étapes"/"Tous statuts" → "Tous".
- **LCP** : `useReveal` démarrait à `false` (opacity-0) même pour les cartes avec `priority={true}`. Correction : `visible = useReveal(ref) || priority` — les cartes above-the-fold démarrent visibles immédiatement.
