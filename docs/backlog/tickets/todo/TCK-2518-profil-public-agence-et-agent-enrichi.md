---
id: TCK-2518
title: Profil public enrichi : accroche, « Pourquoi nous », sélection et couverture de l'agence ; langues, quartiers et délai de réponse
status: todo
phase: P1
family: back
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: [TCK-2521, TCK-2522, TCK-2523, TCK-2524]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
    - "docs/models-spec.md#35-agentprofile-"
tags: [back, directory, agence, audit-ux]
---

## Objectif utilisateur

Le chercheur choisit une agence ou un agent sur ce qui compte à Dakar — la langue, le quartier, la rapidité de réponse — et l'agence a une vitrine qui la vend sans photo à fournir.

## Contrat de données

1. **Agence** (`agencies`) : `tagline` string(120), `highlights` jsonb (trois chaînes ≤ 80), `showcase_property_ids` jsonb (≤ 6 biens de l'agence), `median_response_minutes` integer — cf. `spec_refs.models`.
2. **Agent** (`agent_profiles`) : `languages` jsonb (codes d'une liste fermée en config, `directory.languages`), `neighborhood_ids` jsonb (≤ 5, référentiel `geo_neighborhoods`), `median_response_minutes` integer.
3. **Écriture** : `PATCH /api/agencies/{agency}` accepte `tagline`, `highlights`, `showcase_property_ids` (capacité de configuration de l'agence existante ; un id qui n'est pas un bien de l'agence → 422) ; l'agent écrit `languages` et `neighborhood_ids` sur son propre profil (endpoint de profil existant, ou `PATCH /api/me/agent-profile` s'il n'y en a pas — à relever).
4. **Lecture publique** (`GET /api/public/agencies`, `/agencies/{slug}`, `/agents`, `/agents/{slug}`) : émet ces champs ; `cover` = trois photos de biens **publics** de l'agence (la sélection d'abord, sinon les plus récents), jamais un bien non public ; `showcase` = les biens de la sélection encore publics ; `leases_signed_this_month` (agence) = baux signés depuis le 1er du mois, compté à la lecture ; `median_response_minutes` (`null` sous cinq conversations) ; langues et quartiers (libellés côté front, codes et ids côté API).
5. **Délai de réponse** : job nocturne idempotent (`routes/console.php`, commentaire TCK) — médiane, sur 90 jours, du délai entre le premier message d'un visiteur dans une conversation ouverte depuis le site public et la première réponse d'un membre de l'agence (pour l'agent : la sienne) ; sous cinq conversations, `null`.

## Direction UX / Artistique

Sans objet (back). Maquettes servies : `p=annuaire`, `p=agence`, `p=agent`, approche D.

## Contraintes strictes (métier)

- Tous ces champs sont facultatifs : la fiche se passe de ce qui manque, sans trou.
- Le délai est une médiane honnête : jamais affiché sous le seuil, jamais une moyenne qu'une réponse lente fausse.
- Aucun numéro personnel d'agent dans une réponse d'annuaire (règle existante de `ProfileCard`).
- Migration réversible.

## Delta à produire

- [ ] Migration (agences, profils d'agent).
- [ ] Écriture (FormRequest, autorisation par capacité dans `authorize()`), validation des ids de sélection et de quartiers.
- [ ] Lecture publique : champs, `cover`, `showcase`, `leases_signed_this_month`.
- [ ] Job du délai de réponse + entrée planifiée commentée.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Une sélection qui contient un bien devenu loué émet les autres seulement, et `cover` ne contient aucune photo de bien non public.
- [ ] AC2 — `showcase_property_ids` avec le bien d'une autre agence → 422, rien d'écrit.
- [ ] AC3 — Quatre conversations répondues : `median_response_minutes: null` ; cinq : la médiane, à la minute.
- [ ] AC4 — Deux exécutions du job à la suite rendent le même état (idempotence).
- [ ] AC5 — Une agence sans accroche ni sélection émet `tagline: null`, `highlights: []` et une `cover` tirée de ses trois biens les plus récents.

## Hors périmètre

- Les écrans de saisie dans la console (TCK-2524) et les fiches publiques (TCK-2521 à TCK-2523).

## Notes d'implémentation

Relevés du 2026-11-09 (agent « annuaire-agences », vague 1), sur `dev` @ 92b2a8937 :

- **Écriture de l'agent : endpoint neuf `PATCH /api/me/agent-profiles/{id}/directory`.** L'endpoint
  de profil existant (`…/specialization`) EXIGE `specialization` (étape de l'assistant d'arrivée) :
  l'écran de profil (TCK-2524) aurait dû la renvoyer pour poser une langue. Même règle d'accès que
  ses voisins (`AuthorizesTransitionally::ownsProfile`). `null` ou `[]` vide la liste (rangée `null`).
- **« Conversation ouverte depuis le site public » = fil de prospect d'ADR-0068 § 1** : `direct`
  rattachée à un bien, dont le seul écrivain est `PropertyConversationResolver::firstOrCreate()`
  (`StoreConversationRequest` refuse `property_id` sur une directe). L'agence est celle du bien ; un
  « membre » est un profil d'agent OU d'admin d'agence de cette agence, quel que soit son statut
  aujourd'hui (soft-deleted compris : la réponse a été donnée au nom de l'agence). Pour l'agent :
  sa première réponse à lui, sur un bien de l'agence de son profil. La fenêtre porte sur le premier
  message du visiteur. Médiane `percentile_cont(0.5)` sur les secondes, arrondie à la minute
  (`App\Services\Directory\ResponseTimes`). Un message de l'agence posé AVANT le premier message du
  visiteur n'est pas une réponse.
- **Règle des fils sans réponse (décision de la session sur la revue adverse, 2026-11-09).** Un fil
  sans réponse de l'agence dont le premier message du visiteur a **plus de 24 h**
  (`directory.response_time.unanswered_after_hours`) compte comme un **délai infini** : il entre
  dans le seuil de 5 ET dans la médiane. Plus jeune que 24 h, il n'entre dans aucun des deux. Le
  seuil compte donc les fils répondus + les fils sans réponse de plus de 24 h. **Si la médiane tombe
  sur l'infini, `median_response_minutes` = `null`** : rien d'affiché plutôt qu'un chiffre flatteur
  (5 fils répondus en 10 min et 95 ignorés → `null`, et non « 10 min » ; 6 répondus et 4 ignorés →
  la médiane des dix, infinis compris). Pour l'agent, un fil sans réponse est le sien s'il en est
  participant actif (`conversation_participants.left_at` nul — le destinataire que
  `PropertyConversationResolver` y met, ou le répondant à qui il a été transmis) et que personne de
  l'agence n'y a répondu ; un fil auquel un collègue a répondu ne compte pas contre lui. Côté SQL :
  `'Infinity'::float8`, et seule une médiane `< 'Infinity'` est émise — `percentile_cont` rend
  `Infinity` entre un fini et un infini, `NaN` entre deux infinis, que PostgreSQL range au-dessus.
- **Le job écrit par le constructeur de requêtes** (`IS DISTINCT FROM`), ni audit ni `updated_at`
  pour une valeur dérivée ; il pose `null` partout où la valeur n'existe plus (idempotence par
  recalcul complet). Planifié `04:20` heure de Dakar.
