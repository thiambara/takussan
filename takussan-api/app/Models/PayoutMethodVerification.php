<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-594 (ADR-0039 §6, VERIF-594 M-6) — une destination de paiement vérifiée PAR UNE AGENCE.
 *
 * Une vérification ne vaut que pour l'agence au nom de laquelle son membre l'a faite : c'est elle qui
 * paie. Une destination modifiée perd toutes ses vérifications ; on ne la lit jamais par l'API
 * autrement qu'à travers `PayoutMethodResource`.
 */
class PayoutMethodVerification extends AbstractModel
{
    protected $fillable = ['agency_id', 'payout_method_id', 'verified_by_id', 'verified_at'];

    protected $casts = [
        'verified_at' => 'datetime',
    ];

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function payoutMethod(): BelongsTo
    {
        return $this->belongsTo(PayoutMethod::class);
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by_id');
    }
}
