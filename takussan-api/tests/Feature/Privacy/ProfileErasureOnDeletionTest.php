<?php

namespace Tests\Feature\Privacy;

use App\Models\AccountDeletionRequest;
use App\Models\Activity;
use App\Models\Enums\IdType;
use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-537 (AC2) — la politique (§ 6) et les CGU (art. 17.1) promettent qu'à la suppression d'un compte
 * « les données d'identification du compte et des profils sont effacées ou anonymisées ». Après
 * l'exécution, aucune colonne identifiante d'un profil du compte — terminé avant ou non — ne porte sa
 * valeur d'origine, ni dans la table (lue brute, sans cast), ni dans le journal d'activité ; ses
 * reversements existent toujours (OHADA, 10 ans), et ses moyens de versement ne portent plus l'IBAN.
 */
class ProfileErasureOnDeletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_suppression_efface_les_colonnes_identifiantes_des_profils(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $owner = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'rib' => 'SN012-RIB-NDIOUCK-778899',
            'tax_id' => 'NINEA-NDIOUCK-4455',
            'id_document_type' => IdType::IdCard,
            'id_document_number' => 'CNI-NDIOUCK-1234',
            'monthly_income' => '987654',
            'employer' => 'Ndiouckmbaye SARL',
            'metadata' => ['note' => 'Ndiouckmbaye'],
        ]);
        $retire = AgentProfile::factory()->create(['user_id' => $user->id, 'license_number' => 'CARTE-NDIOUCK-77', 'metadata' => ['kyc' => ['cni' => 'Ndiouckmbaye']]]);
        $retire->delete();
        $prestataire = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'insurance_policy_id' => 'POLICE-NDIOUCK-9',
            'metadata' => ['first_name' => 'Awa', 'last_name' => 'Ndiouckmbaye', 'phone' => '+221770009988'],
        ]);
        $autre = OwnerProfile::factory()->create(['rib' => 'SN012-RIB-AUTRE-1111']);
        $reversement = Payout::factory()->completed()->create(['landlord_id' => $user->id]);
        $moyen = PayoutMethod::factory()->create([
            'user_id' => $user->id,
            'account_identifier' => 'SN08NDIOUCK000123456789',
            'account_holder_name' => 'Awa Ndiouckmbaye',
        ]);
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();

        app(AccountDeletionService::class)->executeDeletion($request);

        $proprietaire = (array) DB::table('owner_profiles')->find($owner->id);
        foreach (['rib', 'tax_id', 'id_document_type', 'id_document_number', 'monthly_income', 'employer', 'metadata'] as $colonne) {
            $this->assertNull($proprietaire[$colonne], "owner_profiles.{$colonne}");
        }
        $this->assertNotNull($proprietaire['deleted_at']);
        $this->assertNull(DB::table('agent_profiles')->where('id', $retire->id)->value('license_number'));
        $this->assertNull(DB::table('agent_profiles')->where('id', $retire->id)->value('metadata'));
        $this->assertNull(DB::table('service_provider_profiles')->where('id', $prestataire->id)->value('insurance_policy_id'));
        $this->assertNull(DB::table('service_provider_profiles')->where('id', $prestataire->id)->value('metadata'));

        // Rien n'a été recopié ailleurs : le journal d'activité ne porte aucune des valeurs d'origine.
        $journal = Activity::query()->get()->toJson();
        foreach (['NDIOUCK', 'Ndiouckmbaye', '987654'] as $trace) {
            $this->assertStringNotContainsString($trace, $journal);
        }

        // Le moyen de versement : ni IBAN ni titulaire, terminé ; sa forme masquée reste.
        $versement = PayoutMethod::withTrashed()->findOrFail($moyen->id);
        $this->assertSame('', $versement->account_identifier);
        $this->assertNull($versement->account_holder_name);
        $this->assertTrue($versement->trashed());
        $this->assertStringNotContainsString('NDIOUCK', (string) DB::table('payout_methods')->where('id', $moyen->id)->value('masked_identifier'));

        // Le profil d'un autre garde ses valeurs ; le reversement demeure.
        $this->assertSame('SN012-RIB-AUTRE-1111', $autre->fresh()->rib);
        $this->assertTrue(Payout::query()->whereKey($reversement->id)->exists());
    }
}
