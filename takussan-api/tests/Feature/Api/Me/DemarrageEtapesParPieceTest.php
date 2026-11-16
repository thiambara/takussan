<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2944 — « Démarrer » liste les pièces une à une : pour le bailleur, l'agent et le prestataire, une étape
 * `piece:<code>` par pièce REQUISE du profil actif, dans l'ordre de `PiecesDuProfil` (la liste de `/app/pieces`), avec
 * son `etat` (`manquante` | `envoyee` | `verifiee` | `refusee`). Les étapes uniques `kyc` (bailleur) et `pieces`
 * (agent, prestataire) disparaissent ; l'étape `kyc` de l'AGENCE (sa vérification) reste.
 *
 * Le `<code>` est celui de `PiecesDuProfil` (`cni`, `rib`, `ninea`, `license`, `photo`, `insurance`) : le même que
 * `GET /api/me/pieces`, pour que l'écran et le menu se libellent d'une seule table.
 *
 * Rouge avant TCK-2944 : le bailleur recevait `kyc`, l'agent et le prestataire `pieces`.
 */
class DemarrageEtapesParPieceTest extends ApiTestCase
{
    use RefreshDatabase;

    private const URL = '/api/me/espace/demarrage';

    /** AC1 — RIB et pièce d'identité manquants → deux étapes non faites ; le RIB envoyé → `envoyee`, faite. */
    public function test_le_bailleur_recoit_une_etape_par_piece_requise(): void
    {
        [$bailleur, $profil] = $this->bailleur();
        $entete = $this->entete('owner', $profil);

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'piece:cni', 'faite' => false, 'etat' => 'manquante'],
            ['code' => 'piece:rib', 'faite' => false, 'etat' => 'manquante'],
        ]]]);

        $this->piece($profil, DocumentType::Rib, $bailleur);

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'piece:cni', 'faite' => false, 'etat' => 'manquante'],
            ['code' => 'piece:rib', 'faite' => true, 'etat' => 'envoyee'],
        ]]]);
    }

    /** Une pièce vérifiée → `verifiee`, faite ; la société a en plus son NINEA, que le numéro tapé fait passer. */
    public function test_la_societe_a_son_ninea_et_une_piece_verifiee_est_verifiee(): void
    {
        [$bailleur, $profil] = $this->bailleur('company');
        $entete = $this->entete('owner', $profil);
        $this->piece($profil, DocumentType::IdCard, $bailleur, ['is_verified' => true, 'verified_at' => now()]);
        $profil->forceFill(['tax_id' => '01234567G2'])->save();

        $this->assertSame([
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'piece:cni', 'faite' => true, 'etat' => 'verifiee'],
            ['code' => 'piece:rib', 'faite' => false, 'etat' => 'manquante'],
            ['code' => 'piece:ninea', 'faite' => true, 'etat' => 'envoyee'],
        ], $this->apiGet(self::URL, $entete)->assertOk()->json('data.etapes'));
    }

    /** AC2 — l'agent : ses trois pièces, sans étape `pieces` ni `kyc`. */
    public function test_l_agent_recoit_ses_pieces_une_a_une(): void
    {
        $agent = $this->apiActingAsRole('agent');
        $profil = AgentProfile::query()->where('user_id', $agent->id)->sole();
        $this->piece($profil, DocumentType::IdCard, $agent);

        $this->apiGet(self::URL, $this->entete('agent', $profil))->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'piece:license', 'faite' => false, 'etat' => 'manquante'],
            ['code' => 'piece:cni', 'faite' => true, 'etat' => 'envoyee'],
            ['code' => 'piece:photo', 'faite' => false, 'etat' => 'manquante'],
        ]]]);
    }

    /** Le prestataire : l'assurance RC pro est facultative, elle n'est pas une étape — même envoyée. */
    public function test_le_prestataire_n_a_que_sa_piece_requise(): void
    {
        $prestataire = User::factory()->withServiceProviderProfile()->create();
        $this->actingAs($prestataire, 'sanctum');
        $profil = ServiceProviderProfile::query()->where('user_id', $prestataire->id)->sole();
        $this->piece($profil, DocumentType::Insurance, $prestataire);

        $this->apiGet(self::URL, $this->entete('service_provider', $profil))->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'piece:cni', 'faite' => false, 'etat' => 'manquante'],
        ]]]);
    }

    /** AC2 (non-régression) — l'admin d'agence garde `premier_bien`, `kyc` (vérification de l'agence) et `equipe`. */
    public function test_l_admin_d_agence_garde_ses_trois_etapes(): void
    {
        $agence = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $profil = AgencyAdminProfile::query()->where('user_id', $admin->id)->sole();

        $this->apiGet(self::URL, $this->entete('agency_admin', $profil))->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'kyc', 'faite' => false],
            ['code' => 'equipe', 'faite' => false],
        ]]]);
    }

    /** @return array{0: User, 1: OwnerProfile} */
    private function bailleur(?string $type = null): array
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $profil = OwnerProfile::query()->where('user_id', $bailleur->id)->sole();
        if ($type !== null) {
            $profil->forceFill(['metadata' => ['owner_type' => $type]])->save();
        }

        return [$bailleur, $profil];
    }

    /** @param  array<string, mixed>  $attributs */
    private function piece(Model $profil, DocumentType $type, User $par, array $attributs = []): void
    {
        Document::factory()->create([
            'documentable_type' => $profil::class,
            'documentable_id' => $profil->getKey(),
            'uploaded_by' => $par->id,
            'type' => $type->value,
            ...$attributs,
        ]);
    }

    /** @return array<string, string> */
    private function entete(string $alias, Model $profil): array
    {
        return ['X-Profile-Id' => "{$alias}:{$profil->getKey()}"];
    }
}
