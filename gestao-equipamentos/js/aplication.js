(function () {
    const ROTAS = {
        dashboard: { secao: 'dashboard-container', titulo: 'Dashboard' },
        equipamentos: { secao: 'equipamentos-container', titulo: 'Equipamentos' },
        setores: { secao: 'setores-container', titulo: 'Setores' },
        usuarios: { secao: 'usuarios-container', titulo: 'Usuários', admin: true },
        'rel-equipamentos': { secao: 'equipamentos-relatorio-container', titulo: 'Relatório de equipamentos' },
        'rel-setores': { secao: 'setores-relatorio-container', titulo: 'Relatório de setores' }
    };

    const ROTA_PADRAO = 'dashboard';

    const el = (id) => document.getElementById(id);
    const todasSecoes = () => Object.values(ROTAS).map((r) => el(r.secao));

    const App = {
        usuario: null,

        mostrarLogin() {
            App.usuario = null;
            el('sidebar-container').hidden = true;
            el('header-container').hidden = true;
            todasSecoes().forEach((s) => (s.hidden = true));
            el('login-container').hidden = false;
            document.title = 'Gestão de Equipamentos';
        },

        mostrarSistema(usuario) {
            App.usuario = usuario;
            el('login-container').hidden = true;
            el('sidebar-container').hidden = false;
            el('header-container').hidden = false;

            const ehAdmin = usuario.perfil === 'Administrador';
            document.querySelectorAll('[data-admin]').forEach((a) => (a.hidden = !ehAdmin));

            if (!location.hash) {
                location.hash = '#/' + ROTA_PADRAO;
            } else {
                navegar();
            }
        }
    };

    function navegar() {
        if (!App.usuario) return;

        const nome = location.hash.replace('#/', '');

        if (nome === 'sair') {
            document.dispatchEvent(new Event('sair'));
            return;
        }

        const rota = ROTAS[nome];
        const ehAdmin = App.usuario.perfil === 'Administrador';

        if (!rota || (rota.admin && !ehAdmin)) {
            location.hash = '#/' + ROTA_PADRAO;
            return;
        }

        todasSecoes().forEach((s) => (s.hidden = true));
        el(rota.secao).hidden = false;
        el('titulo-pagina').textContent = rota.titulo;
        document.title = rota.titulo + ' | Gestão de Equipamentos';

        document.querySelectorAll('#nav-menu a').forEach((a) => {
            a.classList.toggle('ativo', a.dataset.rota === nome);
        });

        el('sidebar-container').classList.remove('aberto');
        window.scrollTo(0, 0);
    }

    document.addEventListener('DOMContentLoaded', () => {
        el('btn-menu').addEventListener('click', () => {
            el('sidebar-container').classList.toggle('aberto');
        });
        window.addEventListener('hashchange', navegar);
    });

    window.App = App;
})();
