<?php

namespace App\Console\Commands;

use App\Models\Property;
use Illuminate\Console\Command;

/**
 * TCK-163 — flag legacy seed/QA fixtures so the public listing scope
 * (`Property::scopePublic`) hides them. Idempotent: re-runs only touch
 * rows whose `is_test` flag isn't already set.
 *
 * The bundled migration (2026_05_05_000002) backfills existing rows
 * once. This command exists for the rare case where new fixtures land
 * in production via a re-seed or hotfix and need flagging without a
 * fresh migration.
 */
class PropertiesFlagTestCommand extends Command
{
    protected $signature = 'properties:flag-test '
        .'{--pattern=* : Title patterns to match (uses SQL LIKE, defaults to seeder fixtures)} '
        .'{--dry : Report rows that would be flagged without writing}';

    protected $description = 'Flag fixture properties (Property Test Filter -*, Propriété Premium Featured) as is_test=true';

    public function handle(): int
    {
        $patterns = (array) $this->option('pattern');
        if ($patterns === []) {
            $patterns = [
                'Property Test Filter -%',
                'Propriété Premium Featured',
            ];
        }

        $query = Property::query()
            ->where('is_test', false)
            ->where(function ($q) use ($patterns) {
                foreach ($patterns as $pattern) {
                    $q->orWhere('title', 'like', $pattern);
                }
            });

        $count = $query->count();
        $this->line("Found {$count} candidate row(s).");

        if ($count === 0) {
            return self::SUCCESS;
        }

        if ($this->option('dry')) {
            $query->limit(20)->get(['id', 'title', 'price'])
                ->each(fn ($p) => $this->line("  #{$p->id}  {$p->title}  ({$p->price})"));
            $this->info('Dry run — no changes written.');

            return self::SUCCESS;
        }

        $updated = $query->update(['is_test' => true]);
        $this->info("Flagged {$updated} row(s) as is_test=true.");

        return self::SUCCESS;
    }
}
