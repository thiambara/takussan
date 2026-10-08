<?php

namespace Tests\Feature\Api;

use App\Models\Document;
use App\Models\DocumentShareLink;
use App\Models\Enums\DocumentType;
use App\Models\Property;
use App\Models\User;
use App\Services\Model\DocumentShareLinkService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §7, AC29-AC30) — débit par IP sur la lecture, et mots de passe faux comptés
 * PAR LIEN : changer d'adresse ne rouvre pas les essais.
 */
class DocumentShareLinkThrottleTest extends TestCase
{
    use RefreshDatabase;

    private function link(array $data = []): string
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $document = Document::create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $owner->id,
            'name' => 'Bail',
            'type' => DocumentType::Other,
        ]);
        $link = app(DocumentShareLinkService::class)->create($document, $owner, $data);

        return (string) $link->token;
    }

    /** AC29 — la 31ᵉ lecture dans la minute, même IP : 429. */
    public function test_the_31st_read_in_a_minute_is_throttled(): void
    {
        $token = $this->link();
        for ($i = 0; $i < 30; $i++) {
            $this->getJson("/api/share/{$token}")->assertOk();
        }
        $this->getJson("/api/share/{$token}")->assertStatus(429);
    }

    /** Le téléchargement a son propre compteur, plus bas. */
    public function test_downloads_are_throttled_at_ten(): void
    {
        $token = $this->link();
        for ($i = 0; $i < 10; $i++) {
            $this->get("/api/share/{$token}/download")->assertStatus(404); // aucun fichier joint
        }
        $this->get("/api/share/{$token}/download")->assertStatus(429);
    }

    /** AC30 — 5 mots de passe faux depuis 5 IP, puis le bon depuis une 6ᵉ : 429. */
    public function test_wrong_passwords_are_counted_per_link_not_per_ip(): void
    {
        $token = $this->link(['password' => 'bon-mot-de-passe']);

        for ($i = 1; $i <= 5; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "10.0.0.{$i}"])
                ->postJson("/api/share/{$token}", ['password' => 'faux'])->assertStatus(401);
        }

        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.6'])
            ->postJson("/api/share/{$token}", ['password' => 'bon-mot-de-passe'])
            ->assertStatus(429)->assertJsonPath('code', 'share_link.too_many_attempts');

        // Un AUTRE lien n'en pâtit pas.
        $other = $this->link(['password' => 'autre']);
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.6'])
            ->postJson("/api/share/{$other}", ['password' => 'autre'])->assertOk();
        $this->assertSame(2, DocumentShareLink::query()->count());
    }

    /** Le bon mot de passe avant la limite ouvre, et ne consomme pas d'essai. */
    public function test_the_right_password_within_the_limit_opens(): void
    {
        $token = $this->link(['password' => 'bon']);
        for ($i = 0; $i < 4; $i++) {
            $this->postJson("/api/share/{$token}", ['password' => 'faux'])->assertStatus(401);
        }
        $this->postJson("/api/share/{$token}", ['password' => 'bon'])->assertOk();
        $this->postJson("/api/share/{$token}", ['password' => 'bon'])->assertOk();
    }

    /**
     * VERIF-602 m1 — une rafale simultanée ne dépasse pas la borne. Chaque évaluation du mot de passe
     * (bcrypt, la fenêtre de la course) voit arriver une AUTRE requête faux sur le même lien, comme
     * douze processus partis au même instant : au plus 5 essais sont évalués, les autres rendent 429
     * sans l'être — et le bon mot de passe, arrivé après la rafale, aussi.
     */
    public function test_a_simultaneous_burst_evaluates_at_most_five_passwords(): void
    {
        $token = $this->link(['password' => 'BonMotDePasse']);
        $service = app(DocumentShareLinkService::class);
        $state = (object) ['evaluated' => 0, 'refused' => 0, 'pending' => 11];

        $nextRequest = function () use ($service, $token, $state): void {
            if ($state->pending <= 0) {
                return;
            }
            $state->pending--;
            try {
                $service->validate($token, 'faux'.$state->pending);
            } catch (HttpException $e) {
                if ($e->getStatusCode() === 429) {
                    $state->refused++;
                }
            }
        };
        $real = app('hash');
        Hash::shouldReceive('check')->andReturnUsing(function (string $value, string $hash) use ($real, $nextRequest, $state): bool {
            $state->evaluated++;
            $nextRequest(); // une requête concurrente arrive pendant le bcrypt de celle-ci

            return $real->check($value, $hash);
        });

        while ($state->pending > 0) {
            $nextRequest(); // la rafale se vide : le reste arrive après le premier essai jugé
        }

        $this->assertSame(5, $state->evaluated, 'essais évalués');
        $this->assertSame(6, $state->refused, 'essais refusés sans évaluation');
        $this->postJson("/api/share/{$token}", ['password' => 'BonMotDePasse'])->assertStatus(429);
    }
}
