<?php

namespace App\Console\Commands;

use App\Models\WizardDraft;
use Illuminate\Console\Command;

/**
 * TCK-250 — Garbage-collect resumable wizard drafts older than the retention
 * window (default 90 days). Drafts that have been sitting untouched are
 * almost always abandoned onboarding flows; keeping them indefinitely
 * grows the table for no UX benefit.
 *
 * Idempotent: safe to re-run; deletes a hard window of `updated_at < cutoff`.
 */
class PurgeOldWizardDrafts extends Command
{
    /** @var int Default retention in days. */
    public const DEFAULT_RETENTION_DAYS = 90;

    protected $signature = 'wizard-drafts:purge {--days= : Override retention window in days (default: 90)} {--dry-run : Print count, do not delete}';

    protected $description = 'Delete wizard_drafts older than the retention window (default 90 days).';

    public function handle(): int
    {
        $days = (int) ($this->option('days') ?? self::DEFAULT_RETENTION_DAYS);
        if ($days < 1) {
            $this->error('--days must be >= 1.');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $cutoff = now()->subDays($days);

        $query = WizardDraft::query()->where('updated_at', '<', $cutoff);
        $count = $query->count();

        if ($dryRun) {
            $this->info(sprintf('wizard-drafts:purge — would delete %d draft(s) older than %s (dry-run).', $count, $cutoff->toIso8601String()));

            return self::SUCCESS;
        }

        $deleted = $query->delete();
        $this->info(sprintf('wizard-drafts:purge — deleted %d draft(s) older than %s.', $deleted, $cutoff->toIso8601String()));

        return self::SUCCESS;
    }
}
