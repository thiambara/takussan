---
id: TCK-2928
title: "Équipe : la fiche du membre complète (portefeuille ventilé, renvois, appareil, 2FA, « Rappeler ») et l'invitation « Par WhatsApp »"
status: done
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2926, TCK-2927]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [front, equipe, membre, invitation, whatsapp, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin lit tout un membre sur sa fiche et passe à ses biens ou à ses clients d'un geste ; il invite un nouveau membre par WhatsApp.

## Contrat de données

- Fiche : `GET /api/agencies/{agency}/team/{user}` (`portfolio`, `commissions_due`, `last_login`, `two_factor_enabled_at`), `POST …/two-factor-reminder`, `filter[agent]` des biens (TCK-2926) ; `filter[referent]` des clients (existant).
- Invitation : `delivery: "share"` → `share_url`, et `POST /api/invitations/{id}/share-link` (TCK-2927).
- La spec ne détaille pas ces éléments : à reporter par `/sync-specs`.

## Direction UX / Artistique

- **Référence de fidélité** : `app-equipe`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-equipe.tsx`, visionneuse `?p=app-equipe&a=a`.
  - **e1 « Fiche d'un membre »**, **téléphone (plein écran) et bureau (panneau droit)** — carte Portefeuille (`:434-442`) : « Biens suivis · 23 biens · 9 en location, 14 à louer ou à vendre » avec chevron, « Clients et visites · 41 clients actifs · 5 visites cette semaine » avec chevron, « Commissions dues » + détail « 3 baux · la plus ancienne date du 30 oct. » ; carte Sécurité (`:444-451`) : « Activée depuis le 3 févr. » ou « Pas encore activée » + « Rappeler », « Dernière connexion » + détail « iPhone · Dakar ».
  - **e3 « Inviter et invitations »** : **téléphone** — bouton contour « Par WhatsApp » à gauche d'« Envoyer l'invitation » dans le pied (`:769-776`) ; **bureau** — « Lien par WhatsApp » à côté d'« Envoyer l'invitation » sous le formulaire (`:817-823`).
- Audit : `audit-f6-agence-entree.md`, § app-equipe e1, e3, et écarts TCK-2667 / TCK-2668.

## Contraintes strictes (métier)

- « Par WhatsApp » crée l'invitation (`delivery: "share"`) puis ouvre `https://wa.me/<numéro saisi>?text=<message + share_url>` ; le lien n'est jamais stocké dans le navigateur ni journalisé côté front.
- Les chevrons mènent aux listes existantes filtrées sur l'agent (biens : `filter[agent]` ; clients : `filter[referent]`), filtre fait côté serveur et porté par l'URL de la liste.
- « Rappeler » n'apparaît que si la 2FA n'est pas active ; 429 → message « déjà rappelé aujourd'hui ».
- Libellés `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Carte Portefeuille : ventilation, clients et visites, ancienneté des dues, chevrons vers les listes filtrées.
- [ ] Carte Sécurité : date d'activation, « Rappeler », appareil et ville de connexion.
- [ ] « Par WhatsApp » (tél.) / « Lien par WhatsApp » (bureau) ; « Repartager » d'une invitation en cours.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — La fiche d'un agent à `portfolio.properties = {rented: 9, available: 14}` dit « 23 biens · 9 en location, 14 à louer ou à vendre » ; toucher la ligne mène à la liste des biens filtrée sur cet agent (la liste ne montre que ses biens).
- [ ] AC2 — « Clients et visites » rend le nombre de clients actifs et de visites de la semaine et mène à la liste des clients filtrée sur l'agent.
- [ ] AC3 — « Commissions dues » porte « {n} baux · la plus ancienne date du {date} » quand des lignes sont dues ; rien de tel sans dû.
- [ ] AC4 — 2FA active : « Activée depuis le {date} » ; inactive : « Pas encore activée » + « Rappeler », qui appelle `POST …/two-factor-reminder` et confirme par un toast. « Dernière connexion » porte en détail l'appareil et la ville quand l'API les rend.
- [ ] AC5 — Au téléphone, le pied du formulaire d'invitation porte « Par WhatsApp » ; au bureau, « Lien par WhatsApp ». Le geste crée l'invitation avec `delivery: "share"` (aucun e-mail envoyé) et ouvre une URL `wa.me` contenant `share_url` ; l'invitation paraît dans « En cours ».
- [ ] AC6 — Vérifier au navigateur, avec une absence en cours en base, le bandeau des absences (bureau) et la ligne « Absent jusqu'au … → X » (téléphone) de la liste (e0, non vérifiables sur la démo) ; corriger si absents.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiches TCK-2667 et TCK-2668 mises à jour : les entrées d'`ecarts_acceptes` couvertes sont retirées.
- [ ] AC-F2 — À 390 × 844 et 1440 × 900 (densité ×0,9), `fidelite compare` sur e1 et e3 ne rend aucun écart non expliqué.
- [ ] AC-F3 — À 1024 et 768 : le panneau de fiche passe en plein écran sous `xl` (ADR-0106 § 4), aucun défilement horizontal.

## Hors périmètre

- La règle d'accès et les données (TCK-2926, TCK-2927).

## Notes d'implémentation

_2026-11-15 — implémenté (agent délégué, arbre `takussan-manques`)._

**Prémisses re-mesurées.** Ni la liste des biens ni celle des clients ne lisaient un agent/référent dans l'URL : ajoutés
(`/app/properties?agent={id}` → `filter[agent]` sur la liste ET sur `portfolio-summary` ; `/app/customers?referent={id}` →
`filter[referent]={id}`, déjà accepté par l'API). Le formulaire exigeait l'e-mail ; l'API refuse l'e-mail avec `delivery: share`.
« Clients et visites » lisait le portefeuille de passation (`…/members/{u}/portfolio`, sous `team.remove`, visites « à venir ») :
remplacé par la fiche `GET …/team/{u}` (TCK-2926) ; la prop `peutLireLePortefeuille` disparaît (4 appelants).

**Décisions tranchées (« valide tes choix »).**
- « Biens suivis » : `rented` = en location ; `available` + `published` = à louer ou à vendre ; tout autre statut (brouillon…)
  se dit « , N autres » plutôt que de laisser une somme fausse. Fiche illisible (403, panne) : repli sur la ligne du tableau
  (compte, 2FA, dernière connexion), sans « Rappeler » ni « Clients et visites ».
- « Commissions dues » reste gardée par la ligne du tableau (`commissions_due_amount`, lecteurs de l'argent, AC4 de TCK-2667) ;
  montant et détail « N baux · la plus ancienne date du … » lus sur la fiche.
- « Dernière connexion » : détail = famille d'appareil telle que servie (`iPhone · Safari`) puis la ville — la ville est nulle
  tant qu'aucune base n'est branchée (ADR-0124 § 2). Écart consigné dans la fiche TCK-2667.
- « Rappeler » : jamais sur sa propre fiche ; 429 → « Déjà rappelé aujourd'hui » (toast info) ; 409 → la fiche se relit.
- « Par WhatsApp » / « Lien par WhatsApp » : seulement si `phone_login` est ouvert (sinon l'API refuse `delivery`). Par WhatsApp,
  le numéro est requis et l'e-mail doit rester VIDE (erreur sur le champ plutôt qu'un e-mail ignoré en silence). L'onglet
  s'ouvre vide dans le geste (motif de `RelanceDUnImpaye`), seulement si la saisie passe la validation ; il part vers
  `wa.me/<numéro rendu par l'API>?text=<message + share_url>` ou se referme sur un refus. Bloqué malgré tout : l'onglet courant
  part vers `wa.me`. Le lien n'est écrit dans aucun stockage, ni état React, ni journal (testé : `Storage.setItem` jamais
  appelé, lien absent du DOM). Message générique (vouvoiement), sans nom d'agence (non disponible à l'écran).
