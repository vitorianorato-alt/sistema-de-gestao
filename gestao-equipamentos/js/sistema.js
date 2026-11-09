(function () {
    const API = 'api/api.php';
    const $ = (id) => document.getElementById(id);

    const SITUACOES = ['Disponível', 'Em utilização', 'Em manutenção', 'Defeituoso', 'Inativo', 'Baixado do patrimônio'];
    const COR_SITUACAO = ['#16a34a', '#1d4ed8', '#eab308', '#dc2626', '#94a3b8', '#64748b'];
    const BADGE = {
        'Disponível': 'badge-disponivel',
        'Em utilização': 'badge-utilizacao',
        'Em manutenção': 'badge-manutencao',
        'Defeituoso': 'badge-defeituoso',
        'Inativo': 'badge-inativo',
        'Baixado do patrimônio': 'badge-inativo'
    };

    const ROTULO_ENTIDADE = { equipamento: 'Equipamento', setor: 'Setor', usuario: 'Usuário' };
    const ROTULO_ACAO = { criacao: 'Cadastro', edicao: 'Edição', desativacao: 'Desativação', reativacao: 'Reativação', exclusao: 'Exclusão' };
    const ENTIDADE_API = { eq: 'equipamento', st: 'setor', us: 'usuario' };
    const ROTULO_TIPO = { eq: 'equipamento', st: 'setor', us: 'usuário' };

    const estado = {
        usuario: null,
        setores: [],
        equipamentos: [],
        usuarios: [],
        alteracoes: [],
        editando: { eq: null, st: null, us: null },
        desativando: { eq: null, st: null, us: null },
        detalhe: null,
        acaoExtra: null
    };

    let graficoStatus = null;
    let graficoSetores = null;
    let timerAviso = null;

    /* ---------- utilidades ---------- */

    const podeEditar = () => !!estado.usuario && estado.usuario.perfil !== 'Consulta';
    const ehAdmin = () => !!estado.usuario && estado.usuario.perfil === 'Administrador';
    const ativo = (x) => Number(x.ativo) === 1;
    const valor = (id) => $(id).value.trim();

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    function dataBR(s) {
        if (!s) return '—';
        const [a, m, d] = String(s).slice(0, 10).split('-');
        return `${d}/${m}/${a}`;
    }

    function dataHora(s) {
        if (!s) return ['—', '—'];
        const [dia, hora] = String(s).split(' ');
        return [dataBR(dia), (hora || '').slice(0, 5) || '—'];
    }

    function hoje() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    function aviso(mensagem, tipo = 'sucesso') {
        const el = $('alert-system');
        el.textContent = mensagem;
        el.className = 'alert-system ' + tipo;
        el.hidden = false;
        clearTimeout(timerAviso);
        timerAviso = setTimeout(() => { el.hidden = true; }, 4000);
    }

    function erroForm(form, mensagem) {
        let caixa = form.querySelector('.error-alert');
        if (!caixa) {
            caixa = document.createElement('div');
            caixa.className = 'error-alert';
            caixa.style.marginBottom = '14px';
            caixa.setAttribute('role', 'alert');
            form.querySelector('.dialog-topo').after(caixa);
        }
        caixa.textContent = mensagem || '';
        caixa.hidden = !mensagem;
    }

    async function chamar(acao, dados, query) {
        const opcoes = { credentials: 'same-origin' };
        if (dados) {
            opcoes.method = 'POST';
            opcoes.headers = { 'Content-Type': 'application/json' };
            opcoes.body = JSON.stringify(dados);
        }
        const resp = await fetch(API + '?acao=' + acao + (query || ''), opcoes);
        const texto = await resp.text();

        let json;
        try {
            json = JSON.parse(texto);
        } catch (e) {
            const trecho = texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
            throw new Error('Resposta inválida do servidor: ' + (trecho || 'vazia'));
        }
        if (resp.status === 401) {
            location.reload();
            throw new Error(json.erro || 'Sessão expirada.');
        }
        if (!json.ok) throw new Error(json.erro || 'Erro inesperado.');
        return json;
    }

    async function enviar(ev, dialogId, acao, dados, mensagem) {
        ev.preventDefault();
        const form = ev.target;
        const botao = form.querySelector('[type="submit"]');
        erroForm(form, '');
        botao.disabled = true;
        try {
            await chamar(acao, dados);
        } catch (e) {
            erroForm(form, e.message);
            botao.disabled = false;
            return;
        }
        botao.disabled = false;
        const recarregou = await carregar();
        $(dialogId).close();
        if (recarregou) aviso(mensagem);
    }

    function baixarCsv(nomeArquivo, linhas) {
        const celula = (c) => {
            let t = String(c ?? '');
            if (/^[=+\-@]/.test(t)) t = "'" + t;
            return '"' + t.replace(/"/g, '""') + '"';
        };
        const csv = linhas.map((l) => l.map(celula).join(';')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    const ESTILO_IMPRESSAO = `
        body{font-family:"Segoe UI",Arial,sans-serif;color:#0f172a;margin:24px;font-size:14px}
        h3{font-size:20px;margin:0 0 16px}
        h4{font-size:16px;margin:24px 0 8px}
        .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px}
        .campo-largo{grid-column:1/-1}
        .input-container{display:flex;flex-direction:column;gap:2px}
        .input-container span{font-size:12px;color:#64748b;font-weight:600}
        .input-container strong{font-weight:500;white-space:pre-wrap}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
        th{background:#f1f5f9}
    `;

    function imprimirElemento(titulo, elemento) {
        const copia = elemento.cloneNode(true);
        copia.querySelectorAll('.dialog-fechar').forEach((b) => b.remove());

        const quadro = document.createElement('iframe');
        quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.appendChild(quadro);

        const doc = quadro.contentWindow.document;
        doc.open();
        doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${ESTILO_IMPRESSAO}</style></head><body>${copia.innerHTML}</body></html>`);
        doc.close();

        const remover = () => quadro.remove();
        quadro.contentWindow.onafterprint = remover;
        setTimeout(remover, 120000);
        setTimeout(() => {
            quadro.contentWindow.focus();
            quadro.contentWindow.print();
        }, 150);
    }

    /* ---------- carregar dados ---------- */

    async function carregar() {
        try {
            const [st, eq, al] = await Promise.all([
                chamar('setores_listar'),
                chamar('equipamentos_listar'),
                chamar('alteracoes_recentes')
            ]);
            estado.setores = st.dados;
            estado.equipamentos = eq.dados;
            estado.alteracoes = al.dados;
            if (ehAdmin()) estado.usuarios = (await chamar('usuarios_listar')).dados;
            renderTudo();
            return true;
        } catch (e) {
            aviso(e.message, 'erro');
            return false;
        }
    }

    function renderTudo() {
        renderSelectsSetor();
        renderDashboard();
        renderEquipamentos();
        renderSetores();
        if (ehAdmin()) renderUsuarios();
        renderRelEquipamentos();
        renderRelSetores();
    }

    function renderSelectsSetor() {
        ['filtro-setor', 'rel-eq-setor'].forEach((id) => {
            const sel = $(id);
            const atual = sel.value;
            sel.innerHTML = '<option value="">Todos</option>' + estado.setores.map((s) =>
                `<option value="${s.id}">${esc(s.nome)}${ativo(s) ? '' : ' (desativado)'}</option>`
            ).join('');
            sel.value = atual;
        });
    }

    /* ---------- partes comuns de listagem ---------- */

    function badgeSituacao(e) {
        if (!ativo(e)) return '<span class="badge badge-inativo">Desativado</span>';
        return `<span class="badge ${BADGE[e.situacao] || ''}">${esc(e.situacao)}</span>`;
    }

    function badgeAtivo(x) {
        return ativo(x)
            ? '<span class="badge badge-disponivel">Ativo</span>'
            : '<span class="badge badge-inativo">Desativado</span>';
    }

    function botoesLinha(x, { detalhes = false, desativar = true, excluir = false } = {}) {
        const btn = (acao, texto, perigo) =>
            `<button type="button" class="btn-acao${perigo ? ' btn-perigo' : ''}" data-acao="${acao}" data-id="${x.id}">${texto}</button>`;
        const b = [];
        if (detalhes) b.push(btn('detalhes', 'Detalhes'));
        if (podeEditar()) {
            if (ativo(x)) {
                b.push(btn('editar', 'Editar'));
                if (desativar) b.push(btn('desativar', 'Desativar', true));
            } else {
                b.push(btn('reativar', 'Reativar'));
            }
        }
        if (excluir && ehAdmin()) b.push(btn('excluir', 'Excluir', true));
        return b.join('');
    }

    function filtrarEquipamentos(prefixo) {
        const busca = norm($(prefixo + 'busca').value.trim());
        const setor = $(prefixo + 'setor').value;
        const categoria = $(prefixo + 'categoria').value;
        const situacao = $(prefixo + 'situacao').value;
        const desativados = $(prefixo + 'desativados').checked;

        return estado.equipamentos.filter((e) => {
            if (!desativados && !ativo(e)) return false;
            if (setor && String(e.setor_id) !== setor) return false;
            if (categoria && e.categoria !== categoria) return false;
            if (situacao && e.situacao !== situacao) return false;
            if (busca && !norm([e.patrimonio, e.nome, e.marca, e.modelo, e.serie].join(' ')).includes(busca)) return false;
            return true;
        });
    }

    const equipamentosAtivos = () => estado.equipamentos.filter(ativo);
    const achar = (lista, id) => lista.find((x) => String(x.id) === String(id));

    /* ---------- dashboard ---------- */

    function renderDashboard() {
        const eqs = equipamentosAtivos();
        const conta = (sit) => eqs.filter((e) => e.situacao === sit).length;
        const num = (id, n) => { $(id).querySelector('span').textContent = n; };

        num('num-equipamentos', eqs.length);
        num('num-setores', estado.setores.filter(ativo).length);
        num('num-disponiveis', conta('Disponível'));
        num('num-manutencao', conta('Em manutenção'));
        num('num-defeituoso', conta('Defeituoso'));

        $('alteracoes-tbody').innerHTML = estado.alteracoes.length
            ? estado.alteracoes.map((a) => {
                const [data, hora] = dataHora(a.criado_em);
                return `<tr>
                    <td>${data} ${hora}</td>
                    <td>${esc(ROTULO_ENTIDADE[a.entidade] || a.entidade)}</td>
                    <td>${esc(a.nome || '—')}</td>
                    <td>${esc(ROTULO_ACAO[a.acao] || a.acao)}</td>
                    <td>${esc(a.situacao_de || '—')}</td>
                    <td>${esc(a.situacao_para || '—')}</td>
                    <td>${esc(a.justificativa || '—')}</td>
                    <td>${esc(a.usuario || 'Usuário excluído')}</td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="8">Nenhuma alteração registrada.</td></tr>';

        desenharGraficos(eqs);
    }

    function desenharGraficos(eqs) {
        if (typeof Chart === 'undefined') return;

        if (graficoStatus) graficoStatus.destroy();
        graficoStatus = new Chart($('grafico-status'), {
            type: 'doughnut',
            data: {
                labels: SITUACOES,
                datasets: [{
                    data: SITUACOES.map((s) => eqs.filter((e) => e.situacao === s).length),
                    backgroundColor: COR_SITUACAO
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });

        const setores = estado.setores.filter(ativo);
        if (graficoSetores) graficoSetores.destroy();
        graficoSetores = new Chart($('grafico-setores'), {
            type: 'bar',
            data: {
                labels: setores.map((s) => s.nome),
                datasets: [{
                    label: 'Equipamentos',
                    data: setores.map((s) => eqs.filter((e) => String(e.setor_id) === String(s.id)).length),
                    backgroundColor: '#1d4ed8',
                    maxBarThickness: 56
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    /* ---------- equipamentos ---------- */

    function renderEquipamentos() {
        const lista = filtrarEquipamentos('filtro-');
        $('equipamentos-contador').textContent = `${lista.length} equipamento(s) encontrado(s)`;
        $('equipamentos-tbody').innerHTML = lista.length
            ? lista.map((e) => `<tr class="${ativo(e) ? '' : 'desativado'}">
                <td>${esc(e.patrimonio || '—')}</td>
                <td>${esc(e.nome)}</td>
                <td>${esc(e.categoria)}</td>
                <td>${esc(e.setor_nome)}</td>
                <td>${badgeSituacao(e)}</td>
                <td>${botoesLinha(e, { detalhes: true, excluir: !ativo(e) })}</td>
            </tr>`).join('')
            : '<tr><td colspan="6">Nenhum equipamento encontrado.</td></tr>';
    }

    function preencherSetorForm(selecionado) {
        const lista = estado.setores.filter((s) => ativo(s) || String(s.id) === String(selecionado));
        $('eq-setor').innerHTML = '<option value="">Selecione…</option>' +
            lista.map((s) => `<option value="${s.id}">${esc(s.nome)}</option>`).join('');
        $('eq-setor').value = selecionado ?? '';
    }

    function abrirEquipamento(id) {
        const eq = id ? achar(estado.equipamentos, id) : null;
        const form = $('form-equipamento');
        form.reset();
        erroForm(form, '');

        estado.editando.eq = eq ? eq.id : null;
        $('dialog-equipamento-titulo').textContent = eq ? 'Editar equipamento' : 'Novo equipamento';
        $('eq-justificativa-container').hidden = !eq;
        $('eq-justificativa').required = !!eq;
        preencherSetorForm(eq ? eq.setor_id : '');

        if (eq) {
            $('eq-patrimonio').value = eq.patrimonio || '';
            $('eq-nome').value = eq.nome || '';
            $('eq-categoria').value = eq.categoria;
            $('eq-marca').value = eq.marca || '';
            $('eq-modelo').value = eq.modelo || '';
            $('eq-serie').value = eq.serie || '';
            $('eq-aquisicao').value = (eq.aquisicao || '').slice(0, 10);
            $('eq-situacao').value = eq.situacao;
            $('eq-observacoes').value = eq.observacoes || '';
        }
        $('dialog-equipamento').showModal();
    }

    async function abrirDetalhes(id) {
        const e = achar(estado.equipamentos, id);
        if (!e) return;
        estado.detalhe = e.id;

        const set = (campo, v) => { $('det-' + campo).textContent = v || '—'; };
        set('patrimonio', e.patrimonio);
        set('nome', e.nome);
        set('categoria', e.categoria);
        set('setor', e.setor_nome);
        set('marca', e.marca);
        set('modelo', e.modelo);
        set('serie', e.serie);
        set('aquisicao', e.aquisicao ? dataBR(e.aquisicao) : '');
        set('situacao', ativo(e) ? e.situacao : `${e.situacao} (desativado)`);
        set('observacoes', e.observacoes);

        const editavel = podeEditar() && ativo(e);
        $('btn-editar-detalhes').hidden = !editavel;
        $('btn-desativar-detalhes').hidden = !editavel;

        $('det-historico').innerHTML = '<tr><td colspan="4">Carregando…</td></tr>';
        $('dialog-detalhes-equipamento').showModal();

        try {
            const r = await chamar('equipamento_historico', null, '&id=' + e.id);
            $('det-historico').innerHTML = r.dados.length
                ? r.dados.map((h) => {
                    const [data, hora] = dataHora(h.criado_em);
                    return `<tr>
                        <td>${data}</td>
                        <td>${hora}</td>
                        <td>${esc(h.cargo)}</td>
                        <td>${esc(h.justificativa || '—')}</td>
                    </tr>`;
                }).join('')
                : '<tr><td colspan="4">Sem alterações registradas.</td></tr>';
        } catch (err) {
            $('det-historico').innerHTML = `<tr><td colspan="4">${esc(err.message)}</td></tr>`;
        }
    }

    /* ---------- setores ---------- */

    function renderSetores() {
        const eqs = equipamentosAtivos();
        $('setores-contador').textContent = `${estado.setores.length} setor(es)`;
        $('setores-tbody').innerHTML = estado.setores.length
            ? estado.setores.map((s) => `<tr class="${ativo(s) ? '' : 'desativado'}">
                <td>${esc(s.nome)}</td>
                <td>${esc(s.localizacao || '—')}</td>
                <td>${esc(s.responsavel || '—')}</td>
                <td>${eqs.filter((e) => String(e.setor_id) === String(s.id)).length}</td>
                <td>${badgeAtivo(s)}</td>
                <td>${botoesLinha(s, { excluir: !ativo(s) })}</td>
            </tr>`).join('')
            : '<tr><td colspan="6">Nenhum setor cadastrado.</td></tr>';
    }

    function abrirSetor(id) {
        const st = id ? achar(estado.setores, id) : null;
        const form = $('form-setor');
        form.reset();
        erroForm(form, '');

        estado.editando.st = st ? st.id : null;
        $('dialog-setor-titulo').textContent = st ? 'Editar setor' : 'Novo setor';
        $('st-justificativa-container').hidden = !st;
        $('st-justificativa').required = !!st;

        if (st) {
            $('st-nome').value = st.nome || '';
            $('st-descricao').value = st.descricao || '';
            $('st-localizacao').value = st.localizacao || '';
            $('st-responsavel').value = st.responsavel || '';
        }
        $('dialog-setor').showModal();
    }

    /* ---------- usuários ---------- */

    function renderUsuarios() {
        $('usuarios-contador').textContent = `${estado.usuarios.length} usuário(s)`;
        $('usuarios-tbody').innerHTML = estado.usuarios.length
            ? estado.usuarios.map((u) => `<tr class="${ativo(u) ? '' : 'desativado'}">
                <td>${esc(u.nome)}</td>
                <td>${esc(u.email)}</td>
                <td>${esc(u.perfil)}</td>
                <td>${badgeAtivo(u)}</td>
                <td>${botoesLinha(u, { desativar: String(u.id) !== String(estado.usuario.id), excluir: !ativo(u) && u.perfil !== 'Administrador' })}</td>
            </tr>`).join('')
            : '<tr><td colspan="5">Nenhum usuário cadastrado.</td></tr>';
    }

    function abrirUsuario(id) {
        const us = id ? achar(estado.usuarios, id) : null;
        const form = $('form-usuario');
        form.reset();
        erroForm(form, '');

        estado.editando.us = us ? us.id : null;
        $('dialog-usuario-titulo').textContent = us ? 'Editar usuário' : 'Novo usuário';
        $('us-justificativa-container').hidden = !us;
        $('us-justificativa').required = !!us;
        $('us-senha').required = !us;
        document.querySelector('label[for="us-senha"]').textContent = us
            ? 'Nova senha (deixe em branco para manter)'
            : 'Senha * (mín. 6 caracteres)';

        if (us) {
            $('us-nome').value = us.nome || '';
            $('us-usuario').value = us.usuario || '';
            $('us-email').value = us.email || '';
            $('us-perfil').value = us.perfil;
        }
        $('dialog-usuario').showModal();
    }

    /* ---------- desativar (equipamento, setor, usuário) ---------- */

    const DESATIVAR = {
        eq: { form: 'form-desativar-equipamento', dialog: 'dialog-desativar-equipamento', titulo: 'dialog-desativar-equipamento-titulo', texto: 'Desativar equipamento' },
        st: { form: 'form-desativar-setor', dialog: 'dialog-desativar-setor', titulo: 'dialog-desativar-setor-titulo', texto: 'Desativar setor' },
        us: { form: 'form-desativar-usuario', dialog: 'dialog-desativar-usuario', titulo: 'dialog-desativar-usuario-titulo', texto: 'Desativar usuário' }
    };

    function abrirDesativar(tipo, id, nome) {
        const cfg = DESATIVAR[tipo];
        estado.desativando[tipo] = id;
        $(cfg.form).reset();
        erroForm($(cfg.form), '');
        $(cfg.titulo).textContent = `${cfg.texto}: ${nome}`;
        $(cfg.dialog).showModal();
    }

    /* ---------- reativar / excluir ---------- */

    function abrirAcao(tipo, acao, id, nome) {
        const reativar = acao === 'reativar';
        const form = $('form-acao');
        estado.acaoExtra = { tipo, acao, id };
        form.reset();
        erroForm(form, '');
        $('acao-titulo').textContent = `${reativar ? 'Reativar' : 'Excluir'} ${ROTULO_TIPO[tipo]}: ${nome}`;
        $('acao-aviso').hidden = reativar;
        $('btn-confirmar-acao').textContent = reativar ? 'Reativar' : 'Excluir';
        $('btn-confirmar-acao').className = reativar ? 'btn btn-primario' : 'btn btn-perigo';
        $('dialog-acao').showModal();
    }

    /* ---------- relatório de equipamentos ---------- */

    function textoSituacao(e) {
        return ativo(e) ? e.situacao : 'Desativado';
    }

    function renderRelEquipamentos() {
        const lista = filtrarEquipamentos('rel-eq-');
        const conta = (sit) => lista.filter((e) => ativo(e) && e.situacao === sit).length;

        $('rel-eq-total').textContent = lista.length;
        $('rel-eq-disponiveis').textContent = conta('Disponível');
        $('rel-eq-manutencao').textContent = conta('Em manutenção');
        $('rel-eq-defeituosos').textContent = conta('Defeituoso');

        $('rel-eq-tbody').innerHTML = lista.length
            ? lista.map((e) => `<tr class="${ativo(e) ? '' : 'desativado'}">
                <td>${esc(e.patrimonio || '—')}</td>
                <td>${esc(e.nome)}</td>
                <td>${esc(e.categoria)}</td>
                <td>${esc([e.marca, e.modelo].filter(Boolean).join(' / ') || '—')}</td>
                <td>${esc(e.serie || '—')}</td>
                <td>${esc(e.setor_nome)}</td>
                <td>${dataBR(e.aquisicao)}</td>
                <td>${badgeSituacao(e)}</td>
            </tr>`).join('')
            : '<tr><td colspan="8">Nenhum equipamento encontrado.</td></tr>';
    }

    function exportarEquipamentos() {
        const lista = filtrarEquipamentos('rel-eq-');
        baixarCsv(`equipamentos-${hoje()}.csv`, [
            ['Patrimônio', 'Nome', 'Categoria', 'Marca', 'Modelo', 'Série', 'Setor', 'Aquisição', 'Situação'],
            ...lista.map((e) => [
                e.patrimonio, e.nome, e.categoria, e.marca, e.modelo, e.serie,
                e.setor_nome, e.aquisicao ? dataBR(e.aquisicao) : '', textoSituacao(e)
            ])
        ]);
    }

    /* ---------- relatório de setores ---------- */

    function resumoSetores() {
        const eqs = equipamentosAtivos();
        return estado.setores.filter(ativo).map((s) => {
            const doSetor = eqs.filter((e) => String(e.setor_id) === String(s.id));
            const n = (sit) => doSetor.filter((e) => e.situacao === sit).length;
            const disp = n('Disponível');
            const uso = n('Em utilização');
            const man = n('Em manutenção');
            const def = n('Defeituoso');
            return { setor: s, total: doSetor.length, disp, uso, man, def, outros: doSetor.length - disp - uso - man - def };
        });
    }

    function ajustarBarra(linha, qtd, total) {
        linha.querySelector('.barra-valor').textContent = qtd;
        linha.querySelector('.barra-preenchida').style.width = (total ? (qtd / total) * 100 : 0) + '%';
    }

    function renderRelSetores() {
        const linhas = resumoSetores();
        const eqs = equipamentosAtivos();

        $('rel-st-total-geral').textContent = linhas.reduce((soma, l) => soma + l.total, 0);

        $('rel-st-tbody').innerHTML = linhas.length
            ? linhas.map((l) => `<tr>
                <td>${esc(l.setor.nome)}</td>
                <td>${esc(l.setor.localizacao || '—')}</td>
                <td>${l.total}</td>
                <td>${l.disp}</td>
                <td>${l.uso}</td>
                <td>${l.man}</td>
                <td>${l.def}</td>
                <td>${l.outros}</td>
            </tr>`).join('')
            : '<tr><td colspan="8">Nenhum setor ativo.</td></tr>';

        document.querySelectorAll('#rel-st-categorias .barra-linha').forEach((linha) => {
            ajustarBarra(linha, eqs.filter((e) => e.categoria === linha.dataset.categoria).length, eqs.length);
        });
        document.querySelectorAll('#rel-st-situacoes .barra-linha').forEach((linha) => {
            ajustarBarra(linha, eqs.filter((e) => e.situacao === linha.dataset.situacao).length, eqs.length);
        });

        const criticos = linhas
            .map((l) => ({ nome: l.setor.nome, qtd: l.man + l.def }))
            .filter((c) => c.qtd > 0)
            .sort((a, b) => b.qtd - a.qtd);
        const maior = criticos.length ? criticos[0].qtd : 1;

        $('rel-st-criticos').innerHTML = criticos.length
            ? criticos.map((c) => `<div class="barra-linha">
                <span class="barra-rotulo">${esc(c.nome)}</span>
                <div class="barra-trilho"><div class="barra-preenchida barra-laranja" style="width:${(c.qtd / maior) * 100}%"></div></div>
                <strong class="barra-valor">${c.qtd}</strong>
            </div>`).join('')
            : '<p class="contador">Nenhum setor com equipamentos em manutenção ou defeituosos.</p>';
    }

    function exportarSetores() {
        const linhas = resumoSetores();
        baixarCsv(`equipamentos-por-setor-${hoje()}.csv`, [
            ['Setor', 'Localização', 'Total', 'Disponível', 'Em uso', 'Manutenção', 'Defeituoso', 'Outros'],
            ...linhas.map((l) => [l.setor.nome, l.setor.localizacao, l.total, l.disp, l.uso, l.man, l.def, l.outros]),
            ['Total geral', '', linhas.reduce((soma, l) => soma + l.total, 0), '', '', '', '', '']
        ]);
    }

    /* ---------- eventos ---------- */

    function ligarTabela(tbodyId, tratar) {
        $(tbodyId).addEventListener('click', (ev) => {
            const botao = ev.target.closest('[data-acao]');
            if (botao) tratar(botao.dataset.acao, botao.dataset.id);
        });
    }

    function ligarEventos() {
        document.querySelectorAll('dialog .dialog-fechar, dialog [id^="btn-cancelar-"]').forEach((b) => {
            b.addEventListener('click', () => b.closest('dialog').close());
        });

        $('det-observacoes').style.whiteSpace = 'pre-wrap';

        /* filtros */
        ['filtro-', 'rel-eq-'].forEach((p) => {
            const aplicar = p === 'filtro-' ? renderEquipamentos : renderRelEquipamentos;
            $(p + 'busca').addEventListener('input', aplicar);
            ['setor', 'categoria', 'situacao', 'desativados'].forEach((c) => $(p + c).addEventListener('change', aplicar));
        });

        /* equipamentos */
        $('btn-novo-equipamento').addEventListener('click', () => abrirEquipamento(null));
        ligarTabela('equipamentos-tbody', (acao, id) => {
            const e = achar(estado.equipamentos, id);
            if (acao === 'detalhes') abrirDetalhes(id);
            if (acao === 'editar') abrirEquipamento(id);
            if (acao === 'desativar' && e) abrirDesativar('eq', id, e.nome);
            if ((acao === 'reativar' || acao === 'excluir') && e) abrirAcao('eq', acao, id, e.nome);
        });

        $('btn-editar-detalhes').addEventListener('click', () => {
            $('dialog-detalhes-equipamento').close();
            abrirEquipamento(estado.detalhe);
        });
        $('btn-desativar-detalhes').addEventListener('click', () => {
            const e = achar(estado.equipamentos, estado.detalhe);
            $('dialog-detalhes-equipamento').close();
            if (e) abrirDesativar('eq', e.id, e.nome);
        });
        $('btn-imprimir-detalhes').addEventListener('click', () => {
            imprimirElemento('Detalhes do equipamento', $('area-impressao-equipamento'));
        });

        $('form-equipamento').addEventListener('submit', (ev) => enviar(
            ev, 'dialog-equipamento', 'equipamento_salvar',
            {
                id: estado.editando.eq,
                patrimonio: valor('eq-patrimonio'),
                nome: valor('eq-nome'),
                categoria: $('eq-categoria').value,
                setor_id: $('eq-setor').value,
                marca: valor('eq-marca'),
                modelo: valor('eq-modelo'),
                serie: valor('eq-serie'),
                aquisicao: $('eq-aquisicao').value,
                situacao: $('eq-situacao').value,
                observacoes: valor('eq-observacoes'),
                justificativa: valor('eq-justificativa')
            },
            estado.editando.eq ? 'Equipamento atualizado.' : 'Equipamento cadastrado.'
        ));
        $('form-desativar-equipamento').addEventListener('submit', (ev) => enviar(
            ev, 'dialog-desativar-equipamento', 'equipamento_desativar',
            { id: estado.desativando.eq, justificativa: valor('dv-eq-justificativa') },
            'Equipamento desativado.'
        ));

        /* setores */
        $('btn-novo-setor').addEventListener('click', () => abrirSetor(null));
        ligarTabela('setores-tbody', (acao, id) => {
            const s = achar(estado.setores, id);
            if (acao === 'editar') abrirSetor(id);
            if (acao === 'desativar' && s) abrirDesativar('st', id, s.nome);
            if ((acao === 'reativar' || acao === 'excluir') && s) abrirAcao('st', acao, id, s.nome);
        });
        $('form-setor').addEventListener('submit', (ev) => enviar(
            ev, 'dialog-setor', 'setor_salvar',
            {
                id: estado.editando.st,
                nome: valor('st-nome'),
                descricao: valor('st-descricao'),
                localizacao: valor('st-localizacao'),
                responsavel: valor('st-responsavel'),
                justificativa: valor('st-justificativa')
            },
            estado.editando.st ? 'Setor atualizado.' : 'Setor cadastrado.'
        ));
        $('form-desativar-setor').addEventListener('submit', (ev) => enviar(
            ev, 'dialog-desativar-setor', 'setor_desativar',
            { id: estado.desativando.st, justificativa: valor('dv-st-justificativa') },
            'Setor desativado.'
        ));

        /* usuários */
        $('btn-novo-usuario').addEventListener('click', () => abrirUsuario(null));
        ligarTabela('usuarios-tbody', (acao, id) => {
            const u = achar(estado.usuarios, id);
            if (acao === 'editar') abrirUsuario(id);
            if (acao === 'desativar' && u) abrirDesativar('us', id, u.nome);
            if ((acao === 'reativar' || acao === 'excluir') && u) abrirAcao('us', acao, id, u.nome);
        });
        $('form-usuario').addEventListener('submit', (ev) => enviar(
            ev, 'dialog-usuario', 'usuario_salvar',
            {
                id: estado.editando.us,
                nome: valor('us-nome'),
                usuario: valor('us-usuario'),
                email: valor('us-email'),
                perfil: $('us-perfil').value,
                senha: $('us-senha').value,
                justificativa: valor('us-justificativa')
            },
            estado.editando.us ? 'Usuário atualizado.' : 'Usuário cadastrado.'
        ));
        $('form-desativar-usuario').addEventListener('submit', (ev) => enviar(
            ev, 'dialog-desativar-usuario', 'usuario_desativar',
            { id: estado.desativando.us, justificativa: valor('dv-us-justificativa') },
            'Usuário desativado.'
        ));

        /* reativar / excluir */
        $('form-acao').addEventListener('submit', (ev) => {
            const a = estado.acaoExtra;
            enviar(
                ev, 'dialog-acao', `${ENTIDADE_API[a.tipo]}_${a.acao}`,
                { id: a.id, justificativa: valor('acao-justificativa') },
                a.acao === 'reativar' ? 'Reativado com sucesso.' : 'Excluído com sucesso.'
            );
        });

        /* relatórios */
        $('btn-exportar-csv').addEventListener('click', exportarEquipamentos);
        $('btn-imprimir-equipamentos').addEventListener('click', () => window.print());
        $('btn-exportar-csv-setores').addEventListener('click', exportarSetores);
        $('btn-imprimir-setores').addEventListener('click', () => window.print());
    }

    function iniciar(usuario) {
        estado.usuario = usuario;
        $('sidebar-usuario').textContent = `${usuario.nome} - ${usuario.perfil}`;
        $('btn-novo-equipamento').hidden = !podeEditar();
        $('btn-novo-setor').hidden = !podeEditar();
        $('btn-novo-usuario').hidden = !ehAdmin();
        carregar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ligarEventos);
    } else {
        ligarEventos();
    }

    const mostrarSistemaOriginal = App.mostrarSistema;
    App.mostrarSistema = function (usuario) {
        mostrarSistemaOriginal.call(App, usuario);
        iniciar(usuario);
    };
})();
