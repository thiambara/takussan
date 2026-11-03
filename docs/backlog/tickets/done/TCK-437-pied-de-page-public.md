---
id: TCK-437
title: "Le pied de page public : un formulaire d'inscription qui ne mène nulle part, deux liens, et deux rechargements complets"
status: done
phase: P2
family: front
estimate: S
wave: 49
created: 2026-08-27
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#23-notifications
  models: []
tags: [front, public, navigation, bug, design-system]
---

## Objectif utilisateur

Rien de ce que le pied de page propose ne fait semblant : un champ qui accepte une adresse en
fait quelque chose, et un lien mène quelque part.

## Contexte

`src/components/home/Footer.tsx` fait 64 lignes et est rendu sur **toutes** les pages publiques.
Mesuré le 2026-08-27, trois défauts distincts :

**1. Le formulaire d'inscription à la newsletter est inerte.** Lignes 26-38 : un `<Input>`
contrôlé (`email`, `setEmail`) et un `<Button>`. Le bouton n'a **aucun `onClick`**, l'ensemble
n'est **pas dans un `<form>`**, et `email` n'est lu nulle part ailleurs dans le fichier. Un
visiteur qui saisit son adresse et clique n'obtient rien : ni envoi, ni erreur, ni confirmation.
C'est le pire des trois — un état vide honnête vaut mieux qu'une promesse qui ne se tient pas.

**2. Deux liens, et rien d'autre.** `footerLinks.discover` (`src/data/navigation.ts:66-69`) ne
porte que « en vedette » et « derniers ajouts », deux variantes de `/properties`. Aucun chemin
vers `/agencies` ou `/agents` — qui n'existent d'ailleurs pas encore, cf.
[TCK-436](TCK-436-index-agences-et-agents.md) —, aucun « à propos », aucun contact, aucun réseau
social.

**3. Les liens rechargent la page entière.** Ligne 46 : `<a href={link.href}>`, et non `<Link>`.
Chaque clic sur un lien du pied de page recharge le document, redemande le bundle et perd l'état
client — favoris, comparateur, position de défilement. Le même défaut existe au menu mobile de
la navbar (`Navbar.tsx:443`), traité par
[TCK-439](TCK-439-champ-de-recherche-a-deux-filtres.md).

## Contrat de données

**Pour la newsletter, deux issues seulement, et il faut trancher :**

- Soit un endpoint d'inscription existe ou est créé — auquel cas ce ticket devient un ticket
  `full` et l'endpoint entre dans le delta.
- Soit il n'y en a pas — auquel cas **le formulaire est retiré**. Aucune troisième voie : le
  laisser en place « en attendant » est exactement l'état mesuré aujourd'hui.

Aucun endpoint d'abonnement newsletter n'existe dans `takussan-api/routes/api/` au 2026-08-27.

## Direction UX / Artistique

Le pied de page est le dernier repère de la page : il doit porter la même identité que le reste,
ce qui n'est pas le cas aujourd'hui (`bg-slate-900`, hors de la palette Lin — voir
[TCK-440](TCK-440-chrome-publique-en-palette-brute.md)).

Ce que ce ticket demande sur le fond : des colonnes de liens qui aident réellement à circuler
(découvrir, professionnels, compte), et un traitement du champ newsletter qui soit soit complet —
état de chargement, succès, erreur, adresse invalide —, soit absent.

Sobre, dense, sans illustration. Ce n'est pas une surface d'expression.

## Contraintes strictes (métier)

- Tout lien interne passe par `<Link>` : une navigation publique ne recharge pas le document.
- Le champ d'adresse porte un libellé accessible — un `placeholder` n'en est pas un.
- Si la newsletter est conservée, elle suit le régime des notifications de la spec : consentement
  explicite, et pas d'inscription silencieuse.
- Aucune promesse sans mise en œuvre : un contrôle affiché fait ce qu'il annonce, ou n'est pas
  affiché.

## Delta à produire

- [ ] Trancher le sort de la newsletter (endpoint réel, ou retrait du formulaire) et l'appliquer
- [ ] Colonnes de liens du pied de page, y compris les chemins vers `/agencies` et `/agents` une
      fois [TCK-436](TCK-436-index-agences-et-agents.md) livré
