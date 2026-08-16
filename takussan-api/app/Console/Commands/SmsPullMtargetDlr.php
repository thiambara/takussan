<?php

namespace App\Console\Commands;

use App\Models\Integration;
use App\Services\Notifications\Sms\Dlr\DlrReportApplier;
use App\Services\Notifications\Sms\Dlr\SmsDlrPullerInterface;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * TCK-294 — Drain Mtarget's DLR/MO queue instead of exposing an inbound
 * webhook nobody can authenticate (ardoise D-49).
 *
 * **Idempotence.** Mtarget's pulling read is destructive — a successful
 * call empties the queue it returns — so re-running this command does not
 * re-read the same reports, and safety cannot come from the read side. It
 * comes from {@see DlrReportApplier}: a report only ever UPDATEs the
 * attempt matched on `(provider, provider_message_id)`, never inserts one,
 * writing the same status twice is a no-op, and a status precedence blocks
 * any regression. Re-running is therefore safe at any moment, including
 * concurrently with the scheduler (which also guards with
 * `withoutOverlapping()`).
 *
 * **On failure the run stops for that account and exits non-zero** rather
 * than continuing to drain: a report consumed while our side is broken is
 * a report lost for good.
 */
class SmsPullMtargetDlr extends Command
{
    protected $signature = 'sms:pull-mtarget-dlr
        {--agency= : restrict to one agency Integration (default: every active sms_mtarget account)}
        {--max= : page size requested per call (default sms.dlr_pulling.max_per_call)}
        {--batches= : maximum calls per account in this run (default sms.dlr_pulling.max_batches)}';

    protected $description = 'Pull Mtarget delivery reports / mobile-originated messages (TCK-294)';

    public function handle(SmsDlrPullerInterface $puller, DlrReportApplier $applier): int
    {
        if (! config('sms.dlr_pulling.enabled')) {
            $this->info('DLR pulling is disabled (sms.dlr_pulling.enabled) — nothing to do.');

            return self::SUCCESS;
        }

        $max = (int) ($this->option('max') ?: config('sms.dlr_pulling.max_per_call', 50));
        $maxBatches = (int) ($this->option('batches') ?: config('sms.dlr_pulling.max_batches', 20));
        $failed = false;
        $totals = [];

        foreach ($this->scopes() as $agencyId) {
            $calls = 0;
            while ($calls < $maxBatches) {
                $batch = $puller->pull(['agency_id' => $agencyId], $max);
                $calls++;
                if (! $batch->ok) {
                    $failed = true;
                    // AC3 — an operator outage is loud, and no status moves.
                    Log::error('[sms.mtarget.pull] pull failed', [
                        'agency_id' => $agencyId,
                        'driver' => $puller->id(),
                        'error' => $batch->error,
                    ]);
                    $this->error("agency={$agencyId} — pull failed: {$batch->error}");

                    break;
                }
                foreach ($batch->records as $record) {
                    $outcome = $applier->apply('mtarget', $record);
                    $totals[$outcome] = ($totals[$outcome] ?? 0) + 1;
                }
                if ($batch->isEmpty()) {
                    break;
                }
            }
        }

        $this->info('Pulled: '.($totals === [] ? 'nothing' : json_encode($totals)));

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Every Mtarget account we hold credentials for — the global one
     * (`agency_id` null) and any agency-scoped override. An empty set
     * still yields one scope so the driver itself reports the missing
     * Integration instead of the command silently doing nothing.
     *
     * @return list<int|null>
     */
    private function scopes(): array
    {
        $agency = $this->option('agency');
        if ($agency !== null && $agency !== '') {
            return [(int) $agency];
        }

        $scopes = Integration::query()
            ->where('provider', 'sms_mtarget')
            ->where('is_active', true)
            ->distinct()
            ->pluck('agency_id')
            ->map(fn ($id) => $id === null ? null : (int) $id)
            ->all();

        return $scopes === [] ? [null] : $scopes;
    }
}
