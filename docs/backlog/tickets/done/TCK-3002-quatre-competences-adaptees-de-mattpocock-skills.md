---
id: TCK-3002
title: "Quatre compétences adaptées de mattpocock/skills (grilling, domain-modeling, retro, improve-codebase-architecture), le glossaire du domaine, et une garde qui suit chaque commande jusqu'à sa compétence"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-11-26
updated: 2026-11-26
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, outillage, agents, competences, glossaire, adr]
---

## Objectif utilisateur

Le porteur peut lancer `/grill-me`, `/grill-with-docs`, `/retro` et `/improve-codebase-architecture`. Ces quatre
commandes parlent les conventions du dépôt : le format des ADR, le backlog `TCK`, les gardes, et les suites
passées par la CI. Le dépôt a aussi enfin un glossaire du domaine.

## Contexte

Étude du pack [`mattpocock/skills`](https://github.com/mattpocock/skills) (v1.3.2) faite le 2026-11-26. Le relevé
complet est dans [ADR-0137](../../../adr/0137-une-competence-venue-d-ailleurs-s-adapte-elle-ne-s-installe-pas.md).
Ce qu'il en ressort :

- **Installé tel quel, le pack serait en doublon ou en contradiction.**
  - En doublon avec superpowers et nos compétences de specs.
  - En contradiction avec nos règles : suite entière en local, parallélisme maximal, `GLOSSARY.md` à la racine,
    ADR « avec parcimonie ».
  - En collision de nom : son `implement-spec` contre notre `/implement-spec`.
- **Quatre compétences apportent ce qui manquait.**
  - Le grilling par vagues, qui est la forme de décision déjà demandée par le porteur.
  - Le glossaire, qui n'existait pas.
  - La rétrospective qui transforme une erreur en garde.
  - Le relevé d'architecture.

**Décision du porteur (2026-11-26).** Il valide les recommandations :
- (a) une copie adaptée, sans installer le pack ;
- les quatre compétences ;
- (a) le glossaire dans `docs/glossaire.md`, en français, avec une ligne « à éviter ».

## Delta à produire

- [x] `.agent/skills/grilling/SKILL.md` — les vagues en texte (jamais `AskUserQuestion`). Les faits sont mesurés par
      l'agent, les décisions posées au porteur. La sortie passe par un ADR, `/write-spec` ou le glossaire.
- [x] `.agent/skills/domain-modeling/SKILL.md` et `FORMAT-DU-GLOSSAIRE.md` — le glossaire dans
      `docs/glossaire.md`.
  - Une ligne *Dans le code* (écart délibéré, ADR-0137).
  - L'ADR **avant** l'implémentation, au format de `docs/adr/README.md`. Les trois critères d'origine servent à
    reconnaître une décision structurelle, jamais à se dispenser d'un ADR.
- [x] `.agent/skills/retro/SKILL.md` et `ECRIRE-POUR-LES-AGENTS.md` — les catégories rapportées au dépôt :
  - `scripts/check-*.mjs`, `check-gardes-branchees` ;
  - la règle dans `CLAUDE.md`, le récit dans le journal ;
  - la mémoire du porteur.

  La compétence propose et n'écrit rien sans accord.
- [x] `.agent/skills/improve-codebase-architecture/` — `SKILL.md`, `VOCABULAIRE-DE-CONCEPTION.md` (codebase-design,
      approfondissement, « concevoir deux fois ») et `RAPPORT-HTML.md`.
  - Le rapport va dans `$TMPDIR`.
  - Les sous-agents sont en lecture seule, 4 au plus, sans tests.
  - Ce qui est retenu devient un ticket ou un ADR.
- [x] Les relais `.agent/workflows/{grill-me,grill-with-docs,retro,improve-codebase-architecture}.md` et
      `.claude/commands/` du même nom.
  - Les descriptions sont entre guillemets : celle de `retro` contient ` : `, que le YAML strict refuse.
  - Les commandes portent `disable-model-invocation: true`.
- [x] `.github/workflows/repo-ci.yml` — `.claude/commands/**` et `.agent/workflows/**` déclenchent la CI, dans les
      deux blocs (`pull_request` et `push`).
- [x] `docs/glossaire.md` — amorcé avec les seuls termes que les ADR fixent déjà, chacun avec son ADR : agence,
      profil, profil actif, capacité, personnel, bailleur, locataire, et le courtier comme terme retiré.
- [x] `docs/adr/0137-…` et sa ligne dans l'index.
- [x] `CLAUDE.md` racine : les quatre commandes (§ Workflows), et `docs/glossaire.md` parmi les sources (§ Specs &
      backlog).
- [x] `scripts/check-skills-dir.mjs` — suit chaque commande suivie par git jusqu'au workflow et à la compétence
      qu'elle cite. Il rougit sur :
  - un relais cassé ;
  - une commande sans relais (le défaut de TCK-2737) ;
  - un `.claude/commands/` vide.

  `EXIGEES` reste comme plancher.

## Critères d'acceptation

- [x] AC1 — Chaque commande neuve mène, par son workflow, à une compétence qui existe sous `.agent/skills/`.
      `node scripts/check-skills-dir.mjs --report` les liste avec leur compétence.
- [x] AC2 — Aucune compétence adaptée n'ordonne :
  - une suite entière ;
  - un push ;
  - un `GLOSSARY.md` à la racine ;
  - une installation du pack ;
  - de se dispenser d'un ADR qu'une décision structurelle exige.
- [x] AC3 — Chaque identifiant cité par `docs/glossaire.md` existe dans le code. Relu le 2026-11-26 :
      `Agency`, `app/Models/Profiles/*`, `ResolveActiveProfile`, `Capability`, `MembershipCapabilityResolver::staffAgencyId`,
      `PlatformAbility`, `OwnerProfile`, `tenant_id`.
- [x] AC4 — Ablation de la garde. Chacune de ces mutations rougit :
  - (1) `.agent/skills/retro/` retiré ;
  - (2) un workflow vers une compétence inexistante ;
  - (3) une commande réduite à une consigne sans relais ;
  - (4) une commande vers un workflow absent ;
  - (5) un index git sans aucune commande.

  L'arbre restauré est identique et vert.
- [x] AC5 — Les en-têtes des huit relais se lisent en YAML strict. Mesuré avec PyYAML : la version
      précédente de `retro.md` échouait (`mapping values are not allowed here`).
- [x] AC6 — `repo-ci.yml` déclenche sur `.claude/commands/**` et `.agent/workflows/**`, en `pull_request` comme en
      `push`. Relu dans le YAML parsé.
- [x] AC7 — Les gardes de docs et du backlog restent vertes : `check-doc-links`, `check-backlog`,
      `ranger-tickets --check`, `gen-index --check`, et la boucle complète `scripts/check-*.mjs`.

## Hors périmètre

- Les autres compétences du pack, ainsi que `implement`, `implement-spec`, `to-spec`, `to-tickets`, `triage`,
  `wayfinder` et `tdd` : elles sont écartées (ADR-0137).
- Remplir le glossaire au-delà de ce que les ADR fixent déjà. Il grandit par `/grill-with-docs`.
- Faire lire le glossaire à `writing-specs` et `implementing-specs` : la ligne du `CLAUDE.md` racine, chargée à
  chaque séance, suffit.

## Notes d'implémentation

- **Source :** commit `main` de `mattpocock/skills` du 2026-11-25 (v1.3.2). Chaque compétence adaptée le cite en tête.
- **Claude Code ne découvre pas `.agent/skills/`**, et les commandes portent `disable-model-invocation: true`. Les
  quatre compétences ne se déclenchent donc pas d'elles-mêmes : on tape leur commande. C'est voulu : superpowers
  impose déjà ses compétences à chaque tour.
- **Exercées après coup, en séance sans interface sur la branche** (`claude -p`, 2026-11-26) : les quatre commandes
  s'enregistrent, et `/grill-me` et `/grill-with-docs` ont rendu une vague conforme (faits relevés d'abord, questions
  numérotées avec recommandation, rien d'écrit avant réponse).
- **Corrigé après fusion, sur ce que `/grill-with-docs` a relevé** : l'entrée *Bailleur* donnait `landlord_id` comme
  identifiant du bailleur. Faux : `LeaseService` le prend du titulaire du bien (`properties.user_id`), qui peut être
  du personnel quand l'agence garde le bien en propre, et `AgentHandoverService` le réattribue à un agent. La ligne
  est retirée ; le partage entre *titulaire du bien* et *bailleur* reste à trancher par `/grill-with-docs`.
- **Le numéro.** TCK-2999 à TCK-3001 sont déjà pris sur une branche non fusionnée (e7ffcb8f3) : d'où TCK-3002.
