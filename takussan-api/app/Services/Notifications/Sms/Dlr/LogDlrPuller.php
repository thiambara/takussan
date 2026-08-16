<?php

namespace App\Services\Notifications\Sms\Dlr;

use App\Services\Notifications\Sms\Drivers\LogSmsDriver;
use Illuminate\Support\Facades\Log;

/**
 * TCK-294 — Inert pulling driver, mirroring
 * {@see LogSmsDriver} on the send side. It is the DEFAULT (`sms.dlr_pulling.driver=log`), so a fresh
 * checkout, a test run and a developer machine never call the operator.
 */
class LogDlrPuller implements SmsDlrPullerInterface
{
    public function id(): string
    {
        return 'log';
    }

    public function pull(array $context = [], int $max = 50): SmsDlrBatch
    {
        Log::info('[sms.dlr.pull] log driver — no operator call', [
            'agency_id' => $context['agency_id'] ?? null,
            'max' => $max,
        ]);

        return SmsDlrBatch::of([]);
    }
}
