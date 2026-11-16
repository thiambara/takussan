---
id: TCK-2907
title: "La visibilité « Réseau » d'une annonce — à définir par le porteur, puis API et écran"
status: obsolete
phase: P3
family: full
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
tags: [back, front, biens, annonces, visibilite, decision-produit, audit-ux, app]
---

> **Obsolète (2026-11-16)** — le porteur, 2026-11-16 : ticket supprimé — la visibilité « Réseau » n'est pas retenue ; le code garde Public et Privé.

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : bloqué externe — décision du porteur**, puis ADR si le sens est inter-agences. Prémisse
toujours vraie : `PropertyVisibility` n'a que `Public` et `Private` (`:7-8`) ; aucune « visibilité
Réseau » dans `docs/features.md`, aucun ADR de partage inter-agences. Rien de fermé entre-temps :
TCK-2905 et TCK-2908 sont livrés **sans** elle (ils l'excluent explicitement). Numéros de ligne de
la maquette justes.

Reste à faire : la décision ; puis selon elle — ADR (si a), `PropertyVisibility::Network` + règle
d'accès + `filter[visibility]=network`, écran (pastille, filtre, sous-titre), tests par profil avec
ablation. Taille : S (d), M (b/c), L (a).

**Question au porteur** :

> La maquette des biens propose trois visibilités : Public, **Réseau**, Privé. Le code n'en a que deux. Que doit ouvrir « Réseau » ?
> - **(a) Les autres agences de Takussan** voient l'annonce dans leur espace (pour la proposer à leurs clients, façon mandat partagé). → Décision structurelle : une agence lirait les biens d'une autre, ce que le principe « l'agence est la frontière d'isolation » interdit aujourd'hui. Il faudrait un ADR, et dire ce que l'autre agence voit (adresse exacte ? bailleur ? prix ?), et à qui vont les contacts et la commission.
> - **(b) Les seuls visiteurs connectés** à un compte Takussan (l'annonce n'apparaît pas aux anonymes ni aux moteurs de recherche).
> - **(c) Les seuls détenteurs du lien** : l'annonce n'apparaît ni dans la recherche, ni dans le sitemap, ni chez Google, mais s'ouvre à qui a le lien (partage WhatsApp).
> - **(d) Rien** : on retire « Réseau » de la maquette, la liste garde Public / Privé.
>
> Deux questions de plus si (a), (b) ou (c) : une annonce « Réseau » compte-t-elle dans le quota d'annonces de l'offre (aujourd'hui, toute annonce disponible compte, même privée) ? Et qui reçoit les demandes de contact qu'elle génère — l'agence du bien seulement, ou aussi l'agence qui l'a montrée (a) ?
>
> *Coût indicatif* : (c) ou (d) se livrent en S/M sans ADR ; (a) est un chantier à part (ADR, accès inter-agences, partage des contacts et des commissions).

## Objectif utilisateur

L'agence choisit, pour une annonce, une visibilité intermédiaire entre « Public » et « Privé » : « Réseau ». La liste des annonces la montre, et le sous-titre compte « les annonces visibles du public ou du réseau ».

## Contrat de données

Constat (vérifié à l'écriture) : `PropertyVisibility` n'a que `public` et `private` (`app/Models/Enums/PropertyVisibility.php:7-8`). Aucune notion de « réseau » n'existe dans le code ni dans `docs/features.md`.

Audit (`audit-f4-patrimoine.md`, app-biens **e1** : « visibilité « Réseau » inexistante (Public/Privé) ») ; maquette `app-biens.tsx` l. 95 (`'Public' | 'Réseau' | 'Privé'`), l. 106, l. 495 (« 67 annonces visibles du public ou du réseau »), l. 834 (« « Validé » et « Public / Réseau / Privé » sont deux autres pastilles (décision 2) »).

**Bloqué : la maquette nomme la valeur, rien ne dit ce qu'elle ouvre.** Questions au porteur :

1. « Réseau » veut-il dire : (a) visible des autres agences de la plateforme (partage inter-agences, mandat partagé) ; (b) visible des seuls comptes connectés ; (c) visible par lien seulement (non listé dans la recherche publique **ni dans le sitemap, en `noindex`**) ?
2. Une annonce « Réseau » entre-t-elle dans les quotas d'annonces en ligne de l'offre ? (Aujourd'hui le quota compte par statut, pas par visibilité — `QuotaResolver::ACTIVE_LISTING_STATUSES`, `app/Services/Billing/QuotaResolver.php:67-71` : une annonce privée `available` l'occupe déjà. Répondre « oui » ne demande rien.)
3. Qui reçoit les contacts d'une annonce vue par le réseau ?

Selon la réponse, (a) est une décision structurelle (accès d'une agence au bien d'une autre : principe 2, l'agence frontière d'isolation) → **ADR avant le code** ; (b) et (c) se règlent dans la portée publique existante.

## Direction UX / Artistique

- **Référence de fidélité** : page `app-biens`, approche `a`, écran **e1 « Liste — mode Annonces »** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-biens.tsx` (`CarteAnnonce` et `BureauAAnnonces`, l. 400-520) — téléphone et bureau : pastille « Réseau » sur la carte ; filtre de visibilité Public / Réseau / Privé ; sous-titre « n annonces visibles du public ou du réseau ».

## Contraintes strictes (métier)

- Rien ne s'implémente avant la décision écrite (ADR si (a)).
- Principe 2 : l'agence reste la frontière d'isolation, sauf décision écrite qui l'amende.

## Delta à produire

- [ ] Décision du porteur (questions 1 à 3), ADR si nécessaire.
- [ ] `PropertyVisibility::Network` + règle d'accès choisie + filtre `visibility=network`.
- [ ] Écran : pastille, filtre, sous-titre.
- [ ] Tests selon la décision (qui voit, qui ne voit pas).

## Critères d'acceptation

- [ ] AC1 — La décision est écrite (ADR ou section de `docs/features.md` § 1.1) avant tout code.
- [ ] AC2 — Une annonce « Réseau » n'est rendue à aucun lecteur que la décision exclut (test par profil, rouge par ablation de la condition).
- [ ] AC3 — La carte d'une annonce « Réseau » porte la pastille « Réseau » (téléphone et bureau) ; le filtre « Réseau » envoie `filter[visibility]=network`.
- [ ] AC4 — Le sous-titre du bureau compte les annonces publiques et réseau.

## Hors périmètre

- Le reste de la liste et de la fiche des biens (TCK-2908).

## Notes d'implémentation

_(à remplir par implementing-specs)_
