<?php

namespace App\Events\Accounting;

use App\Models\BankStatementLine;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BankStatementLineMatched
{
    use Dispatchable, SerializesModels;

    public function __construct(public BankStatementLine $line) {}
}