- **L'index des agences n'émet ni `tagline` ni `highlights`** : texte libre, servi par 48 et
  filtrable — le motif exact pour lequel `description` en est déjà exclu (en-tête de
  `PublicAgencyController::index`). La fiche les sert. L'index émet `cover`,
  `leases_signed_this_month`, `median_response_minutes`.
- **Forme de `cover`** : `[{property_id, slug, photo_url}]`, trois au plus, une photo (conversion
  `preview`, repli `PublicPhotoUrl`) par bien public ; la sélection d'abord, puis les plus récents
  (`published_at DESC NULLS LAST, created_at DESC, id DESC`) ; un bien sans photo servable est sauté.
  `showcase` = `PropertyResource` des biens de la sélection encore publics (`publicPortfolio()`),
  dans l'ordre choisi.
- **Quartiers de l'agent** : émis en `neighborhood_ids` ET `neighborhoods: [{id, name}]` — un nom de
  quartier est une donnée du référentiel, pas un libellé d'interface. Langues : codes seuls,
  filtrés sur `directory.languages` (config neuve, `config/directory.php`).
- `leases_signed_this_month` : `leases.signed_at` entre le 1er du mois et maintenant, toute issue
  confondue (un bail signé puis résilié a été signé).
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (annuaire, fiche d'agence, délai de réponse et fils sans réponse) et § 1.12 (écritures) ; `docs/models-spec.md` § 2 (`highlights`, `showcase_property_ids`, `cover`, `median_response_minutes`) et § 35 (`languages`, `neighborhood_ids`, délai de l'agent).
