<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ParticipantRole;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PrimaryPropertyContact;
use Database\Seeders\Operations\ConversationSeeder;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1875 (P191.05) — le seeder écrit les fils que l'application écrit : des directes de prospect
 * (`direct`, `property_id`, le prospect et le contact principal du bien, créées par le prospect,
 * comme `PropertyConversationResolver::firstOrCreate()`) et des groupes (`group`, sujet, trois
 * participants ou plus, créateur administrateur, comme `GroupConversationService`). Avant, il
 * écrivait des fils `property` de deux à quatre participants : une forme qu'aucun écrivain de
 * l'application ne produit et que `ConversationAccess::isProspectThread()` ne juge pas.
 */
class ConversationSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seme_des_directes_de_prospect_et_des_groupes_comme_l_application(): void
    {
        $agency = Agency::factory()->create();
        // TCK-2378 — un fil d'équipe ne réunit que ceux qui étaient là à son ouverture : l'équipe est
        // arrivée avant la fenêtre, comme dans le seed.
        $arrivee = ['created_at' => Timeline::portfolioStart()];
        $agents = collect([User::factory()->create($arrivee), User::factory()->create($arrivee)]);
        $agents->each(fn (User $u) => $this->materializeRoleProfile($u, 'agent', $agency));
        $owner = User::factory()->create($arrivee);
        $this->materializeRoleProfile($owner, 'owner', $agency);
        $properties = collect(range(1, 3))->map(fn () => Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $owner->id,
        ]));
        $prospects = collect(range(1, 3))->map(fn () => User::factory()->create());
        $customers = $prospects->map(fn (User $u) => Customer::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $u->id,
        ]));

        $ctx = new SeedingContext(new SeedingConfig(conversationsPerAgency: 30));
        $ctx->agencies = collect([$agency->id => $agency]);
        $ctx->usersByAgency[$agency->id] = $agents->concat([$owner])->keyBy('id');
        $ctx->usersByAgencyAndPersona[$agency->id] = [
            'agent' => $agents->keyBy('id'),
            'owner' => collect([$owner->id => $owner]),
        ];
        $ctx->propertiesByAgency[$agency->id] = $properties->keyBy('id');
        $ctx->customersByAgency[$agency->id] = $customers->keyBy('id');

        (new ConversationSeeder($ctx))->run();

        $fils = Conversation::query()->with('participants')->get();
        $this->assertCount(30, $fils);
        $parType = $fils->groupBy(fn (Conversation $c) => $c->type->value);
        $this->assertEqualsCanonicalizing(['direct', 'group'], $parType->keys()->all(), 'les deux seuls types que l\'application écrit');

        foreach ($parType['direct'] as $directe) {
            $this->assertNotNull($directe->property_id, "directe #{$directe->id} : un fil de prospect porte son bien");
            $this->assertCount(2, $directe->participants, "directe #{$directe->id} : deux participants");
            $this->assertContains((int) $directe->created_by, $prospects->pluck('id')->all(), "directe #{$directe->id} : créée par le prospect");

            $bien = Property::query()->with(PrimaryPropertyContact::eagerLoads())->find($directe->property_id);
            $this->assertEqualsCanonicalizing(
                [(int) $directe->created_by, PrimaryPropertyContact::for($bien)?->id],
                $directe->participants->pluck('id')->map(fn ($id) => (int) $id)->all(),
                "directe #{$directe->id} : le prospect et le contact principal du bien",
            );
        }

        foreach ($parType['group'] as $groupe) {
            $this->assertNotNull($groupe->subject, "groupe #{$groupe->id} : un groupe a un sujet");
            $this->assertGreaterThanOrEqual(3, $groupe->participants->count(), "groupe #{$groupe->id} : trois participants ou plus");
            $createur = $groupe->participants->firstWhere('id', $groupe->created_by);
            $this->assertNotNull($createur, "groupe #{$groupe->id} : le créateur participe");
            $this->assertSame(ParticipantRole::Admin, $createur->pivot->role, "groupe #{$groupe->id} : le créateur administre");
        }
    }
}
