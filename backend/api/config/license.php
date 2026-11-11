<?php

return [
    'sales_enabled' => (bool) env('LICENSE_SALES_ENABLED', false),
    'license_required' => (bool) env('LICENSE_REQUIRED', false),
    'sales_starts_at' => (string) env('LICENSE_SALES_STARTS_AT', ''),
    'price' => (int) env('LICENSE_PRICE', 0),
    'currency' => strtoupper((string) env('LICENSE_CURRENCY', 'PHP')),
    'free_notice' => 'FaithStream Studio is free for at least the first three months. We will announce the one-time license price and start date in advance.',
    'payment_methods' => array_values(array_filter([
        [
            'id' => 'gcash',
            'name' => 'GCash',
            'recipient_name' => (string) env('LICENSE_GCASH_RECIPIENT', ''),
            'account_number' => (string) env('LICENSE_GCASH_ACCOUNT', ''),
            'qr_image_url' => (string) env('LICENSE_GCASH_QR_URL', ''),
        ],
        [
            'id' => 'gotyme',
            'name' => 'GoTyme',
            'recipient_name' => (string) env('LICENSE_GOTYME_RECIPIENT', ''),
            'account_number' => (string) env('LICENSE_GOTYME_ACCOUNT', ''),
            'qr_image_url' => (string) env('LICENSE_GOTYME_QR_URL', ''),
        ],
        [
            'id' => 'maribank',
            'name' => 'MariBank',
            'recipient_name' => (string) env('LICENSE_MARIBANK_RECIPIENT', ''),
            'account_number' => (string) env('LICENSE_MARIBANK_ACCOUNT', ''),
            'qr_image_url' => (string) env('LICENSE_MARIBANK_QR_URL', ''),
        ],
    ], static fn (array $method): bool => $method['recipient_name'] !== '' && $method['qr_image_url'] !== '')),
];
