<?php

namespace App\Models\Enums;

enum CustomerPipelineStage: string
{
    case Lead = 'lead';
    case Prospect = 'prospect';
    case Qualified = 'qualified';
    case Negotiating = 'negotiating';
    case Converted = 'converted';
    case Lost = 'lost';
}
