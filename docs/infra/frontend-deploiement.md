# Déploiement du frontend — quelle branche sert quel environnement

> **Source unique des valeurs** : [`frontend-deploiement.json`](frontend-deploiement.json).
> Ce document-ci porte le raisonnement, les commandes et les limites ; il ne recopie pas le relevé,
> il l'explique. **Décision** : [ADR-0017](../adr/0017-deploiement-du-front-pilote-par-vercel.md).
> **Garde** : `.github/workflows/front-deploy-map.yml` — elle vérifie, elle ne déploie rien.
> **Ticket** : TCK-299.

## La réponse, en une ligne par branche

| Branche | Environnement Vercel | Ce qu'on atteint | Public ? |
|---|---|---|---|
| `master` | **Production** | `www.takussan.com` (et `takussan.com` qui y redirige en 307), alias `takussan.vercel.app` | **oui** |
| `dev` | Preview | alias de branche `takussan-git-dev-thiambaras-projects.vercel.app` | non — SSO Vercel |
| `preview` | Preview | alias de branche `takussan-git-preview-thiambaras-projects.vercel.app` | non — SSO Vercel |
| toute autre branche / PR | Preview | une URL par déploiement, publiée en check GitHub sur la PR | non — SSO Vercel |

**Aucun workflow de ce dépôt ne déploie le front.** Le déclencheur est l'intégration Git du projet
Vercel `thiambaras-projects/takussan`. C'est une décision, pas un oubli : ADR-0017 dit pourquoi.

## ⚠️ Trois avertissements avant de se servir de ce tableau

**1. `master` n'est pas « la branche figée » que `CLAUDE.md` décrit.** `CLAUDE.md` écrit *« `master`
est figé au 2026-05-18, 31 commits derrière `dev` »*. Mesuré le 2026-08-20 :

```
$ git log -1 --format='%H %ad %s' --date=iso origin/master
fefe2c871db0186e4bb7094f2d2cb2048054cfc7 2026-08-15 14:56:07 +0000 Merge pull request #151 from thiambara/dev
$ git rev-list --count origin/master..origin/dev
273
```

La date est fausse de trois mois et le compte d'un facteur 9. Surtout : **`master` n'est pas
décorative — c'est elle qui sert le site public.** Un merge vers `master` met le front en
production. `CLAUDE.md` est hors du périmètre de TCK-299 et n'a pas été corrigé ici ; la correction
est listée dans les suites du ticket.

**2. Le front de production appelle une API qui n'a jamais été déployée.** Mesuré le 2026-08-20 :

```
$ curl -o /dev/null -w '%{http_code}\n' https://api.takussan.com/up               → 404
$ curl -o /dev/null -w '%{http_code}\n' https://api.takussan.com/api/properties   → 404 (nginx/1.24.0)
$ curl -o /dev/null -w '%{http_code}\n' https://preview.api.takussan.com/up       → 200
```

et le bundle servi par `www.takussan.com` porte `NEXT_PUBLIC_API_URL = https://api.takussan.com`.
D-04 / TCK-288 décrivaient une production jamais déployée sans utilisateur exposé. Il y en a un, et
il est public.

**3. Chaque commit du dépôt reconstruit le front.** L'intégration n'a aucun filtre de chemins :
`6f38de67`, qui ne touche qu'un fichier de `docs/backlog/`, a produit le déploiement Preview
`6001431629`. Corriger cela demande un `ignoreCommand` dans `takussan-web/vercel.json` — hors
périmètre de TCK-299.

## Les variables du build

| Clé | Obligatoire | Déclarée dans | Valeur dev | Valeur **mesurée** en Production |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | oui | `takussan-web/.env.example` | `http://127.0.0.1:8002` | `https://api.takussan.com` |
| `NEXT_PUBLIC_SITE_URL` | non | `takussan-web/.env.example` | *(vide)* | **non mesurée** — introduite le 2026-08-27 |

