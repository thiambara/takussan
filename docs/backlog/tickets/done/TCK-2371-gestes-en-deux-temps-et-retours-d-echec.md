---
id: TCK-2371
title: "Relance et révocation par l'invitation du brouillon, brouillon non effacé dit, gestes refusés relus, et la description du dialogue « converti / perdu »"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-237--gestes-en-deux-requêtes-dont-le-second-échec-est-avalé"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-243--écritures-optimistes-du-front-posées-avant-la-réponse-sans-retour-arrière-ni-relecture-sur-léchec"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, api, invitations, brouillons, medias, favoris, crm, i18n, pistes]
---

## Contexte

Lot L39 : trois pistes `validé` du fichier de pistes (second tour, 2026-10-25), plus une
correction sans entrée de piste, décidée par le porteur (point 37). La mesure du mesureur
(2026-10-25, `db3e25230`) tient lieu de re-vérification ; chaque prémisse a été re-mesurée sur
l'arbre (`f45487cad`) avant le code, par le test qui en est devenu la garde.

- Réf : **P237.01** — relancer ou révoquer l'invitation d'un bailleur ou d'un prestataire passait
  par une recherche `GET /api/invitations?filter[email]=…` qui avalait toute panne en « Aucune
  invitation en attente », et qui ne partait même pas pour un brouillon invité au seul numéro.
- Réf : **P237.04** — `useWizardDraft.clear()` rangeait l'échec du `DELETE` dans `error` sans
  le rendre : `UpgradeRequestForm` et `WizardReprenable` annonçaient la démarche close pendant que
  le bandeau la reproposait ; la dépublication et la suppression en lot de la console ne
  relisaient la liste que sur un succès complet.
- Réf : **P243.02** — `MediaManager` remettait l'instantané entier d'avant le geste sur un échec,
  faux dès que deux gestes se recouvrent ; un favori refusé remettait le cœur sans un mot.
- **Point 37** (porteur, sans Réf) — le dialogue « converti / perdu » du pipeline lit
  `crm.pipeline.reasonDialog.descriptionConverted` et `descriptionLost`, absentes de `fr`, `en` et
  `wo` ; le dialogue peignait le chemin de la clé.

## Décision du porteur

- **P237.01** :
  > validé — validation du porteur (2026-10-25) : l'API porte l'identifiant de l'invitation en attente dans le profil brouillon, et le front relance ou révoque par cet identifiant sans plus chercher ; une panne n'est plus dite « Aucune invitation en attente »
- **P237.04** :
  > validé — validation du porteur (2026-10-25) : l'échec de `clear()` après une soumission réussie se dit par un toast, et la liste du lot se relit dans `onSettled`
- **P243.02** :
  > validé — validation du porteur (2026-10-25) : sur l'échec d'un geste de la grille, la liste se relit ; le refus d'un favori se dit par un toast `messageErreur`
- **Point 37** : écrire « Précisez pourquoi ce client est converti. » et « Précisez pourquoi ce
  client est perdu. », les traduire en `en`, mettre le français en `wo`, et rendre ces clés
  visibles à la garde.

## Delta à produire

- [x] API : `Invitation::idEnvoyeePour()`, sous-requête corrélée de la dernière invitation `sent`
      d'un profil ; `GET /api/owners` et `GET /api/agencies/{id}/service-providers` rendent
      `pending_invitation_id` sur chaque ligne (agence du profil pour le bailleur, agence du carnet
      pour le prestataire), quelle que soit la liste `fields[]`.
- [x] Front : `OwnersList` et `ServiceProvidersList` relancent et révoquent par
      `pending_invitation_id` ; `resolveInvitationId` disparaît.
- [x] Front : `useWizardDraft.clear()` rend `Promise<boolean>` ; `UpgradeRequestForm` et
      `WizardReprenable` ajoutent un toast « Brouillon non effacé » (avertissement) à leur succès.
- [x] Front : `SuperAdminPropertiesTable`, dépublication et suppression en lot : `onSettled`
      relit la liste, `onSuccess` remet la sélection à zéro, le refus reste dit.
- [x] Front : `MediaManager.onRelire` (branché par `PropertyMediaPanel`) : sur l'échec de
      réordonner, mettre en couverture ou supprimer, la grille se pose sur la liste relue ; une
      suppression encore en vol reste retirée ; sans `onRelire`, l'instantané reste le repli.
- [x] Front : `FavoriteButton` et `useFavorite` disent le refus par un toast (`messageErreur`).
- [x] i18n : `crm.pipeline.reasonDialog.descriptionConverted` et `descriptionLost`,
      `wizardDrafts.component.draftNotClearedToast*`, `agency.upgrade.form.toasts.draft_not_cleared_*`,
      `favorites.button.refusedTitle` — `fr` et `en`, le français en `wo`.

## Critères d'acceptation

