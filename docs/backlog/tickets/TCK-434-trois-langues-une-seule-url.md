---
id: TCK-434
title: "Trois langues servies sur une seule URL : aucune indexation par langue n'est possible, et le choix n'est pas partageable"
status: doing
phase: P2
family: front
estimate: L
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, i18n, seo, public, adr, decision]
---

## Objectif utilisateur

Un visiteur peut envoyer à quelqu'un le lien d'un bien **dans la langue où il l'a lu**, et un
moteur peut proposer la version wolof à qui cherche en wolof.

## Contexte

Mesuré le 2026-08-27 dans `src/i18n/request.ts` : la langue active est résolue par le cookie
`NEXT_LOCALE`, à défaut par l'en-tête `Accept-Language`, à défaut par `DEFAULT_LOCALE`. **La
langue n'apparaît nulle part dans l'URL.**

⚠️ Le garde de route serveur existe et s'appelle `src/proxy.ts` — Next 16 a renommé
`middleware.ts` en `proxy.ts`. Son `matcher` est `['/app/:path*', '/admin/:path*', '/auth/:path*']` :
il ne voit donc **aucune** route publique. Chercher un `src/middleware.ts` et conclure « il n'y a
pas de garde » serait une erreur de lecture ; ce qui manque n'est pas le fichier, c'est un schéma
d'URL que ce fichier pourrait servir.

Trois conséquences, toutes vérifiables sans outil externe :

1. **Une URL ne transporte pas sa langue.** `https://www.takussan.com/properties/<slug>` envoyé
   par un visiteur qui lisait en wolof s'ouvre en français chez le destinataire. Or « Partage d'un
   bien (lien, réseaux sociaux) » est une fonctionnalité P1 de la spec, et
   `PropertyShareDialog` est livré.
2. **Un moteur n'indexe qu'une version.** Un robot n'envoie pas de cookie ; il obtient
   `DEFAULT_LOCALE`. Les versions `en` et `wo` du catalogue n'ont aucune URL propre à indexer, et
   `hreflang` n'a rien à déclarer — il n'existe pas d'URL alternative à nommer.
3. **La même URL rend trois contenus différents selon le demandeur**, ce qui est précisément la
   situation qu'un cache partagé ne peut pas servir correctement sans le savoir.

⚠️ **Ce ticket demande une DÉCISION avant du code.** Mettre la langue dans l'URL touche le
routage entier, les liens internes, le commutateur de langue, les redirections et les 404 : c'est
une décision structurelle, donc un **ADR écrit avant l'implémentation** (`CLAUDE.md` § Décisions
d'architecture). Les options ne s'équivalent pas — préfixe de chemin (`/fr`, `/en`, `/wo`),
préfixe pour les seules langues non par défaut, sous-domaine — et chacune a un coût de migration
sur les URL déjà publiques.

## Contrat de données

Aucun endpoint nouveau. Côté API, `apiFetch` transmet déjà la langue active
(`{ locale }`), et les trois dictionnaires vivent dans `src/messages/`.

⚠️ Le wolof est un dictionnaire **partiel**, fusionné sur le français
(`mergeMessages`, `src/i18n/request.ts`). Une URL wolof déclarée indexable servirait donc des
pages partiellement françaises : la décision doit dire si `wo` obtient une URL propre dès
maintenant, ou seulement quand sa couverture le justifie.

## Direction UX / Artistique

Le commutateur de langue existant (`LanguageSwitcher`) reste le geste unique. Ce qui change est
qu'il doit **changer d'URL** plutôt que seulement poser un cookie, et que le retour arrière du
navigateur doit ramener à la langue précédente — un changement de langue est une navigation, pas
un réglage invisible.

Aucune bannière ni fenêtre de suggestion de langue : une redirection automatique fondée sur
`Accept-Language` qui écraserait un choix explicite reproduirait le défaut qu'on corrige.

## Contraintes strictes (métier)

- Les trois langues de la spec sont FR, EN, WO ; le français reste la langue de repli.
- Un choix explicite de langue **prime toujours** sur la détection : aucune redirection
  automatique ne doit pouvoir écraser un choix déjà exprimé.
- Les URL publiques déjà en ligne ne doivent pas devenir des 404 : la décision doit porter sa
  stratégie de redirection.
- Les surfaces authentifiées (`/app`, `/admin`, `/super-admin`) peuvent rester hors du schéma
  d'URL retenu — elles ne sont pas indexables ; la décision doit le dire explicitement plutôt que
  de le laisser déduire.

## Delta à produire

- [ ] ADR numéroté sous `docs/adr/` : schéma d'URL retenu, sort de `wo`, redirections, périmètre
      (public seul ou site entier) — **écrit et tranché avant toute ligne de code**
- [ ] Implémentation du schéma retenu (routage, liens internes, commutateur de langue)
- [ ] `alternates.languages` (`hreflang`) sur les pages publiques indexables, cohérent avec
      [TCK-433](TCK-433-canonical-et-metadatabase-absents.md)
- [ ] Redirections depuis les URL sans langue, sans 404 sur l'existant
- [ ] Le sitemap de [TCK-431](TCK-431-sitemap-et-robots-absents.md) déclare les alternatives
- [ ] Tests : une URL de langue rend cette langue sans cookie ; une URL héritée redirige ;
      un choix explicite n'est pas écrasé

## Critères d'acceptation

- [ ] AC1 — un ADR est mergé et nomme le schéma retenu, le sort de `wo`, et les redirections.
      Aucun code de ce ticket n'est écrit avant.
- [ ] AC2 — une requête **sans cookie et sans `Accept-Language`** sur l'URL anglaise d'une fiche
      rend la fiche en anglais. Le test n'envoie ni cookie ni en-tête : un test qui pose le cookie
      passerait déjà aujourd'hui et ne prouverait rien.
- [ ] AC3 — la page rend un `hreflang` par langue déclarée indexable, plus `x-default`, et les URL
      pointées répondent 200. Un `hreflang` vers une URL 404 fait rougir le test.
- [ ] AC4 — une URL publique de la forme actuelle ne rend jamais 404 : elle redirige selon la
      règle de l'ADR, et un test l'éprouve sur une fiche de bien.
- [ ] AC5 — un choix explicite de langue survit à une navigation ultérieure et n'est pas écrasé
      par `Accept-Language` ; un test l'éprouve avec un en-tête contradictoire.

## Hors périmètre

- La complétion du dictionnaire wolof — suivie par [TCK-339](TCK-339-vocabulaire-wolof-de-recherche.md)
  et [TCK-342](TCK-342-libelles-wolof-divergents-back-front.md).
- Le formatage localisé des nombres et des dates — [TCK-347](TCK-347-formatage-nombres-et-dates-suit-la-locale.md).
- La traduction des contenus saisis par les utilisateurs (P3 dans la spec).

## Notes d'implémentation

**Deux affirmations de ce ticket ont été contredites par la re-mesure, et les deux ont changé la
décision.** Le détail est dans [ADR-0026](../../adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md)
§Contexte ; en résumé :

1. **« Le `matcher` du proxy ne voit aucune route publique » — faux.** Next n'extrait la
   configuration que d'un export nommé `config` ; `proxyConfig` n'apparaît nulle part dans le
   paquet. Le `matcher` n'a donc jamais été appliqué et le proxy tournait sur TOUT — mesuré par
   instrumentation sur un `next dev`. Le nom est corrigé, ce qui rend le `matcher` réellement
   appliqué pour la première fois : `/api`, `_next` et les fichiers à extension en sortent.
2. **« Le wolof est un dictionnaire partiel » — faux.** 5 338 clés sur 5 338, et 95,4 % des valeurs
   distinctes du français, contre 92,5 % pour l'anglais. La question « `wo` mérite-t-il une URL
   propre dès maintenant ? » n'avait pas lieu d'être.

**La décision qui ne figurait dans aucune des deux : l'URL recopie sa langue dans le cookie.** Sans
elle, le destinataire d'un lien partagé — qui n'a aucun cookie — perd la langue au premier clic sur
un lien interne non préfixé. C'est ce report qui rend la migration des ~50 fichiers portant un lien
public facultative plutôt que bloquante (26 sont passés à `LienLocalise`).

**Redirection en 307, pas 308**, et c'est délibéré : la cible dépend du demandeur, pas de l'URL
source. Un permanent épinglerait la langue du premier visiteur sur tous les suivants.

**Ce que la passe adverse a trouvé, et que mes tests ne pouvaient pas voir** :
`/verification-indisponible` vit dans le groupe `(dashboard)/`, donc à la RACINE du chemin, et
manquait de `SEGMENTS_NON_LOCALISES` — le proxy la redirigeait vers une route inexistante, soit un
404 sur la page de secours des gardes fail-closed, celle qu'on n'atteint que quand l'API est en
panne. **La cause racine n'était pas l'oubli mais la garde** : `routing.test.ts` BOUCLAIT sur la
liste, donc n'éprouvait que ce qui y était déjà écrit. Retirer `onboarding` et `publish` laissait
187 tests sur 187 au vert. La vérification est désormais DÉRIVÉE du routeur (les segments réellement
servis par `src/app`, groupes dépliés), et son ablation a été rejouée dans les trois formes.

Second défaut de la même famille, trouvé en accordant le `matcher` : il excluait tout chemin portant
un point OÙ QUE CE SOIT, quand `estCheminLocalisable` ne regarde que le dernier segment. Un chemin
public à point n'était donc ni vu par le proxy ni servi par le routeur — 404, mesuré sur serveur.
**Latent aujourd'hui** : `Str::slug()` supprime les points (`Villa 2.5 pieces` → `villa-25-pieces`),
aucun slug existant ne peut le déclencher.

**Suites non couvertes** : `docs/features.md` §2.8 ne mentionne toujours pas l'URL par langue — hors
« Delta à produire », à traiter par `/sync-specs`. Les alternatives `hreflang` sont des URL absolues
bâties sur `NEXT_PUBLIC_SITE_URL` (défaut `https://www.takussan.com`) : les prévisualisations Vercel
doivent poser cette variable, et TCK-433 posera `metadataBase`.
