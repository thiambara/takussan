# Backlog MVP — Takussan

> ## 🗄️ STRATÉGIE ARCHIVÉE — ces tickets ne sont PAS du travail ouvert
>
> **Vérifié le 2026-08-12.** Ce dossier porte une stratégie produit *alternative* — « vertical
> slice / zero auth / WhatsApp first / 5 weekends », North KPI *10 contacts/semaine après
> 100 annonces* — qui n'a pas été celle suivie. Le projet a été construit sur le backlog
> [`../backlog/`](../backlog/) : 265 tickets, dont 258 livrés.
>
> **Ses 12 tickets décrivent des fonctionnalités livrées depuis avril 2026** (liste et détail
> d'annonces, contact WhatsApp, saisie admin, médias, recherche, tri). Ils portaient tous
> `status: todo` : un outil ou un agent qui agrégeait les frontmatters `todo` sur `docs/` comptait
> **15 tickets ouverts au lieu de 3**. Ils sont désormais `obsolete`.
>
> **Ce qui reste vrai et vaut d'être relu** : le raisonnement produit — la primauté du canal
> WhatsApp à Dakar, l'entrée sans authentification pour les visiteurs, « do things that don't
> scale » pour les cent premières annonces. Ce sont des arbitrages de marché, et ils n'ont pas
> vieilli comme les tickets.
>
> Les deux backlogs coexistaient sans qu'aucun document n'arbitre (ardoise D-20). Cet encadré est
> l'arbitrage.


> Approche verticale basée sur les recommandations d'Opus.
> Focus : "visiteur → annonce → contact WhatsApp" pour valider le marché en 5 weekends.
>
> **North KPI** : 10 contacts/semaine après 100 annonces.

## Philosophie

1. **Vertical slice** : chaque ticket livre une valeur utilisateur complète
2. **Zero auth** : pas de barrière à l'entrée pour les visiteurs
3. **WhatsApp first** : utiliser le canal existant à Dakar
4. **Do things that don't scale** : saisie manuelle des 100 premières annonces
5. **Evidence over features** : chaque weekend a un KPI mesurable

## Timeline

### 🚀 Weekend 1-2 — Le slice qui génère de la valeur

**Objectif** : Un visiteur voit une annonce et contacte le propriétaire

- [MVP-001](tickets/MVP-001-liste-annonces.md) — Page liste des annonces (publique)
- [MVP-002](tickets/MVP-002-detail-annonce.md) — Page détail annonce
- [MVP-003](tickets/MVP-003-contact-whatsapp.md) — Bouton "Contacter" → WhatsApp

**KPIs Weekend 1-2** :
- Pages vues/session > 3
- Temps sur page détail > 2 minutes
- Taux de clic WhatsApp > 15%

### 📝 Weekend 3 — Comment les annonces arrivent

**Objectif** : Saisir 100 annonces manuellement

- [MVP-004](tickets/MVP-004-admin-saisie.md) — Admin simple pour saisir 100 annonces
- [MVP-005](tickets/MVP-005-photos-medias.md) — Upload photos et infos de base

**KPIs Weekend 3** :
- Temps de saisie/annonce < 5 minutes
- 20 annonces créées/semaine
- Erreurs de saisie < 5%

### 🔍 Weekend 4-5 — Recherche/filtres

**Objectif** : Aider les visiteurs à trouver leur bien

- [MVP-006](tickets/MVP-006-recherche-simple.md) — Filtres quartier/budget/pièces
- [MVP-007](tickets/MVP-007-tri-resultats.md) — Tri résultats basique

**KPIs Weekend 4-5** :
- Utilisation filtres > 60% des visiteurs
- Search success rate > 80%
- Filter to contact rate > 10%

---

## 📋 Statut actuel

### Todo
- [MVP-001](tickets/MVP-001-liste-annonces.md) — Page liste des annonces (publique) `1 weekend`
- [MVP-002](tickets/MVP-002-detail-annonce.md) — Page détail annonce `1 weekend`
- [MVP-003](tickets/MVP-003-contact-whatsapp.md) — Bouton "Contacter" → WhatsApp `0.5 weekend`
- [MVP-004](tickets/MVP-004-admin-saisie.md) — Admin simple pour saisir 100 annonces `1 weekend`
- [MVP-005](tickets/MVP-005-photos-medias.md) — Upload photos et infos de base `1 weekend`
- [MVP-006](tickets/MVP-006-recherche-simple.md) — Filtres quartier/budget/pièces `1 weekend`
- [MVP-007](tickets/MVP-007-tri-resultats.md) — Tri résultats basique `0.5 weekend`

### Doing
_(vide)_

### Review
_(vide)_

### Done
_(vide)_

---

## 🎯 North KPI

**Contacts/semaine via WhatsApp** : 
- Weekend 1-2 : 0 (pas encore d'annonces)
- Weekend 3 : 2-3 contacts/semaine (10-15 annonces)
- Weekend 4-5 : 5-8 contacts/semaine (50-80 annonces)
- **Post-MVP : 10+ contacts/semaine (100+ annonces)**

---

## 📊 Métriques par semaine

| Semaine | Annonces | Visiteurs/jour | Contacts/semaine | Conversion |
|---------|----------|----------------|------------------|------------|
| 1-2 | 0-10 | 10-20 | 0 | - |
| 3 | 10-30 | 20-40 | 2-3 | 0.5% |
| 4 | 30-60 | 40-80 | 5-8 | 1% |
| 5 | 60-100 | 80-150 | 8-12 | 1.5% |

---

## 🚫 Hors périmètre MVP

**Features intentionnellement exclues** :
- Authentification visiteur (barrière à l'entrée)
- Chat interne (WhatsApp suffit)
- Dashboard propriétaire (pas encore de propriétaires)
- Système de booking (négocié en DM WhatsApp)
- Carte interactive (complexité vs valeur)
- Favoris (pas de compte utilisateur)
- Paiements (6 mois gratuit)

**Règle** : Chaque feature exclue nécessite 10 contacts/semaine supplémentaires pour être reconsiderée.

---

## 🔄 Post-MVP (après validation marché)

Une fois 10+ contacts/semaine atteints :

**Phase 1 - Auth & Propriétaires**
- Auth complet seekers
- Dashboard propriétaire simple
- Gestion annonces par propriétaire

**Phase 2 - Features avancées**
- Chat interne (si WhatsApp limitant)
- Booking de visites
- Système d'avis
- Notifications

**Phase 3 - Monétisation**
- Featured listings
- Abonnements agences
- Services premium

---

## 🔧 Stack technique

**Backend** : Laravel minimaliste
- Filament pour admin (rapidité)
- Spatie MediaLibrary pour photos
- Pas de permissions complexes

**Frontend** : Next.js simple
- Pas de state management complexe
- API calls directs
- Mobile-first design

**Infrastructure** :
- Hosting simple (VPS)
- Pas de CDN initial
- Analytics basic (Google Analytics)

---

## 📝 Notes d'Opus

> "La tentation quand on a tout planifié, c'est de commencer par les fondations (auth, modèles, admin, etc.) et de construire horizontalement. C'est un piège — tu vas passer 4 weekends à avoir rien de testable."

> "Règle : construis un slice vertical, pas horizontal."

> "Ton North KPI c'est les connexions contact/semaine. Donc le chemin critique c'est : Un visiteur arrive → voit une annonce → contacte le propriétaire"
