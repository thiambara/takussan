<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2612 — `GET /api/me/pieces` : la liste à faire des pièces du PROFIL ACTIF (bailleur, agent, prestataire), chaque
 * pièce avec `code` (la sorte de l'envoi), `required`, `kind` (`file` | `number` | `file_and_number`) et `state`, lu sur
 * les `Document` vivants du profil (`is_verified` porte la vérification, pièce par pièce) et, pour le NINEA du bailleur,
 * sur le numéro saisi (`tax_id`). Un profil sans pièces (admin, client) rend une liste vide.
 *
 * Rouge avant TCK-2612 : la route n'existait pas (404). TCK-2614 : chaque pièce porte aussi `file` (`null` ici : les pièces de fabrique n'ont pas de média ; le fichier lui-même est éprouvé par MePiecesFichierTest).
 */
class MePiecesTest extends ApiTestCase
{
    use RefreshDatabase;

    private const URL = '/api/me/pieces';

    /** AC3 — RIB envoyé, NINEA saisi en numéro, pièce d'identité manquante. */
    public function test_le_bailleur_au_rib_envoye_et_au_ninea_saisi(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $profil = OwnerProfile::query()->where('user_id', $bailleur->id)->sole();
        $this->piece($profil, DocumentType::Rib, $bailleur);
        $profil->forceFill(['tax_id' => '01234567G2'])->save();

        $this->apiGet(self::URL, $this->entete('owner', $profil->id))->assertOk()->assertExactJson(['data' => [
            ['code' => 'cni', 'required' => true, 'kind' => 'file', 'state' => 'missing', 'file' => null],
            ['code' => 'rib', 'required' => true, 'kind' => 'file', 'state' => 'sent', 'file' => null],
            // TCK-2614 (décision 2b) — facultatif pour ce bailleur, qui n'est pas une société.
            ['code' => 'ninea', 'required' => false, 'kind' => 'file_and_number', 'state' => 'sent', 'file' => null, 'number_masked' => '•••• 67G2'],
        ]]);
    }

    /** Une pièce vérifiée se dit vérifiée ; une pièce supprimée redevient à fournir ; le NINEA en fichier vaut envoyé. */
    public function test_les_etats_d_une_piece_de_bailleur(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $profil = OwnerProfile::query()->where('user_id', $bailleur->id)->sole();
        $this->piece($profil, DocumentType::IdCard, $bailleur, ['is_verified' => true, 'verified_at' => now()]);
        $this->piece($profil, DocumentType::Rib, $bailleur)->delete();
        $this->piece($profil, DocumentType::Ninea, $bailleur);

        $this->assertSame(
            ['cni' => 'verified', 'rib' => 'missing', 'ninea' => 'sent'],
            $this->etats($this->entete('owner', $profil->id)),
        );
    }

    public function test_l_agent_sans_piece_a_trois_pieces_a_fournir(): void
    {
        $agent = $this->apiActingAsRole('agent');
        $profil = AgentProfile::query()->where('user_id', $agent->id)->sole();

        $this->apiGet(self::URL, $this->entete('agent', $profil->id))->assertOk()->assertExactJson(['data' => [
            ['code' => 'license', 'required' => true, 'kind' => 'file', 'state' => 'missing', 'file' => null],
            ['code' => 'cni', 'required' => true, 'kind' => 'file', 'state' => 'missing', 'file' => null],
            ['code' => 'photo', 'required' => true, 'kind' => 'file', 'state' => 'missing', 'file' => null],
        ]]);

        $this->piece($profil, DocumentType::Photo, $agent);
        $this->assertSame('sent', $this->etats($this->entete('agent', $profil->id))['photo']);
    }

    /** L'assurance RC pro du prestataire reste facultative. */
    public function test_le_prestataire_a_une_piece_requise_et_l_assurance_facultative(): void
    {
        $prestataire = User::factory()->withServiceProviderProfile()->create();
        $this->actingAs($prestataire, 'sanctum');
        $profil = ServiceProviderProfile::query()->where('user_id', $prestataire->id)->sole();
        $this->piece($profil, DocumentType::Insurance, $prestataire);

        $this->apiGet(self::URL, $this->entete('service_provider', $profil->id))->assertOk()->assertExactJson(['data' => [
            ['code' => 'cni', 'required' => true, 'kind' => 'file', 'state' => 'missing', 'file' => null],
            ['code' => 'insurance', 'required' => false, 'kind' => 'file', 'state' => 'sent', 'file' => null],
        ]]);
    }

    /** L'agence est la frontière : la pièce du profil bailleur du même compte dans une AUTRE agence ne compte pas ici. */
    public function test_la_piece_d_un_autre_profil_du_compte_ne_compte_pas(): void
    {
        $agenceA = Agency::factory()->create();
        $agenceB = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agenceA]);
        $this->materializeRoleProfile($bailleur, 'owner', $agenceB);
        $profilA = OwnerProfile::query()->where('user_id', $bailleur->id)->where('agency_id', $agenceA->id)->sole();
        $profilB = OwnerProfile::query()->where('user_id', $bailleur->id)->where('agency_id', $agenceB->id)->sole();
        $this->piece($profilB, DocumentType::IdCard, $bailleur);
        $profilB->forceFill(['tax_id' => '01234567G2'])->save();

        $this->assertSame(['cni' => 'missing', 'rib' => 'missing', 'ninea' => 'missing'], $this->etats($this->entete('owner', $profilA->id)));
        $this->assertSame(['cni' => 'sent', 'rib' => 'missing', 'ninea' => 'sent'], $this->etats($this->entete('owner', $profilB->id)));
    }

    public function test_un_profil_sans_pieces_rend_une_liste_vide(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet(self::URL)->assertOk()->assertExactJson(['data' => []]);
    }

    public function test_sans_session_401(): void
    {
        $this->getJson(self::URL)->assertUnauthorized();
    }

    /** @param  array<string, mixed>  $attributs */
    private function piece(Model $profil, DocumentType $type, User $par, array $attributs = []): Document
    {
        return Document::factory()->create([
            'documentable_type' => $profil::class,
            'documentable_id' => $profil->getKey(),
            'uploaded_by' => $par->id,
            'type' => $type->value,
            ...$attributs,
        ]);
    }

    /**
     * @param  array<string, string>  $entete
     * @return array<string, string>
     */
    private function etats(array $entete): array
    {
        return collect($this->apiGet(self::URL, $entete)->assertOk()->json('data'))->pluck('state', 'code')->all();
    }

    /** @return array<string, string> */
    private function entete(string $alias, int $id): array
    {
        return ['X-Profile-Id' => "{$alias}:{$id}"];
    }
}
