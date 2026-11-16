<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Privacy\ConsentLedger;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-537 (AC1) — la preuve qu'une personne a accepté UN document juridique, dans UNE version, à UN
 * instant, depuis UNE adresse. Ajout seul : écrite par {@see ConsentLedger},
 * jamais modifiée ; effacée 5 ans après la fin du compte (`account:prune-consent-proofs`).
 * N'est servie par aucune route.
 */
class ConsentProof extends AbstractModel
{
    public const DOCUMENT_TERMS = 'terms';

    public const DOCUMENT_PRIVACY = 'privacy';

    protected $fillable = ['user_id', 'document', 'version', 'context', 'ip_address', 'accepted_at'];

    protected $casts = [
        'accepted_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }
}
