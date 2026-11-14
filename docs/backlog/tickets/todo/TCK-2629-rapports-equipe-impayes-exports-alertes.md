---
id: TCK-2629
title: "Rapports, les onglets de travail : Équipe, Impayés (balance âgée), Exports prêts à télécharger, Alertes qui disent leur état, chiffres personnalisés sur la page"
status: todo
phase: P2
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2626, TCK-2627, TCK-2628, TCK-2657, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#64-kpiconfig-"
    - "docs/models-spec.md#65-thresholdalert-"
tags: [front, rapports, exports, alertes, audit-ux, app]
---

## Objectif utilisateur

L'admin compare ses agents sur un tableau. Il voit ses impayés par ancienneté et sait lesquels n'ont jamais été relancés. Il télécharge « Paiements du mois dernier » en un geste et sait si une alerte veille, et sur quelle valeur. Il règle les chiffres de sa vue d'ensemble sur la page même, et voit leur effet.

## Contrat de données

- **Équipe** :
  - `GET /api/agencies/{agency}/team-performance`, avec `leads_handled` (TCK-2626) ;
  - délai de première réponse par agent : `contact-leads/response-stats` (famille 5), affiché quand il est livré, colonne absente avant.
- **Impayés** :
  - tranches de `GET /api/agencies/{agency}/finance/aging` (existant) ;
  - liste par échéance avec payeur, bien, bailleur et jours de retard, plus la dernière relance : `payments/history` enrichi et `lease-payments/{id}/reminders` (famille 6). **La même lecture que la page des impayés de la famille 6, pas une seconde.**
