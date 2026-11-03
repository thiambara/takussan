---
id: TCK-2361
title: "Front : une case WhatsApp refusée se dit, un favori retiré revient même menu fermé, un motif refusé reste dans son dialogue"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-237--gestes-en-deux-requêtes-dont-le-second-échec-est-avalé"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-243--écritures-optimistes-du-front-posées-avant-la-réponse-sans-retour-arrière-ni-relecture-sur-léchec"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-244--champs-de-saisie-remis-à-zéro-avant-la-réponse-face-aux-bornes-de-lapi-que-le-champ-ne-porte-pas"
  adr:
    - "docs/adr/0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md"
tags: [front, erreurs, favoris, crm, publication, pistes]
---

## Contexte

Trois pistes `retenu · autonome` du fichier de pistes, classées A1 par le mesureur
(2026-10-25, `db3e25230`). Aucune n'est `validé` : il n'y a pas de précision du porteur à
recopier, c'est le classement du mesureur qui autorise, et le correctif suit la `Piste` et la
ligne `Mesure` de chaque entrée.

- Réf : **P237.02** — `CoordonneesPublication.verifierCode` : le code accepté, l'enregistrement de
  la case WhatsApp refusé ne laissait qu'un « Numéro vérifié. ». La réponse cochée était perdue
  sans un mot (A1 : le geste voisin `repondreWhatsApp` dit déjà son échec avec le message de
  l'action).
- Réf : **P243.01** — `FavoritesPopover.removeOne` remettait le bien par l'`onError` passé à
  `mutate()` (TCK-2214, P228.03). En TanStack Query v5, ce rappel ne part que pour le dernier
  appel, et jamais si le corps du menu est démonté avant la réponse : deux retraits refusés ne
  remettaient que le second bien, et un retrait refusé menu fermé n'en remettait aucun (A1 : le
  contrat de TCK-2214).
- Réf : **P244.01** — `ReasonDialog` (motif d'une étape terminale) : le tableau et la fiche
  lançaient la mutation puis fermaient le dialogue dans le même geste. Sur un refus (422 d'un motif
  de plus de 5 000 caractères, 403, réseau), le motif saisi n'existait plus nulle part ; le champ ne
  portait pas la borne `max:5000` de `UpdatePipelineStageCustomerRequest` (A1 : patron de TCK-2212,
  P228.02).

## Delta à produire

- [x] `CoordonneesPublication` : sur le refus de la case WhatsApp après un code accepté, le message
      de l'action s'affiche en alerte ; « Numéro vérifié. » reste dit pour la vérification.
- [x] `FavoritesPopover` : `mutateAsync(…).catch(() => storeAdd(id))`, le patron de `useFavorite`.
- [x] `ReasonDialog` : `maxLength={5000}`, props `erreur` (dite dans le dialogue) et `enCours`
      (confirmation désactivée en vol).
- [x] `CustomerStageControl` et `PipelineKanban` : le dialogue se ferme dans le `onSuccess` de
      l'appel, le refus s'y lit, et l'ouverture d'un dialogue neuf remet la mutation à zéro.

## Critères d'acceptation

- [x] AC1 (P237.02) — Code accepté, case WhatsApp refusée → l'alerte porte le message de l'action,
      « Numéro vérifié. » reste en statut, `setUser` n'est pas appelé.
- [x] AC2 (P243.01) — Avec la vraie mutation, deux retraits refusés ensemble → les deux biens
      reviennent dans le store.
- [x] AC3 (P243.01) — Menu fermé par Échap avant le refus → le bien revient.
- [x] AC4 (P244.01) — Fiche et tableau, refus en 422 → le dialogue reste ouvert, le motif saisi y
      est, et l'erreur s'y lit en alerte.
- [x] AC5 (P244.01) — Le champ du motif porte `maxlength="5000"`.
- [x] AC6 (P244.01) — Succès → le dialogue se ferme (garde contre un dialogue qui ne se fermerait
      plus).

## Hors périmètre

- P244.01 : le toast de 4 s du tableau (`runStageMutation`) reste aussi sur un refus venu du
  dialogue. Il n'est pas retiré, choix conservateur : l'erreur se lit alors deux fois.
- `crm.pipeline.reasonDialog.descriptionConverted` et `descriptionLost` manquent dans
  `messages/fr.json` (relevé par les tests, `MISSING_MESSAGE`) : défaut antérieur, non corrigé ici.

## Notes d'implémentation

- Tests neufs : `CoordonneesPublication.whatsapp-refuse.p237-02.test.tsx`,
  `FavoritesPopover.retrait-refuse.p243-01.test.tsx` (vrai `useRemoveFavoriteMutation`, seul
  `apiRequest` doublé, appels retenus puis refusés), `CustomerStageControl.motif-refuse.p244-01.test.tsx`,
  `PipelineKanban.motif-refuse.p244-01.test.tsx`.
- `FavoritesPopover.retrait-refuse.p228-03.test.tsx` doublait `mutate` : il double désormais
  `mutateAsync`, même contrat.
- Ablation, chaque correctif retiré seul : P237.02 → AC1 rouge (aucune alerte) ; P243.01 → AC2
  rouge (`[625]` au lieu de `[624, 625]`) et AC3 rouge (`[625]` sans 624) ; P244.01 (trois
  fichiers) → AC5 rouge (`maxlength` absent) et AC4 rouge dans la fiche et le tableau (dialogue
  introuvable). Correctifs remis → tout vert. AC6 est vert des deux côtés : c'est une garde contre
  l'excès inverse, pas un test du défaut.
