<?php

namespace Tests\Feature\Documents;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2655 (AC6) — `filter[expiring_within_days]=N` : les documents dont l'expiration tombe entre
 * aujourd'hui et aujourd'hui + N jours, bornes comprises, le jour étant celui de Dakar. Un document
 * déjà expiré ou sans date n'y est pas ; une valeur qui n'est pas un entier ne rend rien.
 */
class DocumentExpiringFilterTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
    }

    /** @return list<int> */
    private function ids(string $days): array
    {
        return $this->getJson("/api/documents?filter[expiring_within_days]={$days}")->assertOk()->json('data.*.id');
    }

    /** AC6 — la CNI à 42 jours y est, l'assurance à 90 jours non. */
    public function test_ac6_sixty_days_include_42_and_exclude_90(): void
    {
        $this->connecter($this->tenant);

        $this->assertSame([$this->idCard->id], $this->ids('60'));
        $this->assertEqualsCanonicalizing([$this->idCard->id, $this->insurance->id], $this->ids('90'));
        $this->assertSame([], $this->ids('41'));
    }

    public function test_the_bounds_are_today_and_today_plus_n_and_the_expired_is_out(): void
    {
        $today = Document::today();
        $expired = $this->document($this->tenant, $this->tenant, DocumentType::Passport, 'Passeport', $today->subDay()->toDateString());
        $todayDoc = $this->document($this->tenant, $this->tenant, DocumentType::Rib, 'RIB', $today->toDateString());
        $edge = $this->document($this->tenant, $this->tenant, DocumentType::Other, 'Bail précédent', $today->addDays(60)->toDateString());
        $this->document($this->tenant, $this->tenant, DocumentType::Other, 'Sans date');

        $this->connecter($this->tenant);
        $ids = $this->ids('60');

        $this->assertContains($todayDoc->id, $ids);
        $this->assertContains($edge->id, $ids);
        $this->assertNotContains($expired->id, $ids);
        $this->assertCount(3, $ids);
    }

    /** Le jour est celui de Dakar (UTC+0 toute l'année), pas celui du serveur. */
    public function test_today_is_dakar_today(): void
    {
        $this->assertSame('Africa/Dakar', Document::EXPIRY_TIMEZONE);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-11 23:30:00', 'America/New_York'));
        try {
            $this->assertSame('2026-11-12', Document::today()->toDateString());
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_a_malformed_value_matches_nothing_and_never_fails(): void
    {
        $this->connecter($this->tenant);

        foreach (['abc', '-5', '1.5', '6e1'] as $value) {
            $this->assertSame([], $this->ids($value), $value);
        }
        // Une valeur vide n'est pas un filtre (spatie l'ignore, comme tout filtre vide) : la liste
        // entière de l'appelant.
        $this->assertEqualsCanonicalizing([$this->idCard->id, $this->insurance->id], $this->ids(''));
        $this->getJson('/api/documents?filter[expiring_within_days][]=60')->assertOk();
    }

    /** Le filtre compose avec la cible : la liste d'une cible, restreinte aux expirations. */
    public function test_it_composes_with_a_target(): void
    {
        $this->connecter($this->tenant);

        $this->assertSame(
            [$this->idCard->id],
            $this->getJson("/api/documents?filter[documentable_type]=user&filter[documentable_id]={$this->tenant->id}&filter[expiring_within_days]=60")
                ->assertOk()->json('data.*.id'),
        );
    }
}
