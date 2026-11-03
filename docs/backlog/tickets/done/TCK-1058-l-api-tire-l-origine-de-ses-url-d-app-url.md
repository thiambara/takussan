---
id: TCK-1058
title: "L'API tire l'origine de ses URL d'`APP_URL`, et le front cesse d'envoyer `X-Forwarded-Host` : plus d'hôte interne dans les liens rendus au navigateur"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#sur-le-chemin-interne-du-front-lapi-rend-ses-url-signées-et-ses-liens-avec-lhôte-interne--x-forwarded-host-nest-plus-cru-depuis-tck-853"
tags: [back, front, media, proxies, pistes]
---

## Objectif utilisateur

Un lien que l'API rend au navigateur (le document publié d'une fiche, une pièce privée signée,
l'export du journal d'audit) désigne l'API publique, même quand le serveur Next a joint l'API par
son adresse interne : le visiteur peut l'ouvrir.

## Contexte

Réf : **P73.01** du fichier de pistes, `validé` par le porteur (critère V6 accordé).

Le serveur Next joint l'API par `API_INTERNAL_URL` (ADR-0052 § 5) et envoyait `X-Forwarded-Host`
pour que Laravel fabrique ses URL avec l'hôte public. Depuis TCK-853, l'API ne croit plus cet
en-tête : l'hôte de la requête, donc de `url()`, `route()` et des routes signées, était l'hôte
interne. Mesuré avant correctif (`RacineDesUrlTest`, en-têtes du front rejoués depuis
`127.0.0.1`, `Host: api-interne:8080`) : `PrivateMediaAccess::signedUrl()` rend
`https://api-interne/api/media/2/file?expires=…&signature=…`, et le lien du document publié de
`/api/public/properties/{slug}` commence aussi par `https://api-interne`.

## Décision du porteur

> (a) `URL::forceRootUrl(config('app.url'))` et `forceScheme` dans le contexte HTTP, et le front cesse d'envoyer `X-Forwarded-Host` ; ADR-0052 § 5 amendé en session ; l'`APP_URL` de chaque environnement est relevé ; test qui rejoue les en-têtes du front et exige l'origine d'`APP_URL` pour `PropertyResource` et `PrivateMediaAccess::signedUrl()` (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- « Dans le contexte HTTP » : la racine est posée au démarrage de l'application, pour tout
  contexte. En console, Laravel tire déjà la racine d'`APP_URL` ; la poser aussi n'y change rien,
  et une condition `runningInConsole()` la couperait sous PHPUnit, donc hors de toute garde.
- Le schéma forcé est celui d'`APP_URL`. Sans `APP_URL` exploitable (vide, sans schéma), rien
  n'est forcé : le comportement d'avant reste.
- Le front garde `X-Forwarded-Proto` et `-Port` : la décision ne retire que `X-Forwarded-Host`.

## Delta à produire

- [x] `AppServiceProvider::bootUrlRoot()` : `URL::forceRootUrl()` et `URL::forceScheme()` depuis
  `config('app.url')`.
- [x] `takussan-web/src/lib/api.ts` : `enTetesDuCheminInterne()` n'envoie plus `X-Forwarded-Host`,
  et son commentaire dit pourquoi.
- [x] Tests du front qui épinglaient l'en-tête (`api.ip-du-visiteur`, `sante`,
  `impersonation/chemin-serveur`) : ils exigent désormais son absence.
- [x] Garde `tests/Feature/Http/Proxies/RacineDesUrlTest.php`.

## Critères d'acceptation

- [x] AC1 — avec les en-têtes du front sur l'hôte interne, le lien d'un document publié rendu par
  `PropertyResource` commence par l'origine d'`APP_URL`.
- [x] AC2 — dans les mêmes conditions, `PrivateMediaAccess::signedUrl()` rend l'origine
  d'`APP_URL`, et l'URL présentée à cette origine passe le middleware `signed`.
- [x] AC3 — sur le chemin interne, le serveur Next n'envoie plus `X-Forwarded-Host`.

## Reste à faire

- ADR-0052 § 5 amendé en session (chemin fermé à l'agent).
- Relevé de l'`APP_URL` de chaque environnement, préproduction comprise (hors du poste) : toute
  URL que l'API rend en dépend désormais.

## Hors périmètre

- La signature relative des liens (P73.02), traitée à part dans le même lot.
- La pièce KYC ouverte depuis le navigateur (TCK-546, P73.03).

## Notes d'implémentation

- Ablation : appel `bootUrlRoot()` retiré → 2 rouges sur 2 dans `RacineDesUrlTest` ; remis →
  verts. Côté front, `X-Forwarded-Host` remis dans `enTetesDuCheminInterne()` → 7 rouges sur 40
  dans les trois fichiers ; retiré → 40 verts.
- La route `media.private.show` répond 302 (URL présignée du disque simulé) : la garde exige une
  redirection, qu'un refus de signature (403) ne donne pas.
