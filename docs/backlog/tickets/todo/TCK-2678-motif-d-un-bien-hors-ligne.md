---
id: TCK-2678
title: "Un bien hors ligne dit pourquoi : des codes de motif servis par l'API, issus du même prédicat que « En ligne »"
status: todo
phase: P2
family: full
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2637, TCK-2638, TCK-2639, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
tags: [back, front, properties, en-ligne, audit-ux, app]
---

## Objectif utilisateur

Le bailleur ou l'agent qui voit « Hors ligne » sur un bien sait aussitôt pourquoi — privé, en attente
de validation, loué, agence suspendue… — et ce qu'il peut faire pour le remettre en ligne, sans
appeler l'agence ni deviner.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `Property::scopePublic` (`Property.php:607-624`) exige : agence active (`ofPublicAgency` :
  `agency_id` nul ou agence `active`), `visibility = public`, `is_test = false`, `published_at` non
  nul, statut hors `draft, sold, rented, archived, under_maintenance, unavailable, pending_review,
  rejected` (`Property::NON_PUBLIC_STATUSES`).
- TCK-2637 extrait ce prédicat en un seul endroit (`Property::isOnline()` ou équivalent) et sert
  `is_online` ([ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md) § 1).

**À créer** :

- Le prédicat **décomposé** : une fonction unique qui rend la liste des conditions non remplies, et
  dont `isOnline()` devient « la liste est vide ». Il n'y a **pas** deux définitions.
- Champ `offline_reasons` sur `PropertyResource` : liste de codes, vide quand le bien est en ligne,
  demandé comme tout champ (`fields[properties]=…,offline_reasons`, [ADR-0006](../../../adr/0006-lecture-api-par-query-builder.md)).
- Codes, un par condition, dans cet ordre de priorité d'affichage :

  | Code | Condition non remplie |
  |---|---|
  | `agency_inactive` | l'agence du bien n'est pas `active` (suspendue ou inactive, [ADR-0048](../../../adr/0048-effet-d-une-suspension-d-agence.md)) |
  | `status_<valeur>` | le statut est dans `NON_PUBLIC_STATUSES` (ex. `status_pending_review`, `status_rented`) |
  | `not_published` | `published_at` est nul |
  | `private` | `visibility ≠ public` |
  | `test` | `is_test = true` |

- L'API ne rend **que des codes** ([ADR-0032](../../../adr/0032-l-api-n-ecrit-plus-de-prose.md)) ; le texte est au front.

## Direction UX / Artistique

- Pas de maquette dédiée : le motif se pose là où « Hors ligne » s'affiche dans les écrans retenus —
  liste des biens (`/fr/playground/maquettes?p=app-biens&a=b`) et fiche du bien
  (`?p=app-fiche-bien&a=a`), références de fidélité non versionnées (cf.
  [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes)).
- **Fiche du bien** : une phrase par motif, du plus prioritaire au moins, avec le geste quand il existe
  (« Privé — rendre public », « En attente de validation par l'agence », « Loué — remis en ligne à la
  fin du bail », « Agence suspendue »). **Amendé le 2026-11-14 (team-lead)** : la maquette retenue
  (app-biens a-2) ne dessine aucune ligne sous les pastilles ; les phrases vont en tête de l'onglet
  Annonce > Aperçu, sous « Hors ligne » (la maquette b rattache l'état à l'annonce), et la pastille
  « Hors ligne » de l'en-tête les porte en infobulle (survol, focus clavier). L'en-tête ne bouge pas.
- **Liste** : la pastille « Hors ligne » porte le premier motif en sous-texte ; au bureau, le motif
  complet au survol et au focus clavier ; au téléphone (360-390 px), le premier motif seul, sur une
  ligne, tronqué proprement.
