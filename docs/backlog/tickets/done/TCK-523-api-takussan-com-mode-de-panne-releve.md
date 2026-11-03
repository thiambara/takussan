---
id: TCK-523
title: "`api.takussan.com` — le mode de panne du nom de production est relevé et daté, jusqu'à la phase F"
status: done
phase: P1
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-14
depends_on: [TCK-515]
blocks: [TCK-517]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, dns, tls, production, relevé, adr-0028]
---

## Objectif utilisateur

Que le dépôt dise ce que `api.takussan.com` rend **aujourd'hui** — c'est l'hôte que le front public
appelle — au lieu d'un 404 mesuré sur un serveur qui n'existe plus.

## Contrat de données

Mesuré le 2026-09-14 : `api.takussan.com` → `A 178.18.247.62`, en DNS seul ; Traefik y présente
`CN=TRAEFIK DEFAULT CERT` (émis le 2026-09-14 18:23 Z) et rend 404 derrière. Depuis
`www.takussan.com`, l'appel échoue donc sur la poignée de main TLS, plus sur un 404. ADR-0028 (tableau
« Ce qui sert quoi ») et `CLAUDE.md` (« Workflow git ») portent encore le 404 du 2026-08-20 ;
`docs/infra/hebergement.md` ne liste pas le nom ; `deploy/server/certificats.sh` non plus, à raison
(rouge chaque jour jusqu'à F). TCK-332 et D-04 décrivent l'effet utilisateur, inchangé.

## Contraintes strictes (métier)

- Aucune bascule de `api.takussan.com` derrière Cloudflare avant la phase F (TCK-517) : le
  certificat d'origine ne s'émet qu'avec un routeur Traefik, donc avec la pile de production.
- On écrit ce qu'on lit : la commande, la sortie, la date.

## Delta à produire

- [x] `docs/infra/hebergement.md`, tableau « Ce qui sert quoi » : ligne `api.takussan.com` — « aucun
  service ; certificat par défaut de Traefik ; le front public échoue sur TLS », avec la commande
  `openssl s_client … -servername api.takussan.com`
- [x] `CLAUDE.md`, « Workflow git » : le paragraphe du 404 gagne la mesure du 2026-09-14 (le récit
  du changement de serveur va au journal des corrections)
- [x] TCK-332 : note datée, l'échec est TLS et non 404, même effet
- [x] Le plan, tâche F3 étape 3 : « `api.takussan.com` rejoint `NOMS` de `certificats.sh` dès que
  son certificat existe » ; commentaire de `certificats.sh` mis en accord
- [x] Décision écrite dans le ticket : servir ou non un `503` JSON explicite avant F (option :
  proxifier le nom chez Cloudflare avec une règle de réponse), avec le pour et le contre

## Critères d'acceptation

- [x] AC1 — `node scripts/check-doc-links.mjs` et les gardes documentaires passent
- [x] AC2 — les trois documents disent la même chose, avec la même date
- [x] AC3 — `certificats.yml` reste vert (le nom n'y entre qu'en F3)

## Hors périmètre

- Servir l'API de production : TCK-517.
- Corriger le front public pour dégrader proprement sans API : TCK-332.

## Décision — pas de `503` explicite avant la phase F

**Décidé le 2026-09-14 : `api.takussan.com` reste tel quel — DNS seul, certificat par défaut de
Traefik, poignée de main refusée — jusqu'à F3.** Les deux façons de servir un `503` JSON ont été
pesées :

- *Proxifier le nom chez Cloudflare avec une règle de réponse.* Pour : un `503` propre, sans toucher
  au serveur. Contre : cela viole la contrainte du ticket et du plan (F3, étape 3 puis 4) — le
  certificat d'origine ne s'émet qu'en DNS seul, avec un routeur Traefik ; proxifier avant, c'est
  soit un `526` de Full (strict) au premier déploiement, soit repasser le nom en DNS seul le jour de
  F, un geste de plus dans la fenêtre de bascule. Et une règle Cloudflare est un état hors dépôt de
  plus, à relever puis à retirer.
- *Un routeur Traefik « 503 » sur le serveur* (un service Dokploy vide, ou un fichier dynamique).
  Pour : le certificat Let's Encrypt s'émettrait dès maintenant, ce qui raccourcirait F3. Contre :
  c'est un service de production déclaré avant la production, qu'il faudrait retirer sans coupure
  au moment où la vraie pile prend le nom ; et « un certificat qui existe » pousserait à ajouter le
  nom dans `certificats.sh`, donc à garder un état transitoire.

Ce qui tranche : **pour l'utilisateur, l'effet est identique.** Le front public fait un `fetch` ; un
`503` et une poignée de main refusée sont tous deux une promesse rejetée, et TCK-332 — le seul
ticket qui change ce que l'utilisateur voit — n'est pas plus facile avec l'un qu'avec l'autre. Un
`503` ne serait lisible que par quelqu'un qui appelle l'API à la main, et cette personne lit ce
relevé. Le coût d'un état transitoire de plus, dans la fenêtre la plus délicate du plan, n'achète
rien de mesurable. La décision se rouvre si F recule de plus d'un mois : un nom qui échoue sur TLS
pendant des mois finit par entrer dans des listes de blocage.

## Notes d'implémentation

- Mesure du 2026-09-14, 22:42 Z, depuis le poste : `curl -sS -o /dev/null -w '%{http_code}
  %{ssl_verify_result}' https://api.takussan.com/up` → `000 20` ; `-k` → `404` ; `dig +short` →
  `178.18.247.62` ; `openssl s_client -servername api.takussan.com` → `subject=CN=TRAEFIK DEFAULT
  CERT`, `notAfter=Sep 14 20:46:11 2027 GMT`. ⚠ Le contrat du ticket citait un certificat « émis le
  2026-09-14 18:23 Z » : Traefik le **réémet à chaque redémarrage**, et `journaux-traefik.sh`
  (TCK-518) l'a redémarré à 20:46 Z. Une date d'émission de ce certificat ne dit rien : c'est écrit
  au relevé. `www.takussan.com` → `200`, `server: Vercel`, `x-vercel-id` présent : le front public
  est toujours chez Vercel, et appelle toujours ce nom.
- Les trois documents (hebergement.md « Ce qui sert quoi », CLAUDE.md « Workflow git », TCK-332)
  portent la même mesure et la même date ; le récit du changement de serveur est J-44. Le tableau
  « Contexte » d'ADR-0028 garde son 404 : il décrit l'état *au moment de la décision*, daté, et
  c'est sa fonction. `docs/ardoise.md` (D-04, TCK-332) garde ses mesures du 2026-08-20, datées ;
  elles se relisent avec CLAUDE.md, qui renvoie au relevé.
- `certificats.sh` : la liste `NOMS` ne change pas ; son commentaire dit quand `api.takussan.com`
  y entre et pourquoi pas avant. Le workflow *Échéance des certificats* reste vert (AC3) : rien n'y a
  été ajouté ; dernier run `34875684144` (`workflow_dispatch`, 2026-09-14 17 h Z) : `success`, 15 s.
