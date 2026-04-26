<?php

namespace App\Services\Notifications\Sms;

use Illuminate\Contracts\Config\Repository as ConfigRepository;

/**
 * TCK-102 — Resolve a phone number to its terminating operator.
 *
 * Lookup is purely prefix-based on `config('sms.operator_prefixes')`.
 * Numbers outside any known prefix resolve to `null` so the router
 * falls back to the `default` chain instead of attempting Orange.
 */
class OperatorResolver
{
    public function __construct(private readonly ConfigRepository $config) {}

    public function resolve(string $e164): ?string
    {
        if (! PhoneNumber::isValid($e164)) {
            return null;
        }
        $prefixes = $this->config->get('sms.operator_prefixes', []);
        foreach ($prefixes as $countryPrefix => $nationalMap) {
            if (! str_starts_with($e164, $countryPrefix)) {
                continue;
            }
            $national = substr($e164, strlen($countryPrefix), 2);
            if (isset($nationalMap[$national])) {
                return $nationalMap[$national];
            }
        }

        return null;
    }

    /**
     * Group an E.164 list by resolved operator. Numbers with no match
     * land under the `default` bucket (handled by the router fallback
     * chain).
     *
     * @param  list<string>  $numbers
     * @return array<string,list<string>>
     */
    public function groupByOperator(array $numbers): array
    {
        $groups = [];
        foreach ($numbers as $number) {
            $key = $this->resolve($number) ?? 'default';
            $groups[$key][] = $number;
        }

        return $groups;
    }
}
