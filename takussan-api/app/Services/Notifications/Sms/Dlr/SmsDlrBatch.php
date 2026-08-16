<?php

namespace App\Services\Notifications\Sms\Dlr;

/**
 * TCK-294 — Result of ONE call to an operator's pulling endpoint.
 *
 * `ok = false` is not "no reports": it means the call itself failed and
 * the caller must stop draining and surface the outage (AC3). Conflating
 * the two would turn an operator outage into a silent "nothing to do".
 */
final class SmsDlrBatch
{
    /**
     * @param  list<SmsDlrRecord>  $records
     */
    private function __construct(
        public readonly array $records,
        public readonly bool $ok,
        public readonly ?string $error = null,
    ) {}

    /**
     * @param  list<SmsDlrRecord>  $records
     */
    public static function of(array $records): self
    {
        return new self($records, true);
    }

    public static function failed(string $error): self
    {
        return new self([], false, $error);
    }

    public function isEmpty(): bool
    {
        return $this->records === [];
    }
}
