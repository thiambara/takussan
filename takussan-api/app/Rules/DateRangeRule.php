<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;

class DateRangeRule implements DataAwareRule, ValidationRule
{
    /**
     * @var array<string, mixed>
     */
    private array $data = [];

    public function __construct(private readonly string $startField) {}

    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $start = Arr::get($this->data, $this->startField);

        if ($start === null || $value === null) {
            return;
        }

        try {
            $startDate = Carbon::parse((string) $start);
            $endDate = Carbon::parse((string) $value);
        } catch (\Throwable) {
            return;
        }

        if ($endDate->lessThan($startDate)) {
            $fail(__('validation.custom.date_range', ['start' => $this->startField]));
        }
    }
}
