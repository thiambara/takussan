---
id: TCK-2868
title: "Rapports, onglets : les impayés groupés par tranche, « Balance âgée en PDF » et « Tri : montant dû » ; « Qui est prévenu » et « Canal » d'une alerte ; « Retélécharger », « Trimestre », « Autre… » et « 38 lignes à exporter » ; le libellé et le format d'un chiffre déjà affiché"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

2026-11-15 — implémenté (worktree `feat/audit-manques-2026-11-15`, sur l'API de TCK-2866 commitée).

**Impayés** (`Impayes.tsx`, une seule implémentation) : deux options neuves, activées par `OngletImpayes` seul —
`groupes` (téléphone : en-tête de tranche `h3`, bande `bg-muted/50` à fond perdu comme la maquette, avant la première échéance de chaque tranche, compte et montant de
la tranche ENTIÈRE lus des lectures des pastilles, pas des lignes chargées ; pas de second en-tête au raccord d'un
« Voir plus » : la page d'avant, en cache, dit la tranche de sa dernière ligne) et `triEtPdf` (bureau : « N
échéances en retard », « Tous les bailleurs » (bailleurs de la balance âgée par bailleur, même filtre que la puce
posée depuis « Par bailleur », qui ne se double plus au bureau de Rapports), sélecteur « Tri : retard / Tri : montant dû » → `sort=-remaining_amount`, le tri vit dans
`Filtres` donc dans `parametres()`, les comptes ne le relisent pas ; « Balance âgée en PDF » par
`BoutonTelechargement` → `GET /api/agencies/{agence}/finance/aging.pdf`, `filter[landlord_id]` quand un bailleur
est choisi). Le téléphone reste trié par retard (ses groupes en dépendent). « Argent » inchangé (testé).

**Alertes** : « Qui est prévenu » (un CHAMP comme « Métrique », maquette : `Select multiple`, vide = « Tous les
administrateurs » ; options = destinataires possibles, lus par la server action neuve `recipientCandidatesAction(metric)` → `GET /api/threshold-alerts/recipient-candidates`, relu
à chaque changement de mesure ; un choix qui n'en est plus est retiré) et « Canal » (segmenté E-mail · WhatsApp ·
Les deux). `recipient_ids` (vide → `null` = tous, `chosen()` de l'API) et `channel` toujours envoyés, création et
modification. La colonne / la carte « Canal » lit `channel` (« E-mail et WhatsApp » pour `both`), plus `channels`.
Aide sous « Canal » quand WhatsApp est choisi (préférence désactivée par défaut, numéro vérifié ; aucun gabarit
Meta `threshold_alert` n'existe encore — TCK-2866). « Déclenchements récents » dit ce qui est parti
(« E-mail · 2 personnes prévenues », `triggers[].channel/recipients_count`).

**AC7 — défaut trouvé et corrigé** : modifier une alerte VIDAIT ses « Déclenchements récents » (la réponse du
`PATCH`, lue par `enregistree`, n'avait pas `include=triggers`). Les deux actions demandent désormais
`?include=triggers` (l'API le lit sur `store`/`update`, `withReading`, vérifié l. 110 et 135), et `enregistree` garde les déclenchements
d'avant si la réponse n'en a pas. Vérification au navigateur : non mesurée (consigne du porteur), prouvée par test.

**Exports** : « Retélécharger » si et seulement si `file.available` (pas soumis à `refaisable`), sinon « Refaire » ;
par un relais BFF NEUF `app/api/me/exports/[id]/download/route.ts` (copie du relais `data-exports`) — le nom du
fichier vient de `Content-Disposition` ; un 410/403 dit « plus disponible » et relit la liste. Préréglages dans
l'ordre de la maquette (Ce mois · Mois dernier · **Trimestre** · Année · **Autre…**, état tenu à part). Le nombre
de lignes (`useCompteDeLExport` : `useApiQuery` direct à Laravel — le relais `/api/export/[entity]` ne sert que
les fichiers — anti-rebond 400 ms sur une clé texte, clé de cache entité+format+dates) : « 38 lignes à exporter.
5 000 lignes au plus par export, 200 en PDF. » ; au-delà du `limit` (celui du FORMAT) le bouton est désactivé et
la phrase dit le refus ; une lecture absente ou en échec ne bloque rien.

**Chiffres** : un chiffre affiché se déplie au toucher de son libellé (« Libellé / Format », aide « Métrique : …
(aujourd'hui : …) ») ; `Ecriture`, `ecrituresDuReglage` et `inverse` portent `label`/`format` : ils partent à
« Enregistrer / Terminé » dans le même `PATCH`, « Annuler » et le retour arrière d'un échec les couvrent ; un
libellé vide est refusé à l'écran. La tuile lit `kpis[].label` (`chiffresDeLAgence`) après `router.refresh()`.
Formats « Nombre · Montant · Pourcentage » (clés `rapports.reglage.formats.*` ; la clé partagée dit « Devise »).

**Prémisse différente / corrigé en passant** : `rapports.exports.pied` (« Aucun fichier n'est conservé ») et
`quiEstPrevenuValeur`, `videDescription` (« les administrateurs seront prévenus ») étaient faux depuis ADR-0115 /
TCK-2866 : réécrits, `quiEstPrevenuValeur` supprimée ; `dashboard.exports.rowCap` reprend la phrase de la maquette.

Clés i18n : écrites par l'outil ; elles sont DÉJÀ dans les commits 06868169c (TCK-2847) et 2b4d7bcd2 (TCK-2909),
qui ont emporté `messages/*.json` entiers — rien à recommiter pour elles.

Tests (vitest) : `impayes-rapports.tck-2868`, `AlertList.destinataires.tck-2868`, `exports.tck-2868` (composant et
lib), `ReglageDesChiffres.libelle.tck-2868`, `me/exports/[id]/download/__tests__/route.tck-2868` ; mocks mis à jour
dans 5 tests existants ; recensement `relais-chemin-serveur` complété. 14 ablations rouges une à une, restaurées
par md5. Voisins : 77 fichiers / 672 tests verts ; tsc, eslint, `check:*` du front et gardes racine verts.
Fiche de fidélité : `docs/qa/audit-ux-2026-11/fidelite/TCK-2868.json` (lecture de la maquette, écarts expliqués).
