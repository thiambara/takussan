---
id: TCK-159
title: "Sélecteur de langue public — câblage i18n FR/EN/WO"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: [TCK-160]
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#12-recherche--découverte-publique
tags: [front, bug, p1, smoke-test-2026-05-05, i18n, visiteur-anonyme]
---

## Objectif utilisateur

Un visiteur anonyme peut basculer la langue (FR / EN / WO) depuis la navbar et voir l'interface publique changer effectivement de langue, choix persisté entre rechargements et propagé à toutes les pages publiques (`/`, `/properties`, `/properties/[slug]`, `/compare`, `/favorites`, footer).

## Contrat de données

Aucune nouvelle API. Middleware Next.js doit propager la locale courante via cookie `NEXT_LOCALE` (ou équivalent), alimenter les composants serveur (RSC) et client, et exposer la locale à `next-intl` (ou la lib en place — auditer ce qui existe : actuellement le `<html lang>` change à la sélection donc une infra partielle est posée).

## Direction UX / Artistique

- Feedback discret à la sélection : fermeture du menu, mise à jour fluide sans flash de contenu non stylisé.
- Le sélecteur reste sobre (drapeau + code ISO), placé en navbar comme aujourd'hui.
- Pas de modale ni de popover supplémentaire.

## Contraintes strictes (métier)

- FR reste la locale par défaut (cookie absent → FR).
- Wolof peut être partiellement traduit ; les clés manquantes retombent sur FR sans casser la mise en page.
- Ne pas régresser le dashboard (déjà internationalisé via TCK-117 / TCK-154) — la même infra doit servir back-office et public.
- Le `<title>` et la `<meta description>` doivent suivre la locale active sur chaque page.

## Delta à produire

- [ ] Audit du mécanisme i18n actuel (`takussan-web/src/i18n*`, middleware, providers) : ce qui est posé, ce qu'il manque pour persister + appliquer.
- [ ] Persistance de la locale via cookie `NEXT_LOCALE` (lecture serveur + écriture client à la sélection).
- [ ] Brancher la locale aux composants serveur des routes publiques : `/`, `/properties`, `/properties/[slug]`, `/compare`, `/favorites`.
- [ ] Brancher la locale au layout (footer, navbar, sélecteur de langue lui-même).
- [ ] `metadata` Next : titres et meta-description par locale.
- [ ] Catalogues `messages/{fr,en,wo}.json` : amorcer les namespaces des routes publiques (le remplissage exhaustif est confié à TCK-160).
- [ ] Test E2E : bascule FR→EN sur `/`, vérifier que le hero, le footer et au moins un libellé navbar changent ; reload, vérifier persistance.

## Critères d'acceptation

- [ ] Cliquer "English" dans le menu Langue fait passer le hero, les sections home et le footer à l'anglais.
- [ ] Un reload (F5) après bascule conserve l'anglais.
- [ ] Le `<title>` du document suit la locale (titre EN sur `/`, FR sur `/`).
- [ ] Le menu Langue lui-même affiche l'item courant marqué (état sélectionné).
- [ ] WO ne casse aucune page : les clés manquantes retombent en FR sans erreur runtime.
- [ ] Aucune régression visible sur le dashboard authentifié (locale partagée).

## Hors périmètre

- Le contenu des traductions exhaustives des chaînes EN résiduelles côté public (cf. TCK-160).
- La traduction Wolof complète (livraison incrémentale acceptée).
- Les routes `/app/*` et `/admin/*` (déjà couvertes par TCK-117 / TCK-154).

## Notes d'implémentation

_(à remplir par implementing-specs)_
