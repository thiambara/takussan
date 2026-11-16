---
id: TCK-2941
title: "Page d'invitation : « Aide » dans la barre, « Modifier » le numéro, les biens du bailleur en vignettes, les essais restants, le nom de l'invitante sur le lien expiré et le compte connecté dans la barre"
status: done
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2939]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [front, entree, invitation, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité trouve de l'aide, corrige son numéro, reconnaît ses biens, reçoit son code autrement que par SMS, sait combien d'essais il lui reste, et voit sous quel compte il est connecté.

## Contrat de données

- Aperçu public enrichi, numéro corrigé, `attempts_left`, prénom de l'invitant sur le 410 (TCK-2939). La voie par appel est dans TCK-2948.
- « Aide » : le téléphone public de l'agence (déjà dans l'aperçu, ADR-0094 § 1). Le site public n'a **pas** de page de contact (relevé du 2026-11-15) : l'aide n'en invente pas.
- Compte connecté : la session (nom, initiales) déjà lue par la page pour l'état « Déjà inscrit ».

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-invitation`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-invitation.tsx`, visionneuse `?p=app-entree-invitation&a=a`.
  - **e0 « Invitation valide »** : barre « Aide » (**téléphone**, `:66`) / « Besoin d'aide ? » (**bureau**, `:75`) ; champ du numéro avec « Modifier » (**les deux**, `:281`, `:305`) ; **bureau** : panneau de l'agence avec adresse (`:168`) et vignettes des biens du bailleur (photo, titre, quartier, `:157-197`).
  - **e1 « Code »**, **les deux** : état code faux « Ce n'est pas le bon code. Il te reste 2 essais avant d'en demander un autre. » (`:359`).
  - **e2 « Lien expiré »**, **les deux** : le nom de l'invitante dans le texte (remplacé aujourd'hui par la date).
  - **e3 « Déjà inscrit »** : avatar « MN » à droite de la barre (**téléphone**, `:581`), nom + avatar (**bureau**, `:603-609`).
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-invitation (e0, e1, e3), « écarts couverts » 5, 6, 7, 10, « non vérifiables » ; fiche TCK-2611.

## Contraintes strictes (métier)

- « Aide » ouvre une feuille (tél.) / un menu (bureau) avec « Appeler {agence} » et « Écrire à {agence} sur WhatsApp » quand son téléphone est public ; sans téléphone public, « Aide » n'est pas rendu (la barre garde « Retour au site »). Jamais le jeton dans un lien sortant (`Referrer-Policy: no-referrer` conservé).
- « Modifier » n'est rendu que si l'ADR amendé (TCK-2939) l'autorise.
- Le message des essais restants utilise `attempts_left` (pluriel géré) ; sans le champ, le message actuel.
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de la maquette là où la page le porte déjà.

## Delta à produire

- [x] « Aide » / « Besoin d'aide ? » dans la barre.
- [x] « Modifier » du numéro donné par l'agence.
- [x] Panneau bureau : adresse et vignettes des biens du bailleur.
- [x] Message des essais restants ; prénom de l'invitant sur le lien expiré.
- [x] Compte connecté dans la barre (e3).
- [ ] Vérifications au navigateur (AC7).

## Critères d'acceptation

- [ ] AC1 — Pour une agence au téléphone public, la barre de l'invitation porte « Aide » à 390 et « Besoin d'aide ? » à 1440 ; le geste offre « Appeler » (`tel:`) et WhatsApp (`wa.me`) vers ce numéro. Sans téléphone public, ni l'un ni l'autre.
- [ ] AC2 — Pour une invitation par SMS, le numéro figé porte « Modifier » ; le modifier puis demander le code envoie `phone` au nouveau numéro.
- [ ] AC3 — À 1440, l'invitation d'un bailleur à 3 biens en attente montre, dans le panneau de l'agence, l'adresse de l'agence et 3 vignettes (photo, titre, quartier).
- [ ] AC4 — Un lien expiré dont le 410 rend `inviter_first_name: "Awa"` dit « Awa vous avait invité… » ; sans le champ, le texte actuel avec la date.
- [ ] AC5 — Un code faux avec `attempts_left: 2` affiche « Ce n'est pas le bon code. Il te reste 2 essais avant d'en demander un autre. » ; avec `1`, « 1 essai ».
- [ ] AC6 — Connecté (état « Déjà inscrit »), la barre porte l'avatar (initiales) au téléphone, le nom et l'avatar au bureau, à la place de « Retour au site ».
- [ ] AC7 — Vérifier au navigateur : bloc « compte existant » d'une invitation par e-mail dont l'adresse a déjà un compte ; voie mot de passe seule avec `phone_login` éteint (e0). Corriger ce qui manque.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2611 mise à jour (entrées `#0`, `#2`, `#3`, `#4`, essais, nom de l'invitante et barre de e3 retirées, ou motif réécrit si le porteur refuse l'amendement d'ADR-0094).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e0, e1, e2, e3 ne rend aucun écart non expliqué.

## Hors périmètre

- Une page d'aide ou de contact générale du site (aucune n'existe). La voie par appel (TCK-2948).

