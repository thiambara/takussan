---
id: TCK-2775
title: "L'écran Impayés ouvre la relance depuis son URL : l'accueil y mène au lieu d'embarquer la relance"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2624, TCK-2660]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, impayes, relance, accueil, dictionnaire, poids]
---

## Objectif utilisateur

L'admin qui touche « Relancer » sur son accueil arrive sur l'écran Impayés avec la relance déjà ouverte —
la feuille de l'échéance touchée, ou la file guidée des échéances de bail pour « Relancer tout » — sans
retoucher le geste. L'accueil, lui, ne charge plus le code ni les libellés de la relance.

## Contexte

TCK-2624 (lot 1, décision 4 validée le 2026-11-13 avec ce suivi) monte la relance de la famille 6 **sur**
l'accueil : `FeuilleDeRelance` pour une échéance, `FileDeRelance` + `useFileDeRelance` pour « Relancer
tout ». C'est conforme à AC6 (WhatsApp depuis le téléphone de l'admin, journal écrit par l'API, aucun envoi
par Takussan), mais le graphe d'imports de l'accueil atteint alors `admin`, `lease` et `payments` : la
frontière `(dashboard)/app/(accueil)` de `src/i18n/namespaces.json` est passée de 27 à 45 % (mesuré 44,7 %),
le même cas que la fiche du bien (TCK-2639, décision 7, suivi TCK-2758).

Deux voies règlent le poids ; ce ticket prend celle qui ne touche pas aux clés, TCK-2758 l'autre. Le
porteur choisit l'ordre ; les deux peuvent coexister.

## Contrat de données

Aucun endpoint touché. Les lectures restent celles de l'écran Impayés (`payments/history` filtré
`days_late_min=1`, trié `-days_late`, plafond `per_page` 100 de `PaymentController::history`).

## Contraintes strictes (métier)

- **Une seule relance** (décision du porteur du 2026-11-10, point 14 a) : l'écran Impayés ouvre SA feuille et
  SA file, aucune copie.
- L'URL n'écrit rien : arriver sur `…?relance=…` ouvre la feuille ou la file, aucun envoi ni journal tant que
  l'admin n'a pas agi ; un rechargement ne rejoue pas un geste déjà noté.
- Une échéance nommée par l'URL et absente des impayés (soldée entre-temps, autre agence) n'ouvre rien et le
  dit ; l'écran reste utilisable.
- Ordre de la file : celui de « Relancer tout » de l'écran (`ordreDeLaFile`), échéances de bail seules.

## Delta à produire

- [ ] `/app/agency/finances?tab=impayes&relance=<id d'échéance>` ouvre `FeuilleDeRelance` de cette échéance ;
  `&relance=file` démarre la file guidée (`useFileDeRelance().demarrer`).
- [ ] Le paramètre est retiré de l'URL une fois lu (`router.replace`), pour qu'un retour arrière ne rouvre pas.
- [ ] L'accueil de l'admin (TCK-2624) mène à ces URL au lieu de monter la relance ; `FeuilleDeRelance`,
  `FileDeRelance` et `useLireLesEcheancesARelancer` quittent son graphe d'imports.
- [ ] `src/i18n/namespaces.json` régénéré (`--update`) : `admin`, `lease`, `payments` quittent la frontière
  `(dashboard)/app/(accueil)` si plus rien ne les lit ; plafond resserré sur la mesure.

## Critères d'acceptation

- [ ] AC1 — `…?tab=impayes&relance=77` ouvre la feuille de relance de l'échéance 77 ; aucun appel non-GET au
  chargement.
- [ ] AC2 — `…?tab=impayes&relance=file` ouvre la file sur l'échéance de bail la plus en retard ; une échéance de
  réservation n'y entre pas.
- [ ] AC3 — `…&relance=999` (absente) : rien ne s'ouvre, un message le dit, la table s'affiche.
- [ ] AC4 — Après lecture, l'URL ne porte plus `relance` ; un retour arrière ne rouvre rien.
- [ ] AC5 — « Relancer » de l'accueil (rangée et carte du téléphone) est un lien vers ces URL ; la frontière de
  l'accueil ne sert plus `admin` (mesure `check-i18n-namespaces.mjs --report`).
- [ ] Ablation : ignorer le paramètre fait rougir AC1 et AC2 ; ne pas le retirer de l'URL fait rougir AC4.

## Hors périmètre

- Le déplacement des clés de la relance hors de `admin` (TCK-2758).
- La relance du bailleur ou de l'hôte (aucune relance de leur accueil).
