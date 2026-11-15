---
id: TCK-2946
title: "Assistant du prestataire : la carte d'intervention complète, et au bureau les tarifs, les disponibilités et « Enregistrer mon profil » dans l'écran"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2943]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [front, entree, assistants, prestataire, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le prestataire juge l'intervention d'un coup d'œil, et règle au bureau ses tarifs et ses créneaux sans changer de page.

## Contrat de données

- Projection étendue de `intervention-d-origine` (TCK-2943).
- Tarifs et créneaux : les mêmes lectures et écritures que `/app/profile/professional` (`ProfileServiceProviderSection`, tarifs + `available_slots`) — aucun endpoint neuf.

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-assistants`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-assistants-a.tsx`, visionneuse `?p=app-entree-assistants&a=a`, **e2 « Prestataire : l'intervention »** :
  - **téléphone et bureau** — carte : pastille « À traiter sous 48 h » (`:467`), « Signalée par le locataire le 9 nov. · réf. INT-2041 » (`:474`), citation du locataire, « Voir le détail » (`:482`) ;
  - **bureau** — sections « Tarifs » (tarif horaire, frais de visite en F CFA, `:607`) et « Disponibilités » (grille Matin / Après-midi × 7 jours, `:626`) + « Enregistrer mon profil » (`:650`), dans l'écran. Au téléphone, les lignes-liens actuelles vers le profil restent (la maquette les dessine en lignes, `:456-457`).
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-assistants e2, « écarts couverts » 2 et 4 ; fiche TCK-2613 (`[2]`, `[3]`).

## Contraintes strictes (métier)

- Les tarifs et créneaux s'enregistrent par le même appel que la page de profil (une seule règle de validation) ; une erreur s'affiche sous le champ.
- « Voir le détail » n'est actif qu'après acceptation (avant : texte « après acceptation »), selon `detail_url` de l'API.
- L'échéance affichée vient de `respond_by` ; jamais « 48 h » en dur.
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de l'entrée conservé.

## Delta à produire

- [ ] Carte d'intervention complète.
- [ ] Sections Tarifs et Disponibilités + « Enregistrer mon profil » au bureau.
- [ ] Vérification au navigateur (AC4).

## Critères d'acceptation

- [ ] AC1 — Avec la projection de TCK-2943, la carte rend la pastille d'échéance, « Signalée par le locataire le {date} · réf. {réf.} », la citation et « Voir le détail », à 390 et à 1440.
- [ ] AC2 — À 1440, l'écran rend les sections Tarifs (deux champs en F CFA) et Disponibilités (14 cases Matin / Après-midi) préremplies depuis le profil ; « Enregistrer mon profil » écrit tarifs et créneaux, puis `/app/profile/professional` montre les mêmes valeurs.
- [ ] AC3 — À 390, les lignes « Tarifs » et « Disponibilités » restent des liens vers le profil (pas de régression).
- [ ] AC4 — Vérifier au navigateur le panneau multi-agences avec plus d'une collaboration (`service-provider/page.tsx:78-89`) ; corriger s'il diffère de la maquette.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2613 mise à jour (entrées `[2]`, `[3]` retirées).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e2 ne rend aucun écart non expliqué ; à 1024, les sections passent sous la carte (ADR-0106 § 4).

## Hors périmètre

- La projection côté API (TCK-2943).

## Notes d'implémentation

_(à remplir par implementing-specs)_
