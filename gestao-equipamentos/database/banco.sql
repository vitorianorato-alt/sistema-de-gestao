CREATE DATABASE IF NOT EXISTS gestao_equipamentos
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE gestao_equipamentos;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    usuario VARCHAR(60) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil ENUM('Administrador', 'Operador', 'Consulta') NOT NULL DEFAULT 'Consulta',
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS setores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    descricao TEXT NULL,
    localizacao VARCHAR(150) NULL,
    responsavel VARCHAR(120) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipamentos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patrimonio VARCHAR(60) NULL,
    nome VARCHAR(150) NOT NULL,
    categoria ENUM('Computador', 'Monitor', 'Projetor', 'Impressora', 'Rede', 'Periférico') NOT NULL,
    setor_id INT UNSIGNED NOT NULL,
    marca VARCHAR(80) NULL,
    modelo VARCHAR(80) NULL,
    serie VARCHAR(80) NULL,
    aquisicao DATE NULL,
    situacao ENUM('Disponível', 'Em utilização', 'Em manutenção', 'Defeituoso', 'Inativo', 'Baixado do patrimônio')
        NOT NULL DEFAULT 'Disponível',
    observacoes TEXT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_equipamento_setor FOREIGN KEY (setor_id) REFERENCES setores (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS historico (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entidade ENUM('equipamento', 'setor', 'usuario') NOT NULL,
    entidade_id INT UNSIGNED NOT NULL,
    entidade_nome VARCHAR(150) NULL,
    acao ENUM('criacao', 'edicao', 'desativacao', 'reativacao', 'exclusao') NOT NULL,
    situacao_de VARCHAR(60) NULL,
    situacao_para VARCHAR(60) NULL,
    justificativa TEXT NULL,
    usuario_id INT UNSIGNED NULL,
    usuario_nome VARCHAR(120) NULL,
    cargo VARCHAR(30) NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_historico_entidade (entidade, entidade_id),
    CONSTRAINT fk_historico_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Usuário inicial: admin / admin123 (troque a senha depois do primeiro acesso)
INSERT INTO usuarios (nome, usuario, email, senha_hash, perfil)
VALUES ('Administrador', 'admin', 'admin@escola.local',
        '$2y$10$wSVEgU/wCqu4RhKw.FeDCufoQfMk61BUTFYApoVor5Ylakb96Qk5a', 'Administrador')
ON DUPLICATE KEY UPDATE nome = nome;