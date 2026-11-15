---
id: TCK-2868
title: "Rapports, onglets : les impayés groupés par tranche, « Balance âgée en PDF » et « Tri : montant dû » ; « Qui est prévenu » et « Canal » d'une alerte ; « Retélécharger », « Trimestre », « Autre… » et « 38 lignes à exporter » ; le libellé et le format d'un chiffre déjà affiché"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2866]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, rapports, impayes, alertes, exports, audit-ux, app]
---

## Objectif utilisateur

L'admin lit ses impayés par ancienneté et les envoie en PDF, règle qui ses alertes préviennent, retrouve ses exports, sait combien de lignes il va exporter, et renomme un chiffre affiché.

## Contrat de données

- PDF de balance âgée, `sort=-remaining_amount`, `recipient_ids` / `channel` des alertes, téléchargement d'un export conservé, `export/{entity}/count` : **livrés par TCK-2866**.
- Libellé et format d'un chiffre : `PATCH /api/kpi-configs/{id}` accepte déjà `label` et `format` (`UpdateKpiConfigRequest`) — front seul.

Relevé (audit-f3-coque.md, app-rapports e1, e2, e3, e4, e6 ; « Écarts couverts » 11, 12, 13) : `OngletImpayes.tsx` / `BalanceAgee.tsx` / `Impayes.tsx` (décision 14 a : la page suit « Argent », groupes, PDF et tri abandonnés — repris ici à la demande du porteur) ; `AlertList.tsx:308-315, 345-410` (phrase lue au lieu des champs) ; `ExportsDuRapport.tsx` (« Refaire ») ; `ExportForm.tsx:34-128` (ni Trimestre, ni Autre…, ni nombre de lignes) ; `ReglageDesChiffres.tsx` (libellé et format seulement à l'ajout).

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-rapports.tsx` et `app-rapports-pieces.tsx`, approche a :

- **e2 « Impayés (balance âgée) »** : **téléphone** — la liste groupée par tranche, chaque groupe sous un en-tête « > 90 j · 2 échéances · {montant} » ; **bureau** — « Tri : montant dû » et « Balance âgée en PDF » dans la barre (l. 415-418).
- **e6 « Nouvelle alerte »**, **les deux formats** : « Qui est prévenu » (choix parmi les destinataires possibles) et « Canal » E-mail · WhatsApp · Les deux (`app-rapports-pieces.tsx` l. 692-696) ; **e5 « Alertes »**, bureau : colonnes « Destinataires » et « Canal » (l. 602).
- **e3 « Exports »**, **les deux formats** : « Retélécharger » sur un export conservé (l. 489, 540).
- **e4 « Export personnalisé »** (téléphone ; colonne droite d'e3 au bureau) : périodes Ce mois · Mois dernier · **Trimestre** · Année · **Autre…** (l. 632) et « **38 lignes à exporter.** 5 000 lignes au plus par export, 200 en PDF. » (l. 644).
- **e1 « Personnaliser les chiffres »**, **les deux formats** : la ligne dépliée « Libellé / Format » d'un chiffre **déjà affiché**.

## Contraintes strictes (métier)

- Le nombre de lignes se relit quand un filtre change (anti-rebond), et l'export est refusé à l'écran au-delà de la limite.
- « Qui est prévenu » ne propose que les destinataires possibles du chiffre ; vide = « Tous les administrateurs » (comportement actuel).
- Un export expiré ne propose plus « Retélécharger » mais « Refaire ».
- La page des impayés reste le composant d'« Argent » (une seule implémentation) : groupes, tri et PDF y sont ajoutés en options que Rapports active.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Impayés : groupes par tranche (téléphone), tri par montant et PDF (bureau).
- [ ] Alertes : champs « Qui est prévenu » et « Canal » ; colonnes du tableau.
- [ ] Exports : « Retélécharger » ; Trimestre, Autre… ; nombre de lignes.
- [ ] Chiffres : édition du libellé et du format d'un chiffre affiché.
- [ ] Tests : en-têtes de tranche ; requête triée ; lien PDF ; alerte créée avec destinataires et canal ; « Retélécharger » appelle le téléchargement ; « 38 lignes à exporter » ; `PATCH` du libellé.

## Critères d'acceptation

- [ ] AC1 — À 390, les impayés sont groupés sous des en-têtes de tranche portant le nombre d'échéances et le montant.
- [ ] AC2 — À 1440, « Tri : montant dû » envoie `sort=-remaining_amount` ; « Balance âgée en PDF » télécharge le PDF.
- [ ] AC3 — Nouvelle alerte avec « Qui est prévenu : Awa Diop » et « Canal : WhatsApp » : la requête porte `recipient_ids` et `channel = whatsapp` ; le tableau des alertes affiche « Awa Diop » et « WhatsApp ».
- [ ] AC4 — Un export de 2 jours porte « Retélécharger » ; un export expiré porte « Refaire ».
- [ ] AC5 — Export personnalisé : « Trimestre » pose les dates du trimestre courant ; la phrase dit « 38 lignes à exporter. » avec 38 lignes servies par `count`.
- [ ] AC6 — Un chiffre affiché se déplie en « Libellé / Format » ; enregistrer envoie `PATCH` et la tuile prend le nouveau libellé.
- [ ] AC7 — Vérifier au navigateur (audit, non vérifiables) : « Déclenchements récents » d'une alerte qui sonne — corriger s'il ne se rend pas.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2868.json` : app-rapports e1, e2, e3, e4, e5, e6, téléphone et bureau (e4 : téléphone, et la colonne droite d'e3 au bureau).
- [ ] AC-F2 — Zéro écart non expliqué ; rien de ce qui précède n'est « hors périmètre » ni « accepté ».

## Hors périmètre

- Les vues d'ensemble : TCK-2867.

## Notes d'implémentation

_(à remplir par implementing-specs)_
