<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Membership\AgencyRoleCapabilityCache;
use App\Services\Membership\AgencySystemRoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-317 — les rôles système ne dérivent plus par date de création d'agence.
 *
 * Le défaut mesuré : `AgencySystemRoleSeeder::systemRoleFor()` rendait un rôle
 * existant sans jamais regarder ses capacités. Une capacité ajoutée au
 * catalogue après la création d'une agence ne l'atteignait donc jamais, quand
 * toute agence créée ensuite la recevait — sans qu'aucune garde, aucun test ni
 * aucun log ne le signale.
 *
 * ⚠️ On simule « une capacité a été ajoutée au catalogue APRÈS » en RETIRANT
 * une ligne du pivot, et non en truquant l'enum : l'état de base est
 * rigoureusement le même — un rôle système à qui il manque une capacité que le
 * catalogue prescrit — et il est atteignable sans double d'enum.
 */
class SystemRoleDriftTest extends TestCase
{
    use RefreshDatabase;

    private function systemRole(Agency $agency, AgencyRoleBaseType $type): AgencyRole
    {
        return AgencyRole::query()
            ->where('agency_id', $agency->id)
            ->where('base_profile_type', $type->value)
            ->where('is_system', true)
            ->firstOrFail();
    }

    public function test_reseeding_an_existing_agency_now_restores_a_missing_capability(): void
    {
        $agency = Agency::factory()->create();
        $role = $this->systemRole($agency, AgencyRoleBaseType::AgencyAdmin);

        $before = AgencyRoleCapability::where('agency_role_id', $role->id)->count();
        AgencyRoleCapability::where('agency_role_id', $role->id)
            ->where('capability', Capability::InvoicesSend->value)->delete();
        app(AgencyRoleCapabilityCache::class)->forget((int) $role->id);

        app(AgencySystemRoleSeeder::class)->seed($agency->fresh());

        $this->assertSame($before, AgencyRoleCapability::where('agency_role_id', $role->id)->count());
        $this->assertDatabaseHas('agency_role_capabilities', [
            'agency_role_id' => $role->id,
            'capability' => Capability::InvoicesSend->value,
        ]);
    }

    /**
     * AC1 — le cœur du ticket : deux agences, l'une « ancienne » (amputée),
     * l'autre créée après, accordent les mêmes droits une fois réconciliées.
     */
    public function test_an_old_agency_and_a_new_one_grant_the_same_rights(): void
    {
        $ancienne = Agency::factory()->create();
        $roleAncien = $this->systemRole($ancienne, AgencyRoleBaseType::AgencyAdmin);

        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $ancienne->id]);

        // ⚠️ L'amputation vient APRÈS la création du profil, et pas avant :
        // créer un profil appelle `systemRoleFor()`, qui réconcilie désormais.
        // L'ordre inverse voyait l'agence se réparer toute seule avant
        // l'assertion — ce qui est le correctif qui marche, mais qui rendait ce
        // test-ci incapable de prouver quoi que ce soit sur la commande.
        AgencyRoleCapability::where('agency_role_id', $roleAncien->id)
            ->whereIn('capability', [Capability::InvoicesSend->value, Capability::PayoutsApprove->value])
            ->delete();
        app(AgencyRoleCapabilityCache::class)->forget((int) $roleAncien->id);

        $nouvelle = Agency::factory()->create();
        $roleNouveau = $this->systemRole($nouvelle, AgencyRoleBaseType::AgencyAdmin);

        // Avant réconciliation : l'écart est réel et observable.
        $this->assertFalse($user->fresh()->canActAt(Capability::InvoicesSend, $ancienne));

        $this->artisan('membership:reconcile-system-roles')->assertSuccessful();
        app(AgencyRoleCapabilityCache::class)->forget((int) $roleAncien->id);

        $capsAncien = AgencyRoleCapability::where('agency_role_id', $roleAncien->id)->pluck('capability')->sort()->values()->all();
        $capsNouveau = AgencyRoleCapability::where('agency_role_id', $roleNouveau->id)->pluck('capability')->sort()->values()->all();

        $this->assertSame($capsNouveau, $capsAncien, 'les deux agences doivent accorder exactement les mêmes droits');
        $this->assertTrue($user->fresh()->canActAt(Capability::InvoicesSend, $ancienne));
    }

    /** AC4 — un rôle personnalisé n'est jamais réaligné : s'en écarter est sa raison d'être. */
    public function test_a_custom_role_is_never_touched(): void
    {
        $agency = Agency::factory()->create();
        $custom = AgencyRole::query()->create([
            'agency_id' => $agency->id,
            'name' => 'Agent senior',
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
            'is_system' => false,
            'is_clonable' => true,
        ]);
        AgencyRoleCapability::query()->insert([
            'agency_role_id' => $custom->id,
            'capability' => Capability::PropertiesCreate->value,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->artisan('membership:reconcile-system-roles')->assertSuccessful();

        $this->assertSame(
            [Capability::PropertiesCreate->value],
            AgencyRoleCapability::where('agency_role_id', $custom->id)->pluck('capability')->all(),
            'un rôle personnalisé doit rester exactement tel qu\'il a été défini',
        );
        $this->assertSame(0, app(AgencySystemRoleSeeder::class)->reconcile($custom));
    }

    public function test_dry_run_reports_the_gap_without_writing(): void
    {
        $agency = Agency::factory()->create();
        $role = $this->systemRole($agency, AgencyRoleBaseType::AgencyAdmin);
        AgencyRoleCapability::where('agency_role_id', $role->id)
            ->where('capability', Capability::InvoicesSend->value)->delete();

        $this->artisan('membership:reconcile-system-roles --dry-run')->assertSuccessful();

        $this->assertDatabaseMissing('agency_role_capabilities', [
            'agency_role_id' => $role->id,
            'capability' => Capability::InvoicesSend->value,
        ]);
    }

    /**
     * AC3 — LA GARDE. Elle ne teste pas un correctif : elle refuse toute
     * divergence entre un rôle système et le catalogue, dans les deux sens, et
     * elle est rejouée par la CI puisqu'elle vit dans la suite.
     *
     * Sans elle, la prochaine divergence serait silencieuse comme celle-ci.
     */
    public function test_guard_no_seeded_system_role_diverges_from_the_catalogue(): void
    {
        Agency::factory()->count(3)->create();

        $seeder = app(AgencySystemRoleSeeder::class);
        $ecarts = [];

        foreach (AgencyRole::query()->where('is_system', true)->get() as $role) {
            $diff = $seeder->diff($role);
            if ($diff['missing'] !== [] || $diff['extra'] !== []) {
                $ecarts[] = sprintf(
                    'agence %d · rôle %d (%s) · manquantes=[%s] · en trop=[%s]',
                    $role->agency_id, $role->id, $role->name,
                    implode(',', $diff['missing']), implode(',', $diff['extra']),
                );
            }
        }

        $this->assertSame([], $ecarts, "Rôle(s) système divergents :\n".implode("\n", $ecarts));
    }
}
