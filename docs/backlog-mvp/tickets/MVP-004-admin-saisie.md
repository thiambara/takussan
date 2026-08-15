---
id: MVP-004
title: "Admin simple pour saisir 100 annonces"
status: obsolete
slice: "Weekend 3"
estimate: 1 weekend
created: 2026-04-16
depends_on: [MVP-003]
blocks: [MVP-005]
tags: [back, admin, mvp]
---

## Objectif utilisateur

L'admin Takussan peut rapidement saisir 100 annonces manuellement pour valider le marché ("do things that don't scale").

## Contrat de données

- Admin panel : Filament ou Simple CRUD Laravel
- CRUD complet : créer, éditer, supprimer, publier/dépublier
- Upload photos : jusqu'à 10 photos par annonce
- Validation : champs obligatoires + format téléphone

## Contraintes strictes

- **Rapidité de saisie** : < 5 minutes par annonce
- **Pas de permissions complexes** : 1 seul admin
- **Upload simple** : drag & drop photos
- **Publication immédiate** : pas de modération

## Delta à produire

### Backend (Laravel)
- [ ] Installation Filament (ou CRUD artisan)
- [ ] Resource `PropertyResource` (CRUD complet)
- [ ] Form : tous les champs nécessaires (titre, prix, description, etc.)
- [ ] Upload : Spatie MediaLibrary intégré
- [ ] Validation : FormRequest pour les données
- [ ] Seeder : 10 annonces exemples

### Admin Interface
- [ ] Tableau annonces : liste avec filtres rapides
- [ ] Formulaire création : onglets (infos, photos, contact)
- [ ] Upload photos : gallery avec preview
- [ ] Actions rapides : publier/dépublier/ dupliquer

## Critères d'acceptation

- [ ] Admin peut créer une annonce complète en < 5 minutes
- [ ] Photos s'uploadent correctement (max 10)
- [ ] Validation empêche les erreurs (téléphone format, prix > 0)
- [ ] Annonce apparaît immédiatement sur le site public

## KPI à tracker

- **Temps de saisie/annonce** : objectif < 5 minutes
- **Annonces créées/semaine** : objectif 20 annonces/semaine
- **Erreurs de saisie** : < 5% des créations

## Champs obligatoires

- Titre (min 10 caractères)
- Prix (> 0)
- Type (appartement, maison, villa, terrain, commerce)
- Localisation (quartier + ville)
- Téléphone propriétaire (format +221)
- Au moins 1 photo
- Description (min 50 caractères)

## Workflow de saisie

1. Remplir infos de base (titre, prix, type)
2. Ajouter localisation sur carte ou texte
3. Upload photos (drag & drop)
4. Remplir description et caractéristiques
5. Ajouter téléphone propriétaire
6. Publier immédiatement

## Hors périmètre

- Gestion des utilisateurs
- Permissions multi-agences
- Modération des annonces
- Import CSV
- API externe pour les annonces
