<?php

namespace App\Models\Enums;

use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;

/**
 * TCK-2502 — la tranche de la journée demandée par un visiteur qui ne choisit pas d'heure : « mardi
 * matin », et l'agent fixe l'heure en confirmant.
 *
 * La visite est enregistrée au DÉBUT de sa tranche, à Dakar ({@see self::startOn()}) : c'est ce qui
 * la range dans le calendrier et dans les filtres par date, jamais une heure promise au visiteur.
 */
enum VisitWindow: string
{
    case Morning = 'morning';
    case Afternoon = 'afternoon';
    case Evening = 'evening';

    /** Le début de la tranche, heure de Dakar. */
    public function startTime(): string
    {
        return match ($this) {
            self::Morning => '09:00',
            self::Afternoon => '14:00',
            self::Evening => '17:00',
        };
    }

    /** L'instant de début de la tranche, le jour `Y-m-d` donné, à Dakar. */
    public function startOn(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d H:i', $date.' '.$this->startTime(), VisitSchedulingService::TIMEZONE);
    }
}
