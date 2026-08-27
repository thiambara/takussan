---
id: TCK-379
title: "Tableau de bord /app — le menu et l'inventaire des écrans ont divergé : deux écrans sans chemin, un geste mort, un menu qui n'est pas le sien"
status: todo
phase: P2
family: bug
estimate: S
wave: 48
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#16-crm--relation-client
    - docs/features.md#19-état-des-lieux--inventaires
    - docs/features.md#22-rôles--permissions
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, dashboard, navigation, rgpd, bug]
---

## Objectif utilisateur

Ce que le produit a construit est atteignable, et ce que le menu propose correspond au métier de
celui qui le lit.

## Contexte

Quatre défauts mesurés le 2026-08-26 sur `/app`. Aucun n'est une fonctionnalité manquante :
chacun est un raccord entre la table de navigation et l'inventaire des écrans, qui ont dérivé
l'un de l'autre. Ils tiennent dans un seul ticket parce qu'ils partagent leur forme — *l'écran
existe des deux côtés, le fil entre les deux est absent* — et que chacun se vérifie en une
commande.

| # | Constat | Mesure |
|---|---|---|
| 1 | `/app/account/privacy` — **export RGPD de portabilité** — n'a **aucun lien entrant** dans tout le front | clôture d'import de `src/` : 0 référence hors du fichier lui-même. Ni la barre latérale, ni `UserMenu`, ni `/app/profile` (qui expose pourtant « Notifications » et « Avis ») ne la desservent |
| 2 | `/app/crm/pipeline` — le kanban de prospects — n'a **aucun lien entrant** | idem : 0 référence. `PipelineKanban` fait 201 lignes et porte deux fichiers de tests ; l'écran est fini et injoignable |
| 3 | `/app/inventories` n'offre **aucun geste de création** | l'état vide renvoie vers `/app/leases` (`InventoryList.tsx:108`) ; la liste peuplée n'a pas de bouton. `/app/inventories/new` n'est atteint que par `TenantOnboardingChecklistWidget.tsx:133`, avec `?lease_id=`, donc **par le locataire seul** — alors que [§1.9](../../features.md#19-état-des-lieux--inventaires) donne « créer un inventaire » en P1 🧑‍💼 |
| 4 | Un `service_provider` reçoit « Réservations », « Baux », « Favoris », « Recherches sauvegardées » et « Statistiques » | `AppSidebar.tsx` — le bloc « Wave 3 Ops » (l. 186-203) pousse `/app/bookings`, `/app/visits`, `/app/leases` et `/app/messages` **sans aucune condition de rôle**, et `/app/overview` de même (l. 133) |

Le quatrième mérite son détail, parce qu'il ne s'arrête pas au bruit. `OverviewPage` aiguille
explicitement `isServiceProvider` vers `/app/overview/tenant`
(`app/overview/page.tsx`) : un prestataire qui clique « Statistiques » atterrit sur le **tableau
de bord locataire**, qui lui répondra `has_customer_profile: false`.

Et la spec ne le rattrape pas, parce qu'elle ne le connaît qu'à moitié — un générateur du dépôt
le dit déjà tout seul :

```
$ node docs/gen-features-by-actor.mjs --check
⚠ 1 acteur(s) non déclaré(s) dans la légende de features.md : 🔧
$ grep -c "🔧" docs/features.md
1                      # une seule ligne : §2.1, le wizard d'onboarding
```

Le prestataire n'est pas dans la table des acteurs de `docs/features.md`, et
[§2.5](../../features.md#25-reporting--tableaux-de-bord) ne lui accorde aucun tableau de bord. Le
menu offre donc quelque chose que la spec ne prévoit pas, et l'aiguillage le fait atterrir chez
quelqu'un d'autre.

*Un écran qu'on peut construire sans jamais avoir à l'atteindre reste vert en CI, et invisible
en production.*

## Contrat de données

Aucun endpoint à créer, aucun à modifier. Les quatre écrans concernés consomment déjà leurs
routes :

- `/api/data-exports` (`src/lib/queries/data-exports.ts`) — l'export RGPD
- `/api/customers` + transitions de stade (`src/lib/queries/pipeline.ts`) — le pipeline
- `/api/inventories` (`src/lib/queries/inventory.ts`) — la création d'état des lieux

## Direction UX / Artistique

- L'export de ses données personnelles est un **droit**, pas une option avancée : il se trouve
  là où l'utilisateur cherche ses affaires de compte, à côté de la suppression de compte dont il
  est le pendant — et pas au fond d'un menu qu'il faudrait deviner.
- Le pipeline est une **vue** du CRM, pas une section parallèle : il s'atteint depuis les clients,
  comme une seconde façon de regarder la même chose.
- La création d'un état des lieux part d'un bail : le geste doit le dire, plutôt que de renvoyer
  l'agent chercher lui-même dans une autre section.
- Un menu qui propose ce qui ne concerne pas le lecteur lui coûte de l'attention à chaque
  affichage. Retirer vaut mieux que griser.

## Contraintes strictes (métier)

- **Rien ici n'élargit un accès.** Les entrées retirées au `service_provider` sont retirées parce
  que ni la spec ni son métier ne les lui accordent ; aucune entrée n'est ajoutée à un rôle qui
  ne l'avait pas, hors les trois chemins manquants ci-dessus, qui mènent à des pages déjà gardées.
- `/app/account/privacy` et `/app/crm/pipeline` gardent leurs gardes serveur actuelles : un
  chemin de navigation n'autorise rien.
- Le prestataire garde « Interventions », « Messagerie » et « Documents » — c'est son métier
  ([§1.8](../../features.md#18-maintenance--interventions)).
- Tant qu'aucun tableau de bord prestataire n'est spécifié, l'entrée « Statistiques » ne lui est
  pas montrée. **Ne pas en inventer un** : ce serait une fonctionnalité hors spec.
- `/app/crm` reste une redirection permanente vers `/app/customers` (les signets), et
  `/app/payments/return` reste sans lien entrant (c'est un retour de passerelle de paiement) —
  ni l'un ni l'autre n'est un défaut.

## Delta à produire

- [ ] Chemin de navigation vers `/app/account/privacy`, placé auprès des réglages de compte de
      l'utilisateur
- [ ] Chemin de navigation vers `/app/crm/pipeline` depuis les clients, visible par les rôles que
      la page laisse déjà entrer (agent / bailleur / admin)
- [ ] Geste de création d'état des lieux depuis `/app/inventories`, pour les rôles que
      [§1.9](../../features.md#19-état-des-lieux--inventaires) sert — y compris quand la liste
      n'est pas vide
- [ ] Conditions de rôle sur les entrées poussées sans garde dans `buildNavItems` : réservations,
      baux, visites, favoris, recherches sauvegardées, statistiques
- [ ] Aiguillage de `/app/overview` : un `service_provider` n'y est plus envoyé vers la vue
      locataire
- [ ] i18n fr/en/wo pour tout libellé neuf
- [ ] Tests : un par défaut corrigé

## Critères d'acceptation

- [ ] AC1 — un test parcourt **toutes** les routes `page.tsx` de `src/app/(dashboard)/app` et
      échoue sur toute route sans lien entrant, hors une liste d'exceptions **nommées et
      justifiées** (`/app/crm`, `/app/payments/return`, les routes dynamiques). Ce test aurait
      échoué avant ce ticket sur `/app/account/privacy` et `/app/crm/pipeline`
- [ ] AC2 — un `agent` sur `/app/inventories`, liste **non vide**, atteint la création d'un état
      des lieux depuis cet écran ; un test l'éprouve et échouerait si le bouton n'existait que
      dans l'état vide
- [ ] AC3 — le menu d'un `service_provider` ne contient ni « Réservations », ni « Baux », ni
      « Visites », ni « Statistiques ». Un test compare l'ensemble des `href` rendus pour les six
      rôles à une table attendue, et échouerait sur une entrée poussée sans garde
- [ ] AC4 — `/app/overview` n'aiguille plus un `service_provider` vers `/app/overview/tenant`
- [ ] AC5 — les gardes serveur des trois pages nouvellement desservies sont inchangées : un test
      vérifie qu'un rôle non autorisé est toujours refusé malgré le nouveau lien
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Créer un tableau de bord prestataire : hors spec, il faudrait d'abord écrire l'acteur et sa
  ligne dans `docs/features.md`.
- Refondre le pipeline CRM, l'écran d'export RGPD ou le formulaire d'état des lieux.
- Le regroupement et le surlignage de la barre latérale : TCK-377.
- Le contenu du menu pour les cinq autres rôles, au-delà des entrées poussées sans garde.

## Notes d'implémentation

**Ce que la re-mesure du 2026-08-27 a confirmé, et le point où le ticket se trompait.**

Les quatre constats du tableau de contexte sont exacts, y compris les numéros de ligne
(`InventoryList.tsx:108`, `AppSidebar.tsx` bloc Wave 3 Ops) et le relevé du générateur
(`⚠ 1 acteur(s) non déclaré(s) : 🔧`, `grep -c "🔧" docs/features.md` → `1`, ligne 359).

**Une affirmation était fausse.** Le ticket écrit que `/app/inventories/new` « n'est atteint que
par `TenantOnboardingChecklistWidget.tsx:133`, avec `?lease_id=` ». La page lit
`searchParams.lease`, **pas `lease_id`** : ce chemin-là n'atteignait donc pas le formulaire, il
tombait sur l'écran « aucun bail sélectionné ». Le geste n'était pas mort à moitié, il l'était
entièrement. Corrigé, et verrouillé par un test qui compare les DEUX moitiés
(`inventories/new/__tests__/parametre-de-bail.test.tsx`) — une assertion sur le seul `href` du
widget serait restée verte avec `?lease_id=`.

**Le cul-de-sac de la destination, corrigé avec le lien.** Poser un bouton « Nouvel état des
lieux » sans toucher à `/app/inventories/new` aurait mené l'agent sur « Aucun bail sélectionné →
Choisir un bail → `/app/leases` », c'est-à-dire exactement le renvoi vers une autre section que
le ticket condamne. D'où `InventoryLeasePicker` : sans bail, l'écran montre les baux actifs.

**La garde de rôle est un prédicat POSITIF (`occupeUnLogement`), pas `!isServiceProvider`.** Deux
raisons mesurées, toutes deux écrites en commentaire au-dessus : `roles` est un tableau (un
compte prestataire ET locataire garde ses baux), et surtout **le rôle `tenant` n'apparaît nulle
part ailleurs dans `buildNavItems`** — les poussées inconditionnelles étaient la seule raison
pour laquelle un locataire voyait ses baux. Une liste positive qui l'aurait omis corrigeait le
défaut n°4 en en fabriquant un cinquième.

**Vérification par différence complète, plutôt que par assertion ponctuelle.** Les `href` rendus
ont été dumpés pour les 7 rôles avant et après : le diff porte sur **une seule ligne**, celle du
prestataire, et uniquement par retrait. C'est cette table qui est figée dans
`AppSidebar.test.tsx`, en entier — un `not.toContain('/app/bookings')` aurait été coché par une
régression qui retire l'entrée à tout le monde.

**AC4 résiste à la correction naïve.** Supprimer simplement la ligne
`if (isServiceProvider(roles)) redirect('/app/overview/tenant')` ne change **rien** : le
`redirect('/app/overview/tenant')` attrape-tout en fin de fonction y renvoie le prestataire
malgré tout. Vérifié par ablation — le test rougit aussi bien sur `origin/dev` que sur cette
correction-là.

**AC5 dit ce qui est vrai, pas ce qui rassure.** Sur les trois écrans nouvellement desservis, un
seul porte un garde de rôle (`crm/pipeline`, `forbidden()`), éprouvé pour les 7 rôles dans les
deux sens. `/app/account/privacy` (droit RGPD de tout compte) et `/app/inventories/new` (droits
dérivés du bail côté API) n'en ont aucun, délibérément : le test le dit au lieu d'affirmer un
refus qui n'existe pas.

**Deux tickets ouverts** pour ce qui a été mesuré hors du delta : `TCK-419` (quatre liens `/app`
vers des routes inexistantes — la divergence dans l'autre sens, dont un 404 sur le parcours
d'onboarding locataire) et `TCK-420` (l'acteur 🔧 absent de la légende de `features.md`, et son
`--check` qui avertit sans jamais échouer).

**Deux trous trouvés dans mes propres tests à la revue adverse, et refermés.** (a) Le test
d'inventaire comptait une mention en COMMENTAIRE comme un chemin entrant — les commentaires que ce
lot écrit lui-même au-dessus de chaque nouveau lien auraient suffi à le garder vert si le lien
était retiré ensuite : *le correctif se serait prouvé par sa propre documentation.* (b) Le test de
`InventoryList` serait resté vert si la page passait `canCreate={false}` à tout le monde — le geste
n'aurait existé pour aucun rôle réel. D'où `inventories/__tests__/geste-de-creation.test.tsx`, qui
lit ce que la PAGE décide rôle par rôle, et rougit dans les DEUX sens (`true` partout comme `false`
partout), vérifié par ablation.

**Reste** : les clés `inventory.new.no_lease_*` n'ont plus de site d'appel. Elles sont
**conservées** — `grep` confirme qu'aucun `t()` ne les demande, mais la garde de parité fr/en/wo
reste verte quand une clé disparaît des trois, donc rien ne rattraperait une suppression de
trop.
