---
id: TCK-2946
title: "Assistant du prestataire : la carte d'intervention complète, et au bureau les tarifs, les disponibilités et « Enregistrer mon profil » dans l'écran"
status: done
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

Implémenté le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`), « valide tes choix » : décisions mineures tranchées ci-dessous.

**Prémisses re-mesurées — ce qui différait :**
- « Tutoiement de l'entrée conservé » : faux depuis ADR-0095 (révision du 2026-11-10, « utilise toujours le vouvoiement ») ; les clés existantes de l'écran vouvoient. Les libellés neufs vouvoient.
- AC4 : le panneau multi-agences (`page.tsx`) remplaçait TOUT l'écran 2 pour un prestataire à plus d'une collaboration arrivé par `?sp=` — ni la carte, ni la fin d'onboarding qui lui assigne la demande. La maquette en fait une variante de e2 (une note). Corrigé : avec `?sp=`, l'écran 2 + la note « Vous travaillez déjà avec {agences} » (`MultiAgences`, prop `autresAgences`) ; sans lien de reprise, le panneau de TCK-262 reste. `complete()` se rejoue sans dommage sur un profil actif (lu dans `ServiceProviderOnboardingService`).
- `TradesPayload` exigeait métiers et zones : `patchSpTrades` / `spPatchTradesAction` prennent désormais `Partial<TradesPayload>` (l'API n'écrit que les clés présentes, TCK-592) — l'écran 2 n'envoie que les tarifs.

**Choix :**
- Pastille : `respond_by` − maintenant (lu au montage), en heures arrondies au-dessus jusqu'à 72 h (« À traiter sous 47 h »), au-delà « À traiter avant le {date} », passée « Délai de réponse dépassé » ; absente sans `respond_by`. Sur la photo (haut gauche), en tête du corps sans photo. `suppressHydrationWarning` sur le texte (serveur et navigateur peuvent différer d'une heure).
- Ligne « Signalée par {le locataire | le bailleur | l'agence} le {9 nov.} · réf. {INT-0042} » (« Signalée le … » sans rôle).
- Citation `« … »` quand `tenant_quote` ; sinon la note « L'adresse et le contact… » reste.
- « Voir le détail » : texte « Détail après acceptation » avant ; bouton après l'acceptation, vers `detail_url` s'il commence par `/app/`, sinon `/app/maintenance/{id}`. Rendu aussi sans agence.
- Tarifs/Disponibilités (`TarifsEtDisponibilites.tsx`) : dès `lg` (sous la carte de 1024 à 1279, colonne de droite dès `xl`) ; au téléphone, seul « Plus tard » (un seul dans le DOM). Écritures du profil : `PATCH …/trades` {hourly_rate, visit_fee} seulement si modifiés, puis `PATCH …/availability` seulement si les créneaux ont changé ; le soir déjà réglé est GARDÉ (la grille n'affiche que Matin/Après-midi) ; un créneau hors gabarit tombe, comme au profil. 422 → sous le champ (`hourly_rate`, `visit_fee`, `available_slots*`), sinon message général. La liste « n sur 5 » lit les valeurs enregistrées. Réglages illisibles (`null`) → aucun formulaire (rien ne s'écrase).
- Bouton « Enregistrer mon profil » en variante `sombre` (maquette, TCK-2686).

**Mesures :** `InterventionDuPrestataire.tck-2946` (9), `page.tck-2613` (6, mis à jour : champs demandés + AC4), `ServiceProviderOnboardingWizard.test` et `assistants-sans-champ-fichier.tck-2796` : 32 verts. 8 ablations rouges puis restaurées (md5) : soir gardé, tarifs seuls, tarifs non modifiés non écrits, échéance en dur, détail actif avant acceptation, erreur sous le champ, condition AC4 de la page, champs demandés. ESLint propre ; `tsc` propre sur mes fichiers (rouge restant : `AjoutAuCoffre.tck-2898.test.tsx`, coffre en cours) ; `check:i18n` rouge seulement sur `src/lib/documents/recadrage.ts` (coffre) ; `check:vouvoiement`, `check-champs-uniformes` (corrigé : pas de `h-11` sur `<Input>`) et gardes racine verts. Fiche TCK-2613 : écarts acceptés [2] et [3] passés en résolus, + la variante multi-agences.
- **Non mesuré** : AC4 et AC-F2 au navigateur (consigne du porteur du 2026-11-15 : pas de relevé de fidélité) ; disposition jugée en lisant la maquette.
