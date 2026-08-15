<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\ApiTestCase;

/**
 * TCK-285 — `GET /api/kyc/documents/{media}` sert des PIÈCES D'IDENTITÉ.
 *
 * Le contrôleur empile trois gardes qu'aucun test n'éprouvait
 * (`KycDocumentController.php:15-17,30-38`) :
 *   1. la signature d'URL est valide (`hasValidSignature`) ;
 *   2. le média appartient bien à un `KycDossier` — et pas à n'importe quel
 *      modèle média du dépôt, ce qui ferait de cette route un lecteur
 *      universel de fichiers ;
 *   3. l'appelant est super-admin, OU **à la fois** admin de l'agence sujet
 *      ET positionné sur elle par son profil actif.
 *
 * La garde 3 est une CONJONCTION de deux conditions distinctes, et elles ne
 * se recouvrent pas : `$request->activeProfile()?->agency_id === $subject->id`
 * et `$user->isAgencyAdminAt($subject->id)`. Chacune est donc éprouvée seule,
 * avec l'autre satisfaite — sinon on ne saurait pas laquelle porte le refus.
 *
 * Ces cas passent tous par des requêtes HTTP avec `X-Profile-Id` quand
 * l'utilisateur a des profils dans deux agences : hors requête, l'accesseur
 * `User::agency_id` rend null par sécurité (TCK-142) et le test mesurerait
 * autre chose que ce qu'il croit.
 */
class KycDocumentAccessTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');

        $this->agency = Agency::factory()->create();
    }

    // ─── Garde 1 : la signature ──────────────────────────────────

    public function test_an_unsigned_url_is_refused_even_to_the_right_admin(): void
    {
        $media = $this->kycMedia($this->agency);
        $admin = $this->agencyAdmin($this->agency);

        // Même appelant, même média : seule la signature manque.
        $this->actingAs($admin, 'sanctum')
            ->get("/api/kyc/documents/{$media->id}")
            ->assertForbidden();
    }

    public function test_a_tampered_signature_is_refused(): void
    {
        $media = $this->kycMedia($this->agency);
        $admin = $this->agencyAdmin($this->agency);

        $url = $this->signedUrlFor($media->id).'&extra=1';

        $this->actingAs($admin, 'sanctum')->get($url)->assertForbidden();
    }

    public function test_an_expired_signature_is_refused(): void
    {
        $media = $this->kycMedia($this->agency);
        $admin = $this->agencyAdmin($this->agency);

        $url = URL::temporarySignedRoute(
            'kyc.documents.show',
            now()->subMinute(),
            ['media' => $media->id],
        );

        $this->actingAs($admin, 'sanctum')->get($url)->assertForbidden();
    }

    public function test_an_unauthenticated_caller_is_rejected_even_with_a_valid_signature(): void
    {
        $media = $this->kycMedia($this->agency);

        $this->getJson($this->signedUrlFor($media->id))->assertUnauthorized();
    }

    // ─── Garde 2 : le média est bien un document KYC ─────────────

    public function test_a_media_that_is_not_attached_to_a_kyc_dossier_returns_404(): void
    {
        // Sans cette garde, la route servirait n'importe quel média du dépôt à
        // quiconque est super-admin ou admin d'agence — un lecteur de fichiers
        // universel déguisé en endpoint KYC.
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $media = $property->addMedia(
            UploadedFile::fake()->createWithContent('plan.pdf', 'plan-du-bien')
        )->toMediaCollection('images');

        $superAdmin = $this->superAdmin();

        $this->actingAs($superAdmin, 'sanctum')
            ->get($this->signedUrlFor($media->id))
            ->assertNotFound();
    }

    // ─── Garde 3 : l'acteur ──────────────────────────────────────

    public function test_the_agency_admin_of_the_subject_agency_gets_the_file(): void
    {
        $media = $this->kycMedia($this->agency);
        $admin = $this->agencyAdmin($this->agency);

        $response = $this->actingAs($admin, 'sanctum')
            ->get($this->signedUrlFor($media->id));

        $response->assertOk();
        $this->assertSame('piece-identite', $response->streamedContent());
    }

    public function test_a_super_admin_gets_the_file(): void
    {
        $media = $this->kycMedia($this->agency);

        $this->actingAs($this->superAdmin(), 'sanctum')
            ->get($this->signedUrlFor($media->id))
            ->assertOk();
    }

    public function test_the_agency_admin_of_another_agency_is_refused(): void
    {
        // La fuite la plus directe : les pièces d'identité d'une agence
        // servies au patron d'une agence concurrente.
        $media = $this->kycMedia($this->agency);
        $intruder = $this->agencyAdmin(Agency::factory()->create());

        $this->actingAs($intruder, 'sanctum')
            ->get($this->signedUrlFor($media->id))
            ->assertForbidden();
    }

    public function test_a_member_of_the_right_agency_who_is_not_admin_is_refused(): void
    {
        // Condition « profil actif sur la bonne agence » SATISFAITE, condition
        // « est admin de cette agence » NON satisfaite. Isole la seconde.
        $media = $this->kycMedia($this->agency);

        $owner = User::factory()->create();
        OwnerProfile::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->actingAs($owner, 'sanctum')
            ->get($this->signedUrlFor($media->id))
            ->assertForbidden();
    }

    public function test_an_admin_of_the_right_agency_acting_under_another_profile_is_refused(): void
    {
        // Condition « est admin de cette agence » SATISFAITE, condition
        // « profil actif sur cette agence » NON satisfaite : l'appelant est
        // bien admin de l'agence sujet, mais il agit sous son profil de
        // l'autre agence. Isole la première, et c'est le seul cas qui
        // distingue `isAgencyAdminAt()` de `activeProfile()->agency_id`.
        $media = $this->kycMedia($this->agency);
        $otherAgency = Agency::factory()->create();

        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
        ]);
        $otherProfile = AgencyAdminProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $otherAgency->id,
        ]);

        // ⚠ `X-Profile-Id` attend l'identifiant COMPOSITE `<type>:<id>`
        // (`ActiveProfileResolver::compositeId`). Un id nu n'est pas résolu et
        // le middleware rend 403 : le test passerait alors sans jamais
        // atteindre la garde KYC qu'il prétend éprouver.
        $this->actingAs($user, 'sanctum')
            ->get($this->signedUrlFor($media->id), [
                'X-Profile-Id' => "agency_admin:{$otherProfile->id}",
            ])
            ->assertForbidden();
    }

    public function test_the_same_admin_acting_under_the_right_profile_gets_the_file(): void
    {
        // Le témoin du cas précédent : même utilisateur, même média, seul le
        // profil actif change. Sans lui, un 403 systématique passerait pour
        // une garde.
        $media = $this->kycMedia($this->agency);
        $otherAgency = Agency::factory()->create();

        $user = User::factory()->create();
        $rightProfile = AgencyAdminProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
        ]);
        AgencyAdminProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $otherAgency->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->get($this->signedUrlFor($media->id), [
                'X-Profile-Id' => "agency_admin:{$rightProfile->id}",
            ])
            ->assertOk();
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function signedUrlFor(int $mediaId): string
    {
        return URL::temporarySignedRoute(
            'kyc.documents.show',
            now()->addMinutes(15),
            ['media' => $mediaId],
        );
    }

    /** Un média rattaché au dossier KYC d'une agence. */
    private function kycMedia(Agency $agency): Media
    {
        $dossier = KycDossier::create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Submitted,
            'submitted_at' => now(),
        ]);

        return $dossier->addMedia(
            UploadedFile::fake()->createWithContent('cni.pdf', 'piece-identite')
        )->toMediaCollection('documents');
    }

    private function agencyAdmin(Agency $agency): User
    {
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);

        return $user;
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'super_admin');

        return $user;
    }
}
