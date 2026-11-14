<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2614 (décision 2b, porteur, 2026-11-13) — le NINEA n'est requis que d'un bailleur SOCIÉTÉ
 * (`metadata.owner_type = company`, la règle d'{@see OwnerProfile::companyName()}) ; pour une personne physique, il est
 * facultatif. Les deux lecteurs de « pièces complètes » le disent ensemble : `GET /api/me/pieces` (`required`) et l'étape
 * `kyc` du bailleur dans « Démarrer » (`PiecesDuProfil::requisesEnvoyees`). L'un sans l'autre ferait mentir l'écran.
 */
class NineaFacultatifDuParticulierTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_le_particulier_sans_ninea_a_ses_pieces_completes(): void
    {
        [$bailleur, $profil] = $this->bailleur('individual');
        $this->piece($profil, DocumentType::IdCard, $bailleur);
        $this->piece($profil, DocumentType::Rib, $bailleur);

        $this->assertFalse($this->requise($profil, 'ninea'));
        $this->assertTrue($this->requise($profil, 'cni'));
        $this->assertTrue($this->etapeKyc($profil), 'pièce d’identité et RIB suffisent au particulier');
    }

    /** Un profil sans `owner_type` (invité avant TCK-1323) est un particulier, comme pour `companyName()`. */
    public function test_le_bailleur_sans_type_est_un_particulier(): void
    {
        [$bailleur, $profil] = $this->bailleur(null);
        $this->piece($profil, DocumentType::IdCard, $bailleur);
        $this->piece($profil, DocumentType::Rib, $bailleur);

        $this->assertFalse($this->requise($profil, 'ninea'));
        $this->assertTrue($this->etapeKyc($profil));
    }

    public function test_la_societe_sans_ninea_n_a_pas_ses_pieces_completes(): void
    {
        [$bailleur, $profil] = $this->bailleur('company');
        $this->piece($profil, DocumentType::IdCard, $bailleur);
        $this->piece($profil, DocumentType::Rib, $bailleur);

        $this->assertTrue($this->requise($profil, 'ninea'));
        $this->assertFalse($this->etapeKyc($profil), 'le NINEA manque à la société');

        $profil->forceFill(['tax_id' => '01234567G2'])->save();
        $this->assertTrue($this->etapeKyc($profil));
    }

    /** @return array{0: User, 1: OwnerProfile} */
    private function bailleur(?string $type): array
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $profil = OwnerProfile::query()->where('user_id', $bailleur->id)->sole();
        $profil->forceFill(['metadata' => $type === null ? null : ['owner_type' => $type]])->save();

        return [$bailleur, $profil];
    }

    private function piece(OwnerProfile $profil, DocumentType $type, User $par): void
    {
        Document::factory()->create([
            'documentable_type' => OwnerProfile::class,
            'documentable_id' => $profil->id,
            'uploaded_by' => $par->id,
            'type' => $type->value,
        ]);
    }

    private function requise(OwnerProfile $profil, string $code): bool
    {
        return (bool) collect($this->apiGet('/api/me/pieces', $this->entete($profil))->assertOk()->json('data'))
            ->firstWhere('code', $code)['required'];
    }

    private function etapeKyc(OwnerProfile $profil): bool
    {
        return (bool) collect($this->apiGet('/api/me/espace/demarrage', $this->entete($profil))->assertOk()->json('data.etapes'))
            ->firstWhere('code', 'kyc')['faite'];
    }

    /** @return array<string, string> */
    private function entete(OwnerProfile $profil): array
    {
        return ['X-Profile-Id' => "owner:{$profil->id}"];
    }
}
