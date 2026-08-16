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

/**
 * TCK-285 — `GET /api/share/{token}/download`.
 *
 * `GET /api/share/{token}` a huit cas dans {@see DocumentShareLinkTest} ; la
 * route de TÉLÉCHARGEMENT n'en avait aucun, et `recordDownload` était mesuré
 * à 0/2 lignes. C'est pourtant elle qui sort réellement le fichier : une
 * surface PUBLIQUE, non authentifiée, dont le seul contrôle d'accès est le
 * jeton d'URL et les trois gardes de `DocumentShareLinkService::validate()`.
 *
 * Le plafond `max_downloads` n'avait jamais été franchi pour de vrai : sans
 * `recordDownload`, `downloads_count` ne bouge pas, donc la garde
 * `downloads_count >= max_downloads` ne peut pas se déclencher. Un plafond
 * qu'aucun test ne fait atteindre est un plafond qu'on croit avoir.
 *
 * ⚠ DÉFAUT TROUVÉ EN ÉCRIVANT CES TESTS, ET CORRIGÉ DEPUIS (ardoise D-52) —
 * la route était MORTE en production. `DocumentShareLinkController` lisait la
 * collection média `'files'` (pluriel) aux lignes 77 et 91, alors que tout le
 * reste du dépôt écrit et lit `'file'` (singulier) : `DocumentController::store()`
 * ligne 92, `DocumentPdfService` ligne 108, `DocumentResource` ligne 15,
 * `PropertyResource` ligne 263. Aucun code n'alimentait jamais `'files'`.
 * Conséquence : `GET /api/share/{token}/download` rendait **404
 * inconditionnellement**, quel que soit le document — et `recordDownload`
 * n'était jamais atteint, ce qui explique exactement son 0/2 de couverture.
 *
 * Le correctif d'un caractère est appliqué. Les 11 cas sont actifs, dont les 5
 * cas de SUCCÈS qui étaient suspendus le temps que le défaut vive : ils sont
 * désormais la garde anti-régression du correctif. Ils n'ont jamais été
 * réécrits autour du 404 — figer le défaut dans une assertion en aurait fait le
 * comportement attendu.
 *
 * ⚠ **La sonde qui les suspendait a été retirée avec le correctif, et c'est
 * délibéré.** Elle lisait le source du contrôleur et faisait `markTestSkipped`
 * sur `getFirstMedia('files')`. Juste tant que le défaut était ouvert ; inversée
 * une fois refermé — quiconque réécrirait `'files'` ne ferait plus rougir ces 5
 * tests, il les ferait passer en SKIP, et la CI resterait verte sur une route
 * redevenue morte. Aujourd'hui la régression rend un 404 et les cas de succès
 * échouent, ce qui est exactement ce qu'on attend d'eux. *Une garde
 * anti-régression qui se désarme sur la régression qu'elle garde est pire que
 * son absence : elle occupe la place.*
 */
class DocumentShareLinkDownloadTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');
    }

    // ─── Cas nominal ─────────────────────────────────────────────

    public function test_a_valid_link_streams_the_file_and_counts_the_download(): void
    {
        $link = $this->link();

        $response = $this->get("/api/share/{$link->token}/download");

        $response->assertOk();
        $this->assertSame('contenu-du-bail', $response->streamedContent());

        // Le compteur est la seule trace qu'un fichier est sorti — et la
        // seule chose qui rend le plafond opposable.
        $link->refresh();
        $this->assertSame(1, $link->downloads_count);
        $this->assertNotNull($link->last_accessed_at);
    }

    public function test_each_download_increments_the_counter(): void
    {
        $link = $this->link();

        $this->get("/api/share/{$link->token}/download")->assertOk();
        $this->get("/api/share/{$link->token}/download")->assertOk();
        $this->get("/api/share/{$link->token}/download")->assertOk();

        $this->assertSame(3, $link->refresh()->downloads_count);
    }

    // ─── Le plafond, réellement franchi ──────────────────────────

    public function test_the_ceiling_is_reached_by_actually_downloading_and_then_closes(): void
    {
        // Le cas décisif : on télécharge JUSQU'À la limite par la vraie route,
        // sans jamais écrire `downloads_count` à la main, puis une fois de
        // trop. C'est le seul montage qui prouve que le compteur incrémenté
        // par `recordDownload` est bien celui que `validate()` relit.
        $link = $this->link(['max_downloads' => 2]);

        $this->get("/api/share/{$link->token}/download")->assertOk();
        $this->get("/api/share/{$link->token}/download")->assertOk();

        $this->assertSame(2, $link->refresh()->downloads_count);

        $this->get("/api/share/{$link->token}/download")->assertStatus(410);

        // Le refus n'a pas compté comme un téléchargement.
        $this->assertSame(2, $link->refresh()->downloads_count);
    }

    public function test_a_link_already_at_its_ceiling_is_closed(): void
    {
        $link = $this->link(['max_downloads' => 1, 'downloads_count' => 1]);

        $this->get("/api/share/{$link->token}/download")->assertStatus(410);
    }

    public function test_a_link_without_ceiling_never_closes_on_the_count(): void
    {
        // Le témoin : `max_downloads` null veut dire illimité, pas zéro.
        $link = $this->link(['max_downloads' => null]);

        $this->get("/api/share/{$link->token}/download")->assertOk();
        $this->get("/api/share/{$link->token}/download")->assertOk();

        $this->assertSame(2, $link->refresh()->downloads_count);
    }

    // ─── Les autres gardes ───────────────────────────────────────

    public function test_a_revoked_link_cannot_be_downloaded(): void
    {
        $link = $this->link(['revoked_at' => now()]);

        $this->get("/api/share/{$link->token}/download")->assertStatus(410);
        $this->assertSame(0, $link->refresh()->downloads_count);
    }

    public function test_an_expired_link_cannot_be_downloaded(): void
    {
        $link = $this->link(['expires_at' => now()->subDay()]);

        $this->get("/api/share/{$link->token}/download")->assertStatus(410);
        $this->assertSame(0, $link->refresh()->downloads_count);
    }

    public function test_an_unknown_token_returns_404(): void
    {
        $this->get('/api/share/jeton-qui-nexiste-pas/download')->assertStatus(404);
    }

    // ─── Mot de passe ────────────────────────────────────────────

    public function test_a_password_protected_link_refuses_the_download_without_the_password(): void
    {
        $link = $this->link(['password_hash' => bcrypt('secret1234')]);

        $this->get("/api/share/{$link->token}/download")->assertStatus(401);
        $this->assertSame(0, $link->refresh()->downloads_count);
    }

    public function test_a_password_protected_link_refuses_a_wrong_password(): void
    {
        // La garde compare la VALEUR du mot de passe, pas sa seule présence.
        $link = $this->link(['password_hash' => bcrypt('secret1234')]);

        $this->get("/api/share/{$link->token}/download?password=pas-le-bon")
            ->assertStatus(401);
        $this->assertSame(0, $link->refresh()->downloads_count);
    }

    public function test_a_password_protected_link_streams_with_the_right_password(): void
    {
        $link = $this->link(['password_hash' => bcrypt('secret1234')]);

        $this->get("/api/share/{$link->token}/download?password=secret1234")
            ->assertOk();
        $this->assertSame(1, $link->refresh()->downloads_count);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /** @param array<string,mixed> $attributes */
    private function link(array $attributes = []): DocumentShareLink
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

        // Le fichier est déposé dans la collection `file` — celle qu'écrit
        // `DocumentController::store()` et que lit `DocumentResource`.
        $document->addMedia(
            UploadedFile::fake()->createWithContent('bail.pdf', 'contenu-du-bail')
        )->toMediaCollection('file');

        return DocumentShareLink::create(array_merge([
            'document_id' => $document->id,
            'created_by_id' => $owner->id,
            'token' => 'jeton-'.uniqid(),
            'expires_at' => now()->addDays(7),
            'downloads_count' => 0,
        ], $attributes));
    }
}