- Bureau (≥ 1280 px) : rien ne passe en colonnes avant `lg` (`md` n'est pas le bureau).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md) § 5 (décidé par le porteur le 2026-11-10), [ADR-0032](../../../adr/0032-l-api-n-ecrit-plus-de-prose.md).

- **Un seul prédicat** : `offline_reasons` vide ⇔ `is_online = true` ⇔ le bien sort par
  `filter[public]=1`. Le front ne recompose jamais un motif à partir du statut ou de la visibilité.
- **Ce que chacun lit** : le motif se sert à qui lit déjà le bien dans la console (personnel,
  bailleur du bien, collaborateurs). Il n'est **jamais** servi par les routes publiques : un bien hors
  ligne n'y existe pas.
- Le libellé du statut `published` est « Validé » (ADR-0097 § 4, décidé le 2026-11-10) ; le mot
  « Publié » ne s'affiche toujours pas comme état.
- i18n : un libellé par code en `fr` / `en` / `wo` (le `wo` porte le texte français tel quel),
  vouvoiement. Un code inconnu du front s'affiche par un libellé générique (« Hors ligne »), sans erreur.

## Delta à produire

- [x] API : prédicat décomposé (une source), `isOnline()` qui le lit, champ `offline_reasons` dans `PropertyResource`.
- [x] Front : motifs sur la fiche du bien et dans la liste, avec les gestes existants quand il y en a.
- [x] Tests API : `PropertyOfflineReasonsTest` — un cas par code ; plusieurs codes cumulés dans l'ordre ; parité `offline_reasons == []` ⇔ `is_online` ⇔ `filter[public]=1` sur le jeu croisé de TCK-2637.
- [x] Tests front : un libellé par code ; code inconnu → libellé générique.

## Critères d'acceptation

- [x] AC1 — Sur le jeu de 8 biens de TCK-2637 (AC2), pour chaque bien, `offline_reasons` est vide **si et seulement si** il figure dans `filter[public]=1`. Retirer une condition du prédicat décomposé fait rougir ce test (ablation).
  *Preuve (2026-11-14) : `PropertyOfflineReasonsTest` 11/11 vert ; ablation de la condition `private` de `conditionsEnLigne()` → `ac1…` et `ac2…` rouges, fichier restauré (md5 vérifié).*
- [x] AC2 — Un bien `pending_review`, privé, d'une agence suspendue rend exactement `["agency_inactive","status_pending_review","private"]`, dans cet ordre.
  *Preuve : `test_ac2_les_motifs_se_cumulent_dans_l_ordre`, vert ; rouge sous la même ablation.*
- [x] AC3 — `GET /api/public/properties/{slug}` d'un bien hors ligne rend 404 et la réponse ne contient pas `offline_reasons`.
  *Preuve : `test_ac3_la_route_publique_ne_sert_jamais_de_motif` et les quatre tests de fuite (public, client, autre bailleur, agent sous profil bailleur), verts.*
- [x] AC4 — *(reformulé le 2026-11-14, décision du team-lead)* Sur la fiche d'un bien loué, la phrase « Loué » est rendue en tête de l'onglet Annonce, sous « Hors ligne », et portée en infobulle par la pastille « Hors ligne » de l'en-tête (survol, focus clavier, texte lu aux lecteurs d'écran) ; aucune ligne ne s'ajoute sous les pastilles, et aucun texte ne nomme « Publié ».
  *Preuve : `PropertyDetailTabs.motifs-hors-ligne.tck-2678.test.tsx` et `[id]/__tests__/motifs-hors-ligne.tck-2678.test.tsx`, verts (rouges avant le changement) ; ablation de la garde `is_online === false` de l'onglet → « rien pour un bien en ligne » rouge ; au focus clavier, l'infobulle porte la phrase (test rouge sans `TooltipContent`) ; relevé au navigateur à 1280 : focus sur la pastille, infobulle ouverte et non rognée (`.fidelite/TCK-2678/l3-infobulle-1280.png`).*
