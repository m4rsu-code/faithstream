<?php

/**
 * CORS is allow-list only. Requests from the "null" origin (file:// pages,
 * sandboxed iframes and data: URLs) are never accepted, even when "null" is
 * still present in CORS_ALLOWED_ORIGINS, because it would let any local file
 * or opaque origin act as a trusted browser origin.
 */
$allowedOrigins = array_values(array_filter(array_map(
    static fn (string $origin): string => trim($origin),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:8000,http://127.0.0.1:8000')),
), static fn (string $origin): bool => $origin !== '' && strcasecmp($origin, 'null') !== 0));

return [

    'paths' => ['api/*', 'up'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
