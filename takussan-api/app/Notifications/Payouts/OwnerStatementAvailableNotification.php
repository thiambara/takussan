<?php

namespace App\Notifications\Payouts;

use App\Models\Agency;
use Illuminate\Database\Eloquent\Model;

/** TCK-594 (ADR-0039 §3) — au bailleur : son relevé de gérance du mois est disponible. */
class OwnerStatementAvailableNotification extends MoneyOutNotification
{
    public function __construct(public Agency $agency, public string $period) {}

    protected function code(): string
    {
        return 'owner_statement_available';
    }

    protected function data(): array
    {
        return [
            'agency_id' => $this->agency->id,
            'agency' => $this->agency->name,
            'period' => $this->period,
        ];
    }

    protected function referenceable(): ?Model
    {
        return null;
    }
}
