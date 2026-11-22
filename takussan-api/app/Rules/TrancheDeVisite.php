<?php

namespace App\Rules;

use App\Models\Enums\VisitWindow;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-2502 — le jour et la tranche d'une demande de visite sans heure, jugés à Dakar.
 *
 * Posée sur `date` : le jour est aujourd'hui ou dans les {@see self::MAX_DAYS} jours qui suivent.
 * Posée sur `preferred_window` : la tranche, ce jour-là, n'a pas encore commencé — « cet après-midi »
 * demandé à 15:00 ne peut plus être tenu.
 */
class TrancheDeVisite implements DataAwareRule, ValidationRule
{
    public const MAX_DAYS = 30;

    /** @var array<string, mixed> */
    private array $data = [];

    /** @param  array<string, mixed>  $data */
    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $day = $this->day($this->data['date'] ?? null);
        if ($day === null) {
            return; // `date_format` le refuse déjà, ou `required_with` le réclame.
        }

        $today = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->startOfDay();

        if ($attribute === 'date') {
            if ($day->lt($today) || $day->gt($today->addDays(self::MAX_DAYS))) {
                $fail(__('visits.window_date_out_of_range', ['days' => self::MAX_DAYS]));
            }

            return;
        }

        $window = is_string($value) ? VisitWindow::tryFrom($value) : null;
        if ($window !== null && ! $window->startOn($day->format('Y-m-d'))->isFuture()) {
            $fail(__('visits.window_started'));
        }
    }

    private function day(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
            return null;
        }
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $value, VisitSchedulingService::TIMEZONE);

        return $day !== false && $day->format('Y-m-d') === $value ? $day : null;
    }
}
