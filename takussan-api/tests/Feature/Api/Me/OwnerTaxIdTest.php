<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-2612 — `PATCH /api/me/owner-profiles/{owner_profile}/tax-id` : le bailleur TAPE son NINEA au lieu de le photographier.
 * Espaces tolérés, 7 chiffres puis le COFI (un chiffre, une lettre, un chiffre) ; écrit chiffré (`tax_id`, TCK-601), rendu
 * masqué ; seul le titulaire l'écrit. La valeur ne passe dans aucune ligne du journal.
 *
 * Rouge avant TCK-2612 : la route n'existait pas (404).
 */
class OwnerTaxIdTest extends ApiTestCase
{
    use RefreshDatabase;

    private OwnerProfile $profil;

    private User $bailleur;

    protected function setUp(): void
    {
        parent::setUp();
        $agence = Agency::factory()->create();
        $this->bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $this->profil = OwnerProfile::query()->where('user_id', $this->bailleur->id)->sole();
    }

    /** AC1 — 200, colonne illisible en clair, réponse masquée. */
    public function test_le_ninea_tape_avec_espaces_est_ecrit_chiffre_et_rendu_masque(): void
    {
        $this->patchJson($this->url(), ['tax_id' => '0 123 456 7G2'])
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $this->profil->id, 'tax_id_masked' => '•••• 67G2']]);

        $brut = (string) DB::table('owner_profiles')->where('id', $this->profil->id)->value('tax_id');
        $this->assertNotSame('', $brut);
        $this->assertStringNotContainsString('0123456', $brut);
        $this->assertSame('01234567G2', $this->profil->fresh()->tax_id);

        // Ni la valeur ni sa forme saisie dans le journal d'audit.
        $journal = DB::table('activity_log')->pluck('properties')->implode(' ');
        $this->assertStringNotContainsString('0123456', $journal);
        $this->assertStringNotContainsString('0 123 456', $journal);
    }

    public function test_la_lettre_du_cofi_est_mise_en_majuscule(): void
    {
        $this->patchJson($this->url(), ['tax_id' => '0123456 7g2'])->assertOk();

        $this->assertSame('01234567G2', $this->profil->fresh()->tax_id);
    }

    /** @return array<string, array{0: mixed}> */
    public static function malFormes(): array
    {
        return [
            'trop court' => ['12345'],
            'COFI sans lettre' => ['0123456712'],
            'lettre en tête' => ['G1234567G2'],
            'trop long' => ['01234567G23'],
            'vide' => [''],
            'non chaîne' => [[1, 2]],
        ];
    }

    /** AC1 — « 12345 » rend 422, et rien n'est écrit. */
    #[DataProvider('malFormes')]
    public function test_un_ninea_mal_forme_rend_422(mixed $valeur): void
    {
        $this->patchJson($this->url(), ['tax_id' => $valeur])->assertUnprocessable()->assertJsonValidationErrors('tax_id');

        $this->assertNull($this->profil->fresh()->tax_id);
    }

    /** Seul le titulaire écrit son NINEA : 403, même avant la validation d'un corps mal formé. */
    public function test_un_autre_compte_recoit_403(): void
    {
        $this->actingAs(User::factory()->create(), 'sanctum');

        $this->patchJson($this->url(), ['tax_id' => '0 123 456 7G2'])->assertForbidden();
        $this->patchJson($this->url(), ['tax_id' => '12345'])->assertForbidden();
        $this->assertNull($this->profil->fresh()->tax_id);
    }

    private function url(): string
    {
        return "/api/me/owner-profiles/{$this->profil->id}/tax-id";
    }
}
