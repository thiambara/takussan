---
id: TCK-2676
title: "Des mots et non des codes : la matrice des rôles, les intégrations et le journal d'audit"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
    - "docs/features.md#26-audit--traçabilité"
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [front, roles, i18n, audit-ux, app]
---

## Objectif utilisateur

Le gérant d'agence lit ses droits, ses intégrations et son journal dans sa langue, sans `payments.reconcile`, `Client secret` ni `AgentProfile #20`.

## Contrat de données

Aucun endpoint neuf. Rôles : catalogue des capacités et éditeur existants (`AgencyRolesConsole`, `CapabilityMatrix`) ; intégrations : `IntegrationsManager` ; journal : `AuditTrail` et les libellés existants `admin.audit.subjects.*`.

## Direction UX / Artistique

- Pas de maquette : décision 6 (a) de la famille (« retirer les codes de l'écran, garder des phrases, les codes en infobulle pour le support »), validée avec les recommandations le 2026-11-10, et constats de l'audit (`docs/qa/audit-ux-2026-11/06-agence.md` § 3, § 11, § 12, « Transversal »).
- Rôles : le libellé seul sous chaque case ; le code au survol (et lisible au lecteur d'écran) pour le support ; les capacités « sans effet pour l'instant » passent en bas de leur domaine, non cochables, hors du compte « N sur M ». Le champ « Description » d'un rôle système, désactivé, ne montre plus de texte d'invitation à écrire.
- Intégrations : libellés en français (« Identifiant client », « Secret client », « Nom d'utilisateur », « Mot de passe », « Nom d'expéditeur (11 caractères) »…), sous-titre sans « Providers », dates sans les secondes, suppression avec un libellé (plus une icône de poubelle seule collée à « Configurer »).
- Journal : objets nommés par leur libellé (« Agent n° 20 », « Réservation n° 276 »…), actions en phrases (plus `booking_expired`), dates au format commun.
- Téléphone : la matrice se lit domaine par domaine en accordéon, sans défilement horizontal ; au bureau, inchangée hormis les codes.

## Contraintes strictes (métier)

- Aucune capacité, aucun droit, aucun geste ne change : seuls les textes et l'ordre d'affichage bougent. La garde « sans effet pour l'instant » reste celle du catalogue (`features.md` § 2.2).
- Les secrets d'intégration ne sont jamais réaffichés (« laissez vide pour conserver ») ; l'adresse de notification, « Copier », « Régénérer » (confirmation) et « Tester la connexion » restent.
- Le journal garde ses filtres (du / au, action, type d'objet, membre, recherche), son export et ses liens vers les objets.
- i18n `fr` / `en` / `wo` (`wo` = texte français) ; la garde i18n ne voit pas les valeurs d'énumération rendues telles quelles : un test vérifie qu'aucune n'est rendue brute.

## Delta à produire

- [ ] Matrice des rôles : codes en infobulle, capacités sans effet non cochables et hors compte, description d'un rôle système.
- [ ] Libellés des champs et du sous-titre des intégrations ; dates ; suppression libellée.
- [ ] Libellés des objets et des actions du journal ; dates.
- [ ] Tests : aucun code de capacité dans le texte visible de la matrice ; capacité sans effet non cochable ; aucun libellé anglais dans le dialogue d'une intégration Orange Money ; aucune valeur brute d'action dans le journal.

## Critères d'acceptation

- [ ] AC1 — Le texte visible de la matrice ne contient aucune chaîne de la forme `domaine.verbe` ; le survol d'une case la montre.
- [ ] AC2 — « 46 sur 46 capacités accordées » devient le compte des seules capacités qui ont un effet ; une capacité sans effet a sa case désactivée et sa raison à côté.
- [ ] AC3 — Le dialogue « Orange Money » n'affiche ni « Client ID », ni « Client secret », ni « Sender ».
- [ ] AC4 — Une ligne du journal pour une réservation expirée n'affiche ni `booking_expired` ni `Booking #276`.

## Hors périmètre

- La lecture « par personne » des droits et les modèles de rôle prêts à l'emploi (propositions de l'audit sans maquette).
- L'état de santé d'une intégration (paiements confirmés, notifications refusées) : sans maquette retenue.
- Le journal en phrases avec la différence avant / après (« quoi a changé ») : demande une donnée que l'écran n'a pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_
