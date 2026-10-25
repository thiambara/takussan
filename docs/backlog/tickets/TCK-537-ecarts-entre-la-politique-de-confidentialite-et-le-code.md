---
id: TCK-537
title: "La politique de confidentialité promet quatre choses que le code ne fait pas encore (preuve du consentement, effacement des profils, purges, auteur des avis)"
status: todo
phase: P1
family: bug
estimate: L
wave: 66
created: 2026-09-17
updated: 2026-10-25
depends_on: [TCK-531]
blocks: []
spec_refs:
  features:
    - docs/features.md#210-pages-légales-publiques
    - docs/features.md#21-authentification--comptes
    - docs/features.md#26-audit--traçabilité
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#1-user
tags: [back, front, légal, données-personnelles, conformité]
---

## Objectif utilisateur

Que ce que la politique de confidentialité et les CGU affirment soit vrai. Un texte juridique qui
promet un effacement ou une purge que le code n'exécute pas engage l'éditeur devant la CDP (loi
n° 2008-12) et devant l'utilisateur.

## Contrat de données

Relevé le 2026-09-17 en rédigeant les textes de TCK-531 (`takussan-web/src/content/legal/`). La
règle de rédaction retenue : **le texte énonce l'engagement que la loi impose, et l'écart est
tracé ici** — plutôt que d'écrire une politique qui décrirait un défaut comme une règle.

| Engagement écrit | Où | Ce que fait le code (2026-09-17) |
|---|---|---|
| **Preuve du consentement** conservée « le temps du consentement, puis 5 ans » | `privacy.ts` §6 | `cgu_accepted` (assistant hôte) et `terms_accepted` (offre) sont **validés puis jetés** ; `RegisterRequest` ne porte **aucune** case CGU alors que le front en affiche une obligatoire (`app/Http/Requests/Auth/RegisterRequest.php`) |
| À la suppression, « les données d'identification du compte **et des profils** sont effacées ou anonymisées » | `privacy.ts` §6, `terms.ts` §17.1 | `AccountDeletionService` anonymise `users` et les médias du compte, **pas** les profils : RIB, `tax_id`, type et numéro de pièce, revenu, employeur de `OwnerProfile` restent en base |
| Journal d'activité : **12 mois** ; journaux de sécurité et de preuve : **5 ans** ; journaux des pièces comptables : **10 ans** (durées par famille, décision du porteur du 2026-10-25 sur P19.04) | `privacy.ts` §6 | **tenu** par TCK-2342 : `audit:prune-activity-log`, par famille de `log_name`, planifiée chaque jour. Relevé du 2026-09-17 : `activitylog:clean` n'était pas planifiée, rien n'était jamais purgé |
| Pièces KYC : la relation **+ 5 ans** ; demandes de contact anonymes : **3 ans** | `privacy.ts` §6 | aucune purge |
| Notifications in-app lues : **6 mois** après leur lecture (ajout du 2026-10-18, décision du porteur sur P19.06) | `privacy.ts` §6 | **tenu** par TCK-918 : `notifications:prune-read`, planifiée chaque jour |
| Avis publics : le texte dit (vrai) « prénom, nom et photo » | `privacy.ts` §4.1 | `ReviewResource` expose le nom complet et l'avatar. **Recommandation** : prénom + initiale, par minimisation (loi 2008-12, principe de proportionnalité) — puis corriger le texte |

Écarts **hors** politique, relevés au passage, à trancher :

- Les métadonnées EXIF (dont la position GPS des photos) : `config/media-library.php` prévoit
  `jpegoptim --strip-all`, mais le `Dockerfile` n'installe pas `jpegoptim`. Une photo de bien
  prise au téléphone peut publier la position du domicile de l'hôte.
- Jetons Sanctum **sans expiration** (`config/sanctum.php`), alors que le cookie qui les porte vit
  7 jours : un jeton fuité reste valide indéfiniment.
- `ipapi.co` reçoit l'IP de tout visiteur au premier affichage, **avant** tout geste de sa part
  (`UserLocationProvider.tsx`). Déclaré dans la politique ; à confirmer comme choix produit.
- Adresses divergentes : `support@takussan.app` dans `HostIndividualWizard.tsx`, « Takussan.sn »
  dans le message pré-rempli de `PublicPropertyController::contact` ; les textes citent
  `contact@`, `privacy@`, `legal@takussan.com`.
- Le code de vérification du téléphone n'est **envoyé par aucun canal** (pilote `log-stub`,
  `PhoneVerificationService`).

## Contraintes strictes (métier)

1. Un paiement, une facture, un reversement ou une pièce comptable se conserve **10 ans** (Acte
   uniforme OHADA relatif au droit comptable) : l'effacement des profils ne touche pas ces lignes,
   il les détache de l'identité.