- [x] AC1 (P237.01) — Un bailleur invité au seul numéro, un bailleur invité par e-mail (sans
      `fields[]`) et un prestataire invité au seul numéro portent l'identifiant de leur invitation ;
      une invitation révoquée rend `null` ; l'invitation plus récente d'une autre agence n'est pas
      celle du carnet.
- [x] AC2 (P237.01) — Relance et révocation partent par `/api/invitations/<id>/…` sans requête
      `/api/invitations?` ; une panne du geste se dit par son message, jamais par « Aucune
      invitation en attente » ; sans invitation, le dire sans requête.
- [x] AC3 (P237.04) — `clear()` rend `true` sur un `DELETE` 204, `false` sur un 500.
- [x] AC4 (P237.04) — Demande pro et assistant : le succès reste dit, et un `DELETE` refusé ajoute
      « Brouillon non effacé » ; un `DELETE` accepté n'ajoute rien.
- [x] AC5 (P237.04) — Lot de la console refusé sur un bien après un autre accepté : la liste se
      relit, et le refus reste dit ; un lot accepté se relit une seule fois.
- [x] AC6 (P243.02) — Suppression refusée après une autre acceptée : la grille rend la liste relue
      (1 et 3, pas 2) ; refusée pendant qu'une autre est en vol : celle-ci ne reparaît pas ;
      réordonnancement refusé : l'ordre relu.
- [x] AC7 (P243.02) — Favori refusé (bouton des cartes et hook de la fiche) : le cœur revient, et
      un toast porte le message de l'erreur.
- [x] AC8 (point 37) — Le dialogue dit sa phrase pour « converti » et « perdu », en français et en
      anglais.

## Hors périmètre

- **Point 37, « rendre ces clés visibles à la garde »** : aucune garde du dépôt ne confronte les
  clés du code au dictionnaire. `check:i18n` compare les langues entre elles (le dit l'en-tête de
  `scripts/check-status-labels.mjs`), et `check:i18n-namespaces` ne garde que le découpage. Les
  deux littéraux étaient déjà écrits en entier dans le ternaire. Une garde des clés appelées n'est
  pas simple : un relevé jetable par motif (lecteur `useTranslations('<ns>')` → appels `t('…')`)
  rend 424 clés « absentes » sur 6 625 appels, presque toutes des faux positifs de portée. La garde
  de ces deux clés est donc un test de rendu (`ReasonDialog.description.tck-2371.test.tsx`).
  Une garde générale des clés appelées serait un ticket à part.
- `PropertyWizard.terminer()` appelle `clear()` après la création du bien sans lire son sort :
  même défaut que P237.04, hors des sites que l'entrée nomme, non corrigé ici.
- Le carnet des prestataires ne liste par défaut que les collaborations `active`, et un
  prestataire invité naît en `paused` : `ServiceProvidersList` ne demande pas
  `filter[collaboration_status]`, et un brouillon n'y paraît sans doute pas (lu, non mesuré à
  l'écran).
- `pending_invitation_id` ne retient que le statut `sent` (comme la recherche qu'il remplace) : une
  invitation passée à `expired` par la tâche planifiée ne se relance plus depuis le carnet, alors
  que `InvitationService::resend` l'accepterait.

## Notes d'implémentation

- Tests neufs : API `InvitationEnAttenteDuBrouillonTest` ; front
  `OwnersList.invitation-en-attente.p237-01`, `ServiceProvidersList.invitation-en-attente.p237-01`,
  `SuperAdminPropertiesTable.lot-refuse.p237-04`, `MediaManager.echec-relu.p243-02`,
  `FavoriteButton.refus-dit.p243-02`, `ReasonDialog.description.tck-2371` ; cas ajoutés à
  `useWizardDraft.test`, `UpgradeRequestForm.test`, `WizardReprenable.test`.
- Doublures mises au contrat : les deux tests de second facteur des carnets lisent
  `pending_invitation_id` ; les doublures de `clear()` des assistants d'accueil rendent `true` ;
  `FavoriteButton.test` monte un `ToastProvider` (les cartes en exigeaient déjà un, par le
  comparateur).
- `UpgradeRequestForm` lit ses libellés dans son propre espace : lire `wizardDrafts` faisait entrer
  cet espace dans la section `settings` (`check:i18n-namespaces`).
- Ablation, chaque correctif retiré seul (fichiers source remis à leur version d'avant) : P237.01
  API → les 4 tests rouges (clé absente) ; contrainte d'agence retirée → le test prestataire rouge
  (2 au lieu de 1) ; contrainte `sent` retirée → le test de la révoquée rouge. P237.01 front → 6
  rouges sur 8 (les deux « sans invitation » sont des gardes contre l'excès, verts des deux côtés).
  P237.04 → 5 rouges. P243.02 → 4 rouges ; filtre des suppressions en vol retiré seul → le test
  de la suppression en vol rouge. Point 37 → les 4 rouges (`MISSING_MESSAGE`). Correctifs remis →
  tout vert.
