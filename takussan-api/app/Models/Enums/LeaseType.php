<?php

namespace App\Models\Enums;

enum LeaseType: string
{
    case ResidentialRent = 'residential_rent';
    case CommercialRent = 'commercial_rent';
    case SeasonalRent = 'seasonal_rent';
    case Sale = 'sale';
}
