<?php

namespace Tests\Feature\WizardDraft;

use App\Models\User;
use App\Models\WizardDraft;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-250 AC5 — Drafts older than the retention window are deleted by the
 * `wizard-drafts:purge` command. Default retention is 90 days; the
 * `--days` option allows overriding (used here for tighter assertions).
 */
class PurgeOldWizardDraftsTest extends TestCase
{
    use RefreshDatabase;

    public function test_purges_drafts_older_than_default_window(): void
    {
        $user = User::factory()->create();

        $stale = WizardDraft::factory()->for($user)->create(['key' => 'stale']);
        $stale->forceFill(['updated_at' => now()->subDays(91)])->save();

        $fresh = WizardDraft::factory()->for($user)->create(['key' => 'fresh']);

        $this->artisan('wizard-drafts:purge')->assertSuccessful();

        $this->assertDatabaseMissing('wizard_drafts', ['id' => $stale->id]);
        $this->assertDatabaseHas('wizard_drafts', ['id' => $fresh->id]);
    }

    public function test_dry_run_keeps_records(): void
    {
        $user = User::factory()->create();

        $stale = WizardDraft::factory()->for($user)->create(['key' => 'stale']);
        $stale->forceFill(['updated_at' => now()->subDays(180)])->save();

        $this->artisan('wizard-drafts:purge', ['--dry-run' => true])->assertSuccessful();

        $this->assertDatabaseHas('wizard_drafts', ['id' => $stale->id]);
    }

    public function test_custom_days_window(): void
    {
        $user = User::factory()->create();

        $sevenDaysOld = WizardDraft::factory()->for($user)->create(['key' => 'a']);
        $sevenDaysOld->forceFill(['updated_at' => now()->subDays(7)])->save();

        $oneDayOld = WizardDraft::factory()->for($user)->create(['key' => 'b']);
        $oneDayOld->forceFill(['updated_at' => now()->subDay()])->save();

        $this->artisan('wizard-drafts:purge', ['--days' => 3])->assertSuccessful();

        $this->assertDatabaseMissing('wizard_drafts', ['id' => $sevenDaysOld->id]);
        $this->assertDatabaseHas('wizard_drafts', ['id' => $oneDayOld->id]);
    }

    public function test_invalid_days_option_fails(): void
    {
        $this->artisan('wizard-drafts:purge', ['--days' => 0])->assertFailed();
    }
}