2. La suppression reste bloquée tant qu'un bail est actif (comportement actuel, stipulé à
   l'article 17.1 des CGU).
3. La preuve du consentement porte **la version du texte acceptée** (`VERSION_DOCUMENTS` de
   `editeur.ts`, ou un identifiant qui en dérive), l'horodatage, et le document concerné.
4. Corriger le code, pas le texte — sauf décision écrite du porteur qui en change l'engagement.
5. **La purge du journal d'activité garde chaque famille de journaux sa durée** (décision du
   porteur du 2026-10-25, P19.04, qui remplace l'exemption de `PersonalDataAccess` et `Privacy`
   seuls posée le 2026-10-06 par TCK-601) :
   - **12 mois** par défaut, et pour tout journal qu'aucune liste ne nomme ;
   - **5 ans** pour `PersonalDataAccess`, `Privacy`, `Security`, `UserSupport`, `KYC`,
     `KycDossier`, `Account`, `Membership`, `AgencyRole`, `Integration` et `export` : ils prouvent
     qui a consulté une donnée personnelle, comment une demande de droits a été traitée, et les
     gestes de sécurité, de support, d'identité, de compte et de rôle ;
   - **10 ans** pour les pièces comptables (`LeasePayment`, `BookingPayment`, `Invoice`, `Payout`,
     `PlatformPayout`, `CommissionEntry`, `Billing`), la durée de la contrainte 1.

   Une purge à 365 jours qui les effacerait détruirait la preuve que TCK-601 crée.

## Delta à produire

- [ ] Modèle et migration de preuve de consentement (utilisateur ou contact anonyme, document,
      version, horodatage, IP) ; écriture à l'inscription, à l'assistant hôte, à la demande de
      réservation et à l'offre. `RegisterRequest` exige la case.
- [ ] `AccountDeletionService` : anonymiser les champs identifiants de chaque profil du compte.
- [x] Purge du journal d'activité par famille (contrainte 5) : `audit:prune-activity-log`,
      planifiée chaque jour, `docs/models-spec.md` § 13 mis à jour — fait par TCK-2342 (2026-10-25).
- [ ] Purges KYC (+5 ans après la fin de la relation) et demandes de contact anonymes (3 ans) ;
      `docs/models-spec.md` mis à jour.
- [ ] Décision produit sur l'auteur d'un avis public ; texte aligné.
- [ ] Tickets à part, ou décision écrite de ne pas les traiter, pour chacun des cinq écarts hors
      politique.

## Critères d'acceptation

- [ ] AC1 — Une inscription sans la case CGU est refusée (422) ; une inscription acceptée crée une
      preuve portant la version en vigueur. Ablation : retirer l'écriture → rouge.
- [ ] AC2 — Après suppression effective d'un compte propriétaire, aucune colonne identifiante de
      son `OwnerProfile` ne porte sa valeur d'origine ; ses paiements existent toujours.
- [ ] AC3 — `php artisan schedule:list` montre la purge du journal d'activité et les deux purges
      ajoutées ; un test prouve chacune par ablation.
- [x] AC3b — Une ligne de chacun des onze journaux de preuve datée de 400 jours survit à la purge
      planifiée, quand une ligne `default` de 12 mois et un jour disparaît ; à 5 ans et un jour, elle
      disparaît. Une ligne de chacun des sept journaux de pièces comptables survit à 5 ans et un jour,
      et disparaît à 10 ans et un jour. Ablation : retirer un nom d'une liste → son cas rougit. Tenu
      par `tests/Feature/Console/PruneActivityLogCommandTest.php` (TCK-2342).
- [ ] AC4 — Chaque ligne du tableau « Contrat de données » est vraie, ou le texte juridique a été
      changé sur décision écrite du porteur, avec `VERSION_DOCUMENTS` avancée.

## Hors périmètre

- La déclaration à la CDP et la relecture par un avocat : gestes du porteur (README de
  `takussan-web/src/content/legal/`).

## Notes d'implémentation

- **2026-10-25 — la purge du journal d'activité est faite** (TCK-2342, P19.04) :
  `audit:prune-activity-log`, par famille de `log_name` (12 mois, 5 ans, 10 ans, contrainte 5), par
  lots, idempotente, planifiée chaque jour à 04:10 (Dakar) ; `privacy.ts` § 6 donne les trois
  durées. Le ticket reste `todo` pour ses autres parties : preuve du consentement, effacement des
  profils, purges KYC et demandes de contact anonymes, auteur des avis, écarts hors politique.
  `activitylog:clean` du paquet reste enregistré, non planifié : lancé à la main, il purgerait tout
  à 365 jours.
