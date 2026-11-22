---
id: TCK-2422
title: "Radar : l'article des conditions et la mention publique du mandat Takussan, à l'acceptation d'ADR-0079"
status: todo
phase: P3
family: full
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-11-16
depends_on: [TCK-2394]
blocks: []
spec_refs:
  features:
    - "docs/features.md#210-pages-légales-publiques"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, mandat, juridique, adr-0079]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, bloqué par une décision de calendrier du porteur.** Rien n'a été livré :
`content/legal/terms.ts` s'arrête à l'article 6.3 (pas de 6.4) et son article 1 (`:32`) exclut toujours
le mandat « sauf mention expresse contraire » ; aucune mention sur la fiche publique ; `VERSION_DOCUMENTS`
= « 13 novembre 2026 » (`content/legal/editeur.ts:61-64`). Le drapeau `radar_mandate` reste éteint
(`Flag.php:43`, serveur seul ; 422 `radar.mandate.disabled`, `RadarPublicationController.php:50`).
Dépendances TCK-2394 et TCK-2421 : `done`.

Consigne du porteur du 2026-10-31 : les textes juridiques se rédigent comme définitifs, sans attendre
l'avocat, relus à la fin — **seul l'allumage du drapeau attend l'avis de l'avocat** (ADR-0079:3). Ne pas
recopier dans le produit le « ⚠ à relire par l'avocat » de la rédaction de départ (ADR-0079:107).

- Article 6.4 (fr + en), `VERSION_DOCUMENTS` avancé ; texte ajouté à la liste pour l'avocat.
- Un champ « diffusé sous mandat » dans la ressource publique (bien de l'agence `radar.mandate_agency_id`,
  `RadarMandate.php:13-20`) — probable petit delta API ; mention sur la fiche (fr, en ; wo = texte
  français tel quel, pause).

**Décision attendue du porteur :** lever le « plus tard » posé sur ce ticket — maintenant ou après quel
jalon ? Puis, après l'avis de l'avocat, allumer `radar_mandate` par environnement.

## Objectif utilisateur

Un visiteur sait qu'une annonce diffusée par Takussan l'est pour le compte de son annonceur, et
les conditions d'utilisation disent ce que Takussan fait alors.

## Contexte

[ADR-0079](../../../adr/0079-la-publication-sous-mandat-takussan.md) est **accepté sur le principe le 2026-10-30** : la publication
sous mandat existe derrière le drapeau `radar_mandate`, éteint (TCK-2394). L'article 1 des CGU dit
« sauf mention expresse contraire, nous ne sommes ni […] mandataire immobilier des biens
présentés » : la mention expresse est ce ticket. La règle du dossier juridique
(`takussan-web/src/content/legal/README.md`) veut qu'un texte n'entre qu'avec le code qui le
tient : ce ticket se fait **avant l'allumage du drapeau, après l'avis de l'avocat**.

## Delta à produire

- [ ] Article des CGU (rédaction de départ dans ADR-0079 § Les textes), `VERSION_DOCUMENTS`
      avance, traduction anglaise de courtoisie ; relecture d'un avocat. *(2026-11-16 : selon la
      consigne du 2026-10-31, l'article s'écrit comme définitif, la relecture se fait à la fin ; seul
      l'allumage du drapeau l'attend.)*
- [ ] La fiche publique d'un bien publié sous mandat porte la mention « diffusée par Takussan pour
      le compte de son annonceur » (fr, en ; wo en pause).
- [ ] ADR-0079 passe « Accepté » *(il est déjà « Accepté (principe) » : l'item devient « passe
      "Accepté" sans réserve »)*.

## Critères d'acceptation

- [ ] AC1 — La fiche publique d'un bien sous mandat porte la mention ; celle d'un autre bien non.
- [ ] AC2 — Le texte des CGU nomme la diffusion pour le compte d'un annonceur, et sa version avance.

## Hors périmètre

- La reprise des biens par l'annonceur qui ouvre un compte (TCK-2421).

## Notes d'implémentation

_(à remplir par implementing-specs)_