- [x] AC5 — À 390 px, la ligne de liste d'un bien hors ligne tient sur sa largeur (aucun défilement horizontal du document) et montre un seul motif.
  *Preuve (2026-11-14) : `fidelite balayer` de `/app/properties?mode=annonces&listing=offline` à 390 → débord 0, aucune coupe ; un seul motif visible par carte : `CarteAnnonce.tck-2638.test.tsx`, vert.*

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2678.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le quota de biens (inchangé, ADR-0097 § 6, décidé le 2026-11-10).
- Remettre un bien en ligne en un geste depuis le motif, au-delà des gestes qui existent déjà.

## Notes d'implémentation

**Écart au contrat, décidé à l'implémentation (2026-11-13) : `offline_reasons` se demande par
`include=offlineReasons`, pas par `fields[properties]=…,offline_reasons`.** ADR-0097 § 1 (amendé) et
ADR-0021 refusent un champ dérivé dans `fields[]` : `is_online` y est déjà servi par `include=online`, et le
motif suit la même voie. L'inclusion séparée garde aussi son coût (six requêtes par page : une par
condition, plus une qui lit le statut) hors des appelants actuels d'`include=online`. Un
`fields[properties]=…,offline_reasons` rend 400, épinglé.

- **Une seule source** : `Property::conditionsEnLigne()` rend la liste ordonnée des conditions de « en
  ligne » (`agency_inactive`, `status`, `not_published`, `private`, `test`) ; `scopePublic` les applique
  toutes, `offlineReasonsAmong()` juge chacune par l'identifiant des biens qui la remplissent ; le statut
  rend `status_<valeur>`. `isOnline()` et `filter[public]` ne changent pas : ils lisent `scopePublic`.
- **Qui lit** (précisé par le team-lead le 2026-11-13) : le personnel de l'agence du bien, sous son
  profil ACTIF, et le bailleur du bien (`BailleurDuBien`) ; l'opérateur de la plateforme aussi. Jamais le
  public, un client ni un autre bailleur : une ligne qu'ils voient ne porte pas la clé, et aucun code ne
  sort. Une seule porte, `App\Services\Property\MotifsHorsLigne::pour()`, pour la fiche et la liste. Elle
  ajoute une garde à `view` et à la portée de la liste, qui rendent aussi à un agent les biens qu'il a
  saisis quand il agit sous son profil bailleur d'une autre agence. Tests de fuite : public, client
  (locataire du bien loué), autre bailleur, agent sous profil bailleur ; les routes publiques rendent 404
  pour un bien hors ligne (AC3).
- **Décision (team-lead, 2026-11-13) : l'opérateur de la plateforme (super-admin) lit aussi les motifs.**
  La modération lit déjà ces biens, et la console `/super-admin` est une surface de plateforme, pas un
  lecteur public. La branche est épinglée : la retirer fait rougir les trois tests AC1/AC2 qui lisent
  en super-admin.
- **Front** : `src/lib/biens/motifs-hors-ligne.ts` traduit les codes (`property.dashboard.horsLigne.phrase.*`,
  code inconnu → « Hors ligne. ») ; la fiche les liste en tête de l'onglet Annonce > Aperçu
  (`PropertyDetailTabs`, bloc `annonce-hors-ligne`) et la pastille « Hors ligne » de l'en-tête les porte
  en infobulle (`fiche/PastilleHorsLigne.tsx` ; la copie du téléphone, tue aux lecteurs d'écran, reste une
  pastille simple) — 2026-11-14, pour que l'en-tête reste celui de la maquette a-2, la carte du mode Annonces porte le premier motif sur une ligne tronquée, les autres en texte
  lu par les lecteurs d'écran et le tout dans l'infobulle (survol et focus clavier). Le front ne lit que
  `offline_reasons`, jamais le statut ni la visibilité.
- **Gestes** : la phrase nomme le geste (« Privé — rendez-le public pour le mettre en ligne. ») ; les
  gestes existants (visibilité, statut) restent où ils sont, sans bouton dupliqué sous le motif.
- **Reste, non changé** : `PublishReadiness::statusPutsOnline` redit une partie du prédicat sous forme de
  prédiction (ce que fera un changement de statut) ; à converger sur `conditionsEnLigne()` par un ticket
  à part si on le veut.

