---
name: grilling
description: Use when the user wants a plan, decision, design or idea stress-tested before anything is built — "grill me", "cuisine-moi", "interroge-moi", or when another skill (grill-with-docs, improve-codebase-architecture) hands over a decision tree. Interviews relentlessly, in numbered rounds with a recommended answer per question, until every branch of the design tree is settled.
---

# Grilling — l'interrogatoire par vagues

> Adapté de [`mattpocock/skills`](https://github.com/mattpocock/skills) (`skills/productivity/grilling`, v1.3.2,
> licence MIT). Pourquoi une copie adaptée et pas le pack : [ADR-0137](../../../docs/adr/0137-une-competence-venue-d-ailleurs-s-adapte-elle-ne-s-installe-pas.md).

**Annoncer au début :** « J'utilise la compétence grilling. »

Interroger le porteur sans relâche jusqu'à une compréhension partagée. Représenter le sujet comme un **arbre de
décisions** : chaque décision ouvre les décisions qui en dépendent.

## Les vagues

Travailler l'arbre par **vagues**. La **frontière** est l'ensemble des décisions dont les prérequis sont déjà
tranchés : les questions qu'on peut poser *maintenant* sans présumer d'une réponse pas encore entendue. Chaque vague
pose toute la frontière d'un coup, questions numérotées, chacune avec la réponse recommandée. Puis attendre les
réponses avant la vague suivante.

Format d'une vague, **en texte dans la réponse** — jamais par l'outil de questions à choix (`AskUserQuestion`), que
le porteur a refusé pour ses décisions :

```
❓ **Q1 — <titre de la question>** : <corps de la question, plusieurs paragraphes si besoin, options a/b/c le cas échéant>

➡️ <réponse recommandée, et pourquoi en une phrase>

---

❓ **Q2 — <titre>** : <corps>

➡️ <réponse recommandée>
```

- **Formuler chaque question pour que « oui » accepte la recommandation.** Le porteur doit pouvoir répondre
  « oui à tout sauf Q3 ».
- **Une réponse reçue redessine l'arbre.** Une décision tranchée repousse la frontière et débloque les questions qui
  en dépendaient. Recalculer la frontière avant chaque vague.
- **Une question qui dépend d'une autre question encore ouverte dans la même vague appartient à une vague
  suivante,** pas à celle-ci.

## Les faits sont à l'agent, les décisions au porteur

Trouver un **fait** est le travail de l'agent, jamais celui du porteur. Quand une question de la frontière dépend d'un
fait de l'environnement (le code, la base, la CI, un document, une page externe), le **mesurer** — lire le fichier,
lancer la commande, ou confier la recherche à un sous-agent au contexte neuf. Ne jamais demander au porteur ce
qu'on peut relever soi-même, et ne jamais déduire un fait d'une configuration ou d'un docblock quand on peut le
mesurer.

Une recherche en cours est un prérequis non tranché : seules les questions qui en dépendent attendent son retour ;
poser le reste de la frontière tout de suite.

Les **décisions** appartiennent au porteur : chacune lui est posée, et on attend sa réponse.

## Lire avant d'interroger

- **`docs/glossaire.md`** : employer ses termes dans les questions. Un terme qui manque, ou qu'on emploie autrement
  que le glossaire, est lui-même une question à poser (et la matière de `domain-modeling`).
- **Les ADR de la zone** (`docs/adr/README.md`, l'index) : une recommandation qui contredit un ADR le dit
  explicitement — *« contredit ADR-0031, mais mérite d'être rouvert parce que… »* — au lieu de passer outre.
- **Les specs** (`docs/features.md`, `docs/models-spec.md`) et le ticket en cause s'il existe.

## Fin de l'interrogatoire

L'interrogatoire est fini quand la frontière est vide : chaque branche de l'arbre visitée, rien de supposé en
silence. Résumer alors les décisions prises, en une liste numérotée, et **ne rien entreprendre tant que le porteur
n'a pas confirmé** que la compréhension est partagée.

Ce qui suit dépend de ce qui a été tranché, et passe par les chemins du dépôt :

- une décision structurelle → un ADR, **avant** l'implémentation (`docs/adr/README.md` § Format) ;
- du travail à faire → un ticket par `/write-spec` ;
- un terme tranché → `docs/glossaire.md` (la compétence `domain-modeling`).