## Notes d'implémentation

2026-11-16 — implémenté (agent délégué, arbre `takussan-manques`), front seul : l'API est celle de TCK-2939.

**Prémisses re-mesurées, et ce qui différait** :
- **L'adresse de l'agence** n'existe pas : l'amendement d'ADR-0094 (§ 1, TCK-2939) la maintient hors de l'aperçu (la fiche
  publique ne sert que la ville). AC3 « l'adresse de l'agence » est tenu par la **ville**, déjà rendue dans le panneau.
- **AC5, tutoiement** : la page **vouvoie** (ADR-0095, `check-vouvoiement`) — « Ce n'est pas le bon code. Il vous reste
  2 essais avant d'en demander un autre. » (« 1 essai » ; `0` : « Il ne vous reste plus d'essai : demandez un nouveau
  code. »). Lu seulement sur un 422 `phone_code_invalid` dont `attempts_left` est un entier ≥ 0 ; sinon le message d'avant.
- **AC4** : le texte d'avant disait « {agence} vous l'a envoyée le {date} » ; avec le prénom : « Awa vous avait invité
  chez Dakar Immo le 3 nov. … » (la date en fin de phrase garde le point de l'abréviation). Sans agence :
  « Awa vous avait invité le 3 nov. … ». Sans prénom servi : le texte d'avant.
- La voie par appel (TCK-2948) est réutilisée telle quelle ; la barre de l'écran du code (déclarée par la page) reçoit
  « Aide » à la main.

**Décisions tranchées (« valide tes choix »)** :
- **La barre** : un champ additif `aDroite` de `DeclarationDEntree` (coque d'entrée, `CoqueDEntree.tsx`, bloc TCK-2941)
  remplace « Retour au site » dans les deux barres ; la **marque reste la sortie**, avec sa garde de saisie (testé).
  Priorité : connecté → le compte ; sinon téléphone public → l'aide ; sinon rien de déclaré (« Retour au site »).
  Connecté avant la relecture de la session : la place est gardée vide (ni l'aide ni « Retour au site » ne clignotent).
- **L'aide** : feuille du bas (`FeuilleDuBas`) au téléphone, menu (`DropdownMenu`) au bureau, deux gestes —
  « Appeler {agence} » (`tel:` en E.164 par `telephonePublie`, `agencies.phone` gardant la saisie brute) et « Écrire à
  {agence} sur WhatsApp » (`wa.me/<chiffres>?text=` d'un texte fixe, `target=_blank rel="noopener noreferrer"`). Aucun
  lien ne porte le jeton ni l'URL de la page (testé). Rendue aussi sur un lien fermé (e2) dont le 410 sert le téléphone.
- **« Modifier »** : invitation par SMS **non partagée** seulement (`code_only` → absent, l'API rendrait 422). Le numéro
  masqué laisse place au champ du numéro (focus posé, vide) ; le numéro corrigé part à `…/code` ET à `…/verify` ;
  « Garder le numéro donné par {agence} » revient en arrière. « · Modifier » de l'écran du code est désormais rendu
  pour une invitation par SMS (il ramène au numéro, en correction).
- **Vignettes** : bailleur seulement, dans le panneau de l'agence du bureau (≥ 1280, comme la maquette), trois au plus
  (relu côté front aussi), photo publique ou aplat et icône si absente ou cassée.

**Preuves** : `npx vitest run` de `src/app/invitations/accept/__tests__/` (dont les deux fichiers neufs
`EntreeDInvitation.tck-2941` 17 et `EcranFerme.tck-2941` 3), `src/components/entree/__tests__/`,
`src/lib/__tests__/invitation-apercu.tck-2611` : verts. Trois tests d'avant réécrits, le comportement changeant :
`tck-2611` AC3 (« · Modifier » désormais rendu par SMS), `sortie.tck-2598` (fixture sans téléphone public ; le cas
connecté passe par la marque ; un cas neuf : « Aide » à la place de « Retour au site », la marque garde la sortie),
`invitation-apercu` (champs neufs). Ablations une à une (md5 restauré) toutes rouges : `phone` corrigé absent de
`…/verify`, « Modifier » sur un lien partagé, `attempts_left` ignoré, `aDroite` non propagé par `Declarant`, `tel:` sans
`telephonePublie`, prénom du 410 ignoré, vignettes pour tout rôle, place du compte non gardée. `tsc --noEmit`, `eslint`,
`check:i18n`, `check-i18n-namespaces` (aucun espace neuf : `invitationAccept` et `common`), `check-vouvoiement`,
`scripts/check-*.mjs` : verts.

**Non mesuré** : AC7 et AC-F2 (consigne du lot : aucun relevé au navigateur). AC7 est éprouvé en vitest (bloc « compte
existant » d'une invitation par e-mail ; voie mot de passe seule drapeau éteint, `tck-2611`). AC-F1 : fiche
`TCK-2611.json` — motifs réécrits (aide et compte de la barre, ville pour l'adresse, vignettes, « Modifier », prénom du 410).
