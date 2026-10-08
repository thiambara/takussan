<?php

namespace App\Models\Enums;

/**
 * TCK-591 — la nature d'une note épinglée à un changement d'étape. `null` = note libre.
 * Le préfixe affiché (« Perte : », « Lost: ») appartient au front.
 */
enum CustomerNoteKind: string
{
    case Conversion = 'conversion';
    case Loss = 'loss';
}
