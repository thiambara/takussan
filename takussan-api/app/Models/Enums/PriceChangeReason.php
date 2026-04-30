<?php

namespace App\Models\Enums;

enum PriceChangeReason: string
{
    case MarketAdjustment = 'market_adjustment';
    case Negotiation = 'negotiation';
    case Renovation = 'renovation';
    case UrgentSale = 'urgent_sale';
    case Seasonal = 'seasonal';
    case Correction = 'correction';
}
