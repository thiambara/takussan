<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Rules\JourIso;
use App\Support\Http\ParametreUnique;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Validator;

/**
 * TCK-2911 (ADR-0120 § 2) — la période du relevé des factures : `from` et `to` au format `YYYY-MM-DD`,
 * jours inclus. Défaut : le mois de `to`, à défaut le mois en cours ; `to` défaut : la fin du mois de
 * `from`. `to` ne précède pas `from` et la période tient en {@see self::MAX_DAYS} jours.
 */
class ServiceProviderBillStatementRequest extends BaseFormRequest
{
    /** La plus longue période d'un relevé : une année, bissextile comprise. */
    public const MAX_DAYS = 366;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'from' => ['nullable', 'date_format:Y-m-d', new JourIso], // TCK-2911 — l'année bornée (TCK-2768)
            'to' => ['nullable', 'date_format:Y-m-d', new JourIso], // TCK-2911 — l'année bornée (TCK-2768)
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty() || ParametreUnique::chaine($this, 'to') === null) {
                return;
            }
            [$from, $to] = [$this->periodStart(), $this->periodEnd()];
            if ($to->lessThan($from)) {
                $validator->errors()->add('to', __('validation.after_or_equal', ['attribute' => 'to', 'date' => $from->toDateString()]));
            } elseif ($from->diffInDays($to) > self::MAX_DAYS) {
                $validator->errors()->add('to', __('validation.before_or_equal', ['attribute' => 'to', 'date' => $from->addDays(self::MAX_DAYS)->toDateString()]));
            }
        });
    }

    public function periodStart(): CarbonImmutable
    {
        $from = ParametreUnique::chaine($this, 'from');
        if ($from !== null) {
            return CarbonImmutable::createFromFormat('Y-m-d', $from)->startOfDay();
        }
        $to = ParametreUnique::chaine($this, 'to');

        return ($to !== null ? CarbonImmutable::createFromFormat('Y-m-d', $to) : CarbonImmutable::now())->startOfMonth();
    }

    public function periodEnd(): CarbonImmutable
    {
        $to = ParametreUnique::chaine($this, 'to');

        return $to !== null
            ? CarbonImmutable::createFromFormat('Y-m-d', $to)->endOfDay()
            : $this->periodStart()->endOfMonth();
    }
}
