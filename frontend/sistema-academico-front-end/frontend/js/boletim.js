/* BOLETIM.JS - Visualização consolidada de notas por turma + lançamento de notas */

let alunosMap = {}, matriculasMap = {}, disciplinasMap = {}, turmasMap = {}, ofertasMap = {};
let allMatriculas = [], allCursamentos = [], allAvaliacoes = [], allNotas = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (window.auth && !window.auth.initAuth(true)) return;
  if (window.ui && window.ui.Sidebar) window.ui.Sidebar.init();
  if (window.auth && window.auth.updateUserUI) window.auth.updateUserUI();
  setupLogout();
  await loadLookups();
  populateTurmaSelect();
  document.getElementById('filter-turma').addEventListener('change', render);
  document.getElementById('filter-ano').addEventListener('input', render);
  document.getElementById('filter-semestre').addEventListener('change', render);
  // Modal de lançamento.
  document.getElementById('btn-cancelar-notas').addEventListener('click', closeNotasModal);
  document.getElementById('form-lancar-notas').addEventListener('submit', salvarNotas);
  document.getElementById('modal-notas').addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeNotasModal();
  });
});

function toMap(arr, key) {
  return Object.fromEntries((arr || []).map(x => [x[key], x]));
}

async function loadLookups() {
  try {
    const [alunos, matriculas, disciplinas, turmas, ofertas, cursamentos, avaliacoes, notas] = await Promise.all([
      window.api.getData('/alunos?limit=500'),
      window.api.getData('/matriculas?limit=500'),
      window.api.getData('/disciplinas?limit=500'),
      window.api.getData('/turmas?limit=500'),
      window.api.getData('/ofertas?limit=500'),
      window.api.getData('/cursamentos?limit=500'),
      window.api.getData('/avaliacoes?limit=500'),
      window.api.getData('/notas?limit=500'),
    ]);
    alunosMap      = toMap(alunos, 'pessoa_id');
    matriculasMap  = toMap(matriculas, 'idMatricula');
    disciplinasMap = toMap(disciplinas, 'idDisciplina');
    turmasMap      = toMap(turmas, 'idTurma');
    ofertasMap     = toMap(ofertas, 'idOfertaDisciplina');
    allMatriculas  = matriculas || [];
    allCursamentos = cursamentos || [];
    allAvaliacoes  = avaliacoes || [];
    allNotas       = notas || [];
  } catch (e) {
    console.error('Erro ao carregar dados:', e);
    if (window.ui && window.ui.Toast) window.ui.Toast.error('Erro ao carregar dados');
  }
}

function populateTurmaSelect() {
  const sel = document.getElementById('filter-turma');
  const turmas = Object.values(turmasMap)
    .sort((a, b) => a.nomeTurma.localeCompare(b.nomeTurma));
  sel.innerHTML = '<option value="">Selecione uma turma...</option>' +
    turmas.map(t => `<option value="${t.idTurma}">${t.nomeTurma} — ${t.turno} (${t.anoLetivo})</option>`).join('');
}

function badgeClass(situacao) {
  if (situacao === 'APROVADO') return 'badge badge-aprov';
  if (situacao === 'REPROVADO' || situacao === 'REPROVADO_FALTAS') return 'badge badge-reprov';
  if (situacao === 'TRANCADO') return 'badge badge-tranc';
  return 'badge badge-curso';
}

