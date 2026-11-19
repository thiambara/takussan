---
titre: "Décider l'ouverture de la production (phase F), puis re-mesurer ses prémisses avant toute pose"
type: decision
tickets: [TCK-517, TCK-2458, TCK-720, TCK-288]
cles: []
creee: 2026-11-19
preview: sans-objet
production: a-faire
---

## Quoi faire

Ce fichier est la porte d'entrée de la production : rien de ce dossier ne se fait en production avant cette
décision du porteur (`attendre-go` sur [TCK-517](../../backlog/tickets/todo/TCK-517-production-auto-hebergee.md)).

1. Décider le go.
2. Livrer d'abord ce qui est du **code**, et donc pas une action de ce dossier :
   - `images.yml` sur `[preview, master]`, avec un cas `master)` vers l'environnement `production` (plan, F2, étape 1 ;
     relu le 2026-11-19 : `branches: [preview]`, aucun cas `master)`) ;
   - la redirection 308 des URL sans préfixe de langue (plan, F2, étape 2 ; `proxy.ts` rend encore 307) ;
   - TCK-2458, la copie nocturne du seau privé de production ;
   - les corps des gabarits WhatsApp des rappels (voir `2026-11-19-gabarits-whatsapp-des-rappels.md`) ;
   - TCK-720 : un `--timeout` explicite sur `queue:work` dans `compose.api.yml`, au-dessus du budget de la chaîne SMS ;
   - TCK-288 : ses critères restants (garde de divergence `master`/`dev`), ou le passer `obsolete` s'ils sont repris ici.
3. Re-mesurer, dater et écrire dans TCK-517 : `api.takussan.com/up`, le DNS de `www` et de l'apex, la mémoire libre
   du serveur (s'arrêter sous 1 500 Mo) — plan, F1, étape 1.
4. Retirer `TCK-516` (`obsolete`) des `depends_on` de TCK-517.

## Comment vérifier

La décision est datée dans TCK-517, la re-mesure y est écrite, et les livraisons de code ci-dessus sont fusionnées.

## Historique

- 2026-11-19 · preview · sans-objet · Claude (inventaire, pour le porteur) · la préproduction sert depuis le 2026-09-14 ; la décision ne porte que sur la production
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · relevé : environnement Dokploy `production` du projet Takussan présent mais VIDE (aucun service), aucune base `takussan_prod` (seules `postgres` et `takussan_preview`), DNS sans `www` ni apex, `api.takussan.com` en A DNS seul sans service
