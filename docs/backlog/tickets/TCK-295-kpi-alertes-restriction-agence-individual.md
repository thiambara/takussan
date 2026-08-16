---
id: TCK-295
title: "§1.12 — rendre EXPLICITE que les KPI et alertes de seuil ne sont pas réservés aux agences `standard`"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-284]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [spec, autorisation, tracabilite]
---

## Objectif utilisateur

Qu'un `agency_admin` d'agence `individual` — et surtout la prochaine personne qui lira la spec —
trouve la réponse ÉCRITE sur les KPI personnalisables et les alertes de seuil, au lieu d'avoir à
la déduire d'un silence.

## Contrat de données

Aucun changement de données. Aucun changement d'API. Aucun changement de front.

Endpoints concernés, laissés tels quels : `Api\KpiConfigController` et
`Api\ThresholdAlertController` (`routes/api/kpis-and-alerts.php`), surfaces
`/app/overview/kpis` et `/app/overview/alerts`.

## Contraintes strictes (métier)

**La décision est déjà prise, ce ticket ne la rouvre pas.** TCK-284 l'a tranchée le 2026-08-15,
section « ✅ Arbitrage produit » : ces deux écrans ne sont **pas** réservés aux agences
`standard`, et les deux entrées correspondantes ont été retirées de `PRO_ROUTES`.

Ce qui reste est la FORME de cette décision dans la spec. Aujourd'hui elle ne s'y lit que par
soustraction : §1.12 énumère une liste **fermée** de restrictions où les KPI et les alertes ne
figurent pas, puis conclut « toutes les autres capacités restent disponibles ». La réponse est
donc juste, mais elle est portée par un silence.

Or ce dépôt a déjà payé ce mécanisme exact, en sens inverse : **TCK-256 avait décidé et livré la
restriction « carnet de propriétaires » que cette même clause résiduelle NIAIT** — et la
contradiction a tenu jusqu'à ce que TCK-284 la lève. *Une règle que la spec ne nomme pas finit par
être appliquée, ou retirée, par quelqu'un qui lit la spec.* Le verrou sur les KPI et les alertes
avait précisément été ajouté par un commit (`5d40dd31`) qu'aucun ticket ne demandait.

## Delta à produire

- [x] `docs/features.md` §1.12 — encadré nommant les KPI et les alertes de seuil comme
      **disponibles**, citant TCK-284, et rappelant les deux précédents qui rendent le silence
      insuffisant (`5d40dd31` et TCK-256)
- [x] §2.5 relue ligne à ligne contre §1.12 — **un second angle mort trouvé**, et il n'était pas
      un silence mais un problème de VOCABULAIRE (voir les notes)
- [x] Les trois lignes concernées de §2.5 portent désormais leur statut à l'endroit où on les lit

## Critères d'acceptation

- [x] AC1 — la réponse est écrite en §1.12 **et** sur la ligne §2.5 elle-même, dans les deux sens
      de lecture
- [x] AC2 — `node scripts/check-pro-routes.mjs` vert ; `PRO_ROUTES` inchangé (7 entrées, ni KPI ni
      alertes) ; `gen-features-by-actor --check` vert après régénération
- [x] AC3 — vérifié par `git diff --name-only` : **aucun fichier de `takussan-api/app/` ni de
      `takussan-web/src/`** n'apparaît dans le diff

## Hors périmètre

- **Rouvrir l'arbitrage.** Il est tranché (TCK-284). Ce ticket écrit la décision, il ne la
  rediscute pas.
- Les cinq routes `/admin/*`, `/app/overview/agency` et `/app/owners`, dont la restriction est
  tranchée, spécifiée ET gardée des deux côtés.
- L'implémentation des KPI personnalisables et des alertes de seuil elles-mêmes (§2.5, P3).

## Notes d'implémentation

**Le second angle mort n'était pas un silence, c'était un problème de vocabulaire — et c'est pire.**
La relecture ligne à ligne de §2.5 contre §1.12 a trouvé « Dashboard agence (biens, vues, revenus,
impayés) », listé **P1 sans aucune mention de restriction**. Il est pourtant bien restreint :
`/app/overview/agency` figure dans `PRO_ROUTES`, et le docblock de sa page dit mot pour mot *« le
reporting cross-équipe n'est pas disponible pour les agences `individual` »*.

Les deux sections désignent donc le même écran sous deux noms — « reporting cross-équipe » en §1.12,
« Dashboard agence » en §2.5 — sans que rien ne le dise. La spec n'était pas fausse : elle exigeait
du lecteur qu'il sache **déjà** que ces deux expressions sont synonymes, c'est-à-dire précisément ce
qu'il vient chercher. *Un silence se remarque ; deux noms pour la même chose ne se remarquent pas —
on croit avoir lu la réponse.*

**La correction va donc dans les deux sens de lecture.** L'encadré de §1.12 nomme les capacités
disponibles et l'identité des deux termes ; les trois lignes concernées de §2.5 portent leur statut
**là où on les lit**. Un lecteur qui n'ouvre qu'une des deux sections a désormais la réponse
complète — c'est le seul critère qui compte, puisque personne ne lit une spec de bout en bout.

**Aucune garde ajoutée, et c'est délibéré.** `scripts/check-pro-routes.mjs` tient déjà l'accord entre
`PRO_ROUTES` et les pages ; ce ticket ne change ni l'un ni l'autre. Ajouter une garde qui vérifierait
qu'une *phrase* de spec dit la même chose qu'une *constante* demanderait d'ancrer la garde sur une
formulation, donc d'interdire de la reformuler. Le risque réel est couvert : si quelqu'un remet
`/app/overview/kpis` dans `PRO_ROUTES`, `check-pro-routes` casse.
