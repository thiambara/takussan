<?php

return [

    'salutation' => 'Ekip Takussan',

    'registration' => [
        'subject' => 'Dëggël sa adrees e-mail',
        'greeting' => 'Dalal ak jàmm ci Takussan !',
        'intro' => 'Soo bëggee dëggël sa adrees e-mail, bëgg na nga toppël buton bi ci suuf.',
        'action' => 'Dëggël e-mail',
        'expire' => 'Lënk bi di na faat ci :count minit.',
        'ignore' => 'Soo xamul dara ci kayit gii, bul fàtte lu ko moy.',
    ],

    'password_reset' => [
        'subject' => 'Soppi sa baatu jàng (mot de passe)',
        'greeting' => 'Salaam !',
        'intro' => 'Jot nga kayit gii ndax ñu ne ñu soppi sa baatu jàng.',
        'action' => 'Soppi baatu jàng',
        'expire' => 'Lënk bi di na faat ci :count minit.',
        'ignore' => 'Soo ñuulul soppi baatu jàng, bul dara def.',
    ],

    'new_booking' => [
        'subject' => 'Reservation bu bees #:reference',
        'greeting' => 'Salaam,',
        'intro' => 'Sa reservation #:reference doon na bind ak di xaaru ngir muccal ko.',
        'details' => 'Bërëb : li dale ci :start ba :end.',
    ],

    'digest' => [
        'subject' => 'Ñu seetlu Takussan (:count yu bees)',
        'greeting' => 'Salaam,',
        'intro' => 'Lii mooy àq-àq yi nga jot ca demba.',
        'footer' => 'Gis senter bu notifications ngir gis sa yëkkati yépp.',
    ],

    'task_due_reminder' => [
        'subject' => 'Fàttalikuwaay : ligéey bi nag — :title',
        'greeting' => 'Salaam,',
        'intro' => 'Sa ligéey « :title » dafa wàcc ëllëg ci :datetime.',
    ],

    'account_deletion_requested' => [
        'subject' => 'Ndogalu suufeel kont nañ ko jaaxal',
        'greeting' => 'Salaam,',
        'intro' => 'Jot nañu sa ndogalu suufeel kont. Dina jaarukoo ci :date.',
        'consequences' => 'Sa donné personnel ya, dañ leen di anonimiser sax-sax. Donné yu jaadu ag téé yi (paye, bail, fakture) dañ leen di kàllaaxoo waaye sànni leen sa tur.',
        'action' => 'Aju ndogal li',
        'ignore' => 'Bu yaa ko sàppal-li, aju ko leegi te soppi sa baatu jubaale.',
    ],

    'account_deletion_reminder' => [
        'subject' => 'Faalewu : suufeel kont ci :days fan',
        'greeting' => 'Salaam,',
        'intro' => 'Sa kont di nañu ko suufeel ci :days fan, ci :date. Soo soppee xel, manga ko aju ba leegi.',
        'action' => 'Aju ndogal li',
        'ignore' => 'Soo dëggee suufeel bi, ñakkul wax dara.',
    ],

    'account_deletion_executed' => [
        'subject' => 'Sa kont suufeel nañ ko',
        'greeting' => 'Salaam,',
        'intro' => 'Sa kont Takussan suufeel nañ ko, te sa donné personnel anonimiser nañ leen sax-sax.',
        'retention' => 'Naka noonu mu nekke ci yoonu réew, doxal yi nu mëniw (paye, fakture) lañ kàllaaxoo waaye anonim ci 10 at.',
        'contact' => 'Yoonu sa laaj, jokkok ekipu jëfundikuwaay ya.',
    ],

    'conversation_invite' => [
        'subject' => 'Wax bi : :subject',
        'greeting' => 'Salaam,',
        'intro' => ':inviter dafa la wëlbati ci kuréel bu : « :subject ».',
    ],

    'lease_deposit_refunded' => [
        'subject' => 'Delloo kaution — luwé :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Sa kaution ci luwé :reference, delloo nañ la — :amount :currency.',
        'retention' => 'Téye nañ :amount :currency. Mboor : :reason.',
    ],
];
