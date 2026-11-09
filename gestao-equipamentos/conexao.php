<?php
$host = 'localhost';
$banco = 'gestao_equipamentos';
$usuario = 'root';
$senha = '';

try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$banco;charset=utf8mb4",
        $usuario,
        $senha,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    exit(json_encode([
        'ok' => false,
        'erro' => 'Erro ao conectar ao banco de dados. Verifique se o MySQL está ligado e se o banco foi importado.',
    ], JSON_UNESCAPED_UNICODE));
}