function render() {
  const idTurma   = parseInt(document.getElementById('filter-turma').value, 10);
  const anoFilter = parseInt(document.getElementById('filter-ano').value, 10);
  const semFilter = parseInt(document.getElementById('filter-semestre').value, 10);
  const cont = document.getElementById('boletim-container');

  if (!idTurma) {
    cont.innerHTML = '<div class="boletim-empty">Selecione uma turma para ver o boletim.</div>';
    return;
  }

  const matsDaTurma = allMatriculas.filter(m =>
    m.idTurma === idTurma &&
    (!anoFilter || m.anoLetivo === anoFilter) &&
    (!semFilter || m.semestre === semFilter)
  );

  if (matsDaTurma.length === 0) {
    cont.innerHTML = '<div class="boletim-empty">Nenhuma matrícula encontrada para esta turma e período.</div>';
    return;
  }

  matsDaTurma.sort((a, b) => {
    const na = alunosMap[a.pessoa_id]?.nome || '';
    const nb = alunosMap[b.pessoa_id]?.nome || '';
    return na.localeCompare(nb);
  });

  const cursIndex = {};
  for (const c of allCursamentos) {
    cursIndex[`${c.siMatricula}_${c.idOfertaDisciplina}`] = c;
  }

  const turma = turmasMap[idTurma];
  const titulo = `${turma.nomeTurma} — ${turma.turno} (${turma.serie}, ${turma.anoLetivo})`;
  const periodos = anoFilter || semFilter
    ? `Filtro: ${anoFilter || '*'}/${semFilter || '*'}`
    : 'Todos os períodos cadastrados';

  let html = `<div class="boletim-section">
    <h4>${titulo} <small>${periodos} • ${matsDaTurma.length} aluno(s)</small></h4>`;

  for (const mat of matsDaTurma) {
    const aluno = alunosMap[mat.pessoa_id];
    const nomeAluno = aluno ? aluno.nome : `aluno #${mat.pessoa_id}`;
    const raAluno = aluno ? `RA ${aluno.RAaluno}` : '';
    const matStr = aluno && aluno.matriculaAluno ? aluno.matriculaAluno : `matrícula #${mat.idMatricula}`;

    const ofertasDaMat = Object.values(ofertasMap).filter(o =>
      o.idTurma === mat.idTurma &&
      o.anoLetivo === mat.anoLetivo &&
      o.semestre === mat.semestre
    );

    const linhas = ofertasDaMat.map(o => {
      const disc = disciplinasMap[o.idDisciplina];
      const nomeDisc = disc ? disc.nomeDisciplina : `disc #${o.idDisciplina}`;
      const c = cursIndex[`${mat.idMatricula}_${o.idOfertaDisciplina}`];
      const media = c && c.mediaFinal != null ? parseFloat(c.mediaFinal).toFixed(2) : '—';
      const faltas = c ? c.faltas : '—';
      const situacao = c ? c.situacaoFinal : 'SEM_CURSAMENTO';
      const podeLancar = !!c; // só faz sentido se já existe cursamento
      const btn = podeLancar
        ? `<button class="btn btn-sm btn-primary" onclick="abrirLancamento(${mat.idMatricula}, ${o.idOfertaDisciplina})">Lançar notas</button>`
        : `<small style="color:var(--text-secondary)">Sem cursamento</small>`;
      return `<tr>
        <td>${nomeDisc}</td>
        <td>${disc ? disc.cargaHoraria + 'h' : '-'}</td>
        <td style="text-align:center"><strong>${media}</strong></td>
        <td style="text-align:center">${faltas}</td>
        <td><span class="${badgeClass(situacao)}">${situacao.replace(/_/g, ' ')}</span></td>
        <td style="text-align:right">${btn}</td>
      </tr>`;
    }).join('');

    const corpo = linhas || `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:1rem">Nenhuma oferta ativa para ${mat.anoLetivo}/${mat.semestre}.</td></tr>`;

    html += `
      <div style="border:1px solid var(--border);border-radius:8px;margin-bottom:1rem;overflow:hidden">
        <div style="padding:.75rem 1rem;background:#fff;display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${nomeAluno}</strong>
            <small style="color:var(--text-secondary);margin-left:.5rem">${raAluno} • ${matStr}</small>
          </div>
          <small style="color:var(--text-secondary)">Período ${mat.anoLetivo}/${mat.semestre} • ${mat.statusMatricula}</small>
        </div>
        <table class="data-table" style="margin:0">
          <thead><tr><th>Disciplina</th><th>CH</th><th style="text-align:center">Média</th><th style="text-align:center">Faltas</th><th>Situação</th><th></th></tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>`;
  }

  html += '</div>';
  cont.innerHTML = html;
}

/* ===========================================================
   Modal de lançamento de notas
   =========================================================== */

let lancamentoCtx = null; // { siMatricula, idOferta }

function abrirLancamento(siMatricula, idOferta) {
  const mat = matriculasMap[siMatricula];
  const oferta = ofertasMap[idOferta];
  const aluno = mat ? alunosMap[mat.pessoa_id] : null;
  const disc = oferta ? disciplinasMap[oferta.idDisciplina] : null;

  // Avaliações daquela oferta + notas existentes desse aluno.
  const avals = allAvaliacoes
    .filter(a => a.idOfertaDisciplina === idOferta)
    .sort((a, b) => (a.dataAvaliacao || '').localeCompare(b.dataAvaliacao || ''));

  const notasExistentes = {};
  for (const n of allNotas) {
    if (n.siMatricula === siMatricula && n.idOfertaDisciplina === idOferta) {
      notasExistentes[n.idAvaliacao] = n;
    }
  }

  document.getElementById('modal-notas-aluno').textContent =
    `${aluno ? aluno.nome : '?'} — ${disc ? disc.nomeDisciplina : '?'}`;

  const cont = document.getElementById('modal-notas-avals');
  if (avals.length === 0) {
    cont.innerHTML = '<p style="color:var(--text-secondary);padding:1rem;text-align:center">Nenhuma avaliação cadastrada para esta oferta.<br>Cadastre as avaliações primeiro.</p>';
    document.getElementById('btn-salvar-notas').disabled = true;
  } else {
    document.getElementById('btn-salvar-notas').disabled = false;
    cont.innerHTML = avals.map(a => {
      const ja = notasExistentes[a.idAvaliacao];
      const val = ja ? parseFloat(ja.nota) : '';
      const meta = ja ? `nota #${ja.idNota} (edição)` : 'nova';
      return `
        <div class="form-row" style="align-items:end">
          <div class="form-group" style="flex:2">
            <label class="form-label">${a.nomeAvaliacao}
              <small style="color:var(--text-secondary);font-weight:400">(${a.tipoAvaliacao}, peso ${a.peso})</small>
            </label>
            <small style="color:var(--text-secondary)">${meta}</small>
          </div>
          <div class="form-group">
            <input type="number" class="form-input" step="0.1" min="0" max="10"
                   data-aval="${a.idAvaliacao}"
                   data-existing="${ja ? ja.idNota : ''}"
                   value="${val}" placeholder="0–10">
          </div>
        </div>`;
    }).join('');
  }

  lancamentoCtx = { siMatricula, idOferta };
  document.getElementById('modal-notas').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeNotasModal() {
  document.getElementById('modal-notas').classList.remove('active');
  document.body.style.overflow = '';
  lancamentoCtx = null;
}

async function salvarNotas(e) {
  e.preventDefault();
  if (!lancamentoCtx) return;
  const { siMatricula, idOferta } = lancamentoCtx;
  const btn = document.getElementById('btn-salvar-notas');
  if (window.ui && window.ui.Loading) window.ui.Loading.button(btn, true);

  const inputs = document.querySelectorAll('#modal-notas-avals input[data-aval]');
  let okCount = 0, errCount = 0;

  for (const inp of inputs) {
    const raw = inp.value.trim();
    if (raw === '') continue; // vazio: não toca
    const nota = parseFloat(raw);
    if (isNaN(nota) || nota < 0 || nota > 10) { errCount++; continue; }
    const idAval = parseInt(inp.dataset.aval, 10);
    const existing = inp.dataset.existing;
    try {
      if (existing) {
        await window.api.putData(`/notas/${existing}`, { nota });
      } else {
        await window.api.postData('/notas', {
          siMatricula,
          idOfertaDisciplina: idOferta,
          idAvaliacao: idAval,
          nota,
        });
      }
      okCount++;
    } catch (err) {
      console.error('Erro ao salvar nota', idAval, err);
      errCount++;
    }
  }

  if (window.ui && window.ui.Loading) window.ui.Loading.button(btn, false);
  if (window.ui && window.ui.Toast) {
    if (errCount === 0) window.ui.Toast.success(`${okCount} nota(s) salva(s).`);
    else window.ui.Toast.error(`${okCount} salva(s), ${errCount} falha(s).`);
  }

  // Recarrega tudo (cursamentos atualiza media, notas atualiza valores).
  await loadLookups();
  render();
  closeNotasModal();
}

function setupLogout() {
  document.querySelectorAll('.btn-logout, [data-action="logout"]').forEach(b =>
    b.addEventListener('click', e => { e.preventDefault(); window.auth && window.auth.logout && window.auth.logout(); }));
}

window.abrirLancamento = abrirLancamento;
