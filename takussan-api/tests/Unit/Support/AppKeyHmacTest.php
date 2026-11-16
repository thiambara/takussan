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

    /** TCK-614 — la clé dédiée posée, l'écriture ne dépend plus d'`APP_KEY` : une rotation ne change aucune empreinte. */
    public function test_tck614_l_ecriture_se_fait_sous_app_hmac_key_et_survit_a_une_rotation_d_app_key(): void
    {
        config(['app.hmac_key' => 'cle-d-empreinte', 'app.key' => self::ANCIENNE, 'app.previous_keys' => []]);
        $avant = AppKeyHmac::of('x');

        config(['app.key' => self::NEUVE, 'app.previous_keys' => []]);

        $this->assertSame(hash_hmac('sha256', 'x', 'cle-d-empreinte'), AppKeyHmac::of('x'));
        $this->assertSame($avant, AppKeyHmac::of('x'));
        $this->assertTrue(AppKeyHmac::hasDedicatedKey());
    }

    /** TCK-614 — la double lecture : ce qui a été écrit sous `APP_KEY` avant la pose de la clé dédiée reste reconnu. */
    public function test_tck614_la_lecture_reconnait_ce_qui_a_ete_ecrit_sous_app_key_avant_la_cle_dediee(): void
    {
        config(['app.hmac_key' => null, 'app.key' => self::NEUVE, 'app.previous_keys' => [self::ANCIENNE]]);
        $sousLaCourante = AppKeyHmac::of('x');
        config(['app.key' => self::ANCIENNE, 'app.previous_keys' => []]);
        $sousLAncienne = AppKeyHmac::of('x');

        config(['app.hmac_key' => 'cle-d-empreinte', 'app.key' => self::NEUVE, 'app.previous_keys' => [self::ANCIENNE]]);

        $toutes = AppKeyHmac::all('x');
        $this->assertSame(hash_hmac('sha256', 'x', 'cle-d-empreinte'), $toutes[0], 'la clé dédiée d\'abord');
        $this->assertContains($sousLaCourante, $toutes);
        $this->assertContains($sousLAncienne, $toutes);
    }

    /** TCK-614 — une clé vide (ligne `APP_HMAC_KEY=` d'un fichier d'environnement) vaut absente : repli sur `APP_KEY`. */
    public function test_tck614_une_cle_vide_vaut_absente_et_l_ecriture_se_replie_sur_app_key(): void
    {
        config(['app.hmac_key' => '', 'app.key' => self::NEUVE, 'app.previous_keys' => []]);

        $this->assertFalse(AppKeyHmac::hasDedicatedKey());
        $this->assertSame(hash_hmac('sha256', 'x', self::NEUVE), AppKeyHmac::of('x'));
    }
}
