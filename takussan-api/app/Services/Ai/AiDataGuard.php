<?php

namespace App\Services\Ai;

use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiRefusalReason;
use App\Support\PhoneMasker;

/**
 * TCK-2383 (ADR-0076 §4, §5) — ce qui peut partir chez un fournisseur. Une charge `sensible` est
 * refusée quel que soit l'usage ; une charge au-dessus de la classe de l'usage aussi. Un usage
 * `publique` voit en outre ses numéros de téléphone masqués.
 */
final class AiDataGuard
{
    /** @param  list<AiDataClass>  $classes */
    public function refusalFor(AiUsage $usage, array $classes): ?AiRefusalReason
    {
        if (in_array(AiDataClass::Sensible, $classes, true)) {
            return AiRefusalReason::SensitiveData;
        }
        foreach ($classes as $class) {
            if ($class->rank() > $usage->maxDataClass()->rank()) {
                return AiRefusalReason::DataClass;
            }
        }

        return null;
    }

    public function prepare(AiUsage $usage, string $input): string
    {
        return $usage->maxDataClass() === AiDataClass::Publique ? PhoneMasker::mask($input) : $input;
    }
}
