---
id: TCK-115
title: Super_admin sans agence — états vides sur overview, bookings, leases, visits
status: done
phase: P1
family: bug
estimate: M
wave: 13
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#112-agence--équipe
tags: [front, bug, p1, super-admin, permissions]
---

## Objectif utilisateur

Le super_admin (sans `agency_id`) peut naviguer dans l'ensemble du back-office sans recevoir d'erreur 403 ou de message "Impossible de charger".

## Contrat de données

Endpoints affectés (retournent 403 pour super_admin sans agence) :
- `GET /api/agencies/{id}/stats` (overview/agency)
- `GET /api/bookings` (bookings list)
- `GET /api/leases` (leases list)
- `GET /api/visits` (visits list)
- KPI endpoints du dashboard (`/api/dashboard/kpis` ou équivalent)

Le backend applique le scope Spatie Permission team (`agency_id`) — un super_admin sans agence liée reçoit systématiquement 403 sur ces endpoints.

## Direction UX / Artistique

Remplacer les messages d'erreur "Impossible de charger" et les crashs par un état vide explicatif : illustration neutre + message "Aucune agence associée à ce compte" + CTA si applicable. Le super_admin doit comprendre la situation sans que la page plante.

## Contraintes strictes (métier)

- Ne pas modifier les guards backend — la 403 est le comportement correct pour ce rôle sans agence.
- La détection doit se faire côté client (vérifier `user.agency_id === null` avant d'appeler l'endpoint) ou en interceptant la 403 avec un empty state dédié.
- Les utilisateurs avec une agence liée ne doivent subir aucune régression.

## Delta à produire

- [ ] `src/app/(dashboard)/app/overview/agency/page.tsx` — intercepter le 403 API et afficher un empty state "Aucune agence associée"
- [ ] `src/app/(dashboard)/app/bookings/page.tsx` — idem
- [ ] `src/app/(dashboard)/app/leases/page.tsx` — idem
- [ ] `src/app/(dashboard)/app/visits/page.tsx` — idem
- [ ] Dashboard `/app` — KPIs : afficher `0` ou `—` avec tooltip explicatif plutôt que les laisser vides sans indication

## Critères d'acceptation

- [ ] Un super_admin sans agence accède à toutes les pages sans erreur runtime ni message rouge
- [ ] Un empty state explicatif s'affiche sur les pages impactées
- [ ] Les KPIs du dashboard affichent un état cohérent (pas de `—` silencieux)
- [ ] Un agent d'agence normale ne voit aucune différence de comportement

## Hors périmètre

- Associer une agence à un super_admin via l'interface (gestion de profil admin)
- Modifier les guards backend pour permettre au super_admin d'accéder aux données de toutes les agences

## Notes d'implémentation

Guard `isSuperAdmin(user.roles) && !user.agency_id` ajouté côté RSC dans les 5 pages (`/app`, `/app/overview/agency`, `/app/bookings`, `/app/leases`, `/app/visits`). La garde empêche le montage des composants client → aucun hook `useQuery` déclenché → aucune 403 réseau. Composant `NoAgencyState` créé dans `src/components/shared/`. CTA lien `/admin` via `buttonVariants` (pas `asChild` — `@base-ui/react/button` ne le supporte pas).