- « Repartager » (`POST /api/invitations/{id}/share-link`) : sur une invitation d'équipe (`agent`/`agency_admin`) sans e-mail et
  avec numéro, sous double authentification (garde existante) ; le toast dit que l'ancien lien ne fonctionne plus.
- AC6 (absences en cours au navigateur) et AC-F2/AC-F3 (relevés `fidelite compare`) : **non mesurés** — consigne du porteur
  (pas de navigateur dans ce lot ; le front servi en local tourne sur un autre arbre).
- AC-F1 : TCK-2667 — retirés « 9 en location… Rappeler, chevrons » et « 5 visites cette semaine », ajouté l'écart
  « iPhone · Dakar » ; TCK-2668 — retiré « Lien par WhatsApp / Par WhatsApp », ajouté « absents sans `phone_login` ; Repartager ».

**Preuves.** vitest : 24 fichiers liés, 215 tests verts (dont `FicheDuMembre.tck-2928` 9, `FormulaireDInvitation.whatsapp.tck-2928`
4, `LesInvitations.whatsapp.tck-2928` 4, `biens-du-membre.tck-2928` 2, `liste-des-clients.tck-2928` 3,
`ListeDesClients.referent.tck-2928` 2). Ablations une à une, rouges sans correctif, restaurées par `cp` (md5 vérifié) :
`delivery: share`, `filter[agent]` de la liste, `referentDeLUrl`, branche 429 du rappel, chevron des biens, ouverture `wa.me`
du repartage. `tsc --noEmit`, eslint des fichiers touchés, `check:i18n`, toutes les gardes `scripts/check-*.mjs` : verts.
