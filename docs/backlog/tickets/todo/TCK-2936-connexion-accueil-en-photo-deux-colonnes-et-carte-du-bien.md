---
id: TCK-2936
title: "Connexion : l'en-tête d'accueil en photo et les deux colonnes de l'arrivée directe, la date et le délai de réponse sur la carte du bien, et le panneau du bien dès 1024"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2935]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
tags: [front, entree, connexion, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Qui arrive sur la connexion sans venir d'un bien est accueilli comme sur la maquette ; qui vient d'un bien voit pour quoi et pour quand il se connecte, et sous combien de temps l'agence répond — à toutes les largeurs du bureau.

## Contrat de données

- `agency.median_response_minutes` du bien quitté (TCK-2935).
- Date de la visite : `?debut=` déjà lu (`debutDuGesteQuitte`).
- **Photo de ville** : l'écart TCK-2604 / TCK-2598 tient au motif « aucune photo fournie par le porteur ». Le ticket utilise une photo du dépôt déjà libre de droits si elle existe (images du site public), sinon le porteur la fournit : demander dans la PR, ne pas fusionner AC1/AC2 sans photo.

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-connexion`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-connexion.tsx`, visionneuse `?p=app-entree-connexion&a=a`.
  - **e1 « Numéro (arrivée directe) »** : **téléphone** — en-tête photo de ville 176 px, logo clair, « Tes visites, tes favoris, tes annonces. » ; **bureau** — deux colonnes (`DeuxColonnes`, `:111-120` : panneau photo 45 % + logo à gauche, formulaire à droite).
  - **e0 « Numéro (venant d'une visite) »** : **téléphone** « · samedi 15 nov. » à côté de « Ta demande de visite » ; **bureau** carte du panneau « Visite demandée pour samedi 15 nov. » et « Avec Dakar Immo · réponse en 2 h environ » (`:146-158`).
  - **Largeurs** : le gabarit `DeuxColonnes` est en pourcentage (45 %), sans piste fixe, et sa carte porte des variantes `max-lg:` (`:146`) : la maquette parle sous 1280, donc la règle d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 4 (« puisque la maquette n'y dit rien ») s'efface devant elle, et les deux colonnes valent dès `lg` (1024). Le produit ne rend le panneau qu'à partir de `xl` (`CoqueDEntree.tsx:84-90`).
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-connexion (e0, e1, « écarts couverts », « non vérifiables ») ; fiches TCK-2598, TCK-2604.

## Contraintes strictes (métier)

- La date n'est rendue que si le geste quitté en porte une (`?debut=`, ou la date souhaitée de la demande de visite si le formulaire public en recueille une) ; sinon rien — jamais une date inventée.
- « réponse en {durée} environ » suit l'arrondi de la fiche publique d'agence ; `null` → la mention n'est pas rendue.
- Le panneau du bien et le panneau d'accueil sont décoratifs pour la connexion : rien de ce qu'ils portent n'est requis pour se connecter (`aria-hidden` du décor, nom de l'agence lisible).
- Libellés `fr`/`en`/`wo` (`wo` = français).

## Delta à produire

- [ ] En-tête d'accueil en photo (tél.) et panneau photo 45 % (bureau) pour l'arrivée directe.
- [ ] Date de visite et délai de réponse sur la carte / l'en-tête du bien.
- [ ] Panneau d'objet de la coque d'entrée dès `lg` pour la connexion.
- [ ] Vérifications au navigateur (AC5).

## Critères d'acceptation

- [ ] AC1 — `/auth/login` sans intention, à 390 : un en-tête photo de 176 px avec le logo clair et « Tes visites, tes favoris, tes annonces. » précède le champ du numéro.
- [ ] AC2 — Même page à 1440 et à 1024 : deux colonnes, panneau photo à gauche (45 %), formulaire à droite ; plus de colonne centrée de 480 px seule.
- [ ] AC3 — Venu de « Demander une visite » d'un bien d'une agence à `median_response_minutes = 120`, avec `?debut=2026-11-15`, la carte du panneau (bureau) dit « Visite demandée pour samedi 15 nov. » et « Avec {agence} · réponse en 2 h environ » ; au téléphone, l'en-tête porte « · samedi 15 nov. ». Sans `debut`, aucune date ; avec `null`, aucune mention de délai.
- [ ] AC4 — À 1024 et 1279, venu d'un bien, le panneau du bien est rendu à gauche (il ne l'est aujourd'hui qu'à partir de 1280).
- [ ] AC5 — Vérifier au navigateur, depuis « Demander une visite » d'une fiche, à 390, 1024 et 1440 : panneau et carte du bien (e0, e2, e3) ; avec `phone_login` éteint : « Utiliser plutôt mon numéro », barre du bien et encadré SMS absents (e3-e6) ; « Ouvrir Gmail » seulement pour une adresse Gmail (e6, e7). Corriger ce qui diffère de la maquette.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiches TCK-2598 et TCK-2604 mises à jour (en-tête d'accueil, panneau 45 %, date et délai retirés des écarts).
- [ ] AC-F2 — À 390 × 844, 1440 × 900 et 1024 × 768, `fidelite compare` sur e0, e1 ne rend aucun écart non expliqué.

## Hors périmètre

- Le délai de réponse côté API (TCK-2935).

## Notes d'implémentation

_(à remplir par implementing-specs)_
