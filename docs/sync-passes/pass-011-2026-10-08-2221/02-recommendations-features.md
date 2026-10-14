# 02 — Recommandations à `features.md`

> Passe 011 — 2026-10-08 22:21. `docs/features.md` sha1 `feb6a6c9`.
> Le versant features n'a **aucun ❌** : chaque ligne P0-P2 a un support en base. Les 64 ⚠️ par dérive
> se résorbent dans `models-spec.md` (`03-…`), pas ici. Ce fichier ne porte que ce que le catalogue
> lui-même dit de faux, de périmé ou de contradictoire — 13 recommandations.

---

## A. Ce qui est faux aujourd'hui (à corriger en premier)

### F1 — §2.1, note « Profils & contexte actif » (l.472) : le courtier a quitté la base

**Constat.** La note écrit que `BrokerProfile` et `BrokerAgencyCollaboration` « restent décrits par
`models-spec.md` et vivent en base », et cite `license_number` « par AgentProfile/BrokerProfile ».
Les deux tables sont supprimées par `2026_10_07_090100_drop_broker_tables` (TCK-586) ; ADR-0030
remplace ADR-0027, et `features.md` ne la cite nulle part.

**Proposition.** Réécrire la note au passé : le courtier n'a jamais eu de produit, il a quitté la
surface (ADR-0027) puis le code et la base (ADR-0030, TCK-586). Retirer « /BrokerProfile » de la
phrase sur le KYC. C'est l'item « réécrire la note de §2.1 » de TCK-586, non appliqué.

### F2 — En-tête (l.5) : « Base : les 28 modèles de `models-spec.md` »

**Constat.** La spec compte 87 sections ; le chiffre est faux depuis la passe 006.

**Proposition.** Retirer le nombre : « Base : les modèles de `models-spec.md` ». *Un compte écrit à
la main dans un document d'entrée finit faux* (CLAUDE.md, J-01).

### F3 — §2.2 l.518 : « le mécanisme reste à concevoir »

**Constat.** La ligne P1 « Éditeur de rôles personnalisés » dit que le mécanisme reste à concevoir.
Les tables `agency_roles` et `agency_role_capabilities` existent, et `agency_role_id` est NOT NULL
sur les profils agent, admin d'agence et bailleur (`2026_08_16_120000` à `120400`) et sur les
collaborations prestataire (`2026_08_17_090000` à `090200`). La ligne suivante (l.519, TCK-587)
parle déjà de l'éditeur au présent.

**Proposition.** Remplacer la fin de la ligne par l'état mesuré : un rôle personnalisé est un
`AgencyRole` porté par l'agence, chaque profil en désigne un. Ce qui reste à livrer, s'il en reste,
se nomme par son ticket — à mesurer avant d'écrire, la passe n'a pas relevé les écrans.

### F4 — §1.1 l.84 : « permissions granulaires » d'un collaborateur

**Constat.** Aucune colonne `permissions` n'existe sur `property_collaborators`
(`2026_04_17_160008` : `role`, `commission_share`, `invited_at`, `accepted_at`, `metadata`). La
granularité est portée par `role` (`CollaboratorRole`).

**Proposition.** Remplacer « permissions granulaires » par « un rôle (gestionnaire, co-propriétaire,
agent, lecteur) ». Si des permissions fines par collaborateur sont voulues, c'est une fonctionnalité
à ouvrir par ticket, pas une phrase à garder.

---

## B. Ce qui manque au catalogue

### F5 — §1.1 et §1.12 : choisir l'agent principal d'un bien (TCK-504, TCK-603)

**Constat.** TCK-504 a livré le choix de l'agent principal (`property_collaborators.is_primary`, un
seul par bien, rôle `agent` obligatoire — ADR-0053) et ses `spec_refs` visent §1.1 et §1.12. Aucune
ligne ne le dit. Trois lignes en dépendent sans le nommer : l.86 « Réattribuer un bien », l.96
« réattribuer change l'agent responsable », l.425 « biens dont il est responsable ».

**Proposition.**
- Ajouter en §1.1 une ligne P1, acteurs 🧑‍💼🛡️ : « Désigner l'agent principal d'un bien parmi ses
  collaborateurs agents : la fiche publique le nomme et reçoit les demandes ; un seul par bien
  (TCK-504) ».
- Dans l.86, l.96 et l.425, dire une fois ce qu'est « l'agent responsable » : le collaborateur
  principal (ADR-0036), et citer TCK-603 là où il a changé la réattribution.

