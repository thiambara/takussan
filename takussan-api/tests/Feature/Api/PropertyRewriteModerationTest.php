<?php

namespace Tests\Feature\Api;

use App\Jobs\Property\RevalidatePublicPropertyPage;
use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\ApiTestCase;
use Tests\Support\PubliePret;

/**
 * TCK-611 (ADR-0043, amendement du 2026-11-16, décisions du porteur) — dans une agence
 * `moderation_required`, une annonce RÉÉCRITE (champ affiché) par qui ne modère pas perd son
 * approbation et repasse par la file si elle est en ligne ; et « déjà en ligne » exige
 * `visibility = public` : un bien privé qui redevient public est une activation.
 *
 * Rejeux de verif-597 passes 2 (AC1) et 3 (AC2).
 */
class PropertyRewriteModerationTest extends ApiTestCase
{
    use PubliePret, RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create(['moderation_required' => true]);
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
        $this->rendrePubliable($this->agent, $this->admin);
    }

    /** Un bien publié par l'agent puis approuvé par l'admin : en ligne, approbation debout. */
    private function approvedOnline(): Property
    {
        $property = Property::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->agent->id,
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
            'is_test' => false,
            'title' => 'Villa aux Almadies',
            'price' => 90_000_000,
        ]);

        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/publish")->assertOk();
        $this->actingAsApi($this->admin);
        $this->postJson("/api/properties/{$property->id}/approve")->assertOk();

        $property->refresh();
        $this->assertSame(PropertyStatus::Available, $property->status);
        $this->assertNotNull($property->approved_at);
        $this->assertOnline($property);

        return $property;
    }

    /** Un bien en ligne AVANT que l'agence active la modération : jamais approuvé. */
    private function onlineBeforeModeration(): Property
    {
        $this->agency->update(['moderation_required' => false]);
        $property = Property::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->agent->id,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now()->subWeek(),
            'is_test' => false,
        ]);
        $this->agency->update(['moderation_required' => true]);

        return $property;
    }

    private function publicIds(): array
    {
        $this->app['auth']->forgetGuards();

        return collect($this->getJson('/api/public/properties?per_page=100')->assertOk()->json('data'))->pluck('id')->all();
    }

    private function assertOnline(Property $property): void
    {
        $this->assertContains($property->id, $this->publicIds());
    }

    private function assertQueuedNotPublic(Property $property): void
    {
        $property->refresh();
        $this->assertSame(PropertyStatus::PendingReview, $property->status);
        $this->assertNotNull($property->submitted_at);
        $this->assertNull($property->approved_at);
        $this->assertFalse($property->shouldBeSearchable());

        $this->assertNotContains($property->id, $this->publicIds());
        $this->getJson("/api/public/properties/{$property->slug}")->assertNotFound();

        $this->actingAsApi($this->admin);
        $queue = collect($this->getJson('/api/properties/moderation?per_page=100')->assertOk()->json('data'))->pluck('id');
        $this->assertContains($property->id, $queue->all());
    }

    private function rewrite(Property $property, User $as): void
    {
        $this->actingAsApi($as);
        $this->putJson("/api/properties/{$property->id}", [
            'title' => 'Titre entièrement réécrit',
            'description' => 'Un tout autre texte.',
            'price' => 45_000_000,
        ])->assertOk();
    }

    /** AC1 — verif-597 passe 2 : approuvé, archivé, réécrit, republié → file. */
    public function test_ac1_an_approved_listing_rewritten_while_archived_goes_back_to_the_queue(): void
    {
        $property = $this->approvedOnline();

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'archived'])->assertOk();
        $this->rewrite($property, $this->agent);
        $this->assertNull($property->refresh()->approved_at);

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'available'])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /** AC1 — dans la MÊME sauvegarde : l'approbation effacée ne compte plus pour l'activation. */
    public function test_ac1_rewrite_and_unarchive_in_one_save_goes_to_the_queue(): void
    {
        $property = $this->approvedOnline();
        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'archived'])->assertOk();

        $this->putJson("/api/properties/{$property->id}", ['title' => 'Autre titre', 'status' => 'available'])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /** Décision (a) — un bien EN LIGNE réécrit quitte le catalogue aussitôt, fiche invalidée. */
    public function test_an_online_approved_listing_rewritten_by_an_agent_leaves_the_catalogue(): void
    {
        $property = $this->approvedOnline();

        Queue::fake();
        $this->rewrite($property, $this->agent);
        Queue::assertPushed(RevalidatePublicPropertyPage::class, fn ($job) => in_array($property->slug, $job->slugs, true));

        $this->assertQueuedNotPublic($property);
    }

    /** Décision (a) — un bien en ligne avant la modération, réécrit en ligne : file aussi. */
    public function test_an_online_never_approved_listing_rewritten_goes_to_the_queue(): void
    {
        $property = $this->onlineBeforeModeration();

        $this->rewrite($property, $this->agent);

        $this->assertQueuedNotPublic($property);
    }

    /** AC2 — verif-597 passe 3 : publié avant la modération, privé, réécrit, public → file. */
    public function test_ac2_a_listing_made_private_rewritten_then_public_goes_to_the_queue(): void
    {
        $property = $this->onlineBeforeModeration();

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}", ['visibility' => 'private'])->assertOk();
        $this->assertSame(PropertyVisibility::Private, $property->refresh()->visibility);
        $this->assertNotNull($property->published_at);
        $this->rewrite($property, $this->agent);
        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}", ['visibility' => 'public'])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /** Décision 2 seule : privé puis public, sans réécriture, est une activation. */
    public function test_private_then_public_is_an_activation_even_without_rewrite(): void
    {
        $property = $this->onlineBeforeModeration();

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}", ['visibility' => 'private'])->assertOk();
        $this->putJson("/api/properties/{$property->id}", ['visibility' => 'public'])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /** AC3 — les deux parcours dans une agence SANS modération : en ligne, aucune file. */
    public function test_ac3_an_agency_without_moderation_sees_nothing_change(): void
    {
        $this->agency->update(['moderation_required' => false]);
        $archived = Property::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->agent->id,
            'status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public,
            'published_at' => now()->subWeek(), 'is_test' => false,
        ]);
        $private = Property::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->agent->id,
            'status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public,
            'published_at' => now()->subWeek(), 'is_test' => false,
        ]);

        // Parcours 1 : réécrit en ligne, archivé, réécrit, republié.
        $this->rewrite($archived, $this->agent);
        $this->assertSame(PropertyStatus::Available, $archived->refresh()->status);
        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$archived->id}/status", ['status' => 'archived'])->assertOk();
        $this->rewrite($archived, $this->agent);
        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$archived->id}/publish")->assertOk();

        // Parcours 2 : privé, réécrit, public.
        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$private->id}", ['visibility' => 'private'])->assertOk();
        $this->rewrite($private, $this->agent);
        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$private->id}", ['visibility' => 'public'])->assertOk();

        foreach ([$archived, $private] as $property) {
            $this->assertSame(PropertyStatus::Available, $property->refresh()->status);
            $this->assertNull($property->submitted_at);
            $this->assertOnline($property);
        }
    }

    /** AC4 — l'admin d'agence (qui modère) réécrit : l'approbation tient, le bien reste en ligne. */
    public function test_ac4_the_agency_admin_rewriting_keeps_the_approval(): void
    {
        $property = $this->approvedOnline();
        $approvedAt = $property->approved_at;

        $this->rewrite($property, $this->admin);

        $property->refresh();
        $this->assertSame(PropertyStatus::Available, $property->status);
        $this->assertTrue($property->approved_at->equalTo($approvedAt));
        $this->assertSame('Titre entièrement réécrit', $property->title);
        $this->assertOnline($property);
    }

    /** AC5 — un champ non affiché (métadonnées internes, collaborateur) ne renvoie pas en file. */
    public function test_ac5_a_non_displayed_change_does_not_requeue(): void
    {
        $property = $this->approvedOnline();

        $this->actingAsApi($this->agent);
        $property->refresh()->update(['metadata' => ['notes_internes' => 'Clés chez le gardien']]);

        // Joué par l'AGENT : l'admin, exempté de toute façon, ne prouverait rien.
        $collaborator = User::factory()->create();
        $this->materializeRoleProfile($collaborator, 'agent', $this->agency);
        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $collaborator->id,
            'role' => 'agent',
        ])->assertSuccessful();

        $property->refresh();
        $this->assertSame(PropertyStatus::Available, $property->status);
        $this->assertNotNull($property->approved_at);
        $this->assertOnline($property);
    }

    /** Le formulaire renvoie tous ses champs : renvoyer les mêmes valeurs n'est pas une réécriture. */
    public function test_resending_identical_values_is_not_a_rewrite(): void
    {
        $property = $this->approvedOnline();

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}", [
            'title' => $property->title,
            'description' => $property->description,
            'price' => (float) $property->price,
        ])->assertOk();

        $property->refresh();
        $this->assertSame(PropertyStatus::Available, $property->status);
        $this->assertNotNull($property->approved_at);
    }

    /** Une photo ajoutée par l'agent sur un bien en ligne : file. */
    public function test_a_photo_added_by_an_agent_requeues_an_online_listing(): void
    {
        $property = $this->approvedOnline();

        $this->actingAsApi($this->agent);
        $this->post("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('salon.jpg', 800, 600)],
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->assertQueuedNotPublic($property);
    }

    /** L'adresse affichée changée par l'agent : file. */
    public function test_an_address_change_by_an_agent_requeues_an_online_listing(): void
    {
        $property = $this->approvedOnline();

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}", [
            'address' => ['street' => 'Route des Almadies', 'city' => 'Dakar', 'country' => 'SN'],
        ])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /** Un PATCH de statut seul (sans champ affiché) n'est pas une réécriture. */
    public function test_a_status_only_patch_is_not_a_rewrite(): void
    {
        $property = $this->approvedOnline();

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}", ['status' => 'pending'])->assertOk();

        $property->refresh();
        $this->assertSame(PropertyStatus::Pending, $property->status);
        $this->assertNotNull($property->approved_at);
        $this->assertOnline($property);
    }

    /** Une photo SUPPRIMÉE par l'agent sur un bien en ligne : file. */
    public function test_a_photo_removed_by_an_agent_requeues_an_online_listing(): void
    {
        $property = $this->approvedOnline();
        $this->actingAsApi($this->admin);
        $mediaId = $this->post("/api/properties/{$property->id}/media", [
            'photos' => [UploadedFile::fake()->image('salon.jpg', 800, 600)],
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.0.id');
        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);

        $this->actingAsApi($this->agent);
        $this->deleteJson("/api/properties/{$property->id}/media/{$mediaId}")->assertNoContent();

        $this->assertQueuedNotPublic($property);
    }

    /** Les équipements changés par l'agent (synchronisation puis retrait) : file. */
    public function test_amenities_changed_by_an_agent_requeue_an_online_listing(): void
    {
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        $synced = $this->approvedOnline();
        $detached = $this->approvedOnline();
        $this->actingAsApi($this->admin);
        $this->postJson("/api/properties/{$detached->id}/tags", ['tag_ids' => [$piscine->id]])->assertOk();
        $this->assertSame(PropertyStatus::Available, $detached->refresh()->status);

        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$synced->id}/tags", ['tag_ids' => [$piscine->id]])->assertOk();
        $this->assertQueuedNotPublic($synced);

        $this->actingAsApi($this->agent);
        $this->deleteJson("/api/properties/{$detached->id}/tags/{$piscine->id}")->assertNoContent();
        $this->assertQueuedNotPublic($detached);
    }
}
