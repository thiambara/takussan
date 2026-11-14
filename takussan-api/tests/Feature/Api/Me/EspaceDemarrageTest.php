<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\DocumentType;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2479 (ADR-0089 §5) — `GET /api/me/espace/demarrage` : les étapes du groupe « Démarrer » du
 * menu de `/app`, jugées sur le PROFIL ACTIF.
 *
 * Agence neuve, agence en service, hôte, bailleur, agent et prestataire (TCK-2612) ; et tout profil sans étape (compte sans
 * profil, admin dont le rôle retire `agency.update`) → 200 et `etapes: []` : le groupe ne s'affiche
 * pas, ce n'est pas une erreur.
 *
 * Rouge avant TCK-2479 : la route n'existait pas (404).
 */
class EspaceDemarrageTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const URL = '/api/me/espace/demarrage';

    private const CODES_D_AGENCE = ['premier_bien', 'kyc', 'equipe'];

    public function test_une_agence_neuve_rend_ses_trois_etapes_a_faire(): void
    {
        [, $entete] = $this->adminDUneAgence();

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'kyc', 'faite' => false],
            ['code' => 'equipe', 'faite' => false],
        ]]]);
    }

    /** @return array<string, array{0: string}> */
    public static function codesDAgence(): array
    {
        return array_combine(self::CODES_D_AGENCE, array_map(fn (string $c) => [$c], self::CODES_D_AGENCE));
    }

    /** Chaque fait de la mise en service (TCK-589) fait passer SON étape, et elle seule. */
    #[DataProvider('codesDAgence')]
    public function test_chaque_fait_de_l_agence_fait_passer_sa_seule_etape(string $code): void
    {
        [$agence, $entete] = $this->adminDUneAgence();
        $this->poser($code, $agence);

        $this->assertSame(
            array_map(fn (string $c) => ['code' => $c, 'faite' => $c === $code], self::CODES_D_AGENCE),
            $this->apiGet(self::URL, $entete)->assertOk()->json('data.etapes'),
        );
    }

    public function test_une_agence_en_service_rend_ses_trois_etapes_faites(): void
    {
        [$agence, $entete] = $this->adminDUneAgence();
        foreach (self::CODES_D_AGENCE as $code) {
            $this->poser($code, $agence);
        }

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => true],
            ['code' => 'kyc', 'faite' => true],
            ['code' => 'equipe', 'faite' => true],
        ]]]);
    }

    /**
     * L'hôte n'a pas d'équipe (TCK-777), et lit les étapes de SON AGENCE sous ses DEUX profils.
     *
     * Le KYC vérifié de l'agence distingue les deux lectures : sous le profil bailleur, l'étape `kyc`
     * du bailleur (`metadata.kyc.submitted_at`, absent ici) rendrait `false`. Sans ce fait, l'état
     * vide des deux lectures est identique, et le test ne voyait pas la branche de l'hôte retirée
     * (ablation 5, mesurée verte avant ce renfort).
     */
    public function test_l_hote_lit_les_etapes_de_son_agence_sans_equipe_sous_ses_deux_profils(): void
    {
        $agence = Agency::factory()->individual()->create();
        $hote = $this->apiActingAsRole('agency_admin', ['agency' => $agence]);
        $this->materializeRoleProfile($hote, 'owner', $agence);
        $this->poser('kyc', $agence);
        $attendu = ['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'kyc', 'faite' => true],
        ]]];

        $this->apiGet(self::URL, $this->entete('agency_admin', $this->idDuProfil(AgencyAdminProfile::class, $hote)))
            ->assertOk()->assertExactJson($attendu);
        $this->apiGet(self::URL, $this->entete('owner', $this->idDuProfil(OwnerProfile::class, $hote)))
            ->assertOk()->assertExactJson($attendu);
    }

    public function test_le_bailleur_rend_son_premier_bien_et_ses_pieces(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $profil = OwnerProfile::query()->where('user_id', $bailleur->id)->firstOrFail();
        $entete = $this->entete('owner', $profil->id);

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => false],
            ['code' => 'kyc', 'faite' => false],
        ]]]);

        Property::factory()->draft()->create(['agency_id' => $agence->id, 'user_id' => $bailleur->id]);
        $this->assertFalse($this->etape($entete, 'premier_bien'), 'un brouillon n’est pas un premier bien');

        Property::factory()->published()->create(['agency_id' => $agence->id, 'user_id' => $bailleur->id]);
        $profil->forceFill(['metadata' => ['kyc' => ['submitted_at' => now()->toIso8601String()]]])->save();

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'premier_bien', 'faite' => true],
            ['code' => 'kyc', 'faite' => true],
        ]]]);
    }

    public function test_le_bien_d_un_autre_ou_d_une_autre_agence_ne_compte_pas(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $entete = $this->entete('owner', $this->idDuProfil(OwnerProfile::class, $bailleur));
        Property::factory()->published()->create(['agency_id' => $agence->id]);
        Property::factory()->published()->create(['agency_id' => Agency::factory()->create()->id, 'user_id' => $bailleur->id]);

        $this->assertFalse($this->etape($entete, 'premier_bien'));
    }

    /**
     * TCK-2612 (AC2) — l'agent a une étape « Pièces » : à faire sans pièce, faite quand ses trois pièces requises sont parties.
     * Rouge sur `dev` : `etapes: []`.
     */
    public function test_l_agent_a_l_etape_pieces_faite_quand_ses_pieces_requises_sont_envoyees(): void
    {
        $agent = $this->apiActingAsRole('agent');
        $profil = AgentProfile::query()->where('user_id', $agent->id)->sole();
        $entete = $this->entete('agent', $profil->id);

        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'pieces', 'faite' => false],
        ]]]);

        $this->piece($profil, DocumentType::Other, $agent);
        $this->piece($profil, DocumentType::IdCard, $agent);
        $this->assertFalse($this->etape($entete, 'pieces'), 'la photo manque encore');

        $this->piece($profil, DocumentType::Photo, $agent, ['is_verified' => true, 'verified_at' => now()]);
        $this->assertTrue($this->etape($entete, 'pieces'));
    }

    /** TCK-2612 — le prestataire : sa pièce d'identité suffit, l'assurance RC pro est facultative. */
    public function test_le_prestataire_a_l_etape_pieces_sans_attendre_l_assurance(): void
    {
        $prestataire = User::factory()->withServiceProviderProfile()->create();
        $this->actingAs($prestataire, 'sanctum');
        $profil = ServiceProviderProfile::query()->where('user_id', $prestataire->id)->sole();
        $entete = $this->entete('service_provider', $profil->id);

        $this->piece($profil, DocumentType::Insurance, $prestataire);
        $this->apiGet(self::URL, $entete)->assertOk()->assertExactJson(['data' => ['etapes' => [
            ['code' => 'pieces', 'faite' => false],
        ]]]);

        $this->piece($profil, DocumentType::IdCard, $prestataire);
        $this->assertTrue($this->etape($entete, 'pieces'));
    }

    /**
     * TCK-2612 — l'étape `kyc` du bailleur compte le NINEA saisi comme la pièce NINEA : pièce d'identité et RIB envoyés, NINEA
     * tapé → faite, sans soumission. Sans le NINEA, elle reste à faire. TCK-2614 (décision 2b) : pour une SOCIÉTÉ — le NINEA
     * d'un particulier est facultatif (`NineaFacultatifDuParticulierTest`).
     */
    public function test_le_ninea_saisi_compte_pour_l_etape_kyc_du_bailleur(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = $this->apiActingAsRole('owner', ['agency' => $agence]);
        $profil = OwnerProfile::query()->where('user_id', $bailleur->id)->sole();
        $profil->forceFill(['metadata' => ['owner_type' => 'company']])->save();
        $entete = $this->entete('owner', $profil->id);
        $this->piece($profil, DocumentType::IdCard, $bailleur);
        $this->piece($profil, DocumentType::Rib, $bailleur);

        $this->assertFalse($this->etape($entete, 'kyc'), 'le NINEA manque');

        $profil->forceFill(['tax_id' => '01234567G2'])->save();
        $this->assertTrue($this->etape($entete, 'kyc'));
    }

    public function test_un_compte_sans_profil_n_a_pas_d_etape(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet(self::URL)->assertOk()->assertExactJson(['data' => ['etapes' => []]]);
    }

    /**
     * Revue de TCK-2479 (M1, principe n° 2 : l'agence est la frontière d'isolation) — un compte admin
     * de DEUX agences lit les étapes de l'agence de son PROFIL ACTIF, jamais d'une autre agence du
     * compte. Les faits sont posés sur A seule : sous le profil de B, tout reste à faire ; sous A,
     * tout est fait. Avant ce test, chaque cas créait un compte d'une seule agence, et une régression
     * qui prendrait le premier profil d'admin du compte (ou `users.agency_id`) restait verte.
     */
    public function test_un_admin_de_deux_agences_lit_l_agence_de_son_profil_actif(): void
    {
        $agenceA = Agency::factory()->create();
        $agenceB = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agenceA]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agenceB);
        foreach (self::CODES_D_AGENCE as $code) {
            $this->poser($code, $agenceA);
        }
        $profilDe = fn (Agency $agence): int => (int) AgencyAdminProfile::query()
            ->where('user_id', $admin->id)->where('agency_id', $agence->id)->value('id');
        $this->assertNotSame($profilDe($agenceA), $profilDe($agenceB));

        $this->apiGet(self::URL, $this->entete('agency_admin', $profilDe($agenceB)))
            ->assertOk()->assertExactJson(['data' => ['etapes' => [
                ['code' => 'premier_bien', 'faite' => false],
                ['code' => 'kyc', 'faite' => false],
                ['code' => 'equipe', 'faite' => false],
            ]]]);
        $this->apiGet(self::URL, $this->entete('agency_admin', $profilDe($agenceA)))
            ->assertOk()->assertExactJson(['data' => ['etapes' => [
                ['code' => 'premier_bien', 'faite' => true],
                ['code' => 'kyc', 'faite' => true],
                ['code' => 'equipe', 'faite' => true],
            ]]]);
    }

    /** TCK-2024 — la règle de la carte de mise en service : sans `agency.update`, pas d'étape. */
    public function test_un_admin_dont_le_role_retire_agency_update_n_a_pas_d_etape(): void
    {
        $agence = Agency::factory()->create();
        $admin = $this->adminWithout($agence, Capability::AgencyUpdate);
        $this->actingAs($admin, 'sanctum');

        $this->apiGet(self::URL, $this->entete('agency_admin', $this->idDuProfil(AgencyAdminProfile::class, $admin)))
            ->assertOk()->assertExactJson(['data' => ['etapes' => []]]);
    }

    /** @return array{0: Agency, 1: array<string, string>} */
    private function adminDUneAgence(): array
    {
        $agence = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        return [$agence, $this->entete('agency_admin', $this->idDuProfil(AgencyAdminProfile::class, $admin))];
    }

    private function poser(string $code, Agency $agence): void
    {
        match ($code) {
            'premier_bien' => Property::factory()->published()->create(['agency_id' => $agence->id, 'is_test' => false]),
            'kyc' => KycDossier::query()->create([
                'subject_type' => Agency::class,
                'subject_id' => $agence->id,
                'status' => KycDossierStatus::Verified,
                'metadata' => [],
            ]),
            'equipe' => AgentProfile::query()->create([
                'user_id' => User::factory()->create()->id,
                'agency_id' => $agence->id,
                'status' => AgentProfileStatus::Active,
            ]),
        };
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

    /** @param class-string $classe */
    private function idDuProfil(string $classe, User $user): int
    {
        return (int) $classe::query()->where('user_id', $user->id)->value('id');
    }

    /** @return array<string, string> */
    private function entete(string $alias, int $id): array
    {
        return ['X-Profile-Id' => "{$alias}:{$id}"];
    }

    /** @param array<string, string> $entete */
    private function etape(array $entete, string $code): bool
    {
        return (bool) collect($this->apiGet(self::URL, $entete)->assertOk()->json('data.etapes'))
            ->firstWhere('code', $code)['faite'];
    }
}
