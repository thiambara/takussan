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

**2026-11-15 — livré (agent délégué).**

- **Accès** : `PAGES_ADMIN` reçoit l'exigence `personnel: true` sur `/app/agency/lease-settings` — un
  profil `agent` rattaché à une agence y entre sans capacité (l'API juge `personnelActifDe`, qui n'en
  est pas une). Ces pages ne sont ni une entrée « Administration » ni un repli : `cheminsDEntree`
  (nouveau) les écarte d'`entreeAdmin`, du repli de `garderPageAdmin` et de `repliDeLaVueBailleur` —
  sans quoi chaque agent recevait « Administration » vers les réglages de bail. `sectionsMontrees`
  montre « Réglages de bail » à tout lecteur de la fiche. La page ne redirige plus ; l'état lecture
  se choisit dans `ReglagesDeBail` sur `can_edit` SEUL.
- **Décision (mineure, tranchée)** : « Mon agence » (`/app/agency`) reste fermée à l'agent. Sur la
  page des réglages, l'agent n'a donc ni la navigation des sections (chaque entrée le renverrait) ni
  le repli `/app/agency` au téléphone (`/app`) ; `CadreDeLaFiche` reçoit `navigation` et `repli`, et
  ne lit plus le dossier KYC quand ni navigation ni jauge ne s'affichent. « La section de Mon agence »
  de l'AC4 se lit donc : la section-page, atteinte par son adresse.
- **Retour au bail** : `lib/agence/retour-au-bail.ts`. Aucun chemin libre ne voyage (redirection
  ouverte) : `?depuis=bail&booking_id=&property=&customer=&locataire=`, entiers positifs ;
  « Reprendre le bail » reconstruit `/app/leases/new?…` — même adresse, donc même clé de brouillon
  (`cleDuBrouillonDeBail`). Le nom du locataire est relu par `locataire` (`useLeaseCustomer`) : le
  brouillon ne garde que les champs SAISIS, un locataire venu de `?customer=` ou d'une candidature
  n'y est pas ; sans locataire choisi, « Vous venez d'un nouveau bail. ». Aucun nom dans l'adresse.
- **« Modifier »** (même onglet) : `await brouillon.flush()` (la dernière frappe est encore dans
  l'attente de 800 ms) PUIS `router.push` ; un brouillon en échec retient la page et le dit
  (`lease.form.reglages.brouillonEchec`). Un clic modifié (⌘/Ctrl) reste au navigateur. Clé
  `lease.form.reglages.nouvelOnglet` retirée, remplacée par `reglages.cible`.
- **e4** : l'annonce « Réglages enregistrés… » reste lue (`aria-live`) mais n'est plus montrée quand
  l'encart du bail la dit. **e1** : pas en lecture seule (« Changez une valeur » ne s'adresse pas à qui
  ne peut pas). En lecture, aucun encart de bail (on n'y vient que par « Modifier », réservé à qui écrit).
- **Prémisse différait** : l'encart « Réglages de l'agence appliqués » vit dans la section
  Conditions (étape 3 au téléphone), pas au récapitulatif « Vérifier » ; « ramène au récapitulatif »
  = ramène à l'étape enregistrée dans le brouillon.
- **Aucun lien ne mène l'agent à la page** : il l'atteint par son adresse. « Modifier » (nouveau
  bail) reste réservé à qui écrit (`can_edit_agency_settings`), et l'API ne rend aucun drapeau
  « peut lire » où accrocher un lien « Voir » ; « Mon agence » lui reste fermée.
- **Limite de l'étape** : un formulaire seulement prérempli n'écrit aucun brouillon (TCK-566) ; revenu
  au bail, il repart de l'étape initiale de l'adresse (au téléphone, Conditions quand le bien et le
  locataire y sont).
- **Tests** : `ReglagesDeBail.tck-2921` (9), `CreateLeaseForm.retour-au-bail.tck-2921` (5, dont l'aller-
  retour : loyer 250 000 et locataire repris, pénalité relue à 8 % ; au téléphone, l'étape Conditions
  part et revient), `retour-au-bail.tck-2921` (3), `lease-settings/__tests__/page.tck-2921` (3 : agent non
  renvoyé, sans navigation, repli `/app` ; admin avec navigation ; retour et repli du bail),
  `pages-admin.test` (5 cas + 3 attentes mises à jour), `pages-admin-server.test` (2 cas : l'agent ouvre
  les réglages, et refusé sur `/app/agency` va sur `/app`), `fiche.test`,
  `CreateLeaseForm.modifier-les-reglages.tck-2832` (`_blank` → même onglet). 12 ablations une à une,
  toutes rouges, restaurées par `cp` (md5 vérifié). Tests de `admin-agency/fiche`, `app/agency`,
  `lib/navigation` et `components/layout` rejoués : 88 fichiers verts.
- **Fidélité** : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2921.json` (e1, e3, e4, e5) écrite ;
  références de la maquette à geler par la session ; AC-F2 à AC-F4 **non mesurés** (consigne du lot :
  aucun relevé au navigateur), jugés à la lecture de la maquette.
- Hors zone, rouges d'agents en cours : `app/tasks/__tests__/page.pour.tck-2857` (`fields[customers]`,
  zone de TCK-2890 — il double `pages-admin-server`) ; `check-i18n-namespaces` (espace `journee` aux
  frontières calendar/visits, zone de TCK-2886).