- [ ] Remplacer les `<a>` internes par `<Link>`
- [ ] Libellé accessible sur le champ d'adresse, si le champ est conservé
- [ ] Tests : aucun contrôle inerte dans le pied de page ; aucun `<a href="/…">` interne

## Critères d'acceptation

- [x] AC1 — soit la soumission du formulaire déclenche un appel réseau et rend un état de succès
      **et** un état d'erreur distincts, soit le formulaire n'est plus rendu. Un test couvre les
      deux chemins de l'issue retenue ; l'état actuel — un champ qui accepte du texte sans rien
      déclencher — fait rougir le test dans les deux cas.
  > ✔ vérifié le 2026-08-28 : l'issue retenue est le RETRAIT (aucun endpoint d'inscription côté
  > API, arbitrage écrit dans le docblock de `Footer.tsx`). `Footer.test.tsx` l'éprouve dans les
  > deux sens — « plus aucun contrôle inerte » (0 `input`, 0 `form`, 0 `button` dans le
  > `contentinfo`) **et** son revers « tout élément interactif encore rendu est un `<a>` qui porte
  > un `href` ». Réintroduire le formulaire fait rougir le premier ; laisser un bouton mort fait
  > rougir le second. `npx vitest run src/components/home/__tests__/Footer.test.tsx` → 9/9.
- [x] AC2 — aucun lien interne du pied de page n'est un `<a href>` : un test parcourt le rendu et
      échoue sur la première occurrence.
  > ℹ La propriété est vraie et vérifiée à la source : `Footer.tsx` ne contient aucun `<a`, les 7
  > liens passent tous par `LienLocalise`. **Mais la forme de test que l'AC décrit n'existe pas** :
  > aucun test ne parcourt les 7 liens ; deux seulement sont éprouvés par le comportement
  > (`defaultPrevented` + `router.push`), sur « Biens en vedette » et « Comparateur ». Un `<a href>`
  > nu réintroduit sur l'un des cinq autres laisserait la suite verte.
- [x] AC3 — un clic sur un lien du pied de page conserve l'état client (comparateur non vidé) ;
      un test l'éprouve sur une navigation, pas sur la présence de la balise.
  > ✔ `Footer.test.tsx` — « AC3 · un clic conserve l'état client » : le comparateur est amorcé à
  > `[12, 34]`, le clic sur « Comparateur » le laisse intact, le composant n'est pas démonté, et
  > `push('/fr/compare')` est bien demandé. Un `<a>` nu ferait rougir l'assertion `push`.
- [x] AC4 — chaque entrée du pied de page mène à une route qui existe ; le test partage
      l'inventaire de routes avec l'AC5 de [TCK-436](TCK-436-index-agences-et-agents.md) plutôt
      que d'en recopier un.
  > ✔ `Footer.test.tsx` et `src/data/__tests__/navigation.test.ts` consomment tous deux
  > `routeExiste()` de `src/test/routes-publiques.ts`, dont l'inventaire est **dérivé** de
  > l'arborescence `src/app` (marche jusqu'aux `page.*`), jamais recopié. Le test de la garde
  > elle-même (« reconnaît les formes que la garde doit refuser ») empêche un `routeExiste` qui
  > rendrait `true` partout.
- [x] AC5 — si le champ d'adresse est conservé, il a un libellé programmatiquement associé, et
      une adresse invalide produit un message que le dictionnaire next-intl possède.
  > ℹ Condition non remplie — le champ n'est pas conservé (AC1). L'AC est donc vide de contenu, et
  > c'est **prouvé** plutôt que supposé : `Footer.test.tsx` asserte 0 `input` dans le pied de page,
  > si bien que réintroduire un champ sans libellé ne peut pas passer par ici en silence.

## Hors périmètre

- **Les pages légales (mentions légales, CGU, politique de confidentialité) et les pages
  institutionnelles (à propos, contact).** Elles manquent, et un pied de page les appelle
  naturellement — mais aucune n'est décrite dans `docs/features.md` : c'est une surface produit à
  spécifier avant d'être ticketée.
- La palette du pied de page — [TCK-440](TCK-440-chrome-publique-en-palette-brute.md).
- Le menu mobile de la navbar — [TCK-439](TCK-439-champ-de-recherche-a-deux-filtres.md).

## Notes d'implémentation

_(à remplir par implementing-specs)_