### F6 — §1.7 l.262 : la règle de joignabilité (TCK-565)

**Constat.** TCK-565 a laissé à `/sync-specs` la « règle de joignabilité ». `features.md` §1.7 cite
TCK-565 et TCK-576 pour le choix des participants d'un groupe (l.267), mais ne dit pas **qui** peut
être contacté. Une seule règle sert la liste, la création d'un groupe et l'ajout de participants.

**Proposition.** Ajouter à l.262 (ou en ligne P1 voisine) : « On ne joint qu'un contact joignable :
un correspondant (conversation partagée), un lien CRM, l'équipe active de son agence — et ses
bailleurs actifs pour l'équipe seulement » (TCK-565).

### F7 — §2.9 l.660 : un webhook de paiement par intégration (TCK-293, ADR-0046)

**Constat.** La ligne « Gestion des intégrations tierces (API keys) » ne dit pas ce que TCK-293 a
changé : chaque intégration de paiement a sa propre URL de webhook, porteuse d'un jeton secret
haché en base ; le secret d'une agence ne valide plus le webhook d'une autre.

**Proposition.** Compléter la ligne : « chaque intégration de paiement reçoit ses webhooks sur une
URL propre à jeton secret, rotatif et jamais journalisé ; un webhook n'agit que dans l'agence de son
intégration (TCK-293) ».

---

## C. Priorités incohérentes

### F8 — §1.4 l.195 « Espace locataire dédié » (P3)

**Constat.** Le contenu annoncé (quittances, factures, maintenance) est livré par des lignes P1/P2 :
§2.5 l.578-580, §1.4 l.186, l.192, §1.8 l.281.

**Proposition.** Retirer la ligne, ou la réécrire sur ce qui manque réellement (à mesurer) en
gardant P3.

### F9 — §1.5 l.227 « Commissions automatiques par agent / collaborateur » (P3)

**Constat.** Le grand livre des commissions est généré automatiquement à l'activation du bail
(`CommissionEntry`, §85, ADR-0049, TCK-595) ; l.228 en livre le relevé.

**Proposition.** Fusionner l.227 dans l.228 et les remonter au niveau de ce qui est livré, ou dire
ce qui reste P3 (par exemple le versement à l'agent, s'il n'est pas couvert par « payée à l'agent »).

### F10 — §2.3 l.540 et l'intertitre « Canal WhatsApp sortant (P3) »

**Constat.** l.534 (P1, TCK-588) active WhatsApp par défaut pour quatre familles ; l.540 garde
« Notifications WhatsApp » en P3, et l'intertitre l.542 dit « (P3) ».

**Proposition.** Retirer l.540 et le « (P3) » de l'intertitre, ou restreindre l.540 à ce qui reste
futur (l'*inbound*, que l'intertitre met déjà hors périmètre).

### F11 — §1.7 l.268 « Accusés de lecture individuels (si > 5 participants) » (P2)

**Constat.** `models-spec.md` EF5 « refusé pour l'instant » : aucun modèle ne porte une lecture par
message, et aucun n'est prévu tant que le déclencheur n'est pas atteint.

**Proposition.** Passer la ligne en P3 et la lier au déclencheur d'EF5, ou rouvrir EF5 par ticket.

### F12 — §1.10 l.362 « Signature électronique intégrée » (P3) face à §1.4 l.194 (P2)

**Constat.** La signature du bail par code à usage unique est livrée (§1.4 l.194, `LeaseSignature`,
ADR-0042) et dit remplacer « la ligne P3 Signature électronique du bail ». La ligne P3 de §1.10 reste,
sans dire qu'elle ne vise plus que les **autres** documents.

**Proposition.** Préciser l.362 : « … pour les documents autres que le bail ».

### F13 — §1.12 l.433 « Absence datée d'un agent » (P3)

**Constat.** Le support existe : `role_delegations.replaces_user_id`
(`2026_10_07_591400`, ADR-0035 « l'absence est une délégation qui n'accorde rien »).

**Proposition.** Mesurer si la ligne est livrée (TCK-591) ; si oui, l'aligner sur sa priorité réelle
et citer ADR-0035. `models-spec.md` EF8 est traité en M37.

---

## Justifications reconduites

Les 23 lignes P3 hors périmètre de `01-correlation-matrix.md` §A.3 restent justifiées. Aucune ligne
P0 ou P1 n'est sans support en base.
