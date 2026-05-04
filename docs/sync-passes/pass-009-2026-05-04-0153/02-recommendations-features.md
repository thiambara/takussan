# 02 — Recommandations features.md

> Passe 009 — 2026-05-04

**Aucun changement recommandé.**

Le catalogue fonctionnel est complet et cohérent avec l'état actuel de `models-spec.md`. Les 9 features de la section "Profils & contexte actif" (§2.1) sont correctement formulées et couvertes. Les reformulations de §2.2 reflètent fidèlement l'architecture spatie teams + profils.

Tous les ⚠️ côté features sont justifiés :

| Feature | Justification |
|---------|---------------|
| §1.1 P2 "Modération avant publication" | Applicatif — pas de file/modèle de modération nécessaire pour le MVP |
| §1.1 P3 "Import CSV / API externe" | Hors périmètre MVP, déclencheur futur |
| §1.1 P3 "Estimation IA" | Hors périmètre MVP |
| §1.2 P2 "Comparateur de biens" | Applicatif pur — pas de modèle dédié nécessaire |
| §1.2 P2 "Suggestions personnalisées" | Applicatif pur |
| §1.2 P3 "Recherche vocale" | Hors périmètre MVP |
| §1.3 P3 "Annulation avec remboursement auto" | Partiel — refund_amount existe, workflow automatisé = futur |
| §1.4 P2 "Révision annuelle du loyer" | Applicatif via ActivityLog — pas de modèle dédié |
| §1.4 P3 "Signature électronique" | EF, hors périmètre MVP |
| §1.5 P2 "Passerelle de paiement" | Partiel — Integration existe, intégrations réelles à venir |
| §1.5 P3 "Commissions automatiques" | EF2 documentée |
| §1.5 P3 "Comptabilité exportable" | Hors périmètre MVP |
| §1.6 P3 "Campagnes email/SMS" | Hors périmètre MVP |
| §1.7 P3 "Appels audio/vidéo" | Hors périmètre MVP |
| §1.7 P3 "Traduction auto" | Hors périmètre MVP |
| §1.8 P2 "Demande de devis" | Applicatif — pas de modèle dédié |
| §1.8 P3 "Facturation directe prestataire" | Partiel — Invoice existe, workflow à venir |
| §1.8 P3 "Contrats de maintenance" | Hors périmètre MVP |
| §1.9 P3 "Comparaison auto entrée/sortie" | Hors périmètre MVP |
| §1.9 P3 "Reconnaissance IA dégradations" | Hors périmètre MVP |
| §1.10 P3 "Signature électronique intégrée" | Hors périmètre MVP |
| §1.10 P3 "OCR" | Hors périmètre MVP |
| §1.11 P3 "Détection auto avis suspects" | Hors périmètre MVP |
| §1.11 P3 "Badges de réputation" | Hors périmètre MVP |
| §1.12 P3 (×4) | Hors périmètre MVP |
| §2.1 P3 "Magic link" | Hors périmètre MVP |
| §2.2 P2 "Délégation temporaire" | Applicatif — pas de modèle |
| §2.2 P3 "Règles conditionnelles" | Applicatif — Laravel policies |
| §2.3 P2 "Digest" | Applicatif — job planifié |
| §2.3 P3 "WhatsApp" | Canal listé, pas d'implémentation |
| §2.4 P2 "Autocomplétion" | Applicatif — pas de modèle |
| §2.4 P3 "Recherche sémantique" | Hors périmètre MVP |
| §2.5 (×8 P1–P3) | Applicatif pur — requêtes d'agrégation |
| §2.6 P2 "Export audit" | Applicatif — pas de modèle |
| §2.6 P3 "Alertes actions sensibles" | Hors périmètre MVP |
| §2.7 P2 (×2), P3 | Partiel/applicatif/hors périmètre |
| §2.8 P3 (×2) | Hors périmètre MVP |
| §2.9 P3 (×2) | Hors périmètre MVP |

Aucune feature prioritaire (P0/P1) n'est sans modèle. Aucune ne requiert de reformulation.
