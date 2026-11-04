<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2470 (ADR-0087 §6) — une révision des cibles de la demande : un passage de l'usage `radar.cibles` qui a appelé le
 * modèle. `operations` : ce que le code a appliqué ; `discarded` : ce qu'il a écarté, avec le code du refus ; `before` :
 * l'état d'avant de chaque cible touchée (`created: true` pour une cible créée), ce que « défaire » rétablit
 * (`App\Services\Radar\Targets\RadarDemandCurator::revert()`). `signals_signature` : l'empreinte des signaux lus — la même
 * au passage suivant, et aucun appel ne part.
 */
class RadarTargetRevision extends AbstractModel
{
    protected $fillable = [
        'operations', 'discarded', 'before', 'signals_signature', 'signals_count', 'ai_call_id', 'reverted_at', 'reverted_by_id',
    ];

    protected $casts = [
        'operations' => 'array',
        'discarded' => 'array',
        'before' => 'array',
        'signals_count' => 'integer',
        'ai_call_id' => 'integer',
        'reverted_at' => 'datetime',
        'reverted_by_id' => 'integer',
    ];

    protected static array $requestLoadable = ['revertedBy'];

    protected static array $requestSortable = ['created_at', 'id'];

    // `signals_signature` n'est pas lisible : une donnée de calcul, pas d'affichage.
    protected static array $queryFields = [
        'id', 'operations', 'discarded', 'before', 'signals_count', 'ai_call_id', 'reverted_at', 'reverted_by_id',
        'created_at', 'updated_at',
    ];

    public function aiCall(): BelongsTo
    {
        return $this->belongsTo(AiCall::class);
    }

    public function revertedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reverted_by_id');
    }

    /** Les identifiants des cibles que la révision a touchées (créées, modifiées, fusionnées, retirées). */
    public function touchedTargetIds(): array
    {
        return array_values(array_unique(array_map(static fn (array $state): int => (int) $state['id'], (array) $this->before)));
    }
}
