---
id: TCK-2921
title: "Réglages de bail : l'encart « rien de réglé », le retour au bail en cours (« Reprendre le bail »), et l'état « Lecture seule »"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2920, TCK-2912]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#30-setting-"
tags: [front, agence, bail, reglages, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Qui règle les baux de l'agence sait quand rien n'est encore réglé, revient au bail qu'il était en train d'écrire sans rien perdre, et un agent voit les réglages sans pouvoir les changer.

## Contrat de données

- `GET /api/settings/lease` : `can_edit` (calculé par TCK-2920) et, par réglage, la source (`agency` / `platform`).
- Aucun endpoint neuf. Le brouillon du bail en cours est **celui de TCK-2912** (« brouillon enregistré à la création », `PUT /api/me/wizard-drafts/{key}`, même clé par bien) : ce ticket l'emploie pour revenir au bail, il n'en crée pas un second.
- La spec ne décrit pas ces trois états : à reporter par `/sync-specs`.

## Direction UX / Artistique

- **Référence de fidélité** : maquette `agence-reglages-bail`, **approche A**, fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/agence-reglages-bail/index.tsx` (non versionnée), visionneuse `/fr/playground/maquettes?p=app-agence-reglages-bail&a=a`. Écrans **e1 « Vide (rien de réglé) »**, **e3 « Venu du nouveau bail »**, **e4 « Enregistré (venu du bail) »**, **e5 « Lecture seule »**, **téléphone et bureau** (les quatre manquent aux deux formats ; e0 et e2 sont conformes, ne pas les régresser).
- Audit : `audit-f6-agence-entree.md`, § agence-reglages-bail (e1, e3, e4, e5).
- **e1** (tél. et bureau) : encart neutre en tête, texte de la maquette (« Votre agence n'a encore rien réglé : chaque nouveau bail reprend les valeurs de la plateforme… »), quand **aucun** des quatre réglages n'a la source `agency`.
- **e3** (tél. et bureau) : venu de l'encart du nouveau bail, la page s'ouvre **dans le même onglet** (plus de `target="_blank"` dans le récapitulatif du bail) ; encart en tête « Vous venez du nouveau bail de {locataire}. Votre saisie est gardée en brouillon. » + bouton contour « Reprendre le bail ».
- **e4** (tél. et bureau) : après « Enregistrer », l'encart passe au ton succès : « Réglages enregistrés. Vos prochains baux les reprennent. » + bouton primaire « Reprendre le bail ».
- **e5** (tél. et bureau) : encart avec cadenas, texte de la maquette (« Vous pouvez consulter ces réglages, pas les modifier… »), valeurs rendues en texte (aucun champ, aucun « Revenir à la valeur de la plateforme », aucune barre d'enregistrement).

## Contraintes strictes (métier)

- L'état lecture se choisit sur `can_edit` **seul**, jamais sur le rôle déduit côté front.
- La section « Réglages de bail » de « Mon agence » et la page `/app/agency/lease-settings` s'ouvrent au personnel (agent compris) : `lib/agence/fiche.ts` (commentaire « pas d'état lecture » réécrit) et `lib/access/pages-admin.ts`.
- « Reprendre le bail » ramène au bail **avec toutes les valeurs saisies** (locataire, bien, dates, montants, étape) et relit les valeurs par défaut, qui peuvent avoir changé.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Encart « rien de réglé » (e1).
- [ ] Brouillon du nouveau bail (TCK-2912) enregistré avant la sortie vers les réglages ; lien du récapitulatif dans le même onglet, porteur d'un paramètre de retour.
- [ ] Encart « Vous venez du nouveau bail » + « Reprendre le bail » (e3), et sa variante enregistrée (e4).
- [ ] État « Lecture seule » (e5) ; ouverture de la section et de la page au personnel.
- [ ] Tests : les quatre états ; reprise du bail avec ses valeurs ; aucun champ en lecture.

## Critères d'acceptation

- [ ] AC1 — Avec quatre réglages de source `platform`, l'encart « Votre agence n'a encore rien réglé… » est rendu ; il disparaît dès qu'un réglage a la source `agency`.
- [ ] AC2 — Depuis le récapitulatif d'un nouveau bail rempli (locataire « X », loyer 250 000), « Modifier » ouvre les réglages dans le **même onglet** (aucun `target="_blank"`) avec l'encart « Vous venez du nouveau bail de X » ; « Reprendre le bail » ramène au récapitulatif avec le locataire X et le loyer 250 000 toujours saisis.
- [ ] AC3 — Après un enregistrement réussi venu du bail, l'encart dit « Réglages enregistrés. Vos prochains baux les reprennent. » et « Reprendre le bail » ramène au bail, dont les valeurs par défaut relues portent la nouvelle valeur de l'agence. Arrivé sans paramètre de retour, aucun encart de bail n'est rendu.
- [ ] AC4 — Un agent (réponse `can_edit: false`) atteint `/app/agency/lease-settings` et la section « Réglages de bail » de « Mon agence » ; il voit l'encart de lecture et les quatre valeurs en texte ; la page ne contient aucun `input`, aucun bouton « Enregistrer » ni « Revenir à la valeur de la plateforme ». Avec `can_edit: true`, les champs sont là (pas de régression de e0/e2).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2921.json` (modèle de TCK-2684) pour e1, e3, e4, e5.
- [ ] AC-F2 — À 390 × 844 et à 1440 × 900 (densité ×0,9, [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` ne rend aucun écart non expliqué (ADR-0106 § 5) ; chaque écart restant a son motif dans la PR.
- [ ] AC-F3 — Aucun libellé ni icône de ces quatre écrans absent sans alias ou motif écrit.
- [ ] AC-F4 — Largeurs intermédiaires (ADR-0106 § 4) : à 1024 et 768, aucun défilement horizontal du document.

## Hors périmètre

- La règle d'accès côté API (TCK-2920).
- Le brouillon de bail lui-même (TCK-2912).

## Notes d'implémentation

_(à remplir par implementing-specs)_
