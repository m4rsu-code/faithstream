<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PresentationProject extends Model
{
    protected $fillable = [
        'user_id',
        'project_id',
        'name',
        'slides',
        'has_local_media',
        'project_updated_at',
    ];

    protected function casts(): array
    {
        return [
            'slides' => 'array',
            'has_local_media' => 'boolean',
            'project_updated_at' => 'integer',
        ];
    }
}