⚠️ **Ce paragraphe disait « c'est la SEULE que le code front lise ». C'était vrai le 2026-08-20 et
faux depuis.** TCK-434 a introduit `NEXT_PUBLIC_SITE_URL` (l'origine des `hreflang`) sans la
déclarer nulle part, ce qui laissait le job `variables` de `front-deploy-map.yml` rouge : la clé
était lue par le build et absente à la fois de `.env.example` et de ce relevé. TCK-431 la déclare
dans les deux. Re-mesuré le 2026-08-27 :

```
$ grep -rhoE 'process\.env\.NEXT_PUBLIC_[A-Za-z0-9_]+' takussan-web/src takussan-web/next.config.ts \
    | sed 's/^process\.env\.//' | sort | uniq -c
  39 NEXT_PUBLIC_API_URL
   1 NEXT_PUBLIC_SITE_URL
```

`NEXT_PUBLIC_SITE_URL` est **facultative des deux côtés, pour des raisons opposées** : en
Production le défaut du code *est* l'origine mesurée (`https://www.takussan.com`) ; en Preview,
`src/lib/alternates.ts` déduit l'hôte de `VERCEL_URL`, faute de quoi il **échoue bruyamment**
plutôt que de laisser une prévisualisation déclarer que ses pages canoniques sont celles de la
production.

> La garde de ce paragraphe est désormais un script, `scripts/check-front-env-keys.mjs`, que le
> job `variables` appelle au lieu de porter la logique en ligne. *Une garde qui ne vit que dans un
> workflow ne se joue pas avant de pousser* — et celle-ci a laissé passer une clé pendant tout
> l'intervalle entre TCK-434 et TCK-431.

> **Pourquoi la valeur de production est lisible sans compte Vercel.** `NEXT_PUBLIC_*` est
> substituée **à la compilation** : elle finit en clair dans le JavaScript livré. C'est aussi
> pourquoi une clé absente de l'environnement de build ne casse pas le build — elle produit
> `undefined` dans le bundle, et le défaut n'apparaît qu'en production, sur une requête partie vers
> `undefined/api/…`. Le job `variables` de la garde existe pour ce cas précis.

## Re-mesurer — les commandes, et rien d'autre

Toutes lisent ; aucune ne déploie. Aucune n'exige de compte Vercel.

```bash
# 1. Le mécanisme et le mapping : qui crée les déploiements, et pour quel environnement.
gh api --paginate "repos/thiambara/takussan/deployments?per_page=100" \
  -q '.[] | [.environment, .creator.login] | @tsv' | sort | uniq -c | sort -rn

# 2. Les seuls déploiements qui comptent pour la question « quelle branche sert la production ».
gh api --paginate "repos/thiambara/takussan/deployments?per_page=100" \
  -q '.[] | select(.environment=="Production") | [.id, .ref, .created_at] | @tsv'

# 3. À quelle branche appartient un ref Production. `--first-parent`, PAS `--contains` :
#    `dev` CONTIENT tous les commits de `master`, donc `--contains` répond « les deux ».
git rev-list --first-parent origin/master | grep -qx "<ref>" && echo "pointe de master"

# 4. L'URL servie par un déploiement.
gh api "repos/thiambara/takussan/deployments/<id>/statuses" \
  -q '.[] | [.state, .environment, .environment_url] | @tsv'

# 5. Les domaines, et qui les sert.
for h in takussan.com www.takussan.com preview.takussan.com; do
  printf '%-24s ' "$h"; curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://$h/"
done

# 6. La valeur de NEXT_PUBLIC_* réellement donnée au build de production.
curl -sS https://www.takussan.com/ | grep -o '/_next/static/[^"]*\.js' | sort -u \
  | while read -r p; do curl -sS "https://www.takussan.com$p"; done \
  | grep -oE '"https?://[^"]{4,80}"' | sort -u
```

## Ce que le dépôt ne peut PAS mesurer, et ne doit donc pas affirmer

Le dépôt observe ce que Vercel **publie** (les *Deployments* GitHub, le bundle servi) — c'est-à-dire
le **résultat**. Il n'observe pas le **réglage**. Restent hors de portée, et le relevé les liste
dans son champ `non_mesure` :

- **L'attribution du domaine `preview.takussan.com` à une branche.** Il pointe sur Vercel et rend un
  302 vers `vercel.com/sso-api` : rien de public n'y associe une branche. La ligne « `preview` →
  Preview » du tableau ci-dessus s'appuie sur le **déploiement** de sa pointe (`5b922b00`, ref du
  déploiement `5886843367`, environnement `Preview`), pas sur le domaine.
- **Le « Root Directory » du projet Vercel.** Le dépôt est un monorepo ; le résultat prouve que le
  front est construit, pas le réglage qui le décide.
- **Les variables NON préfixées `NEXT_PUBLIC_`.** Elles ne sont pas inlinées. Ce qui EST mesuré,
  c'est que le code de `takussan-web/` n'en lit aucune.

*Pour lever ces trois points il faudrait un jeton d'API Vercel en secret de CI. Ce dépôt n'en
détient aucun, et ADR-0017 explique pourquoi on ne l'a pas ajouté.*

## Comment la garde peut rougir, et ce que chaque rouge veut dire

| Message | Ce qui s'est passé | Ce qu'on fait |
|---|---|---|
| `PAS sur l'historique en premier parent de origin/master` | la branche de production a changé côté Vercel, **ou** quelqu'un a re-déployé un vieux commit à la main | re-mesurer avec les commandes ci-dessus, puis corriger le **relevé** — jamais l'inverse |
| `aucun déploiement d'environnement Production` | l'intégration est débranchée, ou l'appel API a échoué | ne rien conclure : la garde le dit parce qu'elle **ne peut pas** mesurer |
| `origin/<branche> n'existe pas` | la branche du relevé a été supprimée ou renommée | re-mesurer, corriger le relevé |
| `ABSENTES de takussan-web/.env.example` | une nouvelle `NEXT_PUBLIC_*` est lue par le code sans être déclarée | déclarer la clé, et renseigner sa valeur par environnement dans le relevé |
