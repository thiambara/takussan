# ADR-0127 — Les actions humaines du déploiement : un fichier par action, l'état par environnement

- **Statut** : Accepté le 2026-11-16 (décision du porteur, option « a »)
- **Date** : 2026-11-16
- **S'appuie sur** : [ADR-0028](0028-auto-hebergement-conteneurise-sur-le-vps.md) (le service `release` joue les commandes de chaque déploiement), [ADR-0067](0067-l-index-du-backlog-n-est-plus-versionne.md) (une liste commune, modifiée par plusieurs PR à la fois, se perd)

## Contexte

Plusieurs sessions et agents livrent en parallèle. Certaines livraisons exigent une action **qu'aucun
code ne fait** au déploiement : poser une clé dans l'onglet Environment de Dokploy, faire approuver un
gabarit WhatsApp par Meta, fournir une photo ou des relevés bancaires, relire un écran après la mise
en ligne. Jusqu'ici, ces actions n'étaient écrites que dans la description d'une PR : une fois la PR
fusionnée, plus personne ne les relit, et rien ne dit si elles ont été faites, ni où.

Mesuré le 2026-11-16 : la PR #1683 demandait de lancer à la main `migrate`, `scout:sync-index-settings`
et `scout:import` au déploiement. Les trois sont **déjà** joués par `takussan-api/docker/release.sh`
à chaque déploiement (la réimportation, dès que l'empreinte `.search-shape` change). L'auteur les avait
déduites sans lire le script. Une liste écrite à la main prescrit aussi ce qu'il ne faut pas faire.

## Décision

1. **Ce qu'un script peut faire va dans `takussan-api/docker/release.sh`, jamais dans une action.**
   Une action est ce qu'aucun script ne peut faire : une clé, un compte ou un gabarit chez un tiers,
   une donnée à fournir, une vérification à l'œil, une décision.
2. **Une action = un fichier** sous `docs/deploiement/actions/`, nommé `AAAA-MM-JJ-<slug>.md`. Un
   fichier neuf n'entre en conflit avec aucun autre : deux sessions qui ajoutent chacune une action ne
   se gênent pas, et une fusion ne perd aucune ligne.
3. **L'état se tient par environnement** (`preview`, `production`), dans le frontmatter :
   `a-faire`, `fait` ou `sans-objet`. La préproduction existe, la production non encore (phase F) :
   une action faite en préproduction reste à faire en production.
4. **Rien ne se supprime.** Le fichier garde son historique : chaque passage à `fait` ou `sans-objet`
   s'écrit en une ligne datée (`- AAAA-MM-JJ · <env> · <état> · <qui> · <preuve>`), en plus de
   l'historique git.
5. **La liste de ce qui reste se génère**, jamais à la main :
   `node scripts/check-actions-de-deploiement.mjs --report [preview|production]`.
6. **Une garde de Repo CI** (`scripts/check-actions-de-deploiement.mjs`) refuse :
   - une action au frontmatter incomplet ou à l'état inconnu ;
   - un état `fait` ou `sans-objet` sans sa ligne d'historique ;
   - une clé neuve dans `deploy/takussan/env.*.production.example` qu'aucune action ne nomme dans
     `cles:`. Les clés présentes au 2026-11-16 sont figées dans
     `docs/deploiement/cles-anterieures.json` ; cette liste ne s'allonge jamais.

## Conséquences

- Une PR qui exige une action humaine au déploiement crée son fichier d'action (rappelé dans
  `CLAUDE.md`). La description de la PR peut renvoyer au fichier ; elle n'en est plus la source.
- La personne qui déploie lance le rapport de l'environnement visé avant et après, et écrit la ligne
  d'historique de ce qu'elle a fait.
- **Ce que la garde ne voit pas** : une action qui n'est pas une clé d'environnement (un gabarit, une
  donnée, une vérification). Pour celles-là, la règle reste humaine.
- Une clé figée dans `cles-anterieures.json` puis retirée des gabarits y reste sans effet ; la garde
  ne la réclame pas.

## Application

- `docs/deploiement/README.md` : le mode d'emploi et le format.
- `scripts/check-actions-de-deploiement.mjs`, joué par `.github/workflows/repo-ci.yml`.
- Premières actions : celles de la vague 92 (2026-11-16), hors ce que `release.sh` fait déjà.
