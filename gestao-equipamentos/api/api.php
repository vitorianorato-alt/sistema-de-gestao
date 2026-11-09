<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');

const CATEGORIAS = ['Computador', 'Monitor', 'Projetor', 'Impressora', 'Rede', 'Periférico'];
const SITUACOES = ['Disponível', 'Em utilização', 'Em manutenção', 'Defeituoso', 'Inativo', 'Baixado do patrimônio'];
const PERFIS = ['Administrador', 'Operador', 'Consulta'];

function resp(array $dados, int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function erro(string $mensagem, int $codigo = 400): void
{
    resp(['ok' => false, 'erro' => $mensagem], $codigo);
}

set_exception_handler(function (Throwable $e) {
    erro('Erro no servidor: ' . $e->getMessage(), 500);
});

require __DIR__ . '/../conexao.php';

if (empty($_SESSION['usuario'])) {
    erro('Sessão expirada. Entre novamente.', 401);
}

$q = $pdo->prepare('SELECT id, nome, perfil FROM usuarios WHERE id = ? AND ativo = 1');
$q->execute([(int) $_SESSION['usuario']['id']]);
$eu = $q->fetch();
if (!$eu) {
    $_SESSION = [];
    erro('Sessão expirada. Entre novamente.', 401);
}
$eu['id'] = (int) $eu['id'];

function exigir(array $perfis): void
{
    global $eu;
    if (!in_array($eu['perfil'], $perfis, true)) {
        erro('Você não tem permissão para fazer isso.', 403);
    }
}

function registrar(PDO $pdo, string $entidade, int $id, string $acao, ?string $de, ?string $para, string $justificativa, array $eu, ?string $nome = null): void
{
    if ($nome === null) {
        $tabelas = ['equipamento' => 'equipamentos', 'setor' => 'setores', 'usuario' => 'usuarios'];
        $q = $pdo->prepare('SELECT nome FROM ' . $tabelas[$entidade] . ' WHERE id = ?');
        $q->execute([$id]);
        $nome = (string) $q->fetchColumn();
    }
    $pdo->prepare(
        'INSERT INTO historico (entidade, entidade_id, entidade_nome, acao, situacao_de, situacao_para, justificativa, usuario_id, usuario_nome, cargo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$entidade, $id, $nome, $acao, $de, $para, $justificativa, $eu['id'], $eu['nome'], $eu['perfil']]);
}

$acao = $_GET['acao'] ?? '';
$d = json_decode(file_get_contents('php://input'), true);
if (!is_array($d)) {
    $d = [];
}
$txt = function (string $campo) use ($d): string {
    return trim((string) ($d[$campo] ?? ''));
};
$opc = function (string $campo) use ($txt): ?string {
    $v = $txt($campo);
    return $v === '' ? null : $v;
};

switch ($acao) {

    case 'setores_listar':
        resp(['ok' => true, 'dados' => $pdo->query('SELECT * FROM setores ORDER BY nome')->fetchAll()]);

    case 'equipamentos_listar':
        resp(['ok' => true, 'dados' => $pdo->query(
            'SELECT e.*, s.nome AS setor_nome FROM equipamentos e
             JOIN setores s ON s.id = e.setor_id ORDER BY e.nome'
        )->fetchAll()]);

    case 'usuarios_listar':
        exigir(['Administrador']);
        resp(['ok' => true, 'dados' => $pdo->query(
            'SELECT id, nome, usuario, email, perfil, ativo FROM usuarios ORDER BY nome'
        )->fetchAll()]);

    case 'alteracoes_recentes':
        resp(['ok' => true, 'dados' => $pdo->query(
            "SELECT criado_em, entidade, acao, entidade_nome AS nome, situacao_de, situacao_para, justificativa, usuario_nome AS usuario
             FROM historico
             ORDER BY criado_em DESC, id DESC"
        )->fetchAll()]);

    case 'equipamento_historico':
        $q = $pdo->prepare(
            "SELECT criado_em, cargo, justificativa, usuario_nome AS usuario
             FROM historico
             WHERE entidade = 'equipamento' AND entidade_id = ?
             ORDER BY criado_em DESC, id DESC"
        );
        $q->execute([(int) ($_GET['id'] ?? 0)]);
        resp(['ok' => true, 'dados' => $q->fetchAll()]);

    case 'equipamento_salvar':
        exigir(['Administrador', 'Operador']);
        $id = (int) ($d['id'] ?? 0);
        $nome = $txt('nome');
        $categoria = $txt('categoria');
        $situacao = $txt('situacao');
        $setor = (int) ($d['setor_id'] ?? 0);
        $just = $txt('justificativa');
        $aquisicao = $opc('aquisicao');

        if ($nome === '') erro('Informe o nome do equipamento.');
        if (!in_array($categoria, CATEGORIAS, true)) erro('Selecione a categoria.');
        if (!in_array($situacao, SITUACOES, true)) erro('Selecione a situação.');
        if ($aquisicao !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $aquisicao)) erro('Data de aquisição inválida.');

        $q = $pdo->prepare('SELECT ativo FROM setores WHERE id = ?');
        $q->execute([$setor]);
        $s = $q->fetch();
        if (!$s) erro('Selecione o setor.');
        if (!(int) $s['ativo']) erro('Este setor está desativado. Escolha outro.');

        $campos = [$opc('patrimonio'), $nome, $categoria, $setor, $opc('marca'), $opc('modelo'), $opc('serie'), $aquisicao, $situacao, $opc('observacoes')];

        if ($id) {
            $q = $pdo->prepare('SELECT situacao, ativo FROM equipamentos WHERE id = ?');
            $q->execute([$id]);
            $antigo = $q->fetch();
            if (!$antigo) erro('Equipamento não encontrado.', 404);
            if (!(int) $antigo['ativo']) erro('Equipamento desativado não pode ser editado.');
            if ($just === '') erro('Informe a justificativa da edição.');

            $pdo->beginTransaction();
            $pdo->prepare(
                'UPDATE equipamentos SET patrimonio = ?, nome = ?, categoria = ?, setor_id = ?, marca = ?, modelo = ?,
                 serie = ?, aquisicao = ?, situacao = ?, observacoes = ? WHERE id = ?'
            )->execute(array_merge($campos, [$id]));
            registrar($pdo, 'equipamento', $id, 'edicao', $antigo['situacao'], $situacao, $just, $eu);
            $pdo->commit();
        } else {
            $pdo->beginTransaction();
            $pdo->prepare(
                'INSERT INTO equipamentos (patrimonio, nome, categoria, setor_id, marca, modelo, serie, aquisicao, situacao, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute($campos);
            $novo = (int) $pdo->lastInsertId();
            registrar($pdo, 'equipamento', $novo, 'criacao', null, $situacao, 'Cadastro inicial', $eu);
            $pdo->commit();
        }
        resp(['ok' => true]);

    case 'equipamento_desativar':
        exigir(['Administrador', 'Operador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');

        $q = $pdo->prepare('SELECT situacao, ativo FROM equipamentos WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Equipamento não encontrado.', 404);
        if (!(int) $antigo['ativo']) erro('Este equipamento já está desativado.');

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE equipamentos SET ativo = 0 WHERE id = ?')->execute([$id]);
        registrar($pdo, 'equipamento', $id, 'desativacao', $antigo['situacao'], 'Desativado', $just, $eu);
        $pdo->commit();
        resp(['ok' => true]);

    case 'setor_salvar':
        exigir(['Administrador', 'Operador']);
        $id = (int) ($d['id'] ?? 0);
        $nome = $txt('nome');
        $just = $txt('justificativa');
        if ($nome === '') erro('Informe o nome do setor.');
        $campos = [$nome, $opc('descricao'), $opc('localizacao'), $opc('responsavel')];

        if ($id) {
            $q = $pdo->prepare('SELECT ativo FROM setores WHERE id = ?');
            $q->execute([$id]);
            $antigo = $q->fetch();
            if (!$antigo) erro('Setor não encontrado.', 404);
            if (!(int) $antigo['ativo']) erro('Setor desativado não pode ser editado.');
            if ($just === '') erro('Informe a justificativa da edição.');

            $pdo->beginTransaction();
            $pdo->prepare('UPDATE setores SET nome = ?, descricao = ?, localizacao = ?, responsavel = ? WHERE id = ?')
                ->execute(array_merge($campos, [$id]));
            registrar($pdo, 'setor', $id, 'edicao', null, null, $just, $eu);
            $pdo->commit();
        } else {
            $pdo->beginTransaction();
            $pdo->prepare('INSERT INTO setores (nome, descricao, localizacao, responsavel) VALUES (?, ?, ?, ?)')
                ->execute($campos);
            registrar($pdo, 'setor', (int) $pdo->lastInsertId(), 'criacao', null, null, 'Cadastro inicial', $eu);
            $pdo->commit();
        }
        resp(['ok' => true]);

    case 'setor_desativar':
        exigir(['Administrador', 'Operador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');

        $q = $pdo->prepare('SELECT ativo FROM setores WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Setor não encontrado.', 404);
        if (!(int) $antigo['ativo']) erro('Este setor já está desativado.');

        $q = $pdo->prepare('SELECT COUNT(*) AS n FROM equipamentos WHERE setor_id = ? AND ativo = 1');
        $q->execute([$id]);
        $n = (int) $q->fetch()['n'];
        if ($n > 0) erro("Este setor ainda tem $n equipamento(s) ativo(s). Mude-os de setor ou desative-os antes.");

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE setores SET ativo = 0 WHERE id = ?')->execute([$id]);
        registrar($pdo, 'setor', $id, 'desativacao', null, null, $just, $eu);
        $pdo->commit();
        resp(['ok' => true]);

    case 'usuario_salvar':
        exigir(['Administrador']);
        $id = (int) ($d['id'] ?? 0);
        $nome = $txt('nome');
        $login = $txt('usuario');
        $email = strtolower($txt('email'));
        $perfil = $txt('perfil');
        $senha = (string) ($d['senha'] ?? '');
        $just = $txt('justificativa');

        if ($nome === '') erro('Informe o nome do usuário.');
        if (!preg_match('/^[^\s]{3,60}$/', $login)) erro('Informe o usuário de login (3 a 60 caracteres, sem espaços).');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) erro('Informe um e-mail válido.');
        if (!in_array($perfil, PERFIS, true)) erro('Selecione o perfil.');

        try {
            if ($id) {
                $q = $pdo->prepare('SELECT ativo FROM usuarios WHERE id = ?');
                $q->execute([$id]);
                $antigo = $q->fetch();
                if (!$antigo) erro('Usuário não encontrado.', 404);
                if (!(int) $antigo['ativo']) erro('Usuário desativado não pode ser editado.');
                if ($just === '') erro('Informe a justificativa da edição.');
                if ($id === $eu['id'] && $perfil !== $eu['perfil']) erro('Você não pode alterar o seu próprio perfil.');
                if ($senha !== '' && strlen($senha) < 6) erro('A senha deve ter pelo menos 6 caracteres.');

                $pdo->beginTransaction();
                if ($senha !== '') {
                    $pdo->prepare('UPDATE usuarios SET nome = ?, usuario = ?, email = ?, perfil = ?, senha_hash = ? WHERE id = ?')
                        ->execute([$nome, $login, $email, $perfil, password_hash($senha, PASSWORD_DEFAULT), $id]);
                } else {
                    $pdo->prepare('UPDATE usuarios SET nome = ?, usuario = ?, email = ?, perfil = ? WHERE id = ?')
                        ->execute([$nome, $login, $email, $perfil, $id]);
                }
                registrar($pdo, 'usuario', $id, 'edicao', null, null, $just, $eu);
                $pdo->commit();
            } else {
                if (strlen($senha) < 6) erro('A senha deve ter pelo menos 6 caracteres.');

                $pdo->beginTransaction();
                $pdo->prepare('INSERT INTO usuarios (nome, usuario, email, senha_hash, perfil) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$nome, $login, $email, password_hash($senha, PASSWORD_DEFAULT), $perfil]);
                registrar($pdo, 'usuario', (int) $pdo->lastInsertId(), 'criacao', null, null, 'Cadastro inicial', $eu);
                $pdo->commit();
            }
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($e->getCode() === '23000') erro('Já existe um usuário com este login ou e-mail.');
            throw $e;
        }
        resp(['ok' => true]);

    case 'usuario_desativar':
        exigir(['Administrador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');
        if ($id === $eu['id']) erro('Você não pode desativar o seu próprio usuário.');

        $q = $pdo->prepare('SELECT ativo FROM usuarios WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Usuário não encontrado.', 404);
        if (!(int) $antigo['ativo']) erro('Este usuário já está desativado.');

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?')->execute([$id]);
        registrar($pdo, 'usuario', $id, 'desativacao', null, null, $just, $eu);
        $pdo->commit();
        resp(['ok' => true]);

    case 'equipamento_reativar':
        exigir(['Administrador', 'Operador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');

        $q = $pdo->prepare('SELECT situacao, ativo, setor_id FROM equipamentos WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Equipamento não encontrado.', 404);
        if ((int) $antigo['ativo']) erro('Este equipamento já está ativo.');

        $q = $pdo->prepare('SELECT ativo FROM setores WHERE id = ?');
        $q->execute([(int) $antigo['setor_id']]);
        if (!(int) $q->fetchColumn()) erro('O setor deste equipamento está desativado. Reative o setor primeiro.');

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE equipamentos SET ativo = 1 WHERE id = ?')->execute([$id]);
        registrar($pdo, 'equipamento', $id, 'reativacao', 'Desativado', $antigo['situacao'], $just, $eu);
        $pdo->commit();
        resp(['ok' => true]);

    case 'equipamento_excluir':
        exigir(['Administrador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');

        $q = $pdo->prepare('SELECT nome, ativo FROM equipamentos WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Equipamento não encontrado.', 404);
        if ((int) $antigo['ativo']) erro('Desative o equipamento antes de excluir.');

        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM equipamentos WHERE id = ?')->execute([$id]);
        registrar($pdo, 'equipamento', $id, 'exclusao', null, null, $just, $eu, $antigo['nome']);
        $pdo->commit();
        resp(['ok' => true]);

    case 'setor_reativar':
        exigir(['Administrador', 'Operador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');

        $q = $pdo->prepare('SELECT ativo FROM setores WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Setor não encontrado.', 404);
        if ((int) $antigo['ativo']) erro('Este setor já está ativo.');

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE setores SET ativo = 1 WHERE id = ?')->execute([$id]);
        registrar($pdo, 'setor', $id, 'reativacao', null, null, $just, $eu);
        $pdo->commit();
        resp(['ok' => true]);

    case 'setor_excluir':
        exigir(['Administrador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');

        $q = $pdo->prepare('SELECT nome, ativo FROM setores WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Setor não encontrado.', 404);
        if ((int) $antigo['ativo']) erro('Desative o setor antes de excluir.');

        $q = $pdo->prepare('SELECT COUNT(*) FROM equipamentos WHERE setor_id = ?');
        $q->execute([$id]);
        $n = (int) $q->fetchColumn();
        if ($n > 0) erro("Este setor ainda tem $n equipamento(s), inclusive desativados. Mude-os de setor ou exclua-os antes.");

        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM setores WHERE id = ?')->execute([$id]);
        registrar($pdo, 'setor', $id, 'exclusao', null, null, $just, $eu, $antigo['nome']);
        $pdo->commit();
        resp(['ok' => true]);

    case 'usuario_reativar':
        exigir(['Administrador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');

        $q = $pdo->prepare('SELECT ativo FROM usuarios WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Usuário não encontrado.', 404);
        if ((int) $antigo['ativo']) erro('Este usuário já está ativo.');

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE usuarios SET ativo = 1 WHERE id = ?')->execute([$id]);
        registrar($pdo, 'usuario', $id, 'reativacao', null, null, $just, $eu);
        $pdo->commit();
        resp(['ok' => true]);

    case 'usuario_excluir':
        exigir(['Administrador']);
        $id = (int) ($d['id'] ?? 0);
        $just = $txt('justificativa');
        if ($just === '') erro('Informe a justificativa.');
        if ($id === $eu['id']) erro('Você não pode excluir o seu próprio usuário.');

        $q = $pdo->prepare('SELECT nome, perfil, ativo FROM usuarios WHERE id = ?');
        $q->execute([$id]);
        $antigo = $q->fetch();
        if (!$antigo) erro('Usuário não encontrado.', 404);
        if ($antigo['perfil'] === 'Administrador') erro('Administradores não podem ser excluídos.');
        if ((int) $antigo['ativo']) erro('Desative o usuário antes de excluir.');

        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
        registrar($pdo, 'usuario', $id, 'exclusao', null, null, $just, $eu, $antigo['nome']);
        $pdo->commit();
        resp(['ok' => true]);

    default:
        erro('Ação inválida.', 404);
}
