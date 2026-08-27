---
id: TCK-430
title: "`/admin/settings/tags` n'a aucun chemin entrant — le bandeau réparé n'est vu que sur une URL tapée à la main"
status: todo
phase: P3
family: front
estimate: XS
wave: 48
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
tags: [front, admin, navigation, dette-ac]
---

## Contexte — d'où vient ce ticket

Le correctif n°1 de [TCK-370](TCK-370-console-agence-chemins-et-gestes-morts.md) a réparé un fil
cassé : `/admin/settings/tags` redirigeait vers `/admin?notice=tags-platform-managed` et **rien à
l'arrivée ne lisait ce `?notice=`**. Le motif partait, personne ne le recevait. Le correctif est
juste, et il est éprouvé — le test part du VRAI émetteur, extrait le `?notice=` de l'URL que
`redirect()` reçoit, et l'injecte dans la VRAIE page d'arrivée ; changer l'un des deux côtés fait
rougir.

**Ce ticket ne conteste pas ce correctif. Il borne sa valeur, ce que la revue adverse de TCK-370
avait signalé comme observation et que personne n'a encore tranché.**

## La mesure

Re-prise le 2026-08-27, arbre `feat/console-lot-358-382` :

```
$ grep -rn "settings/tags" takussan-web/src/ | grep -v __tests__
src/lib/admin/notices.ts:8:  * `/admin/settings/tags` redirigeait vers `/admin?notice=…` et **rien ne
src/lib/admin/notices.ts:12: *     src/app/(dashboard)/admin/settings/tags/page.tsx:6:  redirect(…)
src/lib/admin/notices.ts:22: /** Valeur de `?notice=` posée par la redirection de `/admin/settings/tags`. */

$ grep -rn "href=\"/admin/settings/tags\"" takussan-web/src/ | grep -v __tests__
(aucun résultat)
```

**Trois commentaires, zéro lien.** Aucune entrée de menu, aucun `<Link>`, aucun onglet ne mène à
cette route. Le bandeau réparé ne s'affiche donc que pour une **URL tapée à la main** ou un vieux
marque-page.

Et pour une agence `individual`, il ne s'affiche pas du tout : `/admin` est dans `PRO_ROUTES`, et
`ensureStandardAgencyOrRedirect` (`src/lib/access/server-guards.ts`) redirige vers `/app` avant que
`AdminNotice` ne rende.

**Où vivent réellement les tags** : `/super-admin/tags`, servi par `TagsManager` et lié depuis
`SuperAdminSidebar.tsx:113`. La route `/admin/settings/tags` est donc une **souche de redirection**
qui dit « ce n'est pas ici » — ce qui est exact, et invisible.

## Le delta à produire

Une **décision**, puis une ligne de code ou zéro. Les deux options tiennent, elles ne se valent pas
au même endroit :

1. **Assumer la souche et l'écrire.** Si la route existe pour rattraper d'anciens marque-pages,
   c'est légitime — mais rien dans le dépôt ne le dit, et le corps de TCK-370 laisse croire que le
   correctif est visible. Il suffit alors d'un commentaire d'en-tête sur `page.tsx` nommant la
   raison, et d'une phrase dans TCK-370.
2. **Ouvrir un chemin, si et seulement si un utilisateur a une raison d'y aller.** Un
   `agency_admin` qui cherche les tags a besoin d'apprendre qu'ils sont gérés par la plateforme :
   l'endroit pour le lui dire est l'écran où il les cherche (les paramètres d'agence), pas une
   entrée de menu vers une page qui ne montre rien. *Ajouter au menu une entrée dont la
   destination redirige aussitôt fabrique un deuxième geste mort en réparant le premier.*

⚠️ **Ne pas ajouter d'entrée « Tags » à `AdminSidebar` sans avoir tranché le point 2.** C'est la
correction réflexe, et c'est celle qui aggrave.

## Critères d'acceptation

- [ ] La décision entre (1) et (2) est écrite dans ce ticket, avec sa raison.
- [ ] Si (1) : `src/app/(dashboard)/admin/settings/tags/page.tsx` porte en en-tête la raison d'être
      de la souche, et le corps de TCK-370 ne laisse plus croire que le bandeau est atteignable par
      la navigation.
- [ ] Si (2) : le chemin ouvert mène à un écran qui **contient** ce qu'il annonce — un test le
      vérifie en montant la destination, pas en assertant le `href`.
- [ ] Dans les deux cas, `grep -rn "settings/tags" src/ | grep -v __tests__` rend un résultat qui
      s'explique sans lire ce ticket.

## Ce que ce ticket n'est PAS

- Ce n'est pas une régression de TCK-370 : le fil `?notice=` est juste, et il est gardé.
- Ce n'est pas un défaut de sécurité : la route ne montre rien et la garde SSR tient.
