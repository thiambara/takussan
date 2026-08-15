---
id: MVP-002
title: "Page détail annonce"
status: obsolete
slice: "Weekend 1-2"
estimate: 1 weekend
created: 2026-04-16
depends_on: [MVP-001]
blocks: [MVP-003]
tags: [front, public, mvp]
---

## Objectif utilisateur

Un visiteur voit toutes les informations d'une annonce et peut contacter le propriétaire via WhatsApp.

## Contrat de données

- API endpoint : `GET /api/public/properties/{id}` (public)
- Modèle complet : toutes les infos de l'annonce
- Photos : gallery avec thumbnails
- Contact : téléphone du propriétaire (format international)

## Contraintes strictes

- **Photos optimisées** : galerie rapide sur mobile
- **Contact visible** : bouton WhatsApp prominent
- **SEO friendly** : meta tags, URL clean
- **Partage** : boutons partage WhatsApp/Facebook

## Delta à produire

### Backend (Laravel)
- [ ] Compléter migration `properties` avec tous les champs nécessaires
- [ ] Model `Property` avec relations (photos, propriétaire)
- [ ] Controller `PublicPropertyController` avec méthode `show`
- [ ] Route `Route::get('/api/public/properties/{property}', [PublicPropertyController::class, 'show'])`
- [ ] Policy pour vérifier que l'annonce est `published`

### Frontend (Next.js)
- [ ] Page `/properties/[slug]` (dynamic routing)
- [ ] Composant `PropertyDetail` (layout desktop/mobile)
- [ ] Composant `PhotoGallery` (swipe sur mobile)
- [ ] Composant `ContactButton` (WhatsApp integration)
- [ ] Composant `PropertyInfo` (caractéristiques structurées)

### Design
- [ ] Header : photo principale avec galerie
- [ ] Section 1 : titre + prix + localisation (prominent)
- [ ] Section 2 : caractéristiques (pièces, superficie, etc.)
- [ ] Section 3 : description complète
- [ ] Section 4 : contact propriétaire (sticky sur mobile)

## Critères d'acceptation

- [ ] Toutes les photos s'affichent correctement
- [ ] Bouton WhatsApp fonctionne avec message pré-rempli
- [ ] Partage WhatsApp inclut titre + prix + lien
- [ ] Page est indexable par Google (meta tags ok)

## KPI à tracker

- **Taux de clic WhatsApp** : objectif > 15%
- **Temps sur page** : objectif > 2 minutes
- **Partages** : objectif > 5% des visiteurs

## Message WhatsApp pré-rempli

```
Bonjour, je suis intéressé(e) par votre bien :
[Titre de l'annonce]
[Prix] - [Localisation]
Vu sur Takussan.sn
```

## Hors périmètre

- Authentification visiteur
- Chat interne
- Favoris
- Visites virtuelles
- Calcul de frais de notaire
