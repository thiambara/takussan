---
id: TCK-438
title: "L'attente et l'introuvable de la section publique : quatre écrans sans état de chargement, et un 404 racine qui n'existe pas"
status: doing
phase: P1
family: front
estimate: M
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
  models: []
tags: [front, public, ux, etats, a11y]
---

## Objectif utilisateur

Un visiteur sait toujours où il en est : que la page arrive, qu'elle n'existe pas, ou qu'elle a
échoué — et il n'est jamais renvoyé sur un écran qui n'appartient pas au site.

## Contexte

[TCK-382](TCK-382-app-attente-introuvable-et-titre-onglet.md) a traité ces trois états pour les
quarante écrans de `/app`. **La section publique n'a pas reçu le même passage**, alors qu'elle
est la seule qui soit exposée à des inconnus.

Mesuré le 2026-08-27 :

| Route | Charge côté serveur | `loading.tsx` | `not-found.tsx` |
|---|---|---|---|
| `/properties` | non (client) | ✅ | — |
| `/properties/[slug]` | **oui**, un aller-retour API | ❌ | ✅ |
| `/agencies/[slug]` | **oui**, un aller-retour API | ❌ | ❌ |
| `/agents/[slug]` | **oui**, un aller-retour API | ❌ | ❌ |
| `/bookings` | **oui**, un aller-retour API | ❌ | — |

```
$ find "src/app/(public)" -name "loading.tsx"
  src/app/(public)/properties/(liste)/loading.tsx        ← un seul, et c'est la page cliente
$ ls src/app/not-found.tsx
  No such file or directory
```

Deux conséquences :

**1. Quatre écrans serveur attendent l'API sans rien dire.** Un composant serveur qui `await`
une réponse HTTP bloque la navigation : le clic est fait, l'ancienne page reste, rien ne bouge.
C'est exactement l'état que `loading.tsx` couvre, et c'est le seul des cinq écrans qui n'en a pas
besoin — la liste, cliente — qui en a un.

**2. Il n'existe aucun 404 du site.** Sans `src/app/not-found.tsx`, une URL publique inconnue
tombe sur l'écran par défaut de Next : en anglais, hors de la palette, sans navbar, sans pied de
page, sans aucun moyen de revenir vers le catalogue. C'est ce qu'obtient aussi un visiteur qui
suit un lien périmé vers une agence ou un agent, puisque leurs `notFound()` n'ont pas de
`not-found.tsx` local et remontent jusque-là.

⚠️ **Et l'échec API n'est pas l'inexistence.** `agencies/[slug]` et `agents/[slug]` font tous deux
`try { … } catch { return null }` puis `notFound()` : une API injoignable rend donc « cette agence
n'existe pas », en 404, alors qu'on n'en sait rien. C'est le défaut exact que TCK-335 a corrigé
sur la fiche de bien — dont le `getProperty` distingue depuis `introuvable` et `indisponible` —
et il vit encore sur les deux fiches voisines. Le mauvais coupable est accusé, et le statut HTTP
le grave.

## Contrat de données

Aucun endpoint nouveau. `src/lib/queries/public-property.ts` porte déjà la distinction
`introuvable` / `indisponible` : c'est la forme à reprendre, pas à réinventer.

## Direction UX / Artistique

Les squelettes reprennent la **forme réelle** de la page qu'ils annoncent — la mosaïque de la
fiche, le hero asymétrique d'un profil —, pas un rectangle générique : un squelette qui ne
ressemble pas à ce qui arrive produit un saut de mise en page à l'arrivée.

Le 404 du site est une page d'accueil manquée, pas une page d'erreur : navbar, pied de page,
palette Lin, un `<h1>` qui dit ce qui s'est passé, et un chemin de retour vers le catalogue. Le
`not-found.tsx` déjà livré pour la fiche de bien est la référence de ton.

L'écran d'API injoignable dit qu'on ne sait pas, et propose de réessayer — il n'affirme pas que la
chose n'existe pas.

## Contraintes strictes (métier)

- **Un `notFound()` ne se prononce que sur un 404 amont.** Toute autre panne rend un écran
  d'indisponibilité, en 200, et — leçon mesurée de TCK-335 — avec `robots: { index: false }` :
  une page qui ne sait pas ne s'offre pas à l'indexation.
- Le statut HTTP compte autant que le rendu : la fiche de bien a montré qu'un `notFound()` appelé
  seulement dans le corps de page rend le bon écran en **200**. La forme retenue doit produire un
  vrai 404, et un test doit le mesurer sur le **code**, pas sur le texte.
