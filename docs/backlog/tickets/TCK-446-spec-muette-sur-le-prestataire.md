---
id: TCK-446
title: "La spec ne décrit pas ce que le produit sert déjà au prestataire — sa vue de travail principale n'a aucune ligne"
status: todo
phase: P2
family: technique
estimate: S
wave: 50
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#17-communication--messagerie
    - docs/features.md#110-documents--contrats
tags: [docs, spec, prestataire]
---

## Objectif utilisateur

La spec décrit ce que le produit sert réellement au prestataire, y compris son écran principal.

## Contexte

[TCK-420](TCK-420-acteur-prestataire-absent-de-features.md) a fait entrer 🔧 dans la légende de
`docs/features.md` et l'a placé sur les lignes de [§1.8](../../features.md#18-maintenance--interventions)
que le code lui accorde. Il n'a **pas** ajouté de lignes — placer des marques d'acteur et écrire
de nouvelles fonctionnalités sont deux gestes différents, et le second dépassait son périmètre.
Reste donc un écart, relevé depuis le code le 2026-08-27 :

| Ce que le produit sert | Où c'est servi | Ce que la spec en dit |
|---|---|---|
| **Consulter ses interventions assignées** — sa vue de travail principale | entrée de barre latérale `/app/maintenance`, libellée `interventions` pour lui (`AppSidebar.tsx:201-203`) ; raccourci de tableau de bord (`DashboardShortcuts.tsx:73-76`) ; côté API `MaintenanceRequestController::index` filtre sur `assigned_to` (l. 38-41) | **aucune ligne** en §1.8 |
| Messagerie | `AppSidebar.tsx:224` — poussée **sans aucune condition de rôle** | aucune ligne de §1.7 ne porte 🔧 |
| Documents | `AppSidebar.tsx:230` — idem, sans condition | aucune ligne de §1.10 ne porte 🔧 |
| Calendrier | `DashboardShortcuts.tsx:75` — poussé pour `isServiceProvider` | aucune section ne le lui accorde |

**Le manque le plus coûteux est le premier.** §1.8 accorde à 🔧 le suivi de statut, le rapport de
fin et la soumission de devis — c'est-à-dire ce qu'il fait *sur* une intervention — mais rien sur
le fait d'en **voir la liste**. Un acteur dont la spec décrit les gestes sans décrire son écran
est un acteur qu'on re-arbitrera au jugé la prochaine fois, exactement comme
[TCK-379](TCK-379-app-menu-et-inventaire-des-ecrans-ont-diverge.md) a dû le faire pour son menu.

⚠ **Les trois lignes du bas ne sont pas symétriques de la première.** Messagerie et documents sont
poussés à *tout le monde* sans condition : l'écart peut se corriger en accordant la ligne à 🔧,
**ou** en constatant que ces poussées inconditionnelles sont elles-mêmes le défaut — TCK-379 a
déjà refermé six entrées de ce genre. *Ne pas trancher en écrivant la spec :* mesurer d'abord si
la poussée est voulue.

## Contrat de données

Aucune. Ticket documentaire : la seule sortie est `docs/features.md` et sa vue dérivée.

## Contraintes strictes (métier)

- **Ne rien inventer.** Chaque ligne ajoutée ou marque posée se relève depuis le code, comme
  TCK-420 l'a fait, et le ticket cite le fichier et la ligne.
- `docs/features-by-actor.md` est **généré** : régénérer par `node docs/gen-features-by-actor.mjs`,
  jamais éditer.
- Ne pas rouvrir ce que §2.5 a tranché : pas de tableau de bord prestataire.
- Ne pas accorder à 🔧 ce que le code lui refuse — l'historique par bien
  (`indexForProperty`) autorise `view` sur la **Property**, que le prestataire ne passe pas.

## Delta à produire

- [ ] Ligne §1.8 pour « consulter ses interventions assignées », marquée 🔧
- [ ] Mesurer si les poussées inconditionnelles de `/app/messages` et `/app/documents` sont
      voulues, puis trancher : marquer 🔧 en §1.7 et §1.10, **ou** ouvrir le retrait côté front
- [ ] Statuer sur le calendrier de `DashboardShortcuts.tsx:75`
- [ ] Régénérer `docs/features-by-actor.md`

## Critères d'acceptation

- [ ] AC1 — §1.8 porte une ligne pour la consultation de ses interventions par le prestataire,
      et `features-by-actor.md` la fait apparaître sous 🔧 après régénération
- [ ] AC2 — chaque marque 🔧 ajoutée cite le fichier et la ligne qui la justifient
- [ ] AC3 — le sort de la messagerie, des documents et du calendrier est écrit dans un sens ou
      dans l'autre — jamais laissé en silence
- [ ] AC4 — `node docs/gen-features-by-actor.mjs --check` sort en 0

## Hors périmètre

- Construire quoi que ce soit côté code — ce ticket ne produit que de la spec.
- Le tableau de bord prestataire.

## Notes d'implémentation

_(à remplir par implementing-specs)_
