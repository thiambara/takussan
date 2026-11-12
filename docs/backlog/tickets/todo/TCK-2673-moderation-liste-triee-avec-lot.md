---
id: TCK-2673
title: "Modération : la liste triée par risque avec publication par lot, et le bien vu comme le public le verra"
status: todo
phase: P1
family: front
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2672, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#11-gestion-des-biens"
  models: []
tags: [front, moderation, reviews, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin trie les avis du jour en deux minutes — publier d'un coup les avis sans risque, regarder de près les autres avec leur sujet — et ne publie une annonce qu'après l'avoir vue.

## Contrat de données

- Avis : `GET /api/reviews` avec `filter[risk]`, `meta.risk_counts`, `target.photo_url`, `target.agent`, `risk` (TCK-2672) ; décision unitaire `PATCH /api/reviews/{id}/moderate` ; lot `POST /api/reviews/moderate-batch` (TCK-2672) ; réponse publique `POST|DELETE /api/reviews/{id}/reply` (existante) ; signalements `GET /api/reviews/{id}/reports` (existant).
- Biens : `GET /api/properties/moderation` (liste, recherche) et `GET /api/properties/moderation/{property}` (détail et liste de contrôle, TCK-2672) ; `POST …/approve` ; `POST …/reject` avec `reason_code` et `rejection_reason` (TCK-2672).
- Comptes du menu : existants (`reviewModeration`, `propertyModeration`).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-moderation&a=b` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « File des avis », « Détail d'un avis » (téléphone seul) et « Bien à valider », téléphone et bureau.
- **Téléphone** : pastilles « À risque (4) · Sans risque (51) · Biens (1) » et un bouton « Filtres » ; cartes compactes : le sujet en titre (photo du bien ou initiales de l'agent, « Avis sur le bien / sur l'agent »), les étoiles, le début du texte, l'auteur, la date, la raison du risque ; sur « Sans risque », des cases, « Tout cocher (51) » et une barre collante « 12 sélectionnés · Publier ». Le toucher ouvre le détail **plein écran**.
- **Bureau (dès `lg`)** : onglets « Avis · Biens à valider » avec leurs comptes ; deux colonnes — la liste (360 px) avec cases et « Publier la sélection · N avis », le détail à droite : le sujet (photo, lien vers le bien ou l'agent), la note, le texte entier, les signalements, puis « Publier », « Répondre publiquement » (600 caractères, signée du nom de l'agence ; « Publier avec la réponse »), « Masquer », « Supprimer », « Ignorer les signalements », le motif.
- **Bien à valider** : au téléphone, plein écran — carrousel de toutes les photos, titre, prix en F CFA par mois, type en français, quartier, description, « Soumis par {nom} · {Propriétaire|Agent} · le {date} · son 3ᵉ bien chez vous » ; liste de contrôle (photos, adresse, description, prix et médiane du quartier) ; barre collante « Demander une correction » / « Publier ». Au bureau, l'aperçu de la fiche au centre, la liste de contrôle et les gestes à droite ; « Demander une correction » : un motif en liste et un texte de 20 caractères au moins, avec son compteur.
- Une phrase rappelle que les avis sur l'agence elle-même sont modérés par Takussan.

## Contraintes strictes (métier)

Fonctions existantes à garder (`moderation/page.tsx`, `moderation/properties/page.tsx`, `ModerationWorkspace.tsx`, `ModerationDetail.tsx`, `PropertyModerationWorkspace.tsx`) :

- Bandeau de périmètre ; filtres statut (en attente, signalés, approuvés, rejetés), sujet (biens, agents), « Signalés uniquement » ; compte de la file ; pagination de 20.
- Détail : signalements (nombre, auteurs), Approuver · Masquer · Supprimer · Ignorer les signalements, motif codé et texte, confirmations ; avis sur l'agence ou déjà publié : réservé à la plateforme.
- Biens : recherche, compte, Approuver, rejet avec raison de 20 caractères au moins et confirmation.
- La publication par lot n'est proposée que sur « Sans risque ».
- Le détail s'ouvre **à l'écran** au téléphone (aujourd'hui il est empilé sous les vingt cartes de la liste).
- Corrections : prix en F CFA (jamais « XOF »), type en français (jamais `apartment`), l'auteur avec son vrai profil (« Propriétaire »), une seule forme de date (« 18 nov. 2026 », `useFormatteurs()`), des messages d'échec qui disent la cause et le geste suivant (plus « Une erreur est survenue. »).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement.

## Delta à produire

- [ ] File des avis par risque, sélection et publication par lot, détail plein écran au téléphone, deux colonnes au bureau.
- [ ] Sujet de l'avis et réponse publique dans le détail.
- [ ] Bien à valider : aperçu complet, liste de contrôle, « Demander une correction » avec motif.
- [ ] Tests : lot envoyé avec les seuls avis cochés ; cases absentes sur « À risque » ; détail plein écran au téléphone ; motif obligatoire ; prix en F CFA et type traduit.

## Critères d'acceptation

- [ ] AC1 — Cocher 12 avis sur « Sans risque » puis « Publier » envoie **une** requête `moderate-batch` à 12 identifiants ; les 12 cartes quittent la liste et le compte passe de 51 à 39.
- [ ] AC2 — Sur « À risque », aucune case ni barre de lot n'est rendue.
- [ ] AC3 — À 390 px, toucher un avis montre son texte entier et ses gestes dans le premier écran, sans faire défiler la liste.
- [ ] AC4 — Le détail d'un avis sur un bien montre la photo et le titre du bien, avec un lien vers sa fiche.
- [ ] AC5 — « Demander une correction » reste inactif sans motif ou sous 20 caractères ; l'envoi part avec `reason_code` et `rejection_reason`.
- [ ] AC6 — Le bien de démo affiche « 1 095 619 F CFA / mois », « Appartement », et « Propriétaire » pour un bien déposé par un bailleur ; « XOF » et `apartment` n'apparaissent pas dans le DOM.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2673.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La pile (approche A) et la modération depuis le sujet (approche C), non retenues.
- « Autres avis sur ce bien » dans le détail (aucun filtre par sujet précis n'existe sur la file).
- Le pré-tri par IA.

## Notes d'implémentation

- **File des avis** (`ModerationWorkspace.tsx`, `moderation/CarteDAvis.tsx`, `moderation/pieces-de-l-avis.tsx`) : deux lectures, une par niveau (`filter[risk]=high|low`), de 20 avis chacune, lues à la suite (« Voir les N suivants ») ; `meta.risk_counts` donne les deux comptes. L'URL nue vaut « En attente » ; « Tous les statuts » s'écrit `filter[moderation_status]=all` et n'est jamais envoyé. Le lot (`moderateReviewBatch`, 100 au plus) n'existe que sur « Sans risque » de la file en attente, pour les avis `can_moderate` ; « Tout cocher » lit les identifiants à part (`per_page=100`), pages non lues comprises ; un 422 (`review.batch_not_moderatable`) ne publie rien, relit la file et le dit. Deux colonnes dès `xl` (↑/↓ hors d'un champ, `useEffectEvent`) ; sous `xl` et au téléphone, le détail remplace la file par une entrée d'historique (`router.push`). `ModerationQueueList.tsx` supprimé : ses tests (TCK-2722, anneaux de focus de `console-agence-a11y`) portent sur `CarteDAvis` ; `check-status-labels` lit désormais `CarteDAvis.tsx`.
- **Détail d'un avis** (`ModerationDetail.tsx`) : sujet (photo, titre, référence, agent ; lien vers `/app/properties/{id}` ou `/agents/{slug}`), contexte de l'auteur, note, texte, raisons du risque, signalements, réponse publique (600, signée du nom de l'agence lu par la page). « Publier avec la réponse » enregistre la réponse puis publie ; si la publication échoue après la réponse, le message le dit tel quel. Supprimer et Ignorer restent à la plateforme.
- **Bien à valider** (`PropertyModerationDetail.tsx`, `PropertyModerationWorkspace.tsx`) : `GET /api/properties/moderation/{id}` ; carrousel (téléphone) ou mosaïque (bureau), prix `montant()` + période, type par `enumLabel`, profil de l'auteur, date seulement si `submitted_at`, rang (`selectordinal`) ; liste de contrôle dérivée des `checks` (un écart à la médiane ≥ 25 % est un point à voir, `ECART_DE_PRIX_A_VOIR`) ; correction = motif codé (`MOTIFS_DE_CORRECTION`) + 20 à 1000 caractères, le bouton reste inactif sinon ; au téléphone, dans une feuille. 2FA de plateforme gardée sur chaque geste.
- **Écarts** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2673.json` (onze écarts acceptés, dont : pas de recherche sur l'onglet « Avis », `GET /api/reviews` n'en a pas ; pas d'aperçu public ni de « Écrire » pour un bien non publié, aucune route ; « Autres avis sur ce bien » hors périmètre).
- **Mesures** (2026-11-12, base de démo, aucun envoi non-GET) : AC3 à 390 × 844 — texte à y 283–331, gestes à y 724–768, scrollY 0 ; AC6 dans le DOM — « 1 095 619 F CFA / mois », « Appartement », « Propriétaire », ni `XOF` ni `apartment`. Comparaisons et balayage 360/768/1024 dans la fiche.
- **Contre-vérification, réserve d1 (corrigée le 2026-11-12)** : un avis en attente sur l'agence elle-même (`can_moderate=false`) entre dans la file de l'admin ; le compte « au plus » le comptait, si bien qu'après « Tout cocher » la case maîtresse restait mixte, le bouton ne passait pas à « Tout décocher », et « Tout cocher (n) » comptait les non publiables. Le compte se juge désormais sur les identifiants que la lecture de « Tout cocher » a rendus (`nbDeToutCocher`, remis à zéro au changement de filtre et après le lot) ; avant cette lecture, sur le total moins les non publiables déjà lus. L'API reste telle quelle : l'admin lit légitimement les avis qui visent son agence, seule la plateforme les modère. Tests : deux cas d1 (bureau, téléphone) et W4 (un changement de filtre vide la sélection), chacun rouge par ablation.