- Tous les libellés viennent du dictionnaire next-intl, dans les trois langues.
- Le squelette ne doit pas écraser la restauration de défilement en traversée d'historique — la
  contrainte est déjà documentée dans `PropertiesDiscoveryPage` (TCK-335).

## Delta à produire

- [ ] `loading.tsx` pour `/properties/[slug]`, `/agencies/[slug]`, `/agents/[slug]`, `/bookings`
- [ ] `src/app/not-found.tsx` — le 404 du site, avec chrome et chemin de retour
- [ ] `not-found.tsx` pour `/agencies/[slug]` et `/agents/[slug]`
- [ ] Distinction `introuvable` / `indisponible` sur les chargements d'agence et d'agent, sur le
      modèle de `public-property.ts`
- [ ] Tests : code HTTP 404 sur un slug inconnu ; écran d'indisponibilité + `index: false` sur une
      API injoignable ; présence d'un état d'attente sur chaque route serveur

## Critères d'acceptation

- [ ] AC1 — un slug d'agence inconnu rend le **code HTTP 404** et l'écran du site. Le test lit le
      code de la réponse : un test qui n'assertion que le texte passerait sur la 200 d'aujourd'hui.
- [ ] AC2 — l'API injoignable sur une fiche d'agence rend un écran d'indisponibilité, **pas** un
      404, et la page déclare `robots: { index: false }`. Un test l'éprouve en faisant échouer
      l'appel — pas en supprimant l'agence.
- [ ] AC3 — chacune des quatre routes serveur rend un état d'attente pendant la navigation ; un
      test le constate par le rendu du repli, pas par la seule présence du fichier.
- [ ] AC4 — une URL publique inconnue rend le 404 du site, avec navbar, pied de page et un lien
      vers `/properties`, dans la langue active.
- [ ] AC5 — aucun libellé de ces écrans n'est écrit en dur : un test échouerait sur une chaîne
      absente des trois dictionnaires.

## Hors périmètre

- Le rendu serveur de la home et de `/properties` — [TCK-432](TCK-432-accueil-et-liste-sans-rendu-serveur.md).
- Les états d'erreur et d'attente de `/app`, traités par TCK-382.
- Le titre d'onglet des pages publiques, déjà porté par leurs `generateMetadata`.

## Notes d'implémentation

### Trois affirmations du ticket que la re-mesure a renversées

Toutes trois mesurées le 2026-08-27, `next dev` 16.3.1, **serveur redémarré entre les campagnes** —
sans quoi Turbopack garde un état de routage périmé après création/suppression de fichiers de route,
et rend des relevés qu'on ne peut pas reproduire (deux campagnes ont été jetées pour cette raison).

1. **AC1 était DÉJÀ vert.** Le ticket annonce « la 200 d'aujourd'hui » sur un slug d'agence inconnu.
   Mesuré : `/fr/agencies/slug-inconnu-zzz` → **404** avant tout correctif. Le `notFound()` du corps
   de page suffisait. Le risque n'était donc pas de gagner le 404 mais de **le perdre** en ajoutant
   les `loading.tsx` que le delta demande.

2. **L'arborescence a changé.** `src/app/(public)/**` n'existe plus (TCK-434) ; tout est sous
   `src/app/[locale]/(public)/**`, et aucune URL publique n'existe sans préfixe de langue.

3. **`properties/[slug]` ne peut pas recevoir de `loading.tsx`** — TCK-335 en avait supprimé un et
   posé une garde structurelle contre son retour. La garde a été vérifiée plutôt que crue :
   ajouter le fichier fait bien retomber la fiche de 404 à **200**.

### La décision qui gouverne le ticket : le repli et le statut s'excluent sur les fiches à slug

Le remède de TCK-426 — remonter `notFound()` dans un `layout.tsx`, au-dessus du repli — a été
rejoué et **il fonctionne** : `agencies/[slug]` avec `loading.tsx` + décision en layout rend 404.
Mais une seconde mesure, que le remède ne couvrait pas, en annule le bénéfice ici :

```
attente artificielle de 2 s placée DANS LA PAGE (sous le repli)   TTFB 0,81 s  total 2,29 s
la même, placée DANS LE LAYOUT (au-dessus du repli)               TTFB 2,25 s  total 2,25 s
```

