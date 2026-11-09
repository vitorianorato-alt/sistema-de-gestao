<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/../conexao.php';

$dados = json_decode(file_get_contents('php://input'), true) ?: [];
$id = trim($dados['id'] ?? '');
$senha = $dados['senha'] ?? '';

if ($id === '' || $senha === '') {
    exit(json_encode(['ok' => false, 'erro' => 'Informe usuário e senha.'], JSON_UNESCAPED_UNICODE));
}

$stmt = $pdo->prepare(
    'SELECT id, nome, perfil, senha_hash FROM usuarios
     WHERE (usuario = :id OR email = :id2) AND ativo = 1 LIMIT 1'
);
$stmt->execute(['id' => $id, 'id2' => $id]);
$usuario = $stmt->fetch();

if (!$usuario || !password_verify($senha, $usuario['senha_hash'])) {
    exit(json_encode(['ok' => false, 'erro' => 'Usuário ou senha inválidos.'], JSON_UNESCAPED_UNICODE));
}

session_regenerate_id(true);
$_SESSION['usuario'] = [
    'id' => (int) $usuario['id'],
    'nome' => $usuario['nome'],
    'perfil' => $usuario['perfil'],
];

echo json_encode(['ok' => true, 'usuario' => $_SESSION['usuario']], JSON_UNESCAPED_UNICODE);