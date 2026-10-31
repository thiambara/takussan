---
id: TCK-2423
title: "Radar : le pilote d'embeddings Voyage AI et la table embeddings d'ADR-0076 § 11, avec repli sur pg_trgm"
status: done
phase: P3
family: back
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-31
depends_on: [TCK-2392]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, ia, pgvector, adr-0076]
---

## Décision du porteur (2026-10-31)

La décision du 2026-10-30 (« rester sur `pg_trgm` ») est **levée**. Le fournisseur est **Voyage AI**. Si la clé n'est pas
fournie, ou si l'API ne répond pas, le signal retombe sur `pg_trgm` : aucune panne de Voyage n'empêche le Radar d'apparier
des annonces, ni ne bloque une migration. Aucune clé n'existe encore : le contrat est vérifié sur la documentation
officielle, sans aucun vrai appel.

## Objectif utilisateur

Deux annonces qui décrivent le même bien avec d'autres mots se rapprochent, et pas seulement celles
qui en recopient le texte.

## Contexte

TCK-2392 a posé la similarité de texte comme quatrième signal de `RadarMatcher`, derrière un pilote
remplaçable (`radar.similarity.driver`). Le seul pilote livré est `trigram` (`pg_trgm`, sans
fournisseur) : il rapproche un texte recopié, pas une reformulation.

La table `embeddings` d'[ADR-0076](../../adr/0076-le-socle-ia.md) § 11 n'a pas été créée : aucun
fournisseur de la liste fermée ne sert d'embeddings (`config/ai.php`, rôle `embedding` vide), et
l'extension `vector` n'est pas de confiance (sa création exige un superutilisateur sur le rôle de
la base cible, à vérifier en préproduction).

## Delta à produire

- [x] Un fournisseur d'embeddings ajouté au rôle `embedding`, avec sa ligne de `privacy.ts`
      (`takussan-web/src/content/legal/README.md`).
- [x] Migration : extension `vector` et table `embeddings` (objet polymorphe, modèle, dimension,
      vecteur, empreinte du contenu), avec leur `down()`.
- [x] Un pilote `embeddings` de `radar.similarity.driver`, calculé en file `ai`, et le repli `trigram`
      tant qu'un vecteur manque.

## Critères d'acceptation

- [x] AC1 — Deux annonces reformulées se rapprochent par le signal `text` sous le pilote
      `embeddings`, avec un faux modèle ; aucun test n'appelle un vrai fournisseur.
- [x] AC2 — Sans vecteur calculé, le signal retombe sur `trigram`.
- [x] AC3 — Ce qui part chez Voyage passe par le masquage de la passerelle, prouvé sur le corps de la requête.
- [x] AC4 — Chaque appel se journalise (`ai_calls`, coût en dollars) et compte dans les plafonds et le coupe-circuit.
- [x] AC5 — Le repli s'applique par cas : pilote non configuré, clé absente, vecteur manquant d'un côté ou de l'autre,
      table absente, API en panne. Le calcul se fait en file `ai`, jamais pendant l'appariement.
- [x] AC6 — L'extension `vector` indisponible ou refusée ne fait jamais rougir la migration, et le refus de droit
      n'abandonne pas la transaction en cours ; `down()` juste.
- [x] AC7 — Une annonce inchangée ne se recalcule pas, et une panne ne produit pas de boucle de réessais.

## Hors périmètre

- Le chatbot de TCK-344, qui réutilisera la même table.

## Notes d'implémentation

- **La table reste facultative** : `App\Services\Ai\EmbeddingsTable`, partagée par la migration et `ai:install-embeddings`.
  La migration a réussi sans droit sur une base jetable (`vector` non de confiance, rôle non superutilisateur), la
  commande a ensuite créé la table une fois l'extension posée.
- **`AiGateway::embed()`** partage `admit()` avec `run()` : même ordre, mêmes refus, un seul endroit.
- **Aucun vrai appel** : le contrat (`/embeddings`, `input_type`, `output_dimension`, tarifs, refus de l'entraînement) est
  vérifié sur la documentation de Voyage du 2026-10-31, jamais éprouvé. Les seuils vectoriels ne reposent sur aucune mesure.

### Prérequis du porteur

Dans l'ordre, runbook de `docs/infra/hebergement.md`, « Allumer les embeddings du Radar » : refuser l'entraînement chez Voyage
**avant** de poser la clé (la politique de confidentialité le promet), informer la CDP du transfert (loi 2008-12, art. 49),
poser l'extension en superutilisateur, `ai:install-embeddings`, puis `VOYAGE_API_KEY`.

### Décisions prises en autonomie, à revoir

- Défaut du pilote : `embeddings`, qui retombe sur `trigram` sans clé ni table : la clé suffit à l'allumer. Écarté : `trigram`
  par défaut, qui demandait une seconde variable.
- Modèle : `voyage-4`, 1024 dimensions (0,06 $ le million). Écarté : `voyage-4-large`, le double du prix pour un texte de
  1 000 caractères. Les deux autres sont au catalogue et se règlent dans la console, ce qui recalcule tout.
- Seuils vectoriels : 0,8 et 0,9. Écarté : les seuils des trigrammes, qui n'ont pas la même échelle. Aucune mesure réelle.
- Calcul par balayage planifié (toutes les 15 min, 100 annonces). Écarté : un observateur sur l'annonce, qui ajoutait une
  écriture à chaque sauvegarde et ne couvrait ni le rattrapage ni la pose tardive de la clé.
- Un rapprochement par vecteurs ne corrobore pas une fusion automatique (`corroborates_merge`, faux). Écarté : le traiter comme
  un trigramme, sans mesure.
- Étapes envoyées : extraite, relue, contactée, accord, publiée. Écarté : `refused`, moins de données sorties.
- Le test de connexion et la console distinguent les fournisseurs d'embeddings (`serves`), code `ai.provider_role_mismatch`.
- `VERSION_DOCUMENTS` et `TERMS_VERSION` avancent au 31 octobre, comme le demande `legal/README.md` : un annonceur par
  téléphone réaccepte donc les conditions, alors que les CGU n'ont pas changé.
- Pas d'index approché : le volume du Radar se balaie en exact. Le chatbot de TCK-344 décidera du sien.
