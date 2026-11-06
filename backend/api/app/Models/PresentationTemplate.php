<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PresentationTemplate extends Model
{
    protected $fillable = [
        'user_id',
        'template_id',
        'name',
        'slides',
        'colors',
        'has_local_media',
        'template_updated_at',
    ];

    protected function casts(): array
    {
        return [
            'slides' => 'array',
            'colors' => 'array',
            'has_local_media' => 'boolean',
            'template_updated_at' => 'integer',
        ];
    }
}
