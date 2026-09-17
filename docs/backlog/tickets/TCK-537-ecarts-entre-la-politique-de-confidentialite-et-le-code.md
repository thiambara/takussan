---
id: TCK-537
title: "La politique de confidentialité promet quatre choses que le code ne fait pas encore (preuve du consentement, effacement des profils, purges, auteur des avis)"
status: todo
phase: P1
family: bug
estimate: L
wave: 66
created: 2026-09-17
updated: 2026-09-17
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
| Journal d'activité : **12 mois** | `privacy.ts` §6 | `config/activitylog.php` → `clean_after_days = 365`, mais `activitylog:clean` **n'est pas planifiée** (`routes/console.php`) : rien n'est jamais purgé |
| Pièces KYC : la relation **+ 5 ans** ; demandes de contact anonymes : **3 ans** | `privacy.ts` §6 | aucune purge |
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

## Delta à produire

- [ ] Modèle et migration de preuve de consentement (utilisateur ou contact anonyme, document,
      version, horodatage, IP) ; écriture à l'inscription, à l'assistant hôte, à la demande de
      réservation et à l'offre. `RegisterRequest` exige la case.
- [ ] `AccountDeletionService` : anonymiser les champs identifiants de chaque profil du compte.
- [ ] Planifier `activitylog:clean` ; purges KYC (+5 ans après la fin de la relation) et demandes
      de contact anonymes (3 ans) ; `docs/models-spec.md` mis à jour.
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
- [ ] AC4 — Chaque ligne du tableau « Contrat de données » est vraie, ou le texte juridique a été
      changé sur décision écrite du porteur, avec `VERSION_DOCUMENTS` avancée.

## Hors périmètre

- La déclaration à la CDP et la relecture par un avocat : gestes du porteur (README de
  `takussan-web/src/content/legal/`).

## Notes d'implémentation
