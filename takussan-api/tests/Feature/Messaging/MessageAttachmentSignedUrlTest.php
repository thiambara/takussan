<?php

namespace Tests\Feature\Messaging;

use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Models\Document;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FichiersReels;
use Tests\TestCase;

/**
 * TCK-2736 (décision du porteur du 2026-11-11, option a) — l'URL signée d'une pièce jointe de la
 * messagerie (photo, PDF, note vocale : la collection `attachments`) et de sa vignette expire en
 * 5 minutes, comme la présignature de `PrivateMediaAccess::redirect()` : un participant retiré ne
 * lit plus un lien déjà reçu au-delà de cette fenêtre (elle était de 30 minutes). Les autres
 * ressources qui signent gardent leur échéance.
 */
class MessageAttachmentSignedUrlTest extends TestCase
{
    use RefreshDatabase;

    private Carbon $emise;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        $this->emise = Carbon::parse('2026-11-11 10:00:00');
        $this->travelTo($this->emise);
    }

    /** @return array{url: string, thumbnail_url: string} les deux URL de la photo, émises à T */
    private function photoEmiseAT(): array
    {
        $member = User::factory()->create();
        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $member->id,
        ]);
        $conversation->participants()->attach($member->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);

        Sanctum::actingAs($member);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'image',
            'file' => FichiersReels::jpeg(),
        ], ['Accept' => 'application/json'])->assertCreated();

        $photo = collect($this->getJson("/api/conversations/{$conversation->id}/messages")->assertOk()->json('data'))
            ->firstWhere('type', 'image');
        $this->app['auth']->forgetGuards();

        return ['url' => (string) $photo['attachments'][0]['url'], 'thumbnail_url' => (string) $photo['attachments'][0]['thumbnail_url']];
    }

    private function lisible(string $url): bool
    {
        return in_array($this->get($url)->status(), [200, 302], true);
    }

    /** AC1 — lisible à T + 5 min − 1 s, refusée à T + 5 min + 1 s ; l'original comme la vignette. */
    public function test_l_url_d_une_piece_jointe_expire_en_cinq_minutes(): void
    {
        $this->assertSame(5, MessageResource::ATTACHMENT_URL_TTL_MINUTES);
        $urls = $this->photoEmiseAT();
        $this->assertStringContainsString('conversion=thumbnail', $urls['thumbnail_url']);

        foreach ($urls as $cle => $url) {
            $this->travelTo($this->emise->copy()->addMinutes(5)->subSecond());
            $this->assertTrue($this->lisible($url), "{$cle} lisible avant l'échéance");

            $this->travelTo($this->emise->copy()->addMinutes(5)->addSecond());
            $this->get($url)->assertForbidden();
        }
    }

    /**
     * Vérification adverse de TCK-2736 — le membre retiré : il ne relit plus le fil (403), et le lien
     * qu'il avait reçu à T meurt à T + 5 min. La relecture d'un membre resté re-signe : l'URL relue à
     * T + 3 min diffère et vit jusqu'à T + 8 min.
     */
    public function test_le_membre_retire_perd_le_fil_et_son_lien_meurt_a_cinq_minutes(): void
    {
        $admin = User::factory()->create();
        $membre = User::factory()->create();
        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        Sanctum::actingAs($admin);
        $this->post("/api/conversations/{$conversation->id}/messages", [
            'type' => 'image',
            'file' => FichiersReels::jpeg(),
        ], ['Accept' => 'application/json'])->assertCreated();
        $this->app['auth']->forgetGuards();

        $lire = function (User $lecteur) use ($conversation): TestResponse {
            Sanctum::actingAs($lecteur);
            $reponse = $this->getJson("/api/conversations/{$conversation->id}/messages");
            $this->app['auth']->forgetGuards();

            return $reponse;
        };
        $urlDe = fn (TestResponse $reponse): string => (string) collect($reponse->assertOk()->json('data'))
            ->firstWhere('type', 'image')['attachments'][0]['url'];

        $urlDuMembre = $urlDe($lire($membre));

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/conversations/{$conversation->id}/participants/{$membre->id}")->assertOk();
        $this->app['auth']->forgetGuards();

        $lire($membre)->assertForbidden();

        $this->travelTo($this->emise->copy()->addMinutes(3));
        $urlRelue = $urlDe($lire($admin));
        $this->assertNotSame($urlDuMembre, $urlRelue, 'la relecture re-signe');

        $this->travelTo($this->emise->copy()->addMinutes(5)->subSecond());
        $this->assertTrue($this->lisible($urlDuMembre), 'fenêtre résiduelle décidée');

        $this->travelTo($this->emise->copy()->addMinutes(5)->addSecond());
        $this->get($urlDuMembre)->assertForbidden();
        $this->assertTrue($this->lisible($urlRelue), "l'URL relue à T + 3 min vit encore");

        $this->travelTo($this->emise->copy()->addMinutes(8)->addSecond());
        $this->get($urlRelue)->assertForbidden();
    }

    /** AC2 — témoin : l'URL signée d'un document garde ses 30 minutes. */
    public function test_le_document_garde_ses_trente_minutes(): void
    {
        $user = User::factory()->create();
        $document = Document::factory()->create([
            'documentable_id' => Property::factory()->create(['user_id' => $user->id])->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
        ]);
        $document->addMedia(UploadedFile::fake()->createWithContent('bail.pdf', 'contenu'))->toMediaCollection('file');

        $url = (string) $this->actingAs($user, 'sanctum')->getJson("/api/documents/{$document->id}")->assertOk()->json('data.file_url');
        $this->app['auth']->forgetGuards();

        $this->travelTo($this->emise->copy()->addMinutes(30)->subSecond());
        $this->assertTrue($this->lisible($url), 'le document reste lisible au-delà de cinq minutes');

        $this->travelTo($this->emise->copy()->addMinutes(30)->addSecond());
        $this->get($url)->assertForbidden();
    }
}
