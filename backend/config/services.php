<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'conectr_session' => [
        'base_url' => env('CONECTR_SESSION_BASE_URL', 'https://conectr.pro'),
        'api_key' => env('CONECTR_SESSION_API_KEY', ''),
        'frontend_url' => env('CONECTR_SESSION_FRONTEND_URL', 'https://conectr.co'),
        'self_view_path' => env('CONECTR_SESSION_SELF_VIEW_PATH', '/api/sessions/create-link'),
        'self_view_fallback_paths' => env('CONECTR_SESSION_SELF_VIEW_FALLBACK_PATHS', ''),
        'self_view_timeout' => env('CONECTR_SESSION_SELF_VIEW_TIMEOUT', 10),
        'webhook_url' => env('CONECTR_WEBHOOK_URL', ''),
        'webhook_secret' => env('CONECTR_WEBHOOK_SECRET', ''),
        'webhook_payload_mode' => env('CONECTR_WEBHOOK_PAYLOAD_MODE', 'full'),
    ],

    'conectr' => [
        'base_url' => env('CONECTR_API', 'https://conectr.biz/api'),
        'api_token' => env('CONECTR_API_TOKEN', ''),
    ],

];
