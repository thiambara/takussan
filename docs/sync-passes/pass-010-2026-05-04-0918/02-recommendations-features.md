# 02 — Recommandations features.md

> Passe 010 — 2026-05-04 09:18 UTC
> `docs/features.md` est inchangé depuis pass-009 (sha1 `b6902e37`).

**Aucun changement recommandé.**

Le catalogue fonctionnel reste complet et cohérent. Les recommandations de pass-009 sur ce versant sont toujours valides : zéro recommandation actionnable.

Tous les ⚠️ côté features sont justifiés (P3 / applicatif pur / hors périmètre MVP), cf. tableau de pass-009 §02. Reproduit ci-dessous pour traçabilité :

| Feature | Justification |
|---------|---------------|
| §1.1 P2 « Modération avant publication » | Applicatif — pas de file/modèle nécessaire pour le MVP |
| §1.1 P3 « Import CSV / API externe » | Hors périmètre MVP |
| §1.1 P3 « Estimation IA » | Hors périmètre MVP |
| §1.2 P2 « Comparateur de biens » | Applicatif pur |
| §1.2 P2 « Suggestions personnalisées » | Applicatif pur |
| §1.2 P3 « Recherche vocale » | Hors périmètre MVP |
| §1.3 P3 « Annulation avec remboursement auto » | Partiel — `BookingPayment.refund_amount` existe, workflow = futur |
| §1.4 P2 « Révision annuelle du loyer » | Applicatif via ActivityLog |
| §1.4 P3 « Signature électronique » | Hors périmètre MVP |
| §1.5 P2 « Passerelle de paiement » | Partiel — `Integration` existe, intégrations réelles à venir |
| §1.5 P3 « Commissions automatiques » | Évolution future documentée |
| §1.5 P3 « Comptabilité exportable » | Hors périmètre MVP |
| §1.6 P3 « Campagnes email/SMS » | Hors périmètre MVP |
| §1.7 P3 « Appels audio/vidéo » | Hors périmètre MVP |
| §1.7 P3 « Traduction auto » | Hors périmètre MVP |
| §1.8 P2 « Demande de devis » | Applicatif |
| §1.8 P3 « Facturation directe prestataire » | Partiel — `Invoice` existe |
| §1.8 P3 « Contrats de maintenance » | Hors périmètre MVP |
| §1.9 P3 « Comparaison auto entrée/sortie » | Hors périmètre MVP |
| §1.9 P3 « Reconnaissance IA dégradations » | Hors périmètre MVP |
| §1.10 P3 « Signature électronique intégrée » | Hors périmètre MVP |
| §1.10 P3 « OCR » | Hors périmètre MVP |
| §1.11 P3 « Détection auto avis suspects » | Hors périmètre MVP |
| §1.11 P3 « Badges de réputation » | Hors périmètre MVP |
| §1.12 P3 (×4) | Hors périmètre MVP |
| §2.1 P3 « Magic link » | Hors périmètre MVP |
| §2.2 P2 « Délégation temporaire » | Applicatif |
| §2.2 P3 « Règles conditionnelles » | Applicatif (Laravel policies) |
| §2.3 P2 « Digest » | Applicatif (job planifié) |
| §2.3 P3 « WhatsApp » | Canal listé, pas d'implémentation |
| §2.4 P2 « Autocomplétion » | Applicatif |
| §2.4 P3 « Recherche sémantique » | Hors périmètre MVP |
| §2.5 (×8 P1–P3) | Applicatif pur — requêtes d'agrégation |
| §2.6 P2 « Export audit » | Applicatif |
| §2.6 P3 « Alertes actions sensibles » | Hors périmètre MVP |
| §2.7 P2 (×2), P3 | Partiel/applicatif/hors périmètre |
| §2.8 P3 (×2) | Hors périmètre MVP |
| §2.9 P3 (×2) | Hors périmètre MVP |

Aucune feature P0/P1 sans modèle. Aucune feature à reformuler.
