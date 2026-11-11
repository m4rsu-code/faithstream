<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountSongbook extends Model
{
    protected $fillable = [
        'user_id',
        'book_id',
        'name',
        'songs',
        'book_created_at',
        'book_updated_at',
        'is_deleted',
    ];

    protected function casts(): array
    {
        return [
            'songs' => 'array',
            'book_created_at' => 'integer',
            'book_updated_at' => 'integer',
            'is_deleted' => 'boolean',
        ];
    }
}
