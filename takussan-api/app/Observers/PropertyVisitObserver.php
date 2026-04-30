<?php

namespace App\Observers;

use App\Models\PropertyVisit;

class PropertyVisitObserver
{
    public function created(PropertyVisit $visit): void
    {
        $visit->property()->increment('visits_count');
    }
}