- **Exports** :
  - `GET /api/export/{entity}` (existant : types selon les capacités, CSV, Excel ou PDF, période, plafonds 5 000 et 200 lignes, nom de fichier rendu par l'API) ;
  - `GET /api/me/exports` (TCK-2627).
- **Alertes** :
  - `threshold-alerts` (existant : création, modification, suppression) ;
  - `current_value`, `recipients`, `channels` et `include=triggers` (TCK-2627).
- **Personnaliser** : `kpi-configs`. Création, suppression, `sort_order` et `is_enabled` sont déjà acceptés par l'API. `kpi-configs/metrics` pour le catalogue.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-rapports&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Personnaliser les chiffres », « Impayés (balance âgée) », « Exports », « Export personnalisé », « Alertes », « Nouvelle alerte ».
- **Équipe** :
  - **bureau** : un tableau avec Agent, Biens gérés, Demandes traitées, Visites, Baux signés, Commissions générées et Délai de réponse, trié par colonne ;
  - **téléphone** : une carte par agent, avec trois chiffres et « Voir ».
- **Impayés** :
  - en tête, les tranches (« 1–30 j · 31–60 j · 61–90 j · > 90 j »), chacune avec son compte, son montant, et un lien qui filtre la liste ;
  - puis la liste : locataire, bailleur, bien, montant dû, retard, « Dernière relance » (« Jamais relancé » en ton d'alerte) ;
  - « Relancer » ouvre le geste de la famille 6.
  - **Un seul composant Impayés** (décision du porteur du 2026-11-10, point 14 a) : l'onglet Impayés de Rapports (TCK-2629) et l'écran Impayés d'« Argent » (TCK-2660) sont **le même composant**, mêmes données, mêmes filtres, même relance unitaire et en lot (TCK-2682) — pas deux écrans qui se ressemblent. Ce qui diffère (en-tête, place dans la page) passe par ses propriétés. Ce ticket **monte** le composant livré par TCK-2660 ; s'il est mergé avant lui, il l'écrit et TCK-2660 le reprend.
- **Exports** :
  - des **cartes prêtes** (« Paiements du mois dernier · Excel › Télécharger », « Baux actifs · Excel », « Balance âgée · PDF ») ;
  - puis « Export personnalisé » (le formulaire actuel, avec les préréglages de période « Mois dernier · Ce mois · Année 2026 ») ;
  - puis « Derniers exports » (date, type, lignes, « Refaire ») ;
  - au téléphone, le PDF est recommandé pour la lecture sur place.
- **Alertes** :
  - une ligne par alerte : jauge de la valeur actuelle avec le trait du seuil (« Taux d'impayés : 3,91 % · seuil 10 % »), puis « Dernier déclenchement » (« jamais » ou une date), destinataires, canal et délai ;
  - au bureau, un tableau à ces colonnes ;
  - « Nouvelle alerte » en feuille ou en dialogue.
- **Personnaliser les chiffres** :
  - depuis la vue d'ensemble, « Personnaliser » ouvre le mode réglage **sur la page** : poignées pour ordonner, interrupteur pour masquer, « Ajouter un chiffre » (métrique, libellé, format), aperçu de la valeur ;
  - « Terminé » referme.
- **Téléphone (360–390)** : cartes, feuilles du bas. **Bureau (≥ 1280)** : tableaux dès `lg`, formulaire d'export en colonne droite.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0089](../../../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md), [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md), [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md).

**Pas de régression.**

- **Indicateurs** :
  - ajouter (métrique du catalogue, libellé, format nombre, montant ou pourcentage), supprimer ;
  - état vide ;
  - les tuiles de la vue d'ensemble lisent ces chiffres (TCK-2373) ;
  - ouvert aussi en agence individuelle (TCK-284).
- **Alertes** :
  - métrique, opérateur, seuil, sévérité, délai entre deux alertes (24 h par défaut) ;
  - liste, suppression ;
  - « évaluées toutes les heures » dit à l'écran.
- **Exports** :
  - types selon les capacités (paiements, baux, clients, biens, reversements, factures, commissions, balance âgée, cautions ; le bailleur : paiements, baux, biens) ;
  - formats CSV, Excel et PDF ;
  - période ;
  - « Les exports respectent votre rôle », « 5 000 lignes au plus, 200 en PDF » ;
  - la coupure au plafond signalée (en-tête de TCK-1308) ;
  - nom de fichier rendu par l'API.

**Autres règles :**

- **Une carte prête est un export comme un autre** : mêmes capacités, mêmes plafonds, même journal. Une carte dont le type n'est pas permis n'est pas rendue.
- **« Refaire »** relance l'export avec les mêmes paramètres, sous les capacités d'aujourd'hui (TCK-2627). Aucun fichier n'est conservé ni promis.
- **Impayés** :
  - Takussan n'envoie rien (décision 13 a) ;
  - la liste ne mélange jamais deux agences ;
  - un bailleur qui ouvre Rapports n'a **pas** cet onglet (il a « Vue d'ensemble · Reversements · Exports »).
- **Équipe** : un onglet du **persona admin d'agence**, sous la garde de `team-performance` (`viewReports`). L'agent ne l'a pas, même s'il détient `reports.view_agency` : ses onglets sont ceux de la maquette, et le délai de réponse d'un collègue ne lui est jamais montré (décision 7 a de la famille 5).
- **Ordre et masquage des chiffres** : `sort_order` et `is_enabled` sont enregistrés à « Terminé ». Un échec rend l'ordre d'avant et le dit.
- Libellés en français (« Indicateurs », « Délai de réponse ») en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement.

## Delta à produire

- [x] Onglet « Équipe » (tableau au bureau, cartes au téléphone). — `components/rapports/equipe/EquipeDuRapport.tsx`
- [x] Onglet « Impayés » : tranches, liste par échéance, dernière relance, « Relancer » (geste de la famille 6). — le composant d'« Argent » (`admin/finances/impayes/Impayes.tsx`) avec `tranches="anciennete"` et `jamaisRelanceEnAlerte` ; « Argent » inchangé.
- [x] Onglet « Exports » : cartes prêtes, export personnalisé avec préréglages, derniers exports et « Refaire ». — `components/rapports/exports/ExportsDuRapport.tsx`, `lib/rapports/exports.ts`
- [x] Onglet « Alertes » : valeur actuelle et seuil, dernier déclenchement, destinataires, canal, création et modification. — `components/rapports/alertes/AlertList.tsx` ; destinataires et canal en lecture (leur choix est hors périmètre).
- [x] Mode « Personnaliser » de la vue d'ensemble : ordre, masquage, ajout, aperçu. — `components/rapports/indicateurs/ReglageDesChiffres.tsx`
- [x] Tests :
  - une carte prête interdite n'est pas rendue ;
  - « Refaire » rejoue les mêmes paramètres ;
  - « Jamais relancé » en ton d'alerte ;
  - jauge et seuil lus de `current_value` ;
  - réordonner écrit `sort_order` ;
  - masquer écrit `is_enabled: false` ;
  - un agent n'a pas l'onglet « Équipe ».

## Critères d'acceptation

- [ ] AC1 — Admin : la carte « Paiements du mois dernier · Excel » lance `GET /api/export/payments?format=xlsx&from=2026-10-01&to=2026-10-31` (réseau, le 2026-11-10). Le fichier porte le nom rendu par l'API, et la ligne apparaît en tête de « Derniers exports » après rechargement. — **Partiel (L1)** : prouvé au test sauf « en tête après rechargement », qui dépend du journal de l'API et se relève au navigateur en L2. **Preuve** (vitest, réseau doublé) : `rapports/exports/__tests__/ExportsDuRapport.tck-2629.test.tsx` « AC1 » — URL exacte au 2026-11-10, `download` = nom du `Content-Disposition`, puis relecture de `['me','exports']` (ablation de l'invalidation : rouge). L'ordre « en tête » est celui de `GET /api/me/exports` ; le rechargement réel se relève en L2. **L2 (2026-11-14, navigateur, GET seulement)** : la moitié lecture est relevée — `GET /api/me/exports` (admin de démo) rend l'export le plus récent d'abord (1 ligne : paiements, 66 lignes) et la page le rend en tête de « Derniers exports » (« Paiements · Du 1 nov. au 30 nov. », 11 nov., CSV, 66 lignes). La moitié écriture (lancer l'export de la carte et recharger) n'est PAS jouée : un export écrit au journal, et la base de démo n'a pas à recevoir d'écriture. AC1 reste ouvert.
- [x] AC2 — Bailleur : l'onglet « Exports » ne propose que paiements, baux et biens (compte = 3 types), en cartes comme en formulaire. — **Preuve** : même fichier, « AC2 » (cartes paiements + baux, formulaire = 3 types, même avec `reports.export`) et `ExportForm.capacites.test.tsx` ; ablation d'`exportsPermis` : 4 rouges.
- [x] AC3 — Alerte « Taux d'impayés > 10 % » jamais déclenchée : la ligne dit « 3,91 % », « seuil 10 % » et « jamais ». Les destinataires sont les admins actifs (nombre égal à `recipients.count`). — **Preuve** : `rapports/alertes/__tests__/AlertList.tck-2629.test.tsx` « AC3 » et `lib/rapports/__tests__/alertes.tck-2629.test.ts` ; `current_value` nul → aucune jauge, jamais 0 (ablation `?? 0` : 2 rouges).
- [x] AC4 — Dans « Impayés », la tranche « 31–60 j » filtre la liste sur les échéances de 31 à 60 jours (paramètres vus au réseau). Une échéance sans relance porte « Jamais relancé ». — **Preuve** : `admin/finances/impayes/__tests__/impayes-anciennete.tck-2629.test.tsx` « AC4 » (`filter[days_late_min]=31`, `filter[days_late_max]=60` relevés sur `apiRequest`) ; « jamais relancé » en `text-destructive` au bureau et au téléphone, gris dans « Argent » (ablations du fournisseur, du défaut, de la table, de la carte : rouges).
- [ ] AC5 — En mode « Personnaliser », glisser « Taux d'impayés » en premier puis « Terminé » envoie `PATCH kpi-configs/{id}` avec le nouveau `sort_order`. Après rechargement, la tuile est la première de la vue d'ensemble. — **Partiel (L1)** : prouvé au test sauf « après rechargement, la tuile est la première », relevé au navigateur en L2. **Preuve** : `rapports/indicateurs/__tests__/ReglageDesChiffres.tck-2629.test.tsx` « AC5 » (PATCH `sort_order` des seules lignes changées, rien avant « Enregistrer »/« Terminé », puis `router.refresh`) ; échec → ordre rendu et écritures passées défaites (ablation : rouge). La tuile en tête vient de `EnsembleAgence` qui lit les KPI dans leur ordre (`chiffres.tck-2628.test.ts`). **L2 (2026-11-14)** : « après rechargement, la tuile est la première » n'est PAS relevable — aucune persona de démo n'a de `kpi-config` (GET /api/kpi-configs : 0 pour admin, admin2, hote, personas-gerant), et le PATCH est une écriture. Le panneau s'ouvre bien sur la page, à l'état vide (« Affichés · 0 sur 0 »). AC5 reste ouvert ; il se relève dès que team-lead autorise six `kpi-configs` pour une persona (réversible).
- [x] AC6 — Un agent qui détient `reports.view_agency` n'a pas d'onglet « Équipe ». `team-performance` ne part pas de sa page (réseau). — **Preuve** : `lib/navigation/__tests__/rapports.tck-2628.test.ts` (table des onglets, ablation `agent: […, 'equipe']` : rouge) ; `rapports/ensemble/__tests__/agent-sans-equipe.tck-2629.test.ts` : le graphe d'imports d'`EnsembleAgent`, de la coque de « Rapports » et des onglets de l'agent (commissions, pipeline, exports) n'appelle ni `useTeamPerformance` ni `useDelaisDeReponse` (ablation par import d'`OngletEquipe` : rouge). Le relevé réseau au navigateur se fait en L2.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [x] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2629.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé). — **Relevé du 2026-11-14 (L3, terrain, 390 et 1280, GET seulement)** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2629.json` : 6 écrans, rôles, alias (avec motifs), éléments ignorés, 11 écarts acceptés et 7 écarts ouverts.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée. — **Relevé du 2026-11-14 (L3, terrain, 390 et 1280, GET seulement)** : NON satisfait : 7 écarts ouverts (fiche, `ecarts_ouverts`), dont des défauts de rendu ; le reste est groupé par cause (donnée, décision du ticket, exception de charte) dans `ecarts_acceptes`. Lignes (avec la fiche) : a-1 390 15 conformes · 31 écarts · 85 absents · 9.28 % · 9.28 % pixels; a-1 1280 51 conformes · 208 écarts · 109 absents · 65.98 % · 65.98 % pixels; a-2 390 21 conformes · 27 écarts · 39 absents · 24.64 % · 24.64 % pixels; a-2 1280 45 conformes · 222 écarts · 51 absents · 14.71 % · 14.71 % pixels; a-3 390 28 conformes · 35 écarts · 8 absents · 16.61 % · 16.61 % pixels; a-3 1280 47 conformes · 229 écarts · 76 absents · 21.7 % · 21.7 % pixels; a-4 390 29 conformes · 82 écarts · 21 absents · 29.16 % · 29.16 % pixels; a-5 390 20 conformes · 16 écarts · 17 absents · 13.27 % · 13.27 % pixels; a-5 1280 33 conformes · 107 écarts · 63 absents · 7.03 % · 7.03 % pixels; a-6 390 21 conformes · 31 écarts · 33 absents · 29.69 % · 29.69 % pixels; a-6 1280 36 conformes · 138 écarts · 60 absents · 66.83 % · 66.83 % pixels.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif. — **Relevé du 2026-11-14 (L3, terrain, 390 et 1280, GET seulement)** : aucun libellé n'est absent sans motif écrit pour la persona relevée, hors `ecarts_ouverts` : voir la fiche (alias, `ignorer`, écarts acceptés). Des éléments de la maquette manquent sans décision écrite (actions de tête de page, sous-textes de tuile, axe, « Voir le tableau »).
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents. — **Relevé du 2026-11-14 (L3, terrain, 390 et 1280, GET seulement)** : pas de zone propre déclarée (`zones_motif`) ; zones de coque : « en-tête » ≤ 0,5 %, « barre d'onglets » du téléphone 1,94 % (cause : « Menu » inactif et pastille de Messages, `ecarts_ouverts`).
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau. — **Relevé du 2026-11-14 (L3, terrain, 390 et 1280, GET seulement)** : lignes ci-dessus ; `rideau.html` et `cote-a-cote.png` de chaque écran sous `takussan-web/.fidelite/TCK-2629/c1-*/` (local). Le porteur n'a pas encore validé sur le rideau.
- [x] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur. — **Relevé du 2026-11-14 (L3, terrain, 390 et 1280, GET seulement)** : balayage 390, 768, 1024, 1280, 1440 : débord 0, dépassement 0, aucune coupe nette ; 1280 sans débord (`produit.releves.balayage` de la fiche).

## Hors périmètre

- La page des impayés de l'onglet « Argent » et le geste de relance (TCK-2660, TCK-2682) : cet onglet monte le même composant.
- L'envoi programmé d'un export, le format SYSCOHADA.
- Le choix des destinataires d'une alerte.

## Notes d'implémentation

**L1 (2026-11-14) — les cinq parties fonctionnelles ; la fidélité (AC-F1 à AC-F6) est la L2.**

- **Impayés** : un seul composant avec « Argent » (ADR-0096 § 5). Deux propriétés : `tranches="anciennete"` (pastilles 1–30 · 31–60 · 61–90 · > 90 j, chacune comptée par sa lecture `per_page=1`, et la balance âgée `BalanceAgee` lue de `finance/aging`) et `jamaisRelanceEnAlerte` (contexte `ton-de-la-relance.ts`). Sans elles, « Argent » rend exactement ce qu'il rendait.
- **Exports** : une carte prête est un export comme un autre, filtrée par `exportsPermis` ; le bailleur a ses trois types quelles que soient ses capacités. « Baux » et non « Baux actifs » : l'export n'a pas de filtre de statut. « Refaire » (et non « Retélécharger », aucun fichier n'est conservé) n'existe que si type et format sont connus et le type permis AUJOURD'HUI.
- **Alertes** : jauge à 1,5 × le seuil, trait aux deux tiers ; `current_value` nul → « — », jamais 0. `include=triggers` pour le dernier déclenchement. Destinataires et canal en lecture (choix hors périmètre).
- **Équipe** : nouveau composant sur la même lecture `team-performance` (`TeamPerformanceTable` d'Équipe inchangé) ; la colonne du délai n'existe que si `response-stats` répond, et dit « médiane sur N jours » sous le tableau (fenêtre glissante, colonnes mensuelles).
- **Personnaliser** : rendu et lu seulement si `indicateursOuverts` (`vues/__tests__/LienDesIndicateurs.tck-2629.test.tsx`, ablation : 4 rouges). Le réglage s'ouvre sur la page (feuille au téléphone, panneau à droite au bureau) ; `/app/reports/indicators` reste et monte le même réglage. `KpiConfigList` supprimé ; sa borne de libellé (120, TCK-1491) est reprise dans le test du réglage, et la garde TCK-868 (`erreurs-de-champ-reliees.test.ts`) vise désormais `ReglageDesChiffres.tsx`.
- Décisions D1 à D7 validées par la session déléguante le 2026-11-14 (« jamais relancé » : `text-destructive`, encre opaque).

**Pour la L2 (fiche de fidélité et relevés 390/1280) — ce que la L1 a rendu en lecture seule, retiré ou renommé par rapport à la maquette (D7), avec le motif de chacun.** Chaque ligne est un alias ou un « absent motivé » à reporter dans `fidelite/TCK-2629.json` :

| Écran | Élément de maquette | Rendu | Motif |
|---|---|---|---|
| Exports, cartes prêtes | nombre de lignes de chaque carte | retiré | aucune lecture ne donne le compte avant l'export ; l'API ne le rend qu'au journal, après coup (`row_count` de `GET /api/me/exports`) |
| Exports, cartes prêtes | « Baux actifs » | renommé « Baux » | l'export `leases` n'a pas de filtre de statut : le titre mentirait |
| Exports, derniers exports | « envoyé à … » (destinataire d'un export) | retiré | un export est un téléchargement ; Takussan n'envoie rien (envoi programmé hors périmètre) |
| Exports, derniers exports | « Retélécharger » | renommé « Refaire » | aucun fichier n'est conservé : le geste relance le même export (type, format, période), sous les capacités du jour |
| Exports, derniers exports | « Refaire » sur chaque ligne | absent sur certaines lignes | absent si le type ou le format est inconnu de l'onglet (exports d'« Argent »), ou si le type n'est plus permis aujourd'hui |
| Alertes, formulaire | choix des destinataires | en lecture (« 2 administrateurs ») | hors périmètre du ticket ; l'API fixe les admins actifs (`recipients`) |
| Alertes, formulaire | choix du canal | en lecture | même motif ; le canal est celui que rend l'API (`channels`) |
| Alertes, liste | jauge | absente quand `current_value` est nul (« — ») | jamais 0 à la place d'une mesure absente |
| Équipe | colonne « Délai de réponse » | libellé + « médiane sur N jours » sous le tableau ; colonne absente si `response-stats` échoue | fenêtre glissante de l'API à côté de colonnes mensuelles : la différence est dite |
| Impayés, téléphone | balance âgée en cartes | barre seule au téléphone | place ; les pastilles de tranche portent les comptes |
| Personnaliser | « Terminé » au téléphone, « Annuler / Enregistrer » au bureau | tel quel | feuille du bas au téléphone, panneau à droite au bureau (`/app/reports/indicators` monte le même réglage, D6) |
