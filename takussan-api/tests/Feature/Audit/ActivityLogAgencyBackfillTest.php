<?php

namespace Tests\Feature\Audit;

use App\Models\Agency;
use App\Models\KycDossier;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-601 (AC14, ADR-0044 §3) — le rattrapage d'`activity_log.agency_id` sur les lignes antérieures
 * suit l'ordre du résolveur : explicite, enfant par son parent, colonne du sujet, sujet `Agency`.
 */
class ActivityLogAgencyBackfillTest extends ApiTestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_10_08_601310_backfill_agency_id_on_activity_log.php';

    /** Une ligne « d'avant » : écrite sans passer par le modèle, donc sans rattachement. */
    private function legacyRow(?string $subjectType, ?int $subjectId, array $properties = []): int
    {
        return DB::table('activity_log')->insertGetId([
            'log_name' => 'default',
            'description' => 'avant',
            'event' => 'updated',
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'properties' => json_encode($properties),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function agencyOf(int $id): ?int
    {
        $value = DB::table('activity_log')->where('id', $id)->value('agency_id');

        return $value === null ? null : (int) $value;
    }

    public function test_le_rattrapage_suit_l_ordre_du_resolveur(): void
    {
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $payment = LeasePayment::factory()->create(['lease_id' => Lease::factory()->create(['agency_id' => $a->id])->id]);
        $property = Property::factory()->create(['agency_id' => $a->id]);
        $dossier = KycDossier::query()->create(['subject_type' => Agency::class, 'subject_id' => $b->id, 'status' => 'pending']);

        $rows = [
            'paiement' => [$this->legacyRow(LeasePayment::class, $payment->id), $a->id],
            'utilisateur' => [$this->legacyRow(User::class, User::factory()->create()->id), null],
            'bien' => [$this->legacyRow(Property::class, $property->id), $a->id],
            'agence' => [$this->legacyRow(Agency::class, $b->id), $b->id],
            'dossier' => [$this->legacyRow(KycDossier::class, $dossier->id), $b->id],
            'explicite' => [$this->legacyRow(null, null, ['agency_id' => $b->id]), $b->id],
            'explicite_prioritaire' => [$this->legacyRow(Property::class, $property->id, ['agency_id' => (string) $b->id]), $b->id],
            'explicite_illisible' => [$this->legacyRow(null, null, ['agency_id' => 'abc']), null],
            'agence_disparue' => [$this->legacyRow(null, null, ['agency_id' => 999_999_999]), null],
        ];
        DB::table('activity_log')->update(['agency_id' => null]);

        $migration = require database_path(self::MIGRATION);
        $migration->up();

        foreach ($rows as $label => [$id, $expected]) {
            $this->assertSame($expected, $this->agencyOf($id), $label);
        }

        // `down()` rend l'état d'avant ; un second `up()` reproduit le même rattachement.
        $migration->down();
        $this->assertSame(0, DB::table('activity_log')->whereNotNull('agency_id')->count());
        $migration->up();
        $this->assertSame($a->id, $this->agencyOf($rows['paiement'][0]));
    }

    public function test_une_ligne_deja_rattachee_n_est_pas_reecrite(): void
    {
        [$a, $b] = [Agency::factory()->create(), Agency::factory()->create()];
        $property = Property::factory()->create(['agency_id' => $a->id]);
        $id = $this->legacyRow(Property::class, $property->id);
        DB::table('activity_log')->where('id', $id)->update(['agency_id' => $b->id]);

        (require database_path(self::MIGRATION))->up();

        $this->assertSame($b->id, $this->agencyOf($id));
    }
}
