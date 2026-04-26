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
        'see_all' => 'Gis notifications yépp',
        'unsubscribe' => 'Yëgël ci kanam bu digest',
    ],

    'types' => [
        'booking' => 'Réservations',
        'payment' => 'Paiements',
        'lease' => 'Baux',
        'maintenance' => 'Maintenance',
        'visit' => 'Visites',
        'message' => 'Messages',
        'system' => 'Système',
    ],

    'task_due_reminder' => [
        'subject' => 'Fàttalikuwaay : ligéey bi nag — :title',
        'greeting' => 'Salaam,',
        'intro' => 'Sa ligéey « :title » dafa wàcc ëllëg ci :datetime.',
    ],

    'lease_late_fee_applied' => [
        'subject' => 'Penalité di yengul ñu ko teg ci paye :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Penalité di yengul bu :amount :currency, ñu ko teg ci paye :reference.',
        'details' => 'Ñu ko jeem ci :percent % bi des ci montant bi (:base :currency).',
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

    'lease_renewed' => [
        'subject' => 'Sa luwé yeesalaat nañ ko — :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Avenant am na ci sa luwé (:reference). Conditions yu bees yi tàmbali nañ.',
        'period' => 'Période : :start ba :end.',
    ],

    'lease_early_termination' => [
        'greeting' => 'Salaam,',
        'penalty_line' => 'Pénalité tas bu jëkk : :amount :currency. War ngaa fey ko bala bisu njëlbeen bi.',
        'requested' => [
            'subject' => 'Tas bu jëkk laaj — luwé :reference',
            'intro' => 'Tas bu jëkk laaj nañ ko ci luwé :reference. Bisu njëlbeen : :date.',
        ],
        'cancelled' => [
            'subject' => 'Tas bu jëkk neenal — luwé :reference',
            'intro' => 'Tas bu jëkk laaj bi neenal nañ ko. Luwé bi des ci jàpp.',
        ],
        'confirmed' => [
            'subject' => 'Luwé jeex na — :reference',
            'intro' => 'Luwé :reference jeex na — bisu :date.',
        ],
    ],

    'lease_rent_reviewed' => [
        'subject' => 'Yeesalaat layeer — luwé :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Layeer mensuel bu luwé :reference yeesalaat nañ ko : :old → :new :currency.',
        'effective' => 'Bisu njëlbeen : :date.',
        'reason' => 'Mboor : :reason',
    ],

    'invoice_reminder_sent' => [
        'subject' => 'Faalewu — fakture :reference dafa yengul',
        'greeting' => 'Salaam,',
        'intro' => 'Fakture :reference yengul na :days fan (échéance : :due_date).',
        'amount' => 'Mbooloom dëgg : :amount :currency.',
        'cta' => 'Bëgg na nga fey ko ba leegi ngir bañ jot beneen faalewu.',
    ],

    'booking_expired' => [
        'subject' => 'Laaj reservation #:reference dafa faat',
        'greeting' => 'Salaam,',
        'intro' => 'Sa laaj reservation #:reference ci :property dafa faat.',
        'expired_reason' => 'Laaj bi dafa baña am xalu lu ko jàpp ci diiwaan bi agence bi teg.',
        'next_steps' => 'Moo man laa laaj waat bu bees su dëkku bi dafa am.',
        'unknown_property' => 'Dëkku bu xamul',
    ],
];
