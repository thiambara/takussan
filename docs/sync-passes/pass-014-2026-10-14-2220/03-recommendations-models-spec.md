# Passe 014 — Recommandations pour `docs/models-spec.md`

**Trois recommandations nouvelles (MC1-MC3).** Des 27 actions de la passe 013, **C6 est résolue**
(§96, TCK-639) ; les 26 autres restent ouvertes et ne sont pas répétées
([texte intégral](../pass-013-2026-10-14-1023/03-recommendations-models-spec.md)).

> **Correctif du 2026-10-14, après la passe — ce qui suit sur FC1 et MC1 est faux sur un point.**
> La passe affirme que les clés globales qu'écrit la route brute « ne sont lues par aucun code ». Re-mesuré
> avant d'appliquer FC1 : **cinq clés hors de tout catalogue sont lues** par `App\Support\ScopedSetting`
> (ligne de l'agence, sinon **ligne globale**, sinon défaut) — `invoice.reminder_offsets_days`,
> `lease.rent_review_max_pct`, `lease.early_termination_penalty_months`, `lease.require_signature`,
> `late_fees.cap_percent`. Leur valeur globale ne s'écrit **que** par la route brute. L'option (b) de FC1
> (fermer la voie brute en portée `global`) supprimerait donc le seul réglage de ces cinq défauts de
> plateforme. Le constat de dérive de l.671 et §30 tient ; la conséquence et l'option recommandée,
> non. Toute autre clé globale écrite par cette route reste sans lecteur (relevé : `PlatformSettingService`,
> `BusinessEnumService` et `ScopedSetting` sont les trois seuls lecteurs de `settings`).

| ID | Section | Objet | Priorité |
|----|---------|-------|----------|
| MC1 | §30 Setting | La console sert aussi l'éditeur brut ; à joindre à MB13 de la passe 013 (catalogue `enum.*`) | Moyenne — suit FC1 |
| MC2 | Rôles personnalisés (l.4924) | `/admin/roles` → `/app/agency/roles` | Basse |
| MC3 | §96 CreditMovement | Reliquat de RC2 : l'`UPDATE` sans changement | Basse |

---

#### MC1 — §30 `Setting` : deux voies d'écriture

**Constat.** « Les clés que la console édite (portée `global`) forment un catalogue en code » : depuis
TCK-648, la console sert aussi `/super-admin/settings/global`, éditeur de la route brute `/api/settings`
(`SettingController`). Celle-ci refuse en **422 `setting.managed_by_catalogue`** toute clé que
`EditablePlatformSettings::managedByCatalogue` reconnaît (le catalogue, et `enum.*` des énumérations
métier) — sur `store` (`StoreSettingRequest::passedValidation`), `update` (`UpdateSettingRequest`) et
`destroy` — et écrit toute autre clé, `value` étant n'importe quel objet JSON, avec `updated_by_id`
pour seule trace. Portée `global` réservée au super-admin, portée `agency` à l'admin de l'agence.

**Proposition.** Après le paragraphe « Clés de plateforme », ajouter un paragraphe « **Route brute.** »
qui dit ces trois faits : ce qu'elle refuse, ce qu'elle écrit, qu'elle ne journalise pas. Si le porteur
retient FC1 (b), écrire à la place que la portée `global` y est refusée. Appliquer MB13 (013) dans le
même mouvement : §30 nomme alors les deux catalogues.

#### MC2 — l.4924 : « Écran : `/admin/roles` »

**Proposition.** Remplacer par « Écran : `/app/agency/roles` » (TCK-649, ADR-0064).

#### MC3 — §96 : l'`UPDATE` qui ne change rien

**Constat.** `credit_movements_append_only()` (`2026_10_14_100000`) ne lève que si une colonne change ;
un `UPDATE` sans changement — y compris `SET actor_id = NULL` sur une ligne où il l'est déjà — passe
à la profondeur 1. « Tout UPDATE ou DELETE direct lève `P0001` » ne l'exclut pas.

**Proposition.** Celle de RC2 (013) : ajouter « (un `UPDATE` qui ne change aucune valeur passe, sans
effet) » après « tout UPDATE ou DELETE direct lève `P0001` ».
