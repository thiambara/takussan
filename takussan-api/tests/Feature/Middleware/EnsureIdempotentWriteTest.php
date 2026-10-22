<?php

namespace Tests\Feature\Middleware;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;
use Tests\ApiTestCase;

/**
 * TCK-1396 (P144.01, ADR-0072) — l'intergiciel `idempotent`, éprouvé sur une route de test qui
 * compte ses exécutions. Chaque cas de la liste d'ADR-0072 § Application y a son test.
 */
class EnsureIdempotentWriteTest extends ApiTestCase
{
    use RefreshDatabase;

    private static int $ecritures = 0;

    protected function setUp(): void
    {
        parent::setUp();
        self::$ecritures = 0;

        Route::middleware(['api', 'auth:sanctum', 'idempotent'])
            ->post('/api/_test/idempotence/{fil}', function (Request $request, string $fil) {
                if ($request->input('statut') === 'refus') {
                    $request->validate(['obligatoire' => 'required']);
                }
                self::$ecritures++;

                return response()->json(['data' => ['ecriture' => self::$ecritures, 'fil' => $fil]], 201);
            })
            ->name('test.idempotence');
    }

    private function utilisateur(): User
    {
        $user = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => Agency::factory()->create()->id]);
        $this->actingAsApi($user);

        return $user;
    }

    public function test_le_rejeu_rend_la_meme_reponse_sans_reecrire(): void
    {
        $this->utilisateur();
        $cle = ['Idempotency-Key' => 'cle-0001-aaaa'];

        $premier = $this->postJson('/api/_test/idempotence/12', ['content' => 'Je passe demain'], $cle)
            ->assertStatus(201)
            ->assertHeaderMissing('Idempotent-Replayed');
        $second = $this->postJson('/api/_test/idempotence/12', ['content' => 'Je passe demain'], $cle)
            ->assertStatus(201)
            ->assertHeader('Idempotent-Replayed', 'true');

        $this->assertSame($premier->getContent(), $second->getContent());
        $this->assertStringContainsString('application/json', (string) $second->headers->get('Content-Type'));
        $this->assertSame(1, self::$ecritures);
    }

    public function test_sans_en_tete_chaque_envoi_ecrit_comme_avant(): void
    {
        $this->utilisateur();

        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'])->assertStatus(201);
        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], ['Idempotency-Key' => '   '])->assertStatus(201);

        $this->assertSame(2, self::$ecritures);
    }

    public function test_une_cle_hors_forme_est_refusee_sans_ecrire(): void
    {
        $this->utilisateur();

        foreach (['court', str_repeat('a', 256), 'cle avec espace', 'clé-accentuée'] as $cle) {
            $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], ['Idempotency-Key' => $cle])
                ->assertStatus(422)
                ->assertJsonPath('code', 'idempotency.key_invalid');
        }

        $this->assertSame(0, self::$ecritures);
    }

    public function test_la_meme_cle_pour_un_autre_corps_ou_un_autre_chemin_est_refusee(): void
    {
        $this->utilisateur();
        $cle = ['Idempotency-Key' => 'cle-0002-bbbb'];
        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], $cle)->assertStatus(201);

        $this->postJson('/api/_test/idempotence/12', ['content' => 'b'], $cle)
            ->assertStatus(422)->assertJsonPath('code', 'idempotency.key_reused');
        $this->postJson('/api/_test/idempotence/13', ['content' => 'a'], $cle)
            ->assertStatus(422)->assertJsonPath('code', 'idempotency.key_reused');

        $this->assertSame(1, self::$ecritures);
    }

    public function test_la_meme_cle_sous_un_autre_profil_est_refusee(): void
    {
        $user = User::factory()->create();
        $owner = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => Agency::factory()->create()->id]);
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => Agency::factory()->create()->id]);
        $this->actingAsApi($user);
        $cle = 'cle-0003-cccc';

        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], ['Idempotency-Key' => $cle, 'X-Profile-Id' => "owner:{$owner->id}"])
            ->assertStatus(201);
        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], ['Idempotency-Key' => $cle, 'X-Profile-Id' => "agent:{$agent->id}"])
            ->assertStatus(422)->assertJsonPath('code', 'idempotency.key_reused');

        $this->assertSame(1, self::$ecritures);
    }

    public function test_la_meme_cle_pour_un_autre_fichier_est_refusee(): void
    {
        $this->utilisateur();
        $cle = ['Idempotency-Key' => 'cle-0004-dddd'];

        $this->post('/api/_test/idempotence/12', ['voice' => UploadedFile::fake()->createWithContent('note.webm', 'son-un')], $cle + ['Accept' => 'application/json'])
            ->assertStatus(201);
        $this->post('/api/_test/idempotence/12', ['voice' => UploadedFile::fake()->createWithContent('note.webm', 'son-un')], $cle + ['Accept' => 'application/json'])
            ->assertStatus(201)->assertHeader('Idempotent-Replayed', 'true');
        $this->post('/api/_test/idempotence/12', ['voice' => UploadedFile::fake()->createWithContent('note.webm', 'son-deux')], $cle + ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('code', 'idempotency.key_reused');

        $this->assertSame(1, self::$ecritures);
    }

    public function test_un_422_de_validation_ne_se_range_pas(): void
    {
        $this->utilisateur();
        $cle = ['Idempotency-Key' => 'cle-0005-eeee'];

        $this->postJson('/api/_test/idempotence/12', ['statut' => 'refus'], $cle)->assertStatus(422);
        $this->postJson('/api/_test/idempotence/12', ['statut' => 'refus', 'obligatoire' => 'oui'], $cle)
            ->assertStatus(201)->assertHeaderMissing('Idempotent-Replayed');

        $this->assertSame(1, self::$ecritures);
    }

    public function test_un_envoi_qui_trouve_le_verrou_pris_recoit_409_sans_ecrire(): void
    {
        $user = $this->utilisateur();
        $cle = 'cle-0006-ffff';
        $verrou = Cache::lock('idempotency-lock:'.$user->getKey().':test.idempotence:'.hash('sha256', $cle), 120);
        $this->assertTrue($verrou->get());

        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], ['Idempotency-Key' => $cle])
            ->assertStatus(409)->assertJsonPath('code', 'idempotency.in_progress');
        $this->assertSame(0, self::$ecritures);

        $verrou->release();
        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], ['Idempotency-Key' => $cle])->assertStatus(201);
        $this->assertSame(1, self::$ecritures);
    }

    public function test_vingt_cinq_heures_plus_tard_la_cle_ecrit_de_nouveau(): void
    {
        $this->utilisateur();
        $cle = ['Idempotency-Key' => 'cle-0007-gggg'];
        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], $cle)->assertStatus(201);

        $this->travel(25)->hours();

        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], $cle)
            ->assertStatus(201)->assertHeaderMissing('Idempotent-Replayed');
        $this->assertSame(2, self::$ecritures);
    }

    public function test_la_cle_d_un_autre_utilisateur_ne_rejoue_pas_sa_reponse(): void
    {
        $this->utilisateur();
        $cle = ['Idempotency-Key' => 'cle-0008-hhhh'];
        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], $cle)->assertStatus(201);

        $this->utilisateur();
        $this->postJson('/api/_test/idempotence/12', ['content' => 'a'], $cle)
            ->assertStatus(201)->assertHeaderMissing('Idempotent-Replayed');
        $this->assertSame(2, self::$ecritures);
    }
}
