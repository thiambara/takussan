<?php

namespace Tests\Feature\Console;

use App\Jobs\Property\RevalidatePublicPropertyPage;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * TCK-618 (contrainte 5) — `properties:flag-test` écrit hors Éloquent : la commande envoie elle-même
 * la revalidation des fiches touchées, sans quoi elles restent servies jusqu'au plancher de 300 s.
 */
class PropertiesFlagTestCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_marquage_en_masse_revalide_chaque_fiche_touchee(): void
    {
        $a = Property::factory()->published()->create(['title' => 'Property Test Filter - A']);
        $b = Property::factory()->published()->create(['title' => 'Property Test Filter - B']);
        $intact = Property::factory()->published()->create(['title' => 'Villa Mermoz']);
        Queue::fake();

        $this->artisan('properties:flag-test')->assertSuccessful();

        $slugs = [];
        Queue::assertPushed(RevalidatePublicPropertyPage::class, function (RevalidatePublicPropertyPage $job) use (&$slugs) {
            $slugs = [...$slugs, ...$job->slugs];

            return true;
        });
        sort($slugs);
        $attendus = [$a->slug, $b->slug];
        sort($attendus);
        $this->assertSame($attendus, $slugs);
        $this->assertNotContains($intact->slug, $slugs);
        $this->assertTrue((bool) $a->refresh()->is_test);
        $this->assertFalse((bool) $intact->refresh()->is_test);
    }

    public function test_un_essai_a_blanc_ne_revalide_rien(): void
    {
        Property::factory()->published()->create(['title' => 'Property Test Filter - A']);
        Queue::fake();

        $this->artisan('properties:flag-test', ['--dry' => true])->assertSuccessful();

        Queue::assertNotPushed(RevalidatePublicPropertyPage::class);
    }
}
