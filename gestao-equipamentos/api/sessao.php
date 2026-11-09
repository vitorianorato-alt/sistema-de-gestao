<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

if (!empty($_SESSION['usuario'])) {
    echo json_encode(['ok' => true, 'usuario' => $_SESSION['usuario']], JSON_UNESCAPED_UNICODE);
} else {
    echo json_encode(['ok' => false]);
}