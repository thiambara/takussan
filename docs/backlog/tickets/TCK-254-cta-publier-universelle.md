---
id: TCK-254
title: "CTA \"Publier\" universelle — routing selon état du user"
status: done
phase: P0
family: front
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-248]
blocks: [TCK-255]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
tags: [front, onboarding, host, p0]
---

## Objectif utilisateur

Le bouton **"Publier"** du header (déjà présent, pattern Airbnb) doit acheminer chaque utilisateur vers le bon écran selon son état : visiteur → signup puis wizard host, Customer sans agence → wizard host, user avec agence existante → directement formulaire bien dans son agence active.

## Contrat de données

Repose sur :

- `GET /api/me/profiles` (existant TCK-138→142) — liste des profils du user, identifie s'il a au moins un `AgencyAdminProfile` ou `AgentProfile` actif.
- `Agency.kind` (TCK-248) — pour différencier le routing si besoin.

Pas de nouvel endpoint.

## Direction UX / Artistique

Le bouton "Publier" du header reste visuellement identique. Le clic déclenche un **router intent** (page intermédiaire ou client-side switch) :

- **Visiteur anonyme** → modal/page "Connectez-vous pour publier" → après auth, reprise automatique vers le wizard host (TCK-255).
- **Customer sans aucun profil agency_admin/agent** → directement le wizard host (TCK-255).
- **User avec ≥ 1 agence (individual ou standard)** → directement `/app/properties/new` dans le contexte de l'agence active. S'il a plusieurs agences, le sélecteur de profil actif l'invite à choisir avant.

L'intent est unique (pas de page "à quoi sert le bouton" intermédiaire si le user est déjà identifié comme host).

## Contraintes strictes (métier)

- Pas de modification du backend dans ce ticket — uniquement front + reuse d'endpoints existants.
- Si l'auth interrompt le flow, l'intent doit être préservé (querystring ou local storage) pour reprise automatique.
- Pas de side-effect (création d'agence implicite) — la création se fait dans TCK-255.

## Delta à produire

- [ ] Composant `<PublishCtaRouter>` (ou hook `usePublishIntent`) qui décide la route
- [ ] Page intermédiaire `/publish` (ou route client-side guard) qui exécute le routing
- [ ] Persistance d'intent durant l'auth flow (`?next=/publish` ou `localStorage.publishIntent`)
- [ ] Wiring du bouton "Publier" du header existant vers ce flow
- [ ] Tests E2E : 3 cas (visiteur, customer sans agence, user avec agence)

## Critères d'acceptation

- [ ] AC1 — Visiteur anonyme : clic Publier → page login → après auth, atterrit sur le wizard host (TCK-255).
- [ ] AC2 — Customer sans agency_admin/agent profile : clic Publier → wizard host directement.
- [ ] AC3 — User avec 1 agence : clic Publier → `/app/properties/new` dans le contexte de cette agence (active profile bascule auto si ce n'était pas déjà le bon).
- [ ] AC4 — User avec plusieurs agences : clic Publier → invite à choisir le profil actif puis route vers `/app/properties/new`.
- [ ] AC5 — L'intent survit à un signup OAuth (Google/Facebook/Apple).

## Hors périmètre

- Wizard host individual lui-même — TCK-255.
- Création de bien `/app/properties/new` — déjà existant.
- Personnalisation du label "Publier" selon le contexte — non requis.

## Notes d'implémentation

- Hook `usePublishIntent()` (`takussan-web/src/hooks/usePublishIntent.ts`) résout l'état du user via `useAuth()` + `useMyProfiles()` et renvoie une décision typée (`anonymous` / `host-needed` / `single-agency` / `multi-agency`) + une URL cible.
- Page `/publish` (`takussan-web/src/app/publish/page.tsx`) consomme le hook et exécute `router.replace()` vers la cible. Affiche un état de chargement (loader + texte rassurant) en attendant la résolution.
- Persistance d'intent : `localStorage` via helper `publish-intent.ts` (clé `publishIntent`, TTL 30 min). Sur la page `/publish`, la résolution successful nettoie l'entrée. Sert de fallback OAuth quand le querystring `?redirect=/publish` peut être perdu.
- Bouton header (`Navbar.tsx`) : la version visiteur ET la version authentifiée pointent désormais vers `/publish` ; la persistance d'intent est posée via `onClick`.
- Stub `/onboarding/host` créé pour absorber la décision `host-needed` jusqu'à TCK-255.
- Tests : 5 cas unitaires sur le hook (anonymous, customer sans agence, single agency, multi agency, profil agent avec agency).
