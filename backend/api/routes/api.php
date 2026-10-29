<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PresentationProjectController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,1');
Route::post('/email/verification-notification', [AuthController::class, 'resendVerification'])->middleware('throttle:3,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'user']);
    Route::patch('/user', [AuthController::class, 'updateUser']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/presentations', [PresentationProjectController::class, 'index']);
    Route::put('/presentations/{projectId}', [PresentationProjectController::class, 'store']);
    Route::delete('/presentations/{projectId}', [PresentationProjectController::class, 'destroy']);
});
