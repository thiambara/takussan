---
id: TCK-2830
title: "« Nouvelle conversation » rangée en sections — Clients récents · Équipe · Propriétaires, chacun avec sa ligne de détail"
status: todo
phase: P2
family: front
estimate: S
wave: 87
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2745]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
tags: [front, messagerie, audit-ux, app]
---

## Objectif utilisateur

Dans « Nouvelle conversation », l'agent retrouve d'un coup d'œil à qui il écrit : ses clients récents
d'abord, puis son équipe, puis les propriétaires, chacun avec une ligne qui le situe (« Maison avec
jardin · Thiès », « Agent · Dakar Immo », « 4 biens gérés »).

## Constat

- TCK-2632 (`done`) livre « Nouvelle conversation » avec une seule liste « Personnes », par nom
  (décision 3 (a) du 2026-11-12) : écart « donnée absente » à la maquette `app-messagerie`, écran
  « Nouvelle conversation ».
- TCK-2745 livre la donnée : `GET /api/conversations/contacts` rend `relation` (`client`, `equipe`,
  `proprietaire`, `prestataire` ou `null`) et `detail` (`{property: {title, city} | null}`,
  `{role: agent|admin}`, `{properties_count}`), `filter[relation]=<code>` et
  `sort=-last_exchange_at`. Le type `MessagingContact` du front (`src/lib/queries/conversations.ts`)
  ne les lit pas encore.

## Delta à produire

- `MessagingContact` porte `relation` et `detail`.
- Sans recherche, « Nouvelle conversation » affiche les sections de la maquette : « Clients récents »
  (`filter[relation]=client&sort=-last_exchange_at`), « Équipe », « Propriétaires », puis les autres
  personnes (relation `null`, et `prestataire`) sous un titre neutre — une section vide ne s'affiche
  pas. Chaque section se lit par `filter[relation]` côté serveur, jamais par un tri côté client sur une
  liste déjà récupérée.
- La ligne de détail se compose côté front depuis les données (principe 5) : « titre · ville » pour un
  client (rien si `property` est `null`), le rôle traduit pour l'équipe, « n biens gérés » (pluriel
  ICU) pour un propriétaire. Clés neuves en `fr`, `en`, `wo` (wolof en pause : le français tel quel).
- Avec une recherche, la liste reste celle de TCK-2632 (une liste par pertinence), avec la ligne de
  détail.
- « Nouveau groupe » reste en dernière ligne ; toucher une personne garde le comportement de TCK-2632
  (fil existant rouvert, sinon brouillon).

## Critères d'acceptation

- [ ] Un agent avec des clients, une équipe et des propriétaires voit les trois sections dans cet
      ordre, chacune avec sa ligne de détail ; les clients sont rangés par dernier échange.
- [ ] Un bailleur (non membre du personnel) ne voit jamais de section « Propriétaires » : l'API ne lui
      rend aucune relation `proprietaire` (TCK-2745), et le front n'en fabrique pas.
- [ ] Chaque section part d'une requête `filter[relation]=…` avec `fields[users]=id,first_name,last_name`.
- [ ] Aucune clé en clair ni `MISSING_MESSAGE` ; relevés de fidélité à 390 et 1280 contre la maquette.

## Notes

- Né de TCK-2745 (décision de team-lead du 2026-11-14) : la donnée est livrée côté API, le rangement
  revient au front.
- Les règles de la relation (priorité, `null`, garde du personnel) vivent dans
  `App\Services\Messaging\MessagingRelation` : ne pas les rejouer côté front.
