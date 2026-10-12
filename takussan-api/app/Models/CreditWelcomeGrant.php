<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;

/** TCK-633 lot F (ADR-0061 §3) — le registre « une offre de bienvenue par numéro ». */
class CreditWelcomeGrant extends AbstractModel
{
    protected $fillable = ['phone_hash', 'agency_id', 'user_id', 'credit_lot_id', 'granted_at'];

    protected $casts = ['granted_at' => 'datetime'];
}
