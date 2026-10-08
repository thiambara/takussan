<?php

namespace Tests\Feature\Api;

use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-587 §8 (AC15) — le mot de passe d'un lien de partage voyage dans le CORPS d'un `POST`,
 * jamais dans l'URL.
 *
 * `DocumentShareLinkController` le lisait par `input('password')`, qui lit aussi la query : le
 * lien protégé s'ouvrait par `GET /api/share/{t}?password=…`, et le mot de passe finissait dans
 * l'historique du navigateur, les journaux d'accès et l'en-tête `Referer`. Une URL qui le porte
 * est désormais refusée en 400 — y compris sur un `POST`, pour qu'aucun client ne s'y habitue.
 */
class DocumentShareLinkPasswordTransportTest extends ApiTestCase
{
    use RefreshDatabase;

    private DocumentShareLink $link;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        RemoteDiskFake::install('r2-private');

        $this->link = $this->link(bcrypt('secret1234'));
    }

    public function test_un_mot_de_passe_dans_l_url_est_refuse_en_lecture(): void
    {
        $this->getJson("/api/share/{$this->link->token}?password=secret1234")
            ->assertStatus(400)
            ->assertJsonPath('code', 'share_link.password_in_query')->assertJsonPath('message', __('errors.share_link.password_in_query'));
    }

    public function test_un_mot_de_passe_dans_l_url_est_refuse_au_telechargement_sans_compter(): void
    {
        $this->get("/api/share/{$this->link->token}/download?password=secret1234")->assertStatus(400);

        $this->assertSame(0, $this->link->refresh()->downloads_count);
    }

    public function test_le_mot_de_passe_dans_le_corps_ouvre_le_lien(): void
    {
        $this->postJson("/api/share/{$this->link->token}", ['password' => 'secret1234'])
            ->assertOk()
            ->assertJsonPath('data.document.name', 'Bail signé');
    }

    public function test_le_mot_de_passe_dans_le_corps_telecharge_et_compte(): void
    {
        $response = $this->post("/api/share/{$this->link->token}/download", ['password' => 'secret1234']);

        $response->assertOk();
        $this->assertSame('contenu-du-bail', $response->streamedContent());
        $this->assertSame(1, $this->link->refresh()->downloads_count);
    }

    public function test_un_mauvais_mot_de_passe_dans_le_corps_est_refuse(): void
    {
        $this->postJson("/api/share/{$this->link->token}", ['password' => 'faux'])->assertStatus(401);
    }

    public function test_un_post_avec_le_mot_de_passe_dans_l_url_est_refuse(): void
    {
        $this->postJson("/api/share/{$this->link->token}?password=secret1234")->assertStatus(400);
    }

    public function test_un_lien_sans_mot_de_passe_s_ouvre_toujours_en_get(): void
    {
        $libre = $this->link(null);

        $this->getJson("/api/share/{$libre->token}")->assertOk();
    }

    private function link(?string $passwordHash): DocumentShareLink
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        $document = Document::create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $owner->id,
            'name' => 'Bail signé',
            'type' => DocumentType::Other,
        ]);
        $document->addMedia(UploadedFile::fake()->createWithContent('bail.pdf', 'contenu-du-bail'))
            ->toMediaCollection('file');

        return DocumentShareLink::create([
            'document_id' => $document->id,
            'created_by_id' => $owner->id,
            'token' => 'jeton-'.uniqid(),
            'expires_at' => now()->addDays(7),
            'downloads_count' => 0,
            'password_hash' => $passwordHash,
        ]);
    }
}
