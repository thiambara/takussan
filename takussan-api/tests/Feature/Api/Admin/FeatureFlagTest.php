<?php

namespace Tests\Feature\Api\Admin;

use App\Domain\Features\Flag;
use App\Models\FeatureFlag;
use App\Models\User;
use App\Services\Features\FeatureFlagEvaluator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Drapeaux de fonctionnalité. TCK-600 : le catalogue a été VIDÉ — ses trois entrées n'avaient aucun
 * lecteur ; TCK-633 y fait entrer deux drapeaux, chacun avec son lecteur. Le mécanisme (segments, déploiement progressif) reste éprouvé sur une ligne stockée,
 * par `FeatureFlagEvaluator::evaluate()`.
 */
class FeatureFlagTest extends TestCase
{
    use RefreshDatabase;

    public function test_unknown_flag_is_fail_closed(): void
    {
        $user = User::factory()->create();
        FeatureFlag::create(['key' => 'unknown_flag', 'label' => 'x', 'enabled' => true, 'segments_json' => []]);

        $this->assertFalse(app(FeatureFlagEvaluator::class)->isEnabled('unknown_flag', $user));
    }

    public function test_segments_and_rollout_are_stable(): void
    {
        $agencyAdmin = $this->actingAsRole('agency_admin');
        $evaluator = app(FeatureFlagEvaluator::class);
        $parRole = new FeatureFlag(['key' => 'k_role', 'enabled' => true, 'segments_json' => ['roles' => ['agency_admin']]]);
        $progressif = new FeatureFlag(['key' => 'k_rollout', 'enabled' => true, 'segments_json' => ['rollout_percentage' => 50]]);
        $eteint = new FeatureFlag(['key' => 'k_off', 'enabled' => false, 'segments_json' => []]);

        $this->assertTrue($evaluator->evaluate($parRole, $agencyAdmin));
        $this->assertFalse($evaluator->evaluate($parRole, User::factory()->create()));
        $this->assertSame($evaluator->evaluate($progressif, $agencyAdmin), $evaluator->evaluate($progressif, $agencyAdmin));
        $this->assertSame($evaluator->bucket('k_rollout', $agencyAdmin->id) < 50, $evaluator->evaluate($progressif, $agencyAdmin));
        $this->assertFalse($evaluator->evaluate($eteint, $agencyAdmin));
        $this->assertFalse($evaluator->evaluate($parRole, null));
    }

    /**
     * AC15 — le catalogue ne sert ni libellé ni description, et la console liste EXACTEMENT ses
     * entrées, dans leur ordre. TCK-633 : il n'est plus vide (`media_watermark`, lot A ;
     * `host_auto_space`, lot C) ; un drapeau serveur n'est pas servi au client.
     */
    public function test_the_catalogue_carries_no_label(): void
    {
        $this->actingAsRole('super_admin');

        $lignes = $this->getJson('/api/admin/feature-flags')->assertOk()->json('data');

        $this->assertSame(array_map(fn (Flag $flag) => $flag->value, Flag::cases()), array_column($lignes, 'key'));
        foreach ($lignes as $ligne) {
            $this->assertArrayNotHasKey('label', $ligne);
            $this->assertArrayNotHasKey('description', $ligne);
        }
        $this->assertArrayNotHasKey(
            Flag::MediaWatermark->value,
            $this->getJson('/api/feature-flags/me')->assertOk()->json('data') ?? [],
        );
    }

