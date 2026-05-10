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
    case Other = 'other';
}
