---
id: TCK-920
title: "Garde des lectures sous impersonation : chaque GET balayé sur une cible garnie, les fuites connues déclarées"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-697, TCK-821]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#83-impersonationsession-
  adr:
    - docs/adr/0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads"
tags: [back, securite, impersonation, test, pistes]
---

## Contexte

Réf : **P23.06** du fichier de pistes, `validé`.

`EnforceImpersonationReadOnly::REFUSED_READS` n'est tenue que par une consigne de docblock :
« toute route GET qui rend un secret durable ou une pièce d'identité entre ici, le jour où elle est
créée. Rien d'autre ne l'attrape. » P23.01 et P23.05 étaient deux lectures que la consigne aurait
dû couvrir. La correction de l'ADR (le code `impersonation.read_only`) est faite par TCK-723.

## Décision du porteur

la garde d'impersonation sur les GET, après P23.05

## Objectif utilisateur

Aucun changement visible. Une lecture neuve qui rend, sous impersonation, une pièce d'identité ou
un secret qui survit à la session fait rougir la CI.

## Contraintes strictes

- La session s'ouvre par la voie réelle (`POST /api/admin/users/{id}/impersonate`), sur une cible
  garnie : une pièce de profil téléversée par l'assistant, une fiche client avec un numéro de
  pièce, une retenue sur caution avec sa photo et sa notification.
- « Secret durable » au sens d'ADR-0055 §3 : ce qui ouvre encore quelque chose après la fin de la
  session. Une URL signée qui expire avant la session n'en est pas un.
- Aucun comportement de l'API ne change.

## Delta à produire

- [x] `takussan-api/tests/Feature/Admin/Platform/ImpersonationReadSweepTest.php` :
  - balaie chaque `GET /api/*` dont il remplit les paramètres ;
  - rougit sur quatre marqueurs : numéro de pièce, pièce de profil, `"token": "…"`, URL signée
    dont `expires` dépasse la fin de la session ;
  - `FUITES_TOLEREES` déclare les fuites connues et rougit quand l'une ne fuit plus ;
  - un témoin vérifie que la cible, sous son propre jeton, lit bien chaque marqueur ;
  - un test rougit sur tout paramètre de route ni rempli ni déclaré dans `PARAMETRES_NON_REMPLIS`.
- [x] Le docblock de `REFUSED_READS` cite la garde, et ce qu'elle ne voit pas.

## Critères d'acceptation

- [x] AC1 — Sous impersonation, aucune réponse 200 ne porte un marqueur hors `FUITES_TOLEREES`.
- [x] AC2 — Une fuite tolérée qui ne fuit plus fait rougir la garde.
- [x] AC3 — Sous son propre jeton, la cible lit les quatre marqueurs (fixture garnie).
- [x] AC4 — Une route `GET` neuve à paramètre inconnu fait rougir la garde.

## Hors périmètre

Le correctif des fuites relevées, déclarées dans `FUITES_TOLEREES` :
- le numéro de pièce du client par `customers`, `leases`, `bookings` (liste et fiche) : P23.03,
  `retenu · à valider` (V8) ;
- `GET /api/dashboard/tenant` liste les pièces des profils de la cible (`documents.recent` : nom et
  type), que TCK-697 retire de `GET /api/documents` sous impersonation ;
- `GET /api/leases/{lease}/deposit-refund` et `GET /api/notifications` rendent des URL signées de
  30 min (`PrivateMediaAccess::SIGNED_ROUTE_TTL_MINUTES`), plus longues que la session (15 min).

## Notes d'implémentation

- **Mesure avant** (sonde retirée depuis) : 286 routes `GET /api/*` ; sous la session, 100 réponses
  200, et les fuites listées en « Hors périmètre » ; aucun `"token"` en clair.
- **Hypothèse** : la garde doit être verte à la livraison ; les fuites trouvées relèvent de choix
  que la décision du porteur n'accorde pas (P23.03 est à valider, la durée des URL signées est
  celle de TCK-821). Elles sont donc déclarées, pas corrigées.
- **Ablation** :
  - `excludingProfilePieces()` retiré de `DocumentController::index` (TCK-697) → rouge :
    `GET api/documents : pièce de profil, URL signée qui survit à la session` ;
  - `api/notifications` retiré de `FUITES_TOLEREES` → rouge (fuite neuve) ;
  - `api/properties` ajouté à `FUITES_TOLEREES` → rouge (fuite tolérée qui ne fuit pas) ;
  - `tag` retiré de `PARAMETRES_NON_REMPLIS` → rouge (`api/tags/{tag}`) ;
  - remis → 3 verts.
- **Limites** : les routes dont un paramètre n'est pas rempli (36 noms déclarés) ne sont pas lues,
  et un secret sans marqueur (codes de secours, QR SVG de la 2FA) ne se voit pas : ceux-là restent
  tenus par `REFUSED_READS` et ses tests.
