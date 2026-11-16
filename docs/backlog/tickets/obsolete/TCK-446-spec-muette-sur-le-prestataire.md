---
id: TCK-446
title: "La spec ne décrit pas ce que le produit sert déjà au prestataire — sa vue de travail principale n'a aucune ligne"
status: obsolete
phase: P2
family: technique
estimate: S
wave: 50
created: 2026-08-27
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#17-communication--messagerie
    - docs/features.md#110-documents--contrats
tags: [docs, spec, prestataire]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : caduc — le delta a été livré par d'autres.** Le ticket est à ranger (`obsolete`, ou `done`
avec renvoi) ; rien ne reste à écrire sur le fond.

- `2b6eaff72` (2026-10-06, analyse par acteur, « ~90 lignes de spec ») a écrit la ligne §1.8 :
  `docs/features.md:365` — « Consulter ses interventions assignées … (**delta de TCK-446**, TCK-592) »,
  rendue sous « 🔧 Prestataire de service » dans `docs/features-by-actor.md:833`.
- **TCK-592** (maintenance de bout en bout) : la messagerie (§1.7, quatre lignes 🔧 : `:335`, `:347`,
  `:349`, `:350`) et les documents (§1.10, cinq lignes 🔧 : `:485-493`) sont marqués.
- **TCK-591** : le calendrier est accordé, `docs/features.md:209` (« Ses interventions planifiées dans le calendrier »).
- `node docs/gen-features-by-actor.mjs --check` → vert le 2026-11-16 (564 lignes, 821 placements).

Seul l'AC2 n'est pas tenu à la lettre (les lignes citent leurs tickets, pas `fichier:ligne`) : sans
objet pour un ticket documentaire dépassé. Aucune décision du porteur attendue.

## Objectif utilisateur

La spec décrit ce que le produit sert réellement au prestataire, y compris son écran principal.

## Contexte

[TCK-420](../done/TCK-420-acteur-prestataire-absent-de-features.md) a fait entrer 🔧 dans la légende de
`docs/features.md` et l'a placé sur les lignes de [§1.8](../../../features.md#18-maintenance--interventions)
que le code lui accorde. Il n'a **pas** ajouté de lignes — placer des marques d'acteur et écrire
de nouvelles fonctionnalités sont deux gestes différents, et le second dépassait son périmètre.
Reste donc un écart, relevé depuis le code le 2026-08-27 (*tableau périmé au 2026-11-16 : les quatre
lignes sont écrites — voir la re-vérification en tête*) :

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
[TCK-379](../done/TCK-379-app-menu-et-inventaire-des-ecrans-ont-diverge.md) a dû le faire pour son menu.

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

- [x] Ligne §1.8 pour « consulter ses interventions assignées », marquée 🔧 (tenu par `2b6eaff72` / TCK-592, relevé 2026-11-16 — `features.md:365`)
- [x] Mesurer si les poussées inconditionnelles de `/app/messages` et `/app/documents` sont
      voulues, puis trancher : marquer 🔧 en §1.7 et §1.10, **ou** ouvrir le retrait côté front
      (tenu par TCK-592, relevé 2026-11-16 — 🔧 posé en §1.7 et §1.10)
- [x] Statuer sur le calendrier de `DashboardShortcuts.tsx:75` (tenu par TCK-591, relevé 2026-11-16 — `features.md:209`)
- [x] Régénérer `docs/features-by-actor.md` (tenu par `2b6eaff72` et suivants, relevé 2026-11-16 — `--check` vert)

## Critères d'acceptation

- [x] AC1 — (tenu par `2b6eaff72` / TCK-592, relevé 2026-11-16) §1.8 porte une ligne pour la consultation de ses interventions par le prestataire,
      et `features-by-actor.md` la fait apparaître sous 🔧 après régénération
- [ ] AC2 — chaque marque 🔧 ajoutée cite le fichier et la ligne qui la justifient — caduc depuis
      TCK-592 (les lignes citent leurs tickets, pas `fichier:ligne` ; sans objet, relevé 2026-11-16)
- [x] AC3 — (tenu par TCK-592 et TCK-591, relevé 2026-11-16) le sort de la messagerie, des documents et du calendrier est écrit dans un sens ou
      dans l'autre — jamais laissé en silence
- [x] AC4 — `node docs/gen-features-by-actor.mjs --check` sort en 0 (tenu, relevé 2026-11-16)

## Hors périmètre

- Construire quoi que ce soit côté code — ce ticket ne produit que de la spec.
- Le tableau de bord prestataire.

## Notes d'implémentation

_(à remplir par implementing-specs)_
