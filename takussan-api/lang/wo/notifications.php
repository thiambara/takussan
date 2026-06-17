<?php

return [

    'salutation' => 'Ekip Takussan',

    // TCK-249 — Invitation lifecycle emails (Wolof).
    'invitation' => [
        'subject' => 'Am nga invitation Takussan',
        'reminder_subject' => 'Tee — invitation Takussan',
        'greeting' => 'Asalaa Maalekum,',
        'intro' => 'Wax nañu la nga bokk Takussan ni :role.',
        'reminder_intro' => 'Buñ la fàttali: invitation Takussan bi nga jot ni :role mu ngi xaar.',
        'action' => 'Nangu invitation bi',
        'expires_at' => 'Lëkkalekaay bii dafay jeex ci :date.',
        'ignore' => 'Soo xamul invitation bi, mën nga ko bañ.',
    ],

    'invitation_accepted' => [
        'subject' => ':email nangu na sa invitation',
        'greeting' => 'Asalaa Maalekum,',
        'intro' => ':email nangu na sa invitation mu bokk Takussan ni :role.',
    ],

    'invitation_expired' => [
        'subject' => 'Invitation bi nga yónni :email jeex na',
        'greeting' => 'Asalaa Maalekum,',
        'intro' => 'Invitation bi nga yónni :email jeex na sa nguñu ko nangu.',
        'advice' => 'Mën nga ko yónniwaat ci sa table de bord.',
    ],

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
        'sms' => 'Takussan : sa reservation #:reference dafa di xaar muccal. Bërëb li dale ci :start ba :end.',
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
        'bank_statement_imported' => 'Relevé bancaire importé',
        'bank_statement_finalized' => 'Relevé bancaire clôturé',
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

    // TCK-265 — one-shot welcome notification fired on Lease.activated.
    'tenant_welcome' => [
        'subject' => 'Dalal jàmm ci sa kër — luwé :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Sa luwé :reference jàppal na léegi.',
        'body' => 'Xool sa fey yi di ñëw, laaj nañu maintenance ak feeg sa documents ci sa espas waa-kër.',
        'action' => 'Ubbi sama espas waa-kër',
    ],

    // TCK-266 — J+7 reminder when the move-in inventory is still unsigned.
    'tenant_inventory_reminder' => [
        'subject' => 'Faatu — état des lieux war ngaa ko shign (luwé :reference)',
        'greeting' => 'Salaam,',
        'intro' => 'État des lieux bu sa luwé :reference signe nañ ko ba léegi.',
        'body' => 'Ba kerig dossier bi am, war ngaa shigne ko. Dugu ci sa espas waa-kër ngir mottali shignal bi.',
        'action' => 'Shigne état des lieux',
    ],

    'agent_tenant_inventory_reminder' => [
        'subject' => 'Waa-kër bu yegg ci EDL — luwé :reference',
        'greeting' => 'Salaam,',
        'intro' => ':tenant signe wuñu état des lieux entrée bu luwé :reference (lu ëpp 7 fan).',
        'body' => 'Xoolal ak waa-kër bi su fekk dañu ko war di gungé ngir mottali signe bi.',
        'action' => 'Xool onboardings yi yagg',
        'unknown_tenant' => 'Waa-kër bi',
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
