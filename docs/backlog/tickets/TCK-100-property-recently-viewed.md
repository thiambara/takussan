---
id: TCK-100
title: "Historique local biens consultés"
status: done
phase: P2
family: front
estimate: S
wave: 11
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-039, TCK-040]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [front, discovery, localstorage]
---

## Objectif utilisateur

Permettre à un Locataire (même non connecté) de retrouver rapidement
les **N derniers biens qu'il a consultés**, affichés en carrousel
"Vus récemment" sur la homepage et au bas de chaque fiche bien, pour
faciliter le retour sur ses pistes en cours.

## Contrat de données

**Frontend uniquement — aucun nouvel endpoint backend.**

Persistance dans `localStorage`, clé `takussan.recently-viewed`, format :

```ts
type RecentlyViewedEntry = {
  id: number;     // Property.id
  viewed_at: string; // ISO timestamp
};
type RecentlyViewedStore = RecentlyViewedEntry[]; // ordered, most recent first
```

- **Capacité** : N = 12 entrées max. FIFO sur dépassement.
- **TTL** : 30 jours par entrée. Les entrées expirées sont purgées au
  chargement.
- **Insertion** : déclenchée à l'ouverture d'une fiche bien (TCK-040). Si
  l'id existe déjà, on le **déplace** en tête (pas de doublon) et on met
  à jour `viewed_at`.

**Fetch unique au mount du carrousel** :
`GET /api/properties?filter[ids]={ids}&include=address,primaryMedia&fields[properties]=id,title,price,address,primaryMedia,property_type,transaction_type`.

Le backend (filter `ids[]`) doit déjà exister via TCK-082 ou être ajouté
en pré-requis trivial — vérifier avant de démarrer ; si absent, follow-up
backend rapide.

## Direction UX / Artistique

**Carrousel horizontal** "Vus récemment" :
- Sur la homepage, **sous** les biens en vedette / nouveautés.
- En bas de chaque fiche bien, **après** les biens similaires (TCK-099).

Le bien **actuellement consulté** est exclu du carrousel sur sa propre
fiche.

Cards identiques aux `PropertyCard` existantes (TCK-039) — pas de variant
spécifique. Bouton discret "Effacer l'historique" en fin de carrousel
(petit lien texte).

**Empty state** : si moins de 2 biens en historique (= rien d'utile à
afficher), masquer entièrement le bloc.

## Contraintes strictes (métier)

- **Aucun appel backend** pour persister l'historique — tout en
  `localStorage`. Mode anonyme pleinement fonctionnel.
- **Pas de tracking serveur** des consultations dans ce ticket
  (l'analytics éventuelle reste P3 / consent banner).
- **Hydration safe** — Next.js SSR : le carrousel doit être un client
  component, ne pas leak l'historique au HTML serveur (sinon mismatch).
- **Privacy** : si l'utilisateur clear ses cookies / localStorage,
  l'historique disparaît. Aucun fallback serveur.
- **Pas de doublons** — un id apparaît une seule fois (le plus récent).
- **Biens supprimés / non-publiés** : l'API ne les retourne pas → on
  filtre simplement les entrées "fantômes" silencieusement et on purge
  l'id du localStorage.

## Delta à produire

- [ ] Hook `useRecentlyViewed` (read / push / clear / purgeExpired).
- [ ] Helper `recentlyViewedStorage` (wrapper localStorage + serialization).
- [ ] Trigger d'insertion sur la fiche bien (TCK-040) au mount.
- [ ] Composant `RecentlyViewedCarousel` (client component).
- [ ] Intégration sur la homepage (TCK-038) et fiche bien (TCK-040, en
      excluant le bien courant).
- [ ] Lien "Effacer l'historique" + confirm dialog.
- [ ] i18n fr/en/wo (`recentlyViewed.*`).
- [ ] Tests Vitest : `useRecentlyViewed` (FIFO, dedupe, TTL,
      hydration-safe), `RecentlyViewedCarousel` (filtre bien courant,
      empty state, clear).

## Critères d'acceptation

- [ ] AC1 — visiter une fiche bien ajoute son id en tête du store
      localStorage.
- [ ] AC2 — re-visiter un bien déjà présent **déplace** son id en tête
      sans créer de doublon.
- [ ] AC3 — au-delà de 12 entrées, le plus ancien est évincé (FIFO).
- [ ] AC4 — une entrée > 30 jours est purgée au prochain chargement.
- [ ] AC5 — sur la fiche d'un bien, ce bien n'apparaît jamais dans son
      propre carrousel "Vus récemment".
- [ ] AC6 — homepage : si < 2 entrées valides, le bloc est masqué.
- [ ] AC7 — "Effacer l'historique" vide le store et masque le carrousel.
- [ ] AC8 — pas de mismatch d'hydration en SSR (test Vitest + manuel).

## Hors périmètre

- Historique côté serveur (lié à un User authentifié) — P3.
- Recommandations basées sur l'historique (P3 — voir TCK-099 hors
  périmètre).
- Tracking analytics des consultations (P3, consent-gated).
- Sync multi-device — localStorage par device uniquement.

## Notes d'implémentation

- Storage rewritten: key changed `takussan.recent_properties` → `takussan.recently-viewed`, type trimmed to `{ id, viewed_at }` (was rich object), cap 10 → 12, +30-day TTL + `purgeIds()`.
- `useRecentlyViewed` now fetches from `/public/properties?filter[ids]=…&include=address,primaryMedia` at mount (instead of reading cached data from localStorage). Ghost IDs (unpublished/deleted properties not returned by API) are silently purged from the store.
- `RecentlyViewedCarousel` is a standalone client component usable on both the homepage and property detail page; `PropertyRecentlyViewed` becomes a thin wrapper passing `excludeId`.
- Hydration safety: `useState({ items: [], loading: false })` — localStorage access only in `useEffect`, so the SSR and initial client renders are identical.
- The loading threshold in the carousel (`!loading && items.length < 2`) ensures the skeleton is shown while fetching, avoiding a flash-of-hidden-content on first render.