Un repli couvre exactement ce qui est en dessous de lui. Or sur ces trois fiches **l'attente EST la
décision** : le seul aller-retour de la page est celui qui dit si le slug existe. Le remonter pour
sauver le statut le met hors de portée du repli — qui ne montrerait plus qu'un éclair de squelette
juste avant le contenu, au prix d'un `layout.tsx`, d'une frontière de dictionnaire (ADR-0022) et du
déplacement de la frontière `not-found` vers le segment parent (mesuré : un `notFound()` levé dans
`agencies/[slug]/layout.tsx` est attrapé par `agencies/not-found.tsx`, jamais par
`agencies/[slug]/not-found.tsx` — le `not-found.tsx` local deviendrait du code mort).

**Les trois `loading.tsx` de fiches n'ont donc pas été livrés, délibérément.** `/bookings` a le sien :
cette page n'appelle jamais `notFound()`, n'a aucun statut à défendre, et son repli enveloppe
l'aller-retour lui-même. Le raisonnement et ses relevés vivent dans
`[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts`, qui remplace et **élargit** la
garde de TCK-335 : elle couvre désormais les trois fiches, leurs parents et leurs ancêtres communs,
et refuse aussi le `layout.tsx` qui tuerait un `not-found.tsx` voisin.

> Le vrai remède, si ces fiches doivent un jour montrer une attente, est de séparer l'appel qui
> décide de l'existence de celui qui porte le portefeuille, et de suspendre le second dans la page.
> Cela change un contrat d'API : **son propre ticket**, pas celui-ci.

### Le 404 du site : emplacement mesuré, chrome arbitrée

Trois emplacements testés avec un marqueur distinct chacun. **Une URL qui ne correspond à aucune
route ne descend dans aucun segment** — ni `(public)`, ni `[locale]` : seule `src/app/not-found.tsx`
est atteinte. Les deux autres candidats rendaient un écran que personne n'aurait vu.

Sa chrome n'importe **pas** `Navbar`/`Footer`, et c'est un arbitrage chiffré, pas une facilité : un
fichier de routeur à la racine fait entrer ses espaces de noms dans le socle servi à *toutes* les
pages. Mesuré par `check-i18n-namespaces --update` — le socle **double** (13 → 26 points du
dictionnaire gzippé), `(auth)` 18 → 30, `publish` 18 → 31, `onboarding` 42 → 54. C'est le défaut que
TCK-337 a corrigé, réintroduit par une page d'erreur. La chrome est donc écrite sur place à partir
d'`errors` (déjà au socle) plus `common.appName` pour la marque — **+1 point**, et une seule source
pour le nom du produit. Les `not-found.tsx` d'agence et d'agent, eux, gardent la vraie chrome : ils
vivent sous `[locale]/(public)`, qui l'a déjà payée.

### AC2 : le défaut s'est produit tout seul pendant la campagne

Le serveur d'API local s'est arrêté en cours de mesure. `/fr/agencies/dakar-immo` — une agence qui
existe — a rendu **404 « cette agence n'existe pas »**, pendant que la fiche de bien voisine rendait
200 « momentanément indisponible ». Une sonde jetable dans le `catch` a nommé le coupable
(`ECONNREFUSED`). Après correctif, API réellement arrêtée : **200**, écran d'indisponibilité,
`<meta name="robots" content="noindex">`.

### Une ablation restée verte, et le test qu'elle a fait naître

`getAgency` remis au défaut d'origine (`return { etat: 'introuvable' }` pour toute panne) laissait
la suite de la fiche **verte, 5/5** : les tests de page remplacent le module de requête par un
`vi.mock` et ne regardent donc jamais la classification. D'où
`src/lib/queries/__tests__/fiches-publiques.test.ts`, qui éprouve `getAgency`/`getAgent` sur 404,
5xx, 4xx, `ECONNREFUSED` et corps illisible. Les 10 ablations finales sont rouges, chacune vérifiée
par `md5` avant/après — un premier essai `perl` dont le motif ne correspondait à rien avait rendu
« ablation non appliquée » plutôt qu'un faux vert.

### Reste ouvert

- AC3 n'est tenu que sur `/bookings` (1 route serveur sur 4), pour la raison mesurée ci-dessus.
- `agencies/[slug]/page.tsx` et `agents/[slug]/page.tsx` : seules les branches `notFound()` et
  `robots: { index: false }` de `generateMetadata` ont été touchées — le reste des métadonnées
  appartient au ticket SEO mené en parallèle.

