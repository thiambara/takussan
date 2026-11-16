<?php

namespace Tests\Feature\Payout;

use App\Models\Agency;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PayoutMethodKind;
use App\Models\Enums\PayoutNature;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Payout\OwnerStatementSnapshots;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2915 — ce que le relevé du bailleur sert de plus sur ses versements et ses biens :
 *
 *  - AC5 : `next_payout` porte le compte MASQUÉ ; chaque `payouts[]` son moyen et sa nature
 *    (TCK-2909) ; `payouts_count` = la longueur de `payouts[]` ;
 *  - AC6 : chaque ligne de bien porte `lease_reference` et `photo_url` (nulle sans photo) ;
 *  - la règle de versement : le jour du mandat, sinon celui de l'agence ;
 *  - un mois envoyé (instantané) sert les mêmes champs, au jour.
 */
class OwnerStatementPayoutDetailsTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-12 10:00:00');
        $this->agency = $this->moneyAgency();
        $this->landlord = $this->landlordOf($this->agency);
        $this->lease = $this->leaseOf($this->agency, $this->landlord);
        $this->lease->property->forceFill(['title' => 'F3 Mermoz'])->save();
        $this->lease->forceFill(['reference_number' => 'LS-2026-0042', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31'])->save();
    }

    /** @param  array<string, mixed>  $attributes */
    private function payout(array $attributes): Payout
    {
        return Payout::factory()->create($attributes + [
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
            'payee_role' => PayeeRole::Landlord,
        ]);
    }

    /** @return array<string, mixed> */
    private function statement(string $period = '2026-11'): array
    {
        Sanctum::actingAs($this->landlord);

        return $this->getJson("/api/owner-statements?period={$period}")->assertOk()->json('data');
    }

    /** AC5 — le compte masqué du prochain versement, le moyen et la nature de chaque reversement, le compteur. */
    public function test_ac5_compte_masque_moyen_nature_et_compteur(): void
    {
        $bank = PayoutMethod::factory()->create([
            'user_id' => $this->landlord->id,
            'kind' => PayoutMethodKind::BankTransfer,
            'account_identifier' => 'SN0120100100123456784521',
            'masked_identifier' => PayoutMethod::mask('SN0120100100123456784521'),
            'is_default' => false,
        ]);
        $this->payout([
            'status' => PayoutStatus::Scheduled, 'scheduled_at' => '2026-11-15 09:00:00',
            'payment_method' => PaymentMethod::BankTransfer, 'payout_method_id' => $bank->id,
        ]);
        $this->payout(['status' => PayoutStatus::Completed, 'processed_at' => '2026-11-03 10:00:00', 'payment_method' => PaymentMethod::Wave, 'nature' => PayoutNature::Advance]);
        $this->payout(['status' => PayoutStatus::Completed, 'processed_at' => '2026-11-10 10:00:00', 'payment_method' => PaymentMethod::BankTransfer, 'nature' => PayoutNature::Balance]);

        $data = $this->statement();

        $this->assertSame('bank_transfer', $data['next_payout']['payout_method_kind']);
        $this->assertSame($bank->masked_identifier, $data['next_payout']['payout_method_masked']);
        $this->assertSame('payout', $data['next_payout']['payout_method_source']);
        $this->assertStringEndsWith('4521', $data['next_payout']['payout_method_masked']);
        $this->assertStringNotContainsString('SN012010', json_encode($data), 'jamais le numéro entier');
        $this->assertSame([['wave', 'advance'], ['bank_transfer', 'balance']], array_map(fn (array $p) => [$p['payment_method'], $p['nature']], $data['payouts']));
        $this->assertSame(count($data['payouts']), $data['payouts_count']);
        $this->assertSame(2, $data['payouts_count']);
    }

    /**
     * Un prochain versement sans compte choisi : le moyen par défaut du bailleur VÉRIFIÉ pour l'agence
     * (la seule destination qu'une approbation accepte), `source: default` ; non vérifié, rien.
     */
    public function test_sans_compte_choisi_le_moyen_verifie_du_bailleur(): void
    {
        $wave = PayoutMethod::factory()->create(['user_id' => $this->landlord->id, 'is_default' => true]);
        PayoutMethod::factory()->verifiedFor($this->agency)->create(['user_id' => User::factory()->create()->id, 'is_default' => true]);
        $this->payout(['status' => PayoutStatus::Scheduled, 'scheduled_at' => '2026-11-15 09:00:00', 'payout_method_id' => null]);

        $next = $this->statement()['next_payout'];
        $this->assertSame([null, null, null], [$next['payout_method_kind'], $next['payout_method_masked'], $next['payout_method_source']], 'non vérifié : aucun compte annoncé');

        $wave->delete();
        $verified = PayoutMethod::factory()->verifiedFor($this->agency)->create(['user_id' => $this->landlord->id, 'is_default' => true]);
        $next = $this->statement()['next_payout'];
        $this->assertSame(['wave', $verified->masked_identifier, 'default'], [$next['payout_method_kind'], $next['payout_method_masked'], $next['payout_method_source']]);
    }

    /** AC6 — la référence du bail et la vignette du bien ; `null` pour un bien sans photo. */
    public function test_ac6_reference_du_bail_et_vignette(): void
    {
        Storage::fake('public');
        Storage::fake(config('media-library.disk_name'));
        $withPhoto = $this->leaseOf($this->agency, $this->landlord);
        $withPhoto->property->forceFill(['title' => 'Villa Almadies'])->save();
        $withPhoto->property->addMedia(UploadedFile::fake()->image('facade.jpg', 800, 600))->toMediaCollection('photos');

        $rows = array_column($this->statement()['properties'], null, 'title');

        $this->assertSame('LS-2026-0042', $rows['F3 Mermoz']['lease_reference']);
        $this->assertNull($rows['F3 Mermoz']['photo_url'], 'sans photo : null');
        $this->assertSame($withPhoto->reference_number, $rows['Villa Almadies']['lease_reference']);
        $this->assertIsString($rows['Villa Almadies']['photo_url']);
        $this->assertNotSame('', $rows['Villa Almadies']['photo_url']);
    }

    /** La règle de versement : le jour du mandat, sinon celui de l'agence, sinon aucune. */
    public function test_la_regle_de_versement_suit_le_mandat_puis_l_agence(): void
    {
        $this->assertSame(['day' => null, 'source' => null], $this->statement()['payout_rule']);

        $this->agency->forceFill(['settings' => ['payout_day' => 15]])->save();
        $this->assertSame(['day' => 15, 'source' => 'agency'], $this->statement()['payout_rule']);

        OwnerProfile::query()->where('user_id', $this->landlord->id)->where('agency_id', $this->agency->id)->update(['payout_day' => 5]);
        $this->assertSame(['day' => 5, 'source' => 'mandate'], $this->statement()['payout_rule']);

        // La même résolution sert `GET /api/me/payout-methods` (`meta`).
        $profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
        $this->withHeader('X-Profile-Id', 'owner:'.$profile->id);
        $this->getJson('/api/me/payout-methods')->assertOk()->assertJsonPath('meta.payout_day', 5)->assertJsonPath('meta.payout_day_source', 'mandate');
        OwnerProfile::query()->whereKey($profile->id)->update(['payout_day' => null]);
        $this->getJson('/api/me/payout-methods')->assertOk()->assertJsonPath('meta.payout_day', 15)->assertJsonPath('meta.payout_day_source', 'agency');
    }

    /** Le jour de l'agence s'écrit par les réglages de l'agence, borné à 1-28. */
    public function test_le_jour_de_l_agence_s_ecrit_par_ses_reglages(): void
    {
        Sanctum::actingAs($this->agencyAdmin($this->agency));
        $this->patchJson("/api/agencies/{$this->agency->id}", ['settings' => ['payout_day' => 31]])->assertUnprocessable()->assertJsonValidationErrors('settings.payout_day');
        $this->patchJson("/api/agencies/{$this->agency->id}", ['settings' => ['payout_day' => 10]])->assertOk();

        $this->assertSame(10, $this->agency->fresh()->setting('payout_day'));
    }

    /**
     * Un mois envoyé : l'instantané ne fige ni la règle, ni le bail, ni la vignette, ni les relances,
     * servis au jour ; un instantané d'avant ces champs reçoit le moyen et la nature de ses reversements
     * et le compteur, sans rectificatif.
     */
    public function test_un_mois_envoye_sert_les_memes_champs(): void
    {
        $this->payout(['status' => PayoutStatus::Completed, 'processed_at' => '2026-10-10 10:00:00', 'payment_method' => PaymentMethod::Wave, 'nature' => PayoutNature::Balance]);
        app(OwnerStatementSnapshots::class)->record($this->agency, $this->landlord, '2026-10', now());

        $payload = json_decode((string) DB::table(OwnerStatementSnapshots::TABLE)->value('payload'), true);
        $this->assertArrayNotHasKey('payout_rule', $payload);
        $this->assertArrayNotHasKey('lease_reference', $payload['properties'][0]);
        // Un instantané d'avant TCK-2915 : sans moyen ni nature.
        $payload['payouts'] = array_map(function (array $p): array {
            unset($p['payment_method'], $p['nature']);

            return $p;
        }, $payload['payouts']);
        DB::table(OwnerStatementSnapshots::TABLE)->update(['payload' => json_encode($payload)]);

        $data = $this->statement('2026-10');

        $this->assertNotNull($data['snapshot']);
        $this->assertNull($data['rectification'], 'aucun rectificatif ne naît de ces champs');
        $this->assertSame([['wave', 'balance']], array_map(fn (array $p) => [$p['payment_method'], $p['nature']], $data['payouts']));
        $this->assertSame(1, $data['payouts_count']);
        $this->assertSame(['day' => null, 'source' => null], $data['payout_rule']);
        $row = array_column($data['properties'], null, 'title')['F3 Mermoz'];
        $this->assertSame(['LS-2026-0042', null, []], [$row['lease_reference'], $row['photo_url'], $row['reminders']]);
    }
}
