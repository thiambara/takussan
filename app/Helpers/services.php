<?php

use App\Services\AfricaMobileService;
use App\Services\EmailService;
//use App\Services\FireBaseService;
use App\Services\OrangeService;
use App\Services\PDFService;
use App\Services\TwilioService;
use App\Services\Utils;
use App\Services\WaveService;
use App\Services\WhatsappService;
use Illuminate\Support\Facades\App;

if(!function_exists('africa_mobile')){
    /**
     * get the africa mobile client service
     *
     * @return AfricaMobileService
     */
    function africa_mobile(): AfricaMobileService
    {
        return App::make(AfricaMobileService::class);
    }
}

if(!function_exists('email')){
    /**
     * get the email client service
     *
     * @return EmailService
     */
    function email(): EmailService
    {
        return App(EmailService::class);
    }
}

//if(!function_exists('firebase')){
//    /**
//     * get the firebase client service
//     *
//     * @return FireBaseService
//     */
//    function firebase(): FireBaseService
//    {
//        return App::make(FireBaseService::class);
//    }
//}

if(!function_exists('orange')){
    /**
     * get the firebase client service
     *
     * @return OrangeService
     */
    function orange(): OrangeService
    {
        return App::make(OrangeService::class);
    }
}

if(!function_exists('pdf')){
    /**
     * get the firebase client service
     *
     * @return PDFService
     */
    function pdf(): PDFService
    {
        return App::make(PDFService::class);
    }
}

if(!function_exists('twilio')){
    /**
     * get the twilio client service
     *
     * @return TwilioService
     */
    function twilio(): TwilioService
    {
        return App::make(TwilioService::class);
    }
}

if(!function_exists('utils')){
    /**
     * get the firebase client service
     *
     * @return Utils
     */
    function utils(): Utils
    {
        return App::make(Utils::class);
    }
}

if(!function_exists('wave')){
    /**
     * get the wave client service
     *
     * @return WaveService
     */
    function wave(): WaveService
    {
        return App::make(WaveService::class);
    }
}

if(!function_exists('whatsapp')){
    /**
     * get the whatsapp client service
     *
     * @return WhatsappService
     */
    function whatsapp(): WhatsappService
    {
        return App(WhatsappService::class);
    }
}
