<?php

namespace Tests\Unit\Support;

use App\Support\AppKeyHmac;
use Tests\TestCase;

/**
 * TCK-2430 (ADR-0084) — l'écriture sous la clé courante, la lecture sous la courante puis chaque ancienne ; et une
 * ancienne clé recopiée sans son `=` final, que Laravel accepte, reconnue elle aussi (vérification adverse M3).
 */
class AppKeyHmacTest extends TestCase
{
    private const ANCIENNE = 'base64:YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=';

    private const NEUVE = 'base64:YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI=';

    public function test_une_ancienne_cle_recopiee_sans_son_egal_final_reconnait_les_empreintes_ecrites_sous_elle(): void
    {
        config(['app.key' => self::ANCIENNE, 'app.previous_keys' => []]);
        $avant = AppKeyHmac::of('mailbox|email|awa@exemple.sn');

        config(['app.key' => self::NEUVE, 'app.previous_keys' => [rtrim(self::ANCIENNE, '=')]]);

        $this->assertContains($avant, AppKeyHmac::all('mailbox|email|awa@exemple.sn'));
        $this->assertSame(AppKeyHmac::all('mailbox|email|awa@exemple.sn')[0], AppKeyHmac::of('mailbox|email|awa@exemple.sn'), 'la clé courante d\'abord');
    }

    public function test_une_cle_bien_recopiee_ne_coute_aucune_empreinte_de_plus(): void
    {
        config(['app.key' => self::NEUVE, 'app.previous_keys' => [self::ANCIENNE]]);

        $this->assertCount(2, AppKeyHmac::all('x'));
    }

    public function test_l_ecriture_garde_la_cle_telle_qu_ecrite(): void
    {
        config(['app.key' => rtrim(self::NEUVE, '='), 'app.previous_keys' => []]);

        $this->assertSame(hash_hmac('sha256', 'x', rtrim(self::NEUVE, '=')), AppKeyHmac::of('x'));
        $this->assertCount(2, AppKeyHmac::all('x'), 'la forme canonique de la clé courante est lue aussi');
    }
}
