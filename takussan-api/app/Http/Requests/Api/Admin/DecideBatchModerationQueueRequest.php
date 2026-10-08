<?php

namespace App\Http\Requests\Api\Admin;

/**
 * TCK-597 (ADR-0043 §7) — une décision et un motif communs à au plus 50 éléments de la file.
 * Les règles de la décision sont celles d'un élément seul : elles ne s'écrivent qu'une fois.
 */
class DecideBatchModerationQueueRequest extends DecideModerationQueueRequest
{
    public const MAX_ITEMS = 50;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return parent::rules() + [
            'ids' => ['required', 'array', 'min:1', 'max:'.self::MAX_ITEMS],
            'ids.*' => ['required', 'string', 'max:64', 'distinct'],
        ];
    }
}
