---
id: TCK-426
title: "Les replis de /app effacent 404 et 307 : le statut HTTP du tableau de bord ne veut plus rien dire"
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

L'échange a été **assumé** dans TCK-382 pour trois raisons mesurées : `(dashboard)/layout.tsx`
pose `robots: { index: false }` sur tout `/app`, l'espace est derrière l'authentification, et la
redirection d'authentification vit dans le layout du groupe — donc **au-dessus** de toute
frontière posée par TCK-382 (vérifié : `GET /app` non authentifié rend toujours 307).

⚠ Deux constats qui relèvent l'intérêt du ticket :

1. **Le défaut préexistait, non mesuré.** `app/properties/loading.tsx` existait avant TCK-382 et
   se trouve exactement au-dessus du seul `notFound()` que `/app` portait alors
   (`properties/[id]`, l. 43). Le 404 de cette page était déjà un 200 et personne ne l'avait vu.
2. **Le patron ne doit pas franchir la frontière du public.** TCK-335 a supprimé
   `properties/[slug]/loading.tsx` pour rendre un vrai 404 à l'indexation ;
   `(public)/properties/[slug]/__tests__/pas-de-frontiere-de-suspension.test.ts` le garde.

## Ce qu'il resterait à décider

- Un statut juste et un repli visible sont-ils conciliables ? La piste connue est le **groupe de
  routes** : sortir les pages qui décident d'un statut (`[id]`, aiguilleurs) de la portée du
  repli, comme TCK-335 l'a fait avec `(liste)`. Coût : un remaniement de répertoires sur ~10
  segments.
- Ou bien : accepter l'échange **explicitement**, et poser une garde qui refuse un `loading.tsx`
  au-dessus d'un `notFound()` **hors** de `(dashboard)`.
- Mesurer d'abord s'il existe un consommateur réel de ces statuts (sonde de disponibilité,
  journal d'accès, analytique). S'il n'y en a aucun, ce ticket se ferme en `wontfix` documenté —
  ce qui est un résultat.

## Hors périmètre

- Le catalogue public, déjà tenu par TCK-335.
