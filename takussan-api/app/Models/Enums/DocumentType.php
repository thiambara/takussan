<?php

namespace App\Models\Enums;

enum DocumentType: string
{
    case IdCard = 'id_card';
    case Passport = 'passport';
    case LeaseContract = 'lease_contract';
    case Receipt = 'receipt';
    case Invoice = 'invoice';
    case Insurance = 'insurance';
    case InventoryReport = 'inventory_report';
    case Photo = 'photo';
    // TCK-257 — owner KYC documents (RIB scan + NINEA tax ID).
    case Rib = 'rib';
    case Ninea = 'ninea';
    // TCK-2909 — le mandat de gestion signé, déposé par l'agence sur le profil du bailleur.
    case ManagementMandate = 'management_mandate';
    case Other = 'other';
}
