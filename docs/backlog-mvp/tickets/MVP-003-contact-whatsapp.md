---
id: MVP-003
title: "Bouton Contacter → WhatsApp"
status: todo
slice: "Weekend 1-2"
estimate: 0.5 weekend
created: 2026-04-16
depends_on: [MVP-002]
blocks: []
tags: [front, contact, mvp]
---

## Objectif utilisateur

Un visiteur intéressé contacte le propriétaire en 1 clic via WhatsApp, le canal naturel à Dakar.

## Contrat de données

- API endpoint : `GET /api/public/properties/{id}/contact` (public)
- Retour : téléphone propriétaire + message pré-rempli
- Tracking : événement analytics sur clic contact

## Contraintes strictes

- **1 clic vers WhatsApp** : pas de formulaire intermédiaire
- **Message pré-rempli** : inclut titre + prix + lien
- **Tracking obligatoire** : mesurer les contacts réels
- **Fallback email** : si WhatsApp pas disponible

## Delta à produire

### Backend (Laravel)
- [ ] Ajouter champ `owner_phone` dans migration `properties`
- [ ] Controller `PublicPropertyController` méthode `contact`
- [ ] Route `Route::get('/api/public/properties/{property}/contact', [PublicPropertyController::class, 'contact'])`
- [ ] Validation : téléphone format Sénégal (+221)

### Frontend (Next.js)
- [ ] Composant `WhatsAppButton` (sticky footer sur mobile)
- [ ] Hook `useWhatsApp` (format message + tracking)
- [ ] Analytics : tracker `contact_attempt` et `contact_success`
- [ ] Fallback : bouton email si WhatsApp not supported

### Design
- [ ] Bouton flottant vert WhatsApp (mobile)
- [ ] Bouton prominent (desktop)
- [ ] Icône WhatsApp officielle
- [ ] Texte : "Contacter via WhatsApp"

## Critères d'acceptation

- [ ] Clic ouvre WhatsApp avec message pré-rempli
- [ ] Message contient : titre, prix, localisation, lien Takussan
- [ ] Tracking analytics fonctionne
- [ ] Fallback email fonctionne si nécessaire

## KPI à tracker (NORTH KPI)

**Contacts/semaine** : objectif 10 contacts/semaine après 100 annonces

## Analytics à implémenter

- `contact_attempt` : clic bouton contact
- `contact_success` : ouverture WhatsApp confirmée
- `property_view_to_contact_rate` : % vues → contact

## Message format

```
Bonjour, je suis intéressé(e) par votre bien :
{property_title}
{property_price} - {property_location}
Vu sur Takussan.sn : {property_url}
```

## Hors périmètre

- Formulaire de contact intermédiaire
- Chat interne
- Rendez-vous en ligne
- Vérification disponibilité en temps réel
