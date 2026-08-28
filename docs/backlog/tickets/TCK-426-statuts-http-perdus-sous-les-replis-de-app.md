---
id: TCK-426
title: "Les replis de /app effacent 404, 307 et 308 : un refus d'autorisation rend désormais 200 et le squelette de la page interdite"
status: todo
phase: P3
family: front
estimate: M
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-382]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, dashboard, http, observabilite]
---

## Contexte

TCK-382 a posé 37 `loading.tsx` sous `/app` pour rendre l'attente visible. Une frontière de
suspension fait partir la coque **et le code de réponse** avant que la page n'ait rien décidé :
tout ce que la page ferait ensuite au niveau HTTP est perdu.

Mesuré le 2026-08-27, Next 16.3.1, sondes jetables sous `next dev`, par ablation du seul
`loading.tsx` :

| Ce que la page appelle | sans repli | avec un repli (même segment **ou** ancêtre) |
|---|---|---|
| `notFound()` | **404** | **200**, l'écran introuvable est rendu quand même |
| `redirect('/x')` | **307** + `Location` | **200** + la coque ; la redirection passe par le flux RSC |

L'écran final reste juste dans les deux cas — c'est le statut seul qui change. `curl`, lui,
s'arrête sur le squelette.

**L'échange est TOTAL, pas segmentaire, et il touche l'AUTORISATION.** `app/loading.tsx` est
l'ancêtre de tout `/app` : les 36 autres replis ne changent rien à la question du statut. Sont
concernés **32 appels de `redirect()`/`permanentRedirect()` sur 15 pages** (relevé sur la source
débarrassée de ses commentaires, 2026-08-27) :

```
7  overview/page.tsx           5  owners/page.tsx              4  settings/agency/upgrade/page.tsx
3  maintenance/providers       2  overview/agency              2  properties/[id]
1  crm · customers · customers/[id] · overview/{agent,alerts,exports,kpis,owner} · properties
```

La grande majorité sont des **refus d'autorisation**, et trois pages font même une redirection
d'**authentification en page** (`owners:36`, `maintenance/providers:34`,
`settings/agency/upgrade:34`) — le cas que la justification de TCK-382 déclarait couvert par le
layout.

Et le changement observable dépasse le statut : un utilisateur sans le droit reçoit désormais
**200 + `AppShell` + le squelette de la route interdite**, puis rebondit côté client. Aucun
contenu ne fuit (le squelette ne porte aucune donnée) mais l'écran ment une fraction de seconde,
là où il y avait un renvoi serveur immédiat. `crm/page.tsx` perd son 308 — celui dont le
commentaire dit qu'il existe pour que les liens en favori résolvent encore.

L'échange a été **assumé** dans TCK-382 pour trois raisons mesurées : `(dashboard)/layout.tsx`
pose `robots: { index: false }` sur tout `/app`, l'espace est derrière l'authentification, et la
garde d'authentification DU GROUPE vit dans le layout — donc **au-dessus** de toute frontière
posée par TCK-382 (vérifié : `GET /app` non authentifié rend toujours 307, donc une visite en
favori depuis un navigateur déconnecté fonctionne encore).

⚠ **Rien ne garde ces statuts, ni avant ni après** : il n'existe aucune suite e2e dans ce dépôt
(`npm run test` = vitest/jsdom). Les deux relevés ci-dessus ont été pris à la main sur sondes
jetables.

⚠ Deux constats qui relèvent l'intérêt du ticket :

1. **Le défaut préexistait, non mesuré.** `app/properties/loading.tsx` existait avant TCK-382 et
   se trouve exactement au-dessus du seul `notFound()` que `/app` portait alors
   (`properties/[id]`, l. 43). Le 404 de cette page était déjà un 200 et personne ne l'avait vu.
2. **Le patron ne doit pas franchir la frontière du public.** TCK-335 a supprimé
   `properties/[slug]/loading.tsx` pour rendre un vrai 404 à l'indexation ;
   `[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts` le garde — chemin
   corrigé par TCK-438 : le fichier a suivi le passage sous `[locale]` (TCK-434) et couvre
   désormais les trois fiches, leurs ancêtres, et la frontière `<Suspense>` écrite à la main
   qu'un nom de fichier ne montre pas.

## Ce qu'il resterait à décider

- Un statut juste et un repli visible sont-ils conciliables ? La piste connue est le **groupe de
  routes** : sortir les pages qui décident d'un statut (`[id]`, aiguilleurs, pages qui refusent
  sur le rôle) de la portée du repli, comme TCK-335 l'a fait avec `(liste)`. Le geste le moins
  cher est `app/(accueil)/page.tsx` + `app/(accueil)/loading.tsx`, qui supprime à lui seul la
  frontière RACINE et rend leur statut à `crm` et à toute page sans repli propre. Coût : un
  remaniement de répertoires, sur 1 segment pour ce premier geste, ~10 pour aller au bout.
- **Le flash de la page interdite** est le point le plus visible, et il se traite peut-être
  séparément du statut : un refus d'autorisation pourrait remonter dans le `layout.tsx` du
  segment, au-dessus de la frontière, plutôt que dans la page.
- Ou bien : accepter l'échange **explicitement**, et poser une garde qui refuse un `loading.tsx`
  au-dessus d'un `notFound()` **hors** de `(dashboard)`.
- Mesurer d'abord s'il existe un consommateur réel de ces statuts (sonde de disponibilité,
  journal d'accès, analytique). S'il n'y en a aucun, ce ticket se ferme en `wontfix` documenté —
  ce qui est un résultat.

## Hors périmètre

- Le catalogue public, déjà tenu par TCK-335.