    /**
     * P98.10 (TCK-1176) — chaque ligne porte l'état évalué pour l'opérateur, bascule de session
     * comprise : le bouton « Test » part de là, et non plus de « éteint » quoi qu'il soit stocké.
     */
    public function test_each_flag_carries_its_state_evaluated_for_the_operator(): void
    {
        $this->actingAsRole('super_admin');
        FeatureFlag::query()->updateOrCreate(['key' => Flag::HostAutoSpace->value], ['label' => Flag::HostAutoSpace->value, 'enabled' => true, 'segments_json' => null]);
        FeatureFlag::query()->updateOrCreate(['key' => Flag::MediaWatermark->value], ['label' => Flag::MediaWatermark->value, 'enabled' => false, 'segments_json' => null]);

        $etat = fn (): array => array_column($this->getJson('/api/admin/feature-flags')->assertOk()->json('data'), 'enabled_for_me', 'key');

        $this->assertSame(true, $etat()[Flag::HostAutoSpace->value]);
        $this->assertSame(false, $etat()[Flag::MediaWatermark->value]);

        $this->postJson('/api/admin/feature-flags/'.Flag::MediaWatermark->value.'/override', ['enabled' => true])->assertOk();
        $this->assertSame(true, $etat()[Flag::MediaWatermark->value]);
    }

    public function test_any_key_is_unknown_to_the_console(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/feature-flags/property_compare', ['enabled' => true])
            ->assertNotFound()
            ->assertJsonPath('code', 'feature_flag.unknown');
        $this->postJson('/api/admin/feature-flags/property_compare/override', ['enabled' => true])
            ->assertNotFound();
        // TCK-633 — une migration de données peut poser la ligne d'un drapeau CATALOGUÉ
        // (`host_auto_space`, lot C) : ce qui compte, c'est qu'aucune ligne n'est née de la clé inconnue.
        $this->assertFalse(FeatureFlag::query()->where('key', 'property_compare')->exists());
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $this->actingAsRole('agency_admin');
        $this->patchJson('/api/admin/feature-flags/property_compare', ['enabled' => true])->assertForbidden();
    }

    /**
     * TCK-1125 (P98.01) — le dialogue « Configurer » envoie toujours `roles` et
     * `rollout_percentage`, vides et à 0 sans ciblage. Ce corps, que l'écran affiche « Global »,
     * éteignait le drapeau pour tout le monde : seul `[]` valait « sans restriction ».
     */
    public function test_le_corps_du_dialogue_sans_ciblage_reste_global(): void
    {
        $superAdmin = $this->actingAsRole('super_admin');
        $evaluator = app(FeatureFlagEvaluator::class);

        $this->patchJson('/api/admin/feature-flags/host_auto_space', [
            'enabled' => true,
            'segments' => ['roles' => [], 'rollout_percentage' => 0],
        ])->assertOk();

        $this->assertSame([], FeatureFlag::query()->where('key', 'host_auto_space')->first()->segments_json);
        $this->assertTrue($evaluator->isEnabled('host_auto_space', User::factory()->create()));
        $this->assertTrue($evaluator->isEnabled('host_auto_space', null));
        $this->assertTrue($evaluator->isEnabled('host_auto_space', $superAdmin));

        // Une ligne déjà écrite sous cette forme se lit de même.
        $ecrite = new FeatureFlag(['key' => 'k_vide', 'enabled' => true, 'segments_json' => ['roles' => [], 'agency_ids' => [], 'rollout_percentage' => 0]]);
        $this->assertTrue($evaluator->evaluate($ecrite, null));
        // Une clé inconnue n'est pas vide : le jugement reste fail-closed.
        $inconnue = new FeatureFlag(['key' => 'k_inconnue', 'enabled' => true, 'segments_json' => ['roles' => [], 'plan' => 'pro']]);
        $this->assertFalse($evaluator->evaluate($inconnue, null));

        // Un ciblage réel reste un ciblage.
        $this->patchJson('/api/admin/feature-flags/host_auto_space', [
            'enabled' => true,
            'segments' => ['roles' => ['agency_admin'], 'rollout_percentage' => 0],
        ])->assertOk();
        $this->assertSame(['roles' => ['agency_admin'], 'rollout_percentage' => 0], FeatureFlag::query()->where('key', 'host_auto_space')->first()->segments_json);
        $this->assertFalse($evaluator->isEnabled('host_auto_space', User::factory()->create()));
        $this->assertFalse($evaluator->isEnabled('host_auto_space', null));
    }
}
