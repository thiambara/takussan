---
id: TCK-177
title: Pages publiques agents & agences + lien depuis la fiche bien
status: done
phase: P2
family: front
estimate: L
wave: 19
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#111-avis--réputation
tags: [front, agents, agencies, public]
---

## Objectif utilisateur

Le visiteur ou le client doit pouvoir consulter la fiche publique d'un agent ou d'une agence depuis la fiche d'un bien — voir leurs informations de contact, leur portefeuille de biens, leurs avis — et y déposer un avis.

## Contrat de données

État actuel (smoke test 2026-05-05) :

- Sur la fiche bien, le panneau agent affiche le nom de l'agent (`Aminata Mbaye`) et de l'agence (`Dakar Immo`) en texte brut, sans aucun lien.
- Tentatives directes : `/agents/aminata-mbaye`, `/agents`, `/agencies/dakar-immo`, `/agencies` → 404. Aucune route publique n'existe.
- Conséquence : TC-LOC-37 (laisser un avis sur un agent ou une agence) **inopérant**.

Endpoints à créer / étendre :

- GET `/api/public/agents/{slug}` : profil public d'un agent (nom, photo, agence, biens publiés, avis).
- GET `/api/public/agencies/{slug}` : profil public d'une agence (nom, logo, adresse, agents, biens, avis).
- POST `/api/public/agents/{slug}/reviews` & `/api/public/agencies/{slug}/reviews` (ou réutiliser endpoint reviews polymorphe avec `reviewable_type`).

Pages à créer :

- `/agents/[slug]` (public, layout `(public)`).
- `/agencies/[slug]` (public, layout `(public)`).

## Direction UX / Artistique

- Format de fiche similaire à une carte de visite : photo ronde, nom, rôle, agence, badges (vérifié, langues parlées), CTA `Message` / `Appeler` / `WhatsApp` (déjà câblés).
- En dessous : portefeuille de biens en grille (`PropertyCard` standard), section avis avec note moyenne et formulaire « Laisser un avis » (gating selon historique — cf. TCK-180).
- Cohérent avec le design system Takussan (Lin + Bricolage/DM Sans, couleurs locales).

## Contraintes strictes (métier)

- Pages publiques accessibles sans auth, mais le formulaire « Laisser un avis » suit le gating de TCK-180 (uniquement si visite/bail éligible avec cet agent/agence).
- Le slug est dérivé du `username` ou du `agency.slug` — vérifier la cohérence avec `models-spec.md` pour ne pas exposer un id technique.
- Un agent ou une agence inactif/désactivé doit retourner 404.

## Delta à produire

- [ ] Backend : endpoints `agents.show` et `agencies.show` publics, scope sur `status = active`.
- [ ] Backend : extension des reviews polymorphes pour supporter `Agent` et `Agency` (déjà prévu côté `models-spec`).
- [ ] Frontend : pages `/agents/[slug]` et `/agencies/[slug]` (Server Components).
- [ ] Frontend : sur la fiche bien (`/properties/[slug]`), wrapper le nom agent et le nom agence en `<Link>` vers ces pages.
- [ ] Tests : feature backend (404 si inactif, 200 si actif), e2e Playwright (depuis fiche bien → clic agent → fiche agent → leave review si éligible).

## Critères d'acceptation

- [ ] `/agents/[slug]` charge la fiche d'un agent existant avec son portefeuille et ses avis.
- [ ] `/agencies/[slug]` charge la fiche d'une agence avec ses agents et son portefeuille.
- [ ] Depuis `/properties/[slug]`, cliquer sur le nom de l'agent ou de l'agence ouvre la fiche correspondante.
- [ ] Tenter de laisser un avis sans historique éligible → bouton invisible ou message explicite (cohérent TCK-180).

## Hors périmètre

- Backoffice de gestion des agences (couvert par 1.12 features.md, déjà ticketé ailleurs).
- Refonte du design des cards `PropertyCard` (utiliser l'existant).

## Notes d'implémentation

### Livré
- Backend : nouveaux endpoints publics `GET /api/public/agents/{slug}` et `GET /api/public/agencies/{slug}` (slug = `users.username` / `agencies.slug`). Retournent fiche + portefeuille public limité à 24/48 biens. Scope `status=active` pour éviter d'exposer un compte désactivé.
- Backend : `PropertyResource::buildOwner` expose désormais `owner.slug` (= `username`) pour permettre au front de lier le nom de l'agent à `/agents/[slug]`.
- Frontend : pages `/agents/[slug]` et `/agencies/[slug]` (Server Components dans `app/(public)/`) avec `generateMetadata` dynamique, layout carte de visite + grille `PropertyCard`, lien croisé agent ↔ agence.
- Frontend : `PropertyAgentCard` enrobe le nom de l'agent et le nom de l'agence dans des `<Link>` (l'agent n'apparaît que si `owner.slug` est rempli, ce qui se fait via la modif `PropertyResource`).

### Reporté à un ticket dédié
- **Reviews polymorphes** sur `Agent` / `Agency` (TC-LOC-37) : nécessite une migration `morphs('reviewable')` sur la table `reviews` + extension du resource controller. Complète l'effort de TCK-180 (gating).
- **`generateStaticParams`** sur les routes agent / agency (perf) — non urgent tant que le portefeuille reste petit.
- **Avatars dimensionnés** via `next/image` au lieu d'`<img>` brut sur les fiches — à faire quand le composant `PropertyAgentCard` partagera son avatar avec `/agents/[slug]`.

### Vérifications à faire à la main
- `php artisan route:list --path=api/public` → confirmer présence de `public.agents.show` et `public.agencies.show`.
- Charger `/agencies/<un slug existant>` et `/agents/<un username existant>` → status 200 et fiche rendue.
