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

- [x] Un agent avec des clients, une équipe et des propriétaires voit les trois sections dans cet
      ordre, chacune avec sa ligne de détail ; les clients sont rangés par dernier échange.
      *Preuve : `NouvelleConversation.sections.tck-2830.test.tsx` (AC1, API simulée au niveau de
      `fetch`) ; au navigateur, agent de démo : « Clients récents » (5) · « Équipe » (11,
      « Administrateur · Dakar Immo », « Agent · Dakar Immo ») · « Propriétaires » (12, « 9 biens
      gérés », « Aucun bien géré »…) · « Autres personnes » (7), à 390 et 1280 ; les quatre
      `meta.total` de l'API réelle font le périmètre entier (5 + 11 + 12 + 7 = 35).*
- [x] Un bailleur (non membre du personnel) ne voit jamais de section « Propriétaires » : l'API ne lui
      rend aucune relation `proprietaire` (TCK-2745), et le front n'en fabrique pas.
      *Preuve : test AC2 (une section vide ne s'affiche pas — ablation de `masquerSiVide` : rouge) ;
      côté API, `test_filter_relation_autre_chez_un_bailleur` : ses bailleurs et prestataires vont
      sous « Autres personnes ». Au navigateur, persona `proprietaire` à 390 : « Équipe » seule (12),
      aucune « Propriétaires ».*
- [x] Chaque section part d'une requête `filter[relation]=…` avec `fields[users]=id,first_name,last_name`.
      *Preuve : test AC3 (quatre requêtes `client`, `equipe`, `proprietaire`, `autre`, aucune sans
      relation ni recherche ; `sort=-last_exchange_at` pour les clients) — ablation du
      `filter.relation` : 4 rouges.*
- [x] Aucune clé en clair ni `MISSING_MESSAGE` ; relevés de fidélité à 390 et 1280 contre la maquette.
      *Preuve : relevés produit à 390 et 1280 (haut de liste et section « Propriétaires ») : 0 clé en
      clair ; titre de section conforme à la maquette (12 px, 500, encre et boîte identiques), ligne de
      détail 13 px / 400 / même encre, x 68 et largeur 306 identiques ; seul écart, l'interligne du
      jeton `text-ui` (18,6 contre 19,5), déjà celui de « Créer un groupe » (TCK-2632). Exceptions
      portées dans `docs/qa/audit-ux-2026-11/fidelite/TCK-2632.json` (celle de la liste unique
      levée). À 1280, la référence gelée a-3-bureau est le formulaire de groupe (TCK-2748) : les
      sections n'y ont pas de dessin, le relevé produit à 1280 n'est comparé qu'à la ligne du
      téléphone (mêmes jetons, densité ×0,9).*

## Notes

- Né de TCK-2745 (décision de team-lead du 2026-11-14) : la donnée est livrée côté API, le rangement
  revient au front.
- Les règles de la relation (priorité, `null`, garde du personnel) vivent dans
  `App\Services\Messaging\MessagingRelation` : ne pas les rejouer côté front.
- Livré (2026-11-14) : la dernière section, « Autres personnes » (prestataire ou sans relation), se
  lit par `filter[relation]=autre`, code de filtre ajouté côté API (`MessagingRelation::AUTRE` :
  aucune des trois relations fortes) — sans lui, une personne sans relation n'avait pas de requête
  serveur. Les quatre sections partitionnent le périmètre (épinglé par test). Validé par team-lead
  le 2026-11-14 (option a) : `autre` ne sort jamais du périmètre de `MessagingReach`
  (`test_filter_relation_autre_ne_sort_jamais_du_perimetre`, porte d'un groupe comprise ; ablation
  `orWhereNot` → rouge).
- Décision (validée par team-lead le 2026-11-14) : au bureau, en mode « groupe », le sélecteur des
  destinataires reste une liste unique (nom, puis pertinence) et porte la même ligne de détail ; les
  sections reviennent quand l'interrupteur est éteint. Le sélecteur de `NewGroupDialog` et d'« Infos du groupe » porte aussi la ligne.
- Données de démo : les cinq clients de l'agent n'ont aucun fil rattaché à un bien (`property: null`
  rendu par l'API, relu le 2026-11-14) : leur rangée n'a pas de ligne de détail, comme prévu.
- L'équipe se lit « Agent · Dakar Immo » comme la maquette : le nom est celui de l'espace actif
  (`useMyProfiles`), la relation `equipe` étant l'agence active de l'appelant ; sans nom, le rôle seul.
- Non rendue : la phrase de pied de la maquette (« Vous pouvez écrire aux clients… ») — le périmètre
  dépend de l'espace ; recommandation validée par team-lead le 2026-11-14 : ne pas l'ajouter.
