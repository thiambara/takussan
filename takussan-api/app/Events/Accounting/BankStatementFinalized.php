<?php

namespace App\Events\Accounting;

use App\Models\BankStatement;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BankStatementFinalized
{
    use Dispatchable, SerializesModels;

    public function __construct(public BankStatement $statement) {}
}
