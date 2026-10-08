<?php

namespace App\Models\Contracts;

use App\Services\Audit\AuditAgencyResolver;

/**
 * TCK-601 (ADR-0044 §3) — un modèle qui n'a pas de colonne `agency_id` mais appartient à une agence
 * par son PARENT (un paiement de loyer par son bail, une ligne de relevé par son relevé, un dossier
 * KYC par l'agence qu'il vérifie). {@see AuditAgencyResolver} le lit pour poser l'agence d'une
 * activité dont il est le sujet.
 */
interface HasAuditAgency
{
    public function auditAgencyId(): ?int;
}
