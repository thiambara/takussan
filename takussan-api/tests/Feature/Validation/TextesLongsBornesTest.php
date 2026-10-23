<?php

namespace Tests\Feature\Validation;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Message;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1891 (P195.04) — les textes longs que seul le front bornait le sont aussi à l'API, à la
 * borne la plus large qu'un écran envoie déjà : 2000 pour un avis de bien ou d'agence et pour une
 * réponse, 5000 pour un message, un premier message et une note de client. Chaque champ : la
 * borne passe, la borne + 1 rend 422 sur le champ et n'écrit rien.
 */
class TextesLongsBornesTest extends TestCase
{
    use RefreshDatabase;

    private function voyageurDuBien(Property $property): User
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Completed,
        ]);

        return $user;
    }

    public function test_le_contenu_d_un_avis_de_bien_est_borne_a_2000(): void
    {
        $property = Property::factory()->create();
        Sanctum::actingAs($this->voyageurDuBien($property));

        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 4, 'content' => str_repeat('a', 2001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('content');
        $this->assertSame(0, Review::count());

        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 4, 'content' => str_repeat('a', 2000)])
            ->assertCreated();
    }

    public function test_le_contenu_d_un_avis_d_agence_est_borne_a_2000(): void
    {
        $super = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $agency = Agency::factory()->create();
        Sanctum::actingAs($super);

        $this->postJson("/api/agencies/{$agency->id}/reviews", ['rating' => 4, 'content' => str_repeat('a', 2001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('content');
        $this->assertSame(0, Review::count());

        $this->postJson("/api/agencies/{$agency->id}/reviews", ['rating' => 4, 'content' => str_repeat('a', 2000)])
            ->assertCreated();
    }

    public function test_la_reponse_a_un_avis_est_bornee_a_2000(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $review = Review::factory()->for($property, 'reviewable')->create(['reply_content' => null]);
        Sanctum::actingAs($owner);

        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => str_repeat('a', 2001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reply_content');
        $this->assertNull($review->fresh()->reply_content);

        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => str_repeat('a', 2000)])
            ->assertOk();
    }

    /** @return array{0: User, 1: User} */
    private function deuxCollegues(): array
    {
        $agency = Agency::factory()->create();
        $me = User::factory()->create();
        $other = User::factory()->create();
        $this->materializeRoleProfile($me, 'agent', $agency);
        $this->materializeRoleProfile($other, 'agent', $agency);

        return [$me, $other];
    }

    public function test_le_premier_message_d_une_directe_est_borne_a_5000(): void
    {
        [$me, $other] = $this->deuxCollegues();
        Sanctum::actingAs($me);

        $this->postJson('/api/conversations', ['participants' => [$other->id], 'initial_message' => str_repeat('a', 5001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('initial_message');
        $this->assertSame(0, Conversation::count());

        $this->postJson('/api/conversations', ['participants' => [$other->id], 'initial_message' => str_repeat('a', 5000)])
            ->assertCreated();
    }

    public function test_un_message_est_borne_a_5000(): void
    {
        [$me, $other] = $this->deuxCollegues();
        Sanctum::actingAs($me);
        $id = $this->postJson('/api/conversations', ['participants' => [$other->id]])->assertCreated()->json('data.id');
        $avant = Message::count();

        $this->postJson("/api/conversations/{$id}/messages", ['content' => str_repeat('a', 5001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('content');
        $this->assertSame($avant, Message::count());

        $this->postJson("/api/conversations/{$id}/messages", ['content' => str_repeat('a', 5000)])
            ->assertCreated();
    }

    public function test_une_note_de_client_est_bornee_a_5000(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $customer = Customer::factory()->create([
            'agency_id' => $agency->id,
            'added_by_id' => $agent->id,
            'pipeline_stage' => CustomerPipelineStage::Qualified,
        ]);
        Sanctum::actingAs($agent);

        $this->postJson("/api/customers/{$customer->id}/notes", ['body' => str_repeat('a', 5001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('body');
        $this->assertSame(0, DB::table('customer_notes')->count());

        $this->postJson("/api/customers/{$customer->id}/notes", ['body' => str_repeat('a', 5000)])
            ->assertCreated();
    }
}
