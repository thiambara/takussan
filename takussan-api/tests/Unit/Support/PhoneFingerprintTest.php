<?php

namespace Tests\Unit\Support;

use App\Support\PhoneFingerprint;
use Tests\TestCase;

/** TCK-633 lot F (interface C → F) — une empreinte par NUMÉRO, quelle qu'en soit l'écriture. */
class PhoneFingerprintTest extends TestCase
{
    public function test_deux_ecritures_du_meme_numero_ont_la_meme_empreinte(): void
    {
        $this->assertSame(PhoneFingerprint::of('+221771234567'), PhoneFingerprint::of('77 123 45 67'));
        $this->assertSame(PhoneFingerprint::of('+221771234567'), PhoneFingerprint::of('00221771234567'));
        $this->assertNotSame(PhoneFingerprint::of('+221771234567'), PhoneFingerprint::of('+221771234568'));
        $this->assertSame(64, strlen(PhoneFingerprint::of('+221771234567')));
    }

    public function test_l_empreinte_depend_de_la_cle(): void
    {
        $avant = PhoneFingerprint::of('+221771234567');
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32))]);

        $this->assertNotSame($avant, PhoneFingerprint::of('+221771234567'));
    }

    /** TCK-2430 — la lecture cherche sous la clé courante d'abord, puis sous chaque ancienne d'`APP_PREVIOUS_KEYS`. */
    public function test_all_reconnait_l_empreinte_ecrite_sous_une_ancienne_cle(): void
    {
        $ancienne = (string) config('app.key');
        $avant = PhoneFingerprint::of('+221771234567');
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32)), 'app.previous_keys' => [$ancienne, $ancienne, '']]);

        $this->assertSame([PhoneFingerprint::of('+221771234567'), $avant], PhoneFingerprint::all('77 123 45 67'));

        config(['app.previous_keys' => []]);
        $this->assertSame([PhoneFingerprint::of('+221771234567')], PhoneFingerprint::all('+221771234567'));
    }
}
