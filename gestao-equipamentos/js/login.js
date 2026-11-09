(function () {
    const el = (id) => document.getElementById(id);

    async function api(url, dados) {
        const opcoes = { credentials: 'same-origin' };
        if (dados) {
            opcoes.method = 'POST';
            opcoes.headers = { 'Content-Type': 'application/json' };
            opcoes.body = JSON.stringify(dados);
        }

        const resp = await fetch(url, opcoes);
        const texto = await resp.text();

        try {
            return JSON.parse(texto);
        } catch (e) {
            if (resp.status === 404) {
                throw new Error('Arquivo ' + url + ' não encontrado (404). Confira se a pasta api está dentro do projeto.');
            }
            const trecho = texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
            throw new Error('Resposta inválida de ' + url + ': ' + (trecho || 'vazia'));
        }
    }

    function telaLogin() {
        el('form-login').reset();
        el('login-erro').hidden = true;
        App.mostrarLogin();
        el('login-id').focus();
    }

    async function entrar(evento) {
        evento.preventDefault();

        const id = el('login-id').value.trim();
        const senha = el('login-senha').value;
        const erro = el('login-erro');

        if (!id || !senha) {
            erro.textContent = 'Informe usuário e senha.';
            erro.hidden = false;
            return;
        }

        try {
            const resp = await api('api/login.php', { id, senha });
            if (!resp.ok) {
                erro.textContent = resp.erro || 'Usuário ou senha inválidos.';
                erro.hidden = false;
                return;
            }
            erro.hidden = true;
            location.hash = '#/dashboard';
            App.mostrarSistema(resp.usuario);
        } catch (e) {
            if (e instanceof TypeError) {
                erro.textContent = 'Não foi possível conectar ao servidor. Abra o site por http://localhost/ (com o Apache ligado), não pelo arquivo.';
            } else {
                erro.textContent = e.message;
            }
            erro.hidden = false;
        }
    }

    async function sair() {
        try {
            await api('api/logout.php', {});
        } catch (e) { }
        history.replaceState(null, '', location.pathname);
        telaLogin();
    }

    async function iniciar() {
        el('form-login').addEventListener('submit', entrar);
        document.addEventListener('sair', sair);

        try {
            const resp = await api('api/sessao.php');
            if (resp.ok) {
                App.mostrarSistema(resp.usuario);
                return;
            }
        } catch (e) { }

        telaLogin();
    }

    document.addEventListener('DOMContentLoaded', iniciar);
})();