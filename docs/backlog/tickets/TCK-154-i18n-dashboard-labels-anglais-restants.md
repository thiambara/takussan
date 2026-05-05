---
id: TCK-154
title: "Dashboard — chaînes anglaises résiduelles & libellés bruts"
status: review
phase: P1
family: front
estimate: M
created: 2026-05-04
updated: 2026-05-05
depends_on: [TCK-117]
blocks: []
spec_refs:
  features:
    - docs/features.md#19-internationalisation
tags: [front, bug, p2, smoke-test-2026-05-04, i18n, agent-immobilier]
---

## Objectif utilisateur

Un agent qui utilise le dashboard en français ne voit aucun libellé anglais résiduel (boutons, états vides, statuts, étiquettes techniques) dans les zones identifiées par le smoke test.

## Contrat de données

Les libellés sont gérés via les fichiers de traduction `takussan-web/src/messages/{fr,en,wo}.json` (cf. `next-intl` ou équivalent). Compléter les clés manquantes et brancher les composants.

## Direction UX / Artistique

- Cohérence FR — pas de mix FR/EN dans une même zone fonctionnelle.
- Préserver les valeurs canoniques d'enum côté code (ne pas changer le contrat backend).
- Quand un statut backend (`active`, `inactive`, etc.) doit s'afficher : passer par une map de traduction, ne pas rendre la valeur brute.

## Contraintes strictes (métier)

- Pas de modification des enums backend.
- Pas de duplication de la logique de format devise (TCK-153 pilote).
- L'a11y : si on remplace `auth_token` par un libellé humain, conserver l'attribut technique en `aria-label` ou `data-*` si nécessaire pour le debug.

## Delta à produire

Pour chaque zone, ajouter / corriger les clés dans `messages/fr.json` (et `en.json`, `wo.json` si activé) et brancher les composants concernés :

- [x] **Maintenance** — `/app/maintenance` cards : niveaux de priorité affichés `Low` / `Normal` / `High` → `Faible` / `Normale` / `Élevée` (dropdown filtre déjà OK, mais cards rendent la valeur brute)
- [x] **Messagerie** — `/app/messages` :
  - bouton `New group` → `Nouveau groupe`
  - empty state `Select a conversation to view messages.` → `Sélectionnez une conversation pour voir les messages.`
- [x] **Profil** — `/app/profile` → bloc Sécurité :
  - heading `Delete my account` → `Supprimer mon compte`
  - description `Deletion is irreversible after the grace period. Your personal data is anonymized and legal records are retained.` → équivalent FR
  - bouton `Delete my account` → `Supprimer mon compte`
- [x] **Profil** — `/app/profile` → carte profil agence : supprimer le rendu raw `active` à côté de `Profil actif` (probable double affichage de `profile.status` + `Profil actif`)
- [x] **Profil** — `/app/profile` → Sessions actives : remplacer le label brut `auth_token` par un libellé humain (parser User-Agent ou afficher `Session navigateur`)
- [x] **Recherches sauvegardées** — `/app/saved-searches` : formater le prix raw `1142038` via le helper de TCK-153 (lien transverse) et afficher `prix maximum` au lieu de `prix … – 1142038` (la borne basse vide doit être omise ou renommée `Pas de minimum`)
- [ ] **Tests frontend** — Snapshot ou test ciblé sur chaque zone vérifiant l'absence des chaînes EN listées

## Critères d'acceptation

- [ ] Aucune des chaînes suivantes n'apparaît dans le dashboard en mode FR : `Low`, `Normal`, `High` (sur cartes maintenance), `New group`, `Select a conversation to view messages.`, `Delete my account`, `Deletion is irreversible…`, `auth_token`
- [ ] Le badge raw `active` n'est plus rendu en plus de `Profil actif`
- [ ] `/app/saved-searches` rend des prix formatés en FR avec libellé clair (`Maximum`, `Minimum` ou `Pas de minimum`)

## Hors périmètre

- i18n des autres pages non listées dans le smoke test (TCK-117 couvre le reste)
- Wolof — uniquement la cohérence FR vs EN dans ce ticket
- Refonte de la carte profil ou des sessions actives au-delà de l'i18n

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bugs **P2-4**, **P2-7**, **P2-8**, **P2-9**, **P2-10**, **P2-11**.
- TCK-117 a déjà couvert l'i18n du backoffice ; ce ticket complète les zones restantes identifiées par le smoke test agent.
- Pour le label `auth_token` côté sessions : la donnée utile à l'utilisateur est l'IP + User-Agent (déjà en base via `personal_access_tokens.last_used_at` + custom field ?). Si pas dispo, afficher au minimum `Session web` + date dernière activité.
- Pour `Profil actif` + `active` doublon : inspecter `(dashboard)/app/profile/page.tsx` et la carte profil — probable double rendu de `profile.status` brut et du label `Profil actif`.
