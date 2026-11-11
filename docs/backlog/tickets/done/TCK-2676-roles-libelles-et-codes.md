---
id: TCK-2676
title: "Des mots et non des codes : la matrice des rôles, les intégrations et le journal d'audit"
status: done
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-11
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

**Re-mesure (2026-11-11).**

- Le catalogue compte **49** capacités (`Capability.php`), et non 46 : `owners.update` (TCK-2640, non commité au moment de la mesure) n'avait **ni libellé ni domaine** côté front. Il s'affichait donc en code brut. Les clés `admin.roles.capabilities.owners.update` et `admin.roles.domains.owners` sont ajoutées ici.
- Les capacités sans effet sont au nombre de **6** dans l'inventaire (`CapabilityEnforcementInventory::AWAITING`). Deux sont aussi réservées à la plateforme. La messagerie n'a **aucune** capacité attribuable, et son en-tête lisait « 0/0 » : il lit désormais « Sans effet pour l'instant ».
- Journal : sur la démo, `activity_log` filtré par `agency_id` rend **15** événements et **17** types d'objet. Seuls 4 types et 13 événements avaient un libellé.
- L'API écrit **184** valeurs littérales `->event('…')`, plus des noms passés par ternaire, par constante `…EVENT` ou par variable (passation d'un agent : `tasks`, `visits`… ; collaborations de prestataire). Tous ceux qu'une agence lit ont désormais leur phrase sous `admin.audit.events.*`. Restent exclus ceux de la plateforme : `super_admin_*`, `radar_*`, `ops_*`, `search_alias_*`.
  - Un point du code y devient `_` (`property.report_resolved` → `property_report_resolved`).
  - Le test de parité voit les littéraux, les ternaires et les constantes. Il ne voit pas les noms passés par variable, dont les libellés sont posés à la main.

**Choix.**

- **Matrice.** Le code n'est plus affiché : il passe dans le `title` de la ligne et de la case (description accessible). Une capacité absente du dictionnaire se lit « Autre capacité », au lieu du code brut.
  - Une capacité sans effet a sa case désactivée et sa raison écrite à côté. Elle passe en bas de son domaine et sort des comptes.
  - **Aucun droit ne change** : une capacité sans effet déjà accordée reste dans la valeur émise par « Tout cocher » et « Tout décocher ».
  - Conséquence : elle ne peut plus être retirée d'un rôle depuis l'écran. Elle ne fait rien, mais il faudra la retirer le jour où son geste sera branché.
- **Téléphone.** La matrice était déjà un accordéon par domaine. Le constat de l'audit (5 600 px, défilement) venait de la ligne de code `break-all`, qui est retirée. Aucune logique de largeur d'écran n'est ajoutée. **Non mesuré au navigateur.**
- **Description d'un rôle.** Le texte d'invitation n'apparaît plus dès que le champ est en lecture seule : rôle système, ou absence de `roles.edit_custom`.
- **Intégrations.**
  - Libellés en français, sous-titre sans « Providers ». Le schéma de l'API publie des `label` anglais : l'écran ne les lit pas.
  - « URL de webhook », le champ générique d'un fournisseur sans adresse générée, est gardé. Il désigne l'URL que l'agence saisit, et ne doit pas se confondre avec l'« Adresse de notification » générée par Takussan.
  - Les messages de validation SMS (« Sender name… », « Host invalide ») sont aussi traduits.
  - Le nom du fournisseur (« Orange Money ») remplace `orange_money` dans le titre du dialogue, la confirmation et le nom accessible de la suppression.
  - La suppression a un libellé visible, poussée au bout de la rangée. Les dates passent par `formatDateTime`, sans secondes.
- **Journal.**
  - `KNOWN_AUDIT_EVENTS` et `KNOWN_SUBJECT_TYPES` sont **inchangés** : ce sont les filtres. `libelleEvenementAudit` (partagé avec la console de la plateforme) n'est pas touché.
  - Un événement sans clé se lit par sa description si c'est une phrase. Sinon il se lit « Autre action », le code au survol.
  - L'objet se lit « Réservation n° 276 », le nom du modèle au survol. Un type inconnu se lit « Autre objet n° N ».
  - Les libellés existants `subjects.*` sont gardés : « Profil d'agent n° 20 », et non « Agent n° 20 » comme dans l'exemple du ticket.
  - Date au format commun (`formatDateTime`).
  - Au passage, `events.kyc_expired` devient « Pièce justificative expirée » (plus « KYC »).

**Pour `/sync-specs`.** `features.md` § 2.2 (ligne TCK-587) décrit le signalement « sans effet pour l'instant ». Il faut y ajouter que ces cases ne sont plus cochables et sortent du compte (TCK-2676).

**Wolof.** Les `wo` déjà traduits sont conservés par l'outil de clés (ADR-0095 § 4). Plusieurs portent encore « Sender ID » ou « Host » (`fields.senderIdLam`, `fields.hostLam`, `validation.setting.*`) : à reprendre quand le wolof reprendra.
