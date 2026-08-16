# Chantier — solder les 17 fiches qui restent

> **Ouvert le 2026-08-16**, au sortir de la revue des PR #154 → #176 (22 mergées, 1 tenue
> ouverte). Ce document organise **ce qui reste**, il ne le réécrit pas : chaque fiche porte son
> propre contenu, ses AC et ses mesures. On lit ici l'**ordre** et le **pourquoi de l'ordre**.
>
> **Le compte exact ne s'écrit pas ici.** Il se prend à la source :
> ```bash
> node docs/backlog/check-backlog.mjs --report
> ```
> Une version de ce paragraphe qui donnerait « 17 fiches » en toutes lettres serait fausse au
> premier ticket ajouté — et fausse avec l'autorité d'un document de plan. Les 17 ci-dessous sont
> l'état **au 2026-08-16**, pas une valeur à tenir à jour.

## Ce que le graphe de dépendances dit, et qu'aucune fiche ne dit seule

Trois faits structurent tout le reste. Ils ne se voient qu'en croisant les `depends_on`, ce que
personne ne fait en lisant les fiches une par une.

**⑴ Il ne reste QU'UN verrou avant la première mise en production.** `TCK-288` déclare
`depends_on: [TCK-296, TCK-299, TCK-300]`. Deux des trois sont `done` depuis le 2026-08-16
(#176). **`TCK-299` est le dernier.** La première mise en production — jamais faite, D-04 — est
donc à deux fiches, pas à un chantier.

**⑵ `TCK-279` est le goulot du backend.** Six fiches en dépendent : `304, 305, 306, 307, 308,
309`, plus `315`. Son backend est mergé ; **seule sa moitié frontend manque** (AC11, AC12). Tant
qu'elle manque, un quart du backlog restant est formellement bloqué.

**⑶ Quatre fiches n'ont AUCUNE dépendance et sont donc attaquables tout de suite, en
parallèle** : `293`, `299`, `314`, `316`, `317`. C'est là que la première vague doit taper.

---

## Vague A — la faille et le verrou de production

> Deux fiches sans dépendance, et la seule chose de ce backlog qui touche des utilisateurs réels.
> **À faire avant tout le reste**, y compris avant ce qui est plus agréable à faire.

| Fiche | Pourquoi maintenant |
|---|---|
| **TCK-293** · P0 · M | 🔴 **D-50 — le webhook de paiement accepte le secret de N'IMPORTE QUELLE agence.** Mesuré le 2026-08-15. C'est une faille d'isolation inter-agences, sur le chemin de l'argent, et elle ne dépend de rien : elle peut partir aujourd'hui. |
| **TCK-299** · P1 · M | Le déploiement du frontend n'existe dans aucun workflow ni script (D-10). **C'est le dernier `depends_on` non soldé de TCK-288.** |

Puis, et seulement une fois les deux ci-dessus mergées :

| **TCK-288** · P0 · M | Première mise en production. `deploy.yml` n'a **jamais** tourné — pas « plus depuis trois mois », *jamais* (`gh run list`). Ne pas déduire l'état du serveur de la configuration qui le vise : le mesurer. |

## Vague B — débloquer ce qui attend, en parallèle

> Quatre fiches sans dépendance entre elles. Un worktree chacune, une PR chacune.

| Fiche | Ce qu'elle débloque |
|---|---|
| **TCK-316** · P2 · M | Les 23 findings React Compiler. **Débloque la PR #172** (ESLint 10), tenue ouverte pour cette seule raison. Rappel du fond : ces cinq familles de règles sont déclarées bloquantes sous ESLint 9 **aussi**, et n'y produisent rien — `npm run lint` est vert en partie pour ça. |
| **TCK-314** · P2 · S | Un test de recherche publique ne passe que grâce à l'**ordre** de la suite. **Débloque `--parallel`** (D-30, TCK-302) : gain mesuré ×2,6 sur la suite backend, aujourd'hui refusé parce que 5 exécutions d'épreuve sont rouges. |
| **TCK-317** · P2 · M | Les rôles système dérivent par date de création d'agence. Latent tant que `Capability` ne bouge pas — et il bougera. Demande un **ADR** avant d'écrire : matérialiser ou non un catalogue défini en code s'est déjà posé deux fois. |
| **TCK-313** · P2 · S | Le délai propre de `waitFor`/`findBy` est un défaut de framework jamais mesuré pour cette suite. Petit, et il ferme la question laissée ouverte par TCK-312. |

## Vague C — finir TCK-279, et lever le goulot

| Fiche | |
|---|---|
| **TCK-279** · P1 · L | **Frontend uniquement** — AC11 et AC12. Backend mergé (#176), 138 tests verts. La section « Reste sur dev » de la fiche liste ce qui manque : page `/admin/roles`, `AgencyRolesList` / `AgencyRoleEditor` / `CapabilityMatrix`, les deux modules de queries, la colonne « Rôle » de la TeamConsole, et le hook `useCan(Capability)`. |
| **TCK-315** · P1 · M | Où vit le rôle d'agence d'un prestataire — `service_provider_profiles` n'a pas d'`agency_role_id`, et c'est délibéré. Décision arbitrée : le rôle vit sur la **collaboration**. Reste à l'implémenter. |

> ⚠️ **Deux points que le frontend doit REPRENDRE du backend, pas redécouvrir.** Ils sont déjà
> écrits dans la fiche, ils sont répétés ici parce qu'ils coûtent cher à retrouver :
> 1. `GET /api/capabilities` publie `data.platform_reserved` à côté de `data.domains`. La matrice
>    doit **griser** ces capacités — l'API les refuse en 422, et une case cochable qui rend 422
>    est un défaut d'UI, pas une garde.
> 2. `PATCH /profiles/{p}/agency-role` exige `profile_type` **dans le corps** : un id nu ne
>    désigne pas un profil polymorphe.

## Vague D — dette de convention backend

> **Formellement bloquée par TCK-279** (les six la déclarent en `depends_on`). Elles se
> ressemblent : une convention a été décidée, une seconde a proliféré à côté, et rien n'arbitre.
> Elles sont massivement parallélisables entre elles — mais elles touchent beaucoup de fichiers,
> donc **un worktree par fiche**, sans quoi les conflits mangeront le gain.

| Fiche | Ampleur mesurée |
|---|---|
| **TCK-306** · L | 25 contrôleurs redéfinissent l'autorisation que 16 policies portent déjà. `depends_on` inclut TCK-297, désormais `done`. **La plus proche de la sécurité — à prendre en premier de cette vague.** |
| **TCK-305** · L | 120 validations inline contre 65 FormRequest. |
| **TCK-304** · L | Enveloppe de pagination dupliquée à la main sur 58 fichiers, avec des jeux de clés incohérents que le front ne peut pas consommer. |
| **TCK-308** · M | `BaseResource` adoptée par 7 ressources sur 44. |
| **TCK-307** · S | Supprimer le DSL `scopeFilter` — mort, mais toujours branché. La plus petite : bon candidat pour ouvrir la vague. |
| **TCK-309** · P3 · M | Trois conventions dédoublées (classes de base de test, préfixes de commandes…). La moins urgente du lot. |

## Vague E — dette front à volume

> Ni bloquée ni bloquante. Se traite en lots, en fond de tâche.

| Fiche | |
|---|---|
| **TCK-291** · M | États vides / erreurs sur le reste du parc (super-admin, admin…). Dépendance `TCK-246` : `done`. |
| **TCK-292** · **XL** | i18n — 409 fichiers, 3 542 libellés, **déjà découpé en 12 lots** dans la fiche. Ne pas l'attaquer d'un bloc : c'est ce découpage qui le rend faisable. Dépendance `TCK-286` : `done`. |

---

## Comment on livre

La convention du dépôt, telle qu'elle a été pratiquée : **un worktree, un agent, une PR par
groupe indépendant**, l'INDEX régénéré au centre après coup. Les vagues A et B sont
parallélisables immédiatement ; C est séquentielle ; D s'ouvre quand C est mergée.

**Le rituel de fin de branche n'est pas optionnel, et il vient d'être payé.** Le 2026-08-16, le
merge de #176 a rendu six statuts de fiches faux *à l'instant du merge*, et
`check-backlog.mjs` — qui confronte les statuts à l'historique de `dev` — est passé au rouge,
**bloquant toutes les PR suivantes**, pas seulement celle qui l'avait révélé. L'ordre est donc :

```
fiches à done (vérifiées UNE PAR UNE, pas basculées en bloc)
  → node docs/backlog/gen-index.mjs
  → les gardes en local           (for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done)
  → push → PR vers dev → merge
```

Une fiche dont une moitié seulement est livrée ne passe pas `done` : elle reste `doing` avec une
section **« ## Reste sur dev »** qui dit ce qui manque. C'est ce que la garde propose comme
alternative, et c'est ce que porte TCK-279 aujourd'hui — le basculer `done` ferait croire
qu'`/admin/roles` existe.

## ⚠️ Le budget GitHub Actions est une contrainte de ce chantier

Signalé le 2026-08-16 en cours de série. Ce qui a été mesuré ce jour-là, et qui vaut pour la
suite :

- **`gh pr update-branch` coûte une exécution de CI complète par PR.** Sur une série de bumps de
  dépendances, c'est le poste principal — et il ne prouve presque rien de plus que la CI déjà
  passée sur la PR.
- **La parade tenue :** merger en local en `--no-ff` (chaque PR garde son commit de merge et se
  ferme bien en *merged*), vérifier le résultat **combiné** sur sa machine — `npm ci`,
  `tsc --noEmit`, `lint`, la suite, `build` — puis **pousser une seule fois**. Sur les 11
  dernières PR de la série : **3 poussées au lieu d'environ 16 exécutions**. La vérification
  locale était en outre *plus forte*, puisqu'elle portait sur l'arbre réellement mergé et non sur
  huit bases différentes et périmées.
- **Ne pas confondre avec un contournement de la CI** : la CI de `dev` reste le filet, elle est
  filtrée par chemin, et c'est elle qu'on garde.

## Ce qui n'est PAS dans ce chantier

- **PR #172** reste ouverte tant que TCK-316 n'est pas traitée. Ne pas la merger en repassant les
  cinq familles de règles en `warn` : ce serait rendre au dépôt le silence qu'il vient de perdre.
- Les dettes d'ardoise déjà soldées. **D-48** reste ouverte et le restera : c'est une dette
  d'**onboarding** (`takussan-api/.env` est ignoré par git), aucun fichier du dépôt ne peut la
  corriger — seulement l'afficher, ce que `./dev.sh doctor` fait depuis TCK-301.
