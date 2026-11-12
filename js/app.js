import { CONFIG } from "./config.js";
import { avaliar, resumoTexto } from "./triagem.js";
import { parseCartilha, trechosDaCartilha } from "./cartilha.js";
import { BM25, urgencia, pedeDiagnostico } from "./busca.js";

// ---------------------------------------------------------------- utilidades
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const main = $("#conteudo");
const LS = { consentimento: "les.consentimento", historico: "les.historico" };
const lerLS = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
const gravarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// ---------------------------------------------------------------- dados
const [regras, mdCartilha, casos] = await Promise.all([
  fetch("data/regras-les.json").then((r) => r.json()),
  fetch("data/cartilha-les.md").then((r) => r.text()),
  fetch("data/casos-simulados.json").then((r) => r.json()),
]);
const cartilha = parseCartilha(mdCartilha);
const trechos = trechosDaCartilha(cartilha);
const bm25 = new BM25(trechos);
const secaoPorId = Object.fromEntries(cartilha.secoes.map((s) => [s.id, s]));

// ---------------------------------------------------------------- consentimento
const dlg = $("#consentimento");
if (lerLS(LS.consentimento, null)?.versao !== CONFIG.versaoConsentimento) {
  dlg.showModal();
  dlg.addEventListener("cancel", (e) => e.preventDefault());
}
$("#cons-ok").onclick = () => {
  gravarLS(LS.consentimento, { versao: CONFIG.versaoConsentimento, data: new Date().toISOString() });
  dlg.close();
};

// ---------------------------------------------------------------- rotas
const rotas = { inicio: vInicio, triagem: vTriagem, cartilha: vCartilha, pergunte: vPergunte, privacidade: vPrivacidade };
function navegar() {
  const [rota, arg] = (location.hash.slice(1) || "inicio").split("/");
  const fn = rotas[rota] || vInicio;
  if (rota !== "pergunte" && ia.worker) desligarIA();
  document.querySelectorAll(".abas a").forEach((a) => a.toggleAttribute("aria-current", a.dataset.aba === rota));
  if (a11yFoco) a11yFoco = false; else main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  fn(arg);
  if (rota === "pergunte") $("#pergunta")?.focus();
}
let a11yFoco = true;
addEventListener("hashchange", navegar);

// ---------------------------------------------------------------- início
function vInicio() {
  main.innerHTML = `
  <section class="cartao">
    <h1>Lúpus: conhecer para cuidar cedo</h1>
    <p>Os primeiros sinais do lúpus parecem com os de muitas outras doenças, e por isso o diagnóstico costuma demorar. Este aplicativo ajuda você a <b>reconhecer sinais</b> e a saber <b>quando procurar a UBS</b>.</p>
    <p class="aviso">É um protótipo educativo de pesquisa. <b>Não faz diagnóstico</b> e não substitui consulta. Urgência: <b>192 (SAMU)</b>.</p>
  </section>
  <div class="grade">
    <a class="cartao atalho" href="#triagem"><span class="ic">✓</span><span><b>Questionário de sinais</b><p>Responda em 2 minutos e veja uma orientação de onde procurar atendimento.</p></span></a>
    <a class="cartao atalho" href="#cartilha"><span class="ic">▤</span><span><b>Cartilha</b><p>O que é o lúpus, sinais, diagnóstico, tratamento no SUS e cuidados.</p></span></a>
    <a class="cartao atalho" href="#pergunte"><span class="ic">?</span><span><b>Pergunte à cartilha</b><p>Escreva sua dúvida. A resposta é montada no seu aparelho, só com o conteúdo da cartilha.</p></span></a>
  </div>
  <p class="pequeno">Projeto PIBITI-PROTEC 2026/2027 · UFAM · Grupo Saúde Global, Bioética e Direitos Humanos. Conteúdo em validação clínica (regras ${esc(regras.versao)}). App versão ${esc(CONFIG.versaoApp)}.</p>`;
}

// ---------------------------------------------------------------- triagem
let resp = {};
let etapa = 0;
function vTriagem() {
  if (etapa === 0) return triagemIntro();
  if (etapa === 1) return triagemAlertas();
  if (etapa === 2) return triagemDominios();
  if (etapa === 3) return triagemDuracao();
  return triagemResultado();
}
const barra = (n) => `<div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="3" aria-valuenow="${n}" aria-label="Progresso"><i data-w="${(n / 3) * 100}"></i></div>`;
function ajustarBarra() { main.querySelectorAll(".barra > i").forEach((i) => (i.style.width = i.dataset.w + "%")); }

function triagemIntro() {
  main.innerHTML = `
  <section class="cartao">
    <h1>Questionário de sinais</h1>
    <p>São perguntas de <b>sim ou não</b> sobre sinais que podem aparecer no lúpus. No fim, você recebe uma orientação: procurar urgência, procurar a UBS ou observar.</p>
    <p class="aviso">${esc(regras.aviso_fixo)}</p>
    <p class="pequeno">Não perguntamos nome, idade, endereço nem documento. As respostas ficam só na memória desta tela e somem quando você fecha o aplicativo, a não ser que você escolha guardar.</p>
    <div class="acoes"><button class="primario" id="comecar">Começar</button></div>
  </section>
  <details class="cartao naoimprimir">
    <summary>Para o teste-piloto: usar um caso simulado</summary>
    <p class="pequeno">Casos fictícios, para avaliar a usabilidade sem usar dados reais.</p>
    <div class="grade">${casos.casos.map((c) => `<button data-caso="${esc(c.id)}">${esc(c.titulo)}</button>`).join("")}</div>
  </details>`;
  $("#comecar").onclick = () => { resp = {}; etapa = 1; vTriagem(); };
  main.querySelectorAll("[data-caso]").forEach((b) => (b.onclick = () => {
    const c = casos.casos.find((x) => x.id === b.dataset.caso);
    resp = { ...c.respostas, _caso: c };
    etapa = 4; vTriagem();
  }));
}

function triagemAlertas() {
  main.innerHTML = `
  <section class="cartao">
    <span class="passo">Passo 1 de 3 · Sinais de alerta</span>${barra(1)}
    <h2>Agora, neste momento, você tem algum destes sinais?</h2>
    <form id="f">${regras.alertas.map((a) => `
      <div class="pergunta" role="radiogroup" aria-labelledby="t-${a.id}">
        <span id="t-${a.id}">${esc(a.texto)}</span>
        <div class="simnao">
          <label><input type="radio" name="${a.id}" value="1" required ${resp[a.id] === true ? "checked" : ""}><span>Sim</span></label>
          <label><input type="radio" name="${a.id}" value="0" ${resp[a.id] === false ? "checked" : ""}><span>Não</span></label>
        </div>
      </div>`).join("")}
      <div class="acoes"><button type="button" id="voltar">Voltar</button><button class="primario">Continuar</button></div>
    </form>
  </section>`;
  ajustarBarra();
  $("#voltar").onclick = () => { etapa = 0; vTriagem(); };
  $("#f").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    regras.alertas.forEach((a) => (resp[a.id] = fd.get(a.id) === "1"));
    etapa = regras.alertas.some((a) => resp[a.id]) ? 4 : 2;
    vTriagem();
  };
}

function triagemDominios() {
  main.innerHTML = `
  <section class="cartao">
    <span class="passo">Passo 2 de 3 · Sinais nas últimas semanas</span>${barra(2)}
    <h2>Marque tudo o que você tem sentido</h2>
    <p class="mut">Pode marcar quantos quiser, ou nenhum.</p>
    <form id="f">${regras.dominios.map((d) => `
      <fieldset><legend>${esc(d.nome)}</legend><div class="chips">
        ${d.perguntas.map((p) => `<label class="chip"><input type="checkbox" name="${p.id}" ${resp[p.id] ? "checked" : ""}><span>${esc(p.texto)}</span></label>`).join("")}
      </div></fieldset>`).join("")}
      <div class="acoes"><button type="button" id="voltar">Voltar</button><button class="primario">Continuar</button></div>
    </form>
  </section>`;
  ajustarBarra();
  $("#voltar").onclick = () => { etapa = 1; vTriagem(); };
  $("#f").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    regras.dominios.forEach((d) => d.perguntas.forEach((p) => (resp[p.id] = fd.has(p.id))));
    const algum = regras.dominios.some((d) => d.perguntas.some((p) => resp[p.id]));
    if (!algum) delete resp[regras.duracao.id];
    etapa = algum ? 3 : 4;
    vTriagem();
  };
}

function triagemDuracao() {
  const d = regras.duracao;
  main.innerHTML = `
  <section class="cartao">
    <span class="passo">Passo 3 de 3 · Duração</span>${barra(3)}
    <form id="f"><fieldset><legend><h2>${esc(d.texto)}</h2></legend><div class="chips">
      ${d.opcoes.map((o) => `<label class="opcao"><input type="radio" name="dur" value="${o.valor}" required ${resp[d.id] === o.valor ? "checked" : ""}><span>${esc(o.rotulo)}</span></label>`).join("")}
    </div></fieldset>
    <div class="acoes"><button type="button" id="voltar">Voltar</button><button class="primario">Ver orientação</button></div></form>
  </section>`;
  ajustarBarra();
  $("#voltar").onclick = () => { etapa = 2; vTriagem(); };
  $("#f").onsubmit = (e) => { e.preventDefault(); resp[d.id] = new FormData(e.target).get("dur"); etapa = 4; vTriagem(); };
}

function triagemResultado() {
  const caso = resp._caso;
  const r = avaliar(regras, resp);
  const resumo = resumoTexto(regras, r);
  main.innerHTML = `
  ${caso ? `<p class="aviso naoimprimir"><b>Caso simulado:</b> ${esc(caso.descricao)}</p>` : ""}
  <section class="cartao resultado ${r.nivel}" aria-live="polite">
    <h1>${esc(r.titulo)}</h1>
    <p>${esc(r.texto)}</p>
    ${r.nivel === "urgencia" ? `<div class="acoes"><a class="botao primario" href="tel:192">Ligar 192 (SAMU)</a></div>` : ""}
    <details><summary>Por que esta orientação?</summary>
      <ul>${r.motivos.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
      <p class="pequeno">Regras explícitas, versão ${esc(regras.versao)}, baseadas em: ${regras.fontes.map(esc).join("; ")}. ${esc(regras.nota_metodologica)}</p>
    </details>
  </section>
  <section class="cartao">
    <h2>Resumo para levar à UBS</h2>
    <pre class="resumo" id="resumo">${esc(resumo)}</pre>
    <div class="acoes">
      <button id="imprimir">Imprimir ou salvar PDF</button>
      <button id="compartilhar">${navigator.share ? "Compartilhar" : "Copiar texto"}</button>
      <button id="guardar">Guardar neste aparelho</button>
    </div>
    <p class="pequeno" id="msg-res" role="status"></p>
  </section>
  <p class="aviso">${esc(regras.aviso_fixo)}</p>
  <div class="acoes">
    <a class="botao" href="#cartilha/${esc(r.secao_cartilha)}">Ler na cartilha</a>
    <button id="refazer">Refazer o questionário</button>
  </div>`;
  $("#imprimir").onclick = () => print();
  $("#compartilhar").onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Resumo do questionário", text: resumo });
      else { await navigator.clipboard.writeText(resumo); $("#msg-res").textContent = "Texto copiado."; }
    } catch { /* a pessoa cancelou */ }
  };
  $("#guardar").onclick = () => {
    const h = lerLS(LS.historico, []);
    h.unshift({ data: new Date().toISOString(), nivel: r.nivel, resumo });
    $("#msg-res").textContent = gravarLS(LS.historico, h.slice(0, 20))
      ? "Guardado só neste aparelho. Para apagar, vá em Privacidade."
      : "Não foi possível guardar neste navegador.";
  };
  $("#refazer").onclick = () => { resp = {}; etapa = 0; vTriagem(); };
}

// ---------------------------------------------------------------- cartilha
function vCartilha(id) {
  if (id && secaoPorId[id]) return cartilhaSecao(id);
  main.innerHTML = `
  <section class="cartao">
    <h1>${esc(cartilha.titulo)}</h1>
    <label for="busca-c" class="mut">Procurar na cartilha</label>
    <input id="busca-c" class="campo" type="search" placeholder="Ex.: manchas no rosto, exame FAN, gravidez" autocomplete="off">
    <div id="res-busca" class="grade" aria-live="polite"></div>
  </section>
  <nav class="indice" aria-label="Seções da cartilha">
    ${cartilha.secoes.map((s) => `<a href="#cartilha/${s.id}">${esc(s.titulo)}<small>${esc(s.paragrafos[0].slice(0, 70))}…</small></a>`).join("")}
  </nav>
  <p class="pequeno">${esc(cartilha.intro)}</p>`;
  $("#busca-c").oninput = (e) => {
    const q = e.target.value.trim();
    const res = q.length < 3 ? [] : bm25.buscar(q, 4);
    const vistos = new Set();
    $("#res-busca").innerHTML = res.filter((h) => !vistos.has(h.secao) && vistos.add(h.secao))
      .map((h) => `<a class="atalho" href="#cartilha/${h.secao}"><span class="ic">▤</span><span><b>${esc(h.titulo)}</b><p>${esc(h.texto.slice(0, 120))}…</p></span></a>`).join("")
      || (q.length >= 3 ? `<p class="mut">Nada encontrado. Tente outras palavras.</p>` : "");
  };
}

function cartilhaSecao(id) {
  const i = cartilha.secoes.findIndex((s) => s.id === id);
  const s = cartilha.secoes[i];
  const ant = cartilha.secoes[i - 1], prox = cartilha.secoes[i + 1];
  const linkar = (t) => esc(t).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener noreferrer" target="_blank">$1</a>');
  main.innerHTML = `
  <article class="cartao secao">
    <a href="#cartilha" class="pequeno naoimprimir">← Índice da cartilha</a>
    <h1>${esc(s.titulo)}</h1>
    ${s.paragrafos.map((p) => `<p>${linkar(p)}</p>`).join("")}
    <p class="fonte">Fonte: ${esc(s.fonte)}</p>
  </article>
  <div class="acoes">
    ${ant ? `<a class="botao" href="#cartilha/${ant.id}">← ${esc(ant.titulo)}</a>` : ""}
    ${prox ? `<a class="botao" href="#cartilha/${prox.id}">${esc(prox.titulo)} →</a>` : ""}
    <a class="botao primario" href="#pergunte">Tirar uma dúvida</a>
  </div>`;
}

// ---------------------------------------------------------------- pergunte (RAG)
const ia = { worker: null, ativo: false, carregando: false, modelo: null, device: null, conversa: [], avancado: false, timer: null };
const temGPU = !!navigator.gpu;
const celular = /Android|iPhone|iPad/i.test(navigator.userAgent);
const aparelhoLeve = (navigator.deviceMemory ?? 8) <= 4 || celular;
// Aparelho fraco: celular, pouca memória ou sem WebGPU. Nele a IA fica escondida em
// "Opções avançadas" (no teste do Galaxy A15 o LFM2.5-230M deixou o aparelho lento).
const aparelhoFraco = aparelhoLeve || !temGPU;
const modeloPadrao = CONFIG.modelos.find((m) => m.leve === aparelhoLeve) ?? CONFIG.modelos[0];
const OCIOSO_MS = 5 * 60 * 1000; // descarrega o modelo após 5 min sem perguntas

/** Libera a memória do modelo: encerra o worker (os pesos continuam no cache do aparelho). */
function desligarIA(motivo) {
  clearTimeout(ia.timer);
  if (!ia.worker) return;
  ia.worker.terminate();
  Object.assign(ia, { worker: null, ativo: false, carregando: false, modelo: null, device: null });
  if ($("#modelo")) $("#modelo").value = "";
  if ($("#carga")) $("#carga").hidden = true;
  if ($("#enviar")) $("#enviar").disabled = false;
  if ($("#desligar")) $("#desligar").hidden = true;
  if ($("#estado-ia") && motivo) $("#estado-ia").textContent = motivo;
}
function reiniciarOcioso() {
  clearTimeout(ia.timer);
  ia.timer = setTimeout(() => desligarIA("IA desligada após 5 minutos sem uso, para liberar a memória. Escolha o modo com IA de novo quando quiser."), OCIOSO_MS);
}
// Em aparelho fraco, sair do app (trocar de aplicativo, bloquear a tela) já libera a memória.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && aparelhoFraco) desligarIA("IA desligada ao sair do aplicativo, para liberar a memória.");
});

function vPergunte() {
  const mostrarIA = !aparelhoFraco || ia.avancado;
  const modelosVisiveis = CONFIG.modelos.filter((m) => !aparelhoFraco || m.leve);
  main.innerHTML = `
  <section class="cartao">
    <h1>Pergunte à cartilha</h1>
    <p class="mut">As respostas usam <b>só</b> o conteúdo da cartilha e são montadas no seu aparelho. Sua pergunta não é enviada nem guardada.</p>
    ${mostrarIA ? `
    <label for="modelo" class="pequeno">Modo de resposta</label>
    <select id="modelo" class="campo">
      <option value="">Sem IA · mostrar os trechos da cartilha (funciona em qualquer aparelho)</option>
      ${modelosVisiveis.map((m) => `<option value="${m.id}" ${ia.modelo?.id === m.id ? "selected" : ""}>Com IA · ${esc(m.rotulo)}</option>`).join("")}
    </select>
    <p class="pequeno" id="estado-ia">${ia.ativo ? `IA ligada (${esc(ia.modelo.rotulo)}).` : temGPU ? "Este navegador tem aceleração gráfica (WebGPU)." : "Este navegador não tem WebGPU: com IA, as respostas ficam muito lentas."}
      ${!ia.modelo && !aparelhoFraco ? ` Sugestão para este aparelho: ${esc(modeloPadrao.rotulo)}.` : ""}
      ${aparelhoFraco ? " Atenção: neste aparelho a IA pode deixar o celular lento. Ela é desligada quando você sai desta tela." : ""}</p>
    <div class="acoes"><button type="button" id="desligar" ${ia.worker ? "" : "hidden"}>Desligar IA e liberar memória</button></div>
    <div id="carga" hidden><span class="pequeno" id="carga-txt"></span><progress id="carga-bar" max="1" value="0"></progress></div>`
    : `
    <p class="pequeno">Neste aparelho as respostas mostram o trecho da cartilha que mais combina com sua pergunta, sem IA, para não deixar o celular lento.</p>
    <details><summary class="pequeno">Opções avançadas</summary>
      <p class="pequeno">A IA baixa um modelo de cerca de 200 MB e usa bastante memória. Em celulares mais simples ela pode deixar o aparelho lento até você fechar o aplicativo.</p>
      <button type="button" id="avancado">Quero testar a IA mesmo assim</button>
    </details>`}
  </section>
  <div class="conversa" id="conversa" aria-live="polite"></div>
  <form class="cartao" id="f-perg">
    <label for="pergunta" class="pequeno">Sua dúvida</label>
    <textarea id="pergunta" class="campo" placeholder="Ex.: Lúpus é contagioso? O que é o exame FAN?" maxlength="400"></textarea>
    <div class="acoes"><button class="primario" id="enviar">Perguntar</button></div>
    <p class="pequeno">Em urgência, ligue 192. A resposta é educativa e não substitui consulta.</p>
  </form>`;
  if ($("#avancado")) $("#avancado").onclick = () => { ia.avancado = true; vPergunte(); };
  if ($("#desligar")) $("#desligar").onclick = () => desligarIA("IA desligada. A memória foi liberada; o modelo continua guardado para a próxima vez.");
  const sel = $("#modelo");
  if (sel) {
    if (!ia.modelo) sel.value = "";
    sel.onchange = () => (sel.value ? ativarModelo(sel.value) : desligarIA("Modo sem IA."));
  }
  ia.conversa.forEach(renderMsg);
  $("#f-perg").onsubmit = (e) => { e.preventDefault(); perguntar(); };
  $("#pergunta").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(); } };
}

function renderMsg(m) {
  const box = $("#conversa");
  if (!box) return;
  const el = document.createElement("div");
  el.className = `msg ${m.quem}`;
  el.textContent = m.texto;
  if (m.fontes?.length) {
    const f = document.createElement("div");
    f.className = "fontes";
    f.innerHTML = m.fontes.map((h, i) => `<a href="#cartilha/${h.secao}">[${i + 1}] ${esc(h.titulo)}</a>`).join("");
    el.appendChild(f);
  }
  if (m.meta) { const d = document.createElement("div"); d.className = "meta"; d.textContent = m.meta; el.appendChild(d); }
  box.appendChild(el);
  return el;
}

function ativarModelo(id) {
  if (!id) { ia.modelo = null; return; }
  const m = CONFIG.modelos.find((x) => x.id === id);
  if (!m.leve && aparelhoLeve && !confirm("Este modelo é grande para celulares e pode travar o navegador. Usar mesmo assim?")) {
    $("#modelo").value = ia.modelo?.id ?? ""; return;
  }
  ia.modelo = m;
  ia.ativo = false;
  if (!ia.worker) {
    ia.worker = new Worker(new URL("./llm-worker.js", import.meta.url), { type: "module" });
  }
  ia.carregando = true;
  if ($("#desligar")) $("#desligar").hidden = false;
  const carga = $("#carga"); carga.hidden = false;
  $("#carga-txt").textContent = "Preparando o modelo… Na primeira vez ele é baixado; depois fica guardado no aparelho.";
  $("#enviar").disabled = true;
  ia.worker.onmessage = ({ data }) => {
    if (data.tipo === "progresso" && $("#carga-bar")) {
      $("#carga-bar").value = data.carregado / data.total;
      $("#carga-txt").textContent = `Baixando o modelo: ${(data.carregado / 1e6).toFixed(0)} de ${(data.total / 1e6).toFixed(0)} MB`;
    } else if (data.tipo === "pronto") {
      ia.ativo = true; ia.carregando = false; ia.device = data.device;
      reiniciarOcioso();
      if ($("#carga")) $("#carga").hidden = true;
      if ($("#estado-ia")) $("#estado-ia").textContent = `IA pronta (${m.rotulo}), rodando ${data.device === "webgpu" ? "na GPU" : "na CPU"} deste aparelho.`;
      if ($("#enviar")) $("#enviar").disabled = false;
    } else if (data.tipo === "erro" && ia.carregando) {
      ia.carregando = false; ia.modelo = null;
      if ($("#carga")) $("#carga").hidden = true;
      if ($("#modelo")) $("#modelo").value = "";
      if ($("#estado-ia")) $("#estado-ia").textContent = `Não foi possível carregar o modelo (${data.mensagem}). Usando o modo sem IA.`;
      if ($("#enviar")) $("#enviar").disabled = false;
    }
  };
  ia.worker.postMessage({ tipo: "carregar", modelo: m.id, dtype: m.dtype });
}

const SISTEMA = `Você é um assistente educativo sobre lúpus para usuários do SUS no Brasil.
Responda SOMENTE com base nos trechos da cartilha fornecidos. Se a resposta não estiver nos trechos, diga: "Não encontrei isso na cartilha." e sugira procurar a UBS.
Regras: escreva em português do Brasil simples, em no máximo 5 frases; cite os trechos com [1], [2]; nunca diga se a pessoa tem ou não tem lúpus; nunca indique remédio, dose ou exame para a pessoa; quando falar de sintomas, oriente procurar a UBS; em sinais graves, oriente ligar 192.`;

function adicionar(m) { ia.conversa.push(m); return renderMsg(m); }

async function perguntar() {
  const campo = $("#pergunta");
  const q = campo.value.trim();
  if (!q || ia.carregando) return;
  campo.value = "";
  adicionar({ quem: "eu", texto: q });

  const u = urgencia(q);
  if (u === "crise") {
    return adicionar({ quem: "ia", texto: "Sinto muito que você esteja passando por isso. Você não precisa enfrentar isso sozinho(a). Ligue agora para o CVV, no 188 (gratuito, 24 horas), ou converse pelo site cvv.org.br. Se estiver em perigo imediato, ligue 192 (SAMU)." });
  }
  if (u === "clinica") {
    return adicionar({ quem: "ia", texto: "O que você descreveu pode ser um sinal de urgência. Ligue agora para o 192 (SAMU) ou vá a uma UPA ou pronto-socorro.", fontes: [secaoPorId.urgencia ? { secao: "urgencia", titulo: secaoPorId.urgencia.titulo } : null].filter(Boolean) });
  }

  const hits = bm25.buscar(q, CONFIG.rag.topK);
  if (!hits.length || hits[0].score < CONFIG.rag.scoreMinimo) {
    return adicionar({ quem: "ia", texto: "Não encontrei isso na cartilha. Tente perguntar com outras palavras ou procure a equipe da sua UBS." });
  }
  const prefixo = pedeDiagnostico(q) ? "Este aplicativo não consegue dizer se você tem lúpus: só uma consulta pode avaliar isso. Se você tem sinais que se repetem, procure a UBS.\n\n" : "";

  if (!ia.ativo) {
    const h = hits[0];
    return adicionar({ quem: "ia", texto: `${prefixo}Da cartilha, “${h.titulo}”:\n\n${h.texto}`, fontes: hits, meta: "Modo sem IA: trecho mais relacionado à sua pergunta." });
  }

  const contexto = hits.map((h, i) => `[${i + 1}] ${h.titulo}\n${h.texto}`).join("\n\n");
  const msg = { quem: "ia", texto: prefixo, fontes: hits };
  const el = adicionar(msg);
  const corpo = document.createTextNode(prefixo);
  el.firstChild?.replaceWith(corpo);
  $("#enviar").disabled = true;
  const t0 = performance.now();
  await new Promise((resolve) => {
    ia.worker.onmessage = ({ data }) => {
      if (data.tipo === "token") { msg.texto += data.texto; corpo.textContent = msg.texto; }
      else if (data.tipo === "fim") {
        msg.meta = `${data.tokens} tokens · ${data.tokPorSeg.toFixed(1)} tok/s · ${((performance.now() - t0) / 1000).toFixed(1)} s · ${ia.device === "webgpu" ? "GPU" : "CPU"} · resposta educativa, confira na cartilha`;
        const d = document.createElement("div"); d.className = "meta"; d.textContent = msg.meta; el.appendChild(d);
        resolve();
      } else if (data.tipo === "erro") {
        msg.texto += `\n[Erro ao gerar a resposta: ${data.mensagem}]`; corpo.textContent = msg.texto; resolve();
      }
    };
    ia.worker.postMessage({
      tipo: "gerar", maxTokens: CONFIG.rag.maxTokens,
      mensagens: [{ role: "system", content: SISTEMA }, { role: "user", content: `Trechos da cartilha:\n${contexto}\n\nPergunta: ${q}` }],
    });
  });
  if ($("#enviar")) $("#enviar").disabled = false;
  reiniciarOcioso();
}

// ---------------------------------------------------------------- privacidade
async function vPrivacidade() {
  const cons = lerLS(LS.consentimento, null);
  const hist = lerLS(LS.historico, []);
  let uso = "";
  try { const e = await navigator.storage.estimate(); uso = `${(e.usage / 1e6).toFixed(0)} MB usados por este aplicativo no aparelho (inclui modelos de IA baixados).`; } catch {}
  main.innerHTML = `
  <section class="cartao">
    <h1>Privacidade e seus dados</h1>
    <p>Este aplicativo foi feito para <b>não coletar dados pessoais</b> (LGPD, Lei 13.709/2018):</p>
    <ul>
      <li><b>Sem cadastro</b>, sem login e sem identificação. Não perguntamos nome, idade, endereço ou documento.</li>
      <li><b>Questionário e perguntas</b> são processados no seu aparelho. Nada é enviado à UFAM nem a outra empresa.</li>
      <li><b>Sem rastreamento</b>: não há analytics, anúncios, cookies de terceiros nem fontes externas.</li>
      <li><b>Modelos de IA</b>: só são baixados se você escolher o modo “com IA”. O download sai do Hugging Face${CONFIG.hostModelos ? " (espelho configurado)" : ""}; como qualquer download, o servidor vê o endereço de internet do aparelho, mas não recebe nenhuma resposta ou pergunta sua.</li>
      <li>O que fica guardado: a confirmação do aviso inicial${hist.length ? `, ${hist.length} resumo(s) que você escolheu guardar` : ""} e os arquivos do aplicativo e dos modelos, para funcionar sem internet.</li>
    </ul>
    <p class="pequeno">${cons ? `Aviso aceito em ${new Date(cons.data).toLocaleString("pt-BR")}.` : ""} ${uso}</p>
  </section>
  ${hist.length ? `<section class="cartao"><h2>Resumos guardados</h2>${hist.map((h) => `<details><summary>${new Date(h.data).toLocaleString("pt-BR")} · ${esc(h.nivel)}</summary><pre class="resumo">${esc(h.resumo)}</pre></details>`).join("")}</section>` : ""}
  <section class="cartao">
    <h2>Apagar dados</h2>
    <div class="acoes">
      <button id="ap-hist" ${hist.length ? "" : "disabled"}>Apagar resumos guardados</button>
      <button id="ap-mod">Apagar modelos de IA baixados</button>
      <button class="perigo" id="ap-tudo">Apagar tudo deste aplicativo</button>
    </div>
    <p class="pequeno" id="msg-priv" role="status"></p>
  </section>`;
  $("#ap-hist").onclick = () => { localStorage.removeItem(LS.historico); vPrivacidade(); };
  $("#ap-mod").onclick = async () => {
    ia.worker?.terminate(); Object.assign(ia, { worker: null, ativo: false, modelo: null });
    for (const k of await caches.keys()) if (!k.startsWith("app-")) await caches.delete(k);
    $("#msg-priv").textContent = "Modelos apagados.";
  };
  $("#ap-tudo").onclick = async () => {
    if (!confirm("Apagar tudo o que este aplicativo guardou neste aparelho?")) return;
    ia.worker?.terminate();
    localStorage.clear(); sessionStorage.clear();
    for (const k of await caches.keys()) await caches.delete(k);
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
    location.replace(location.pathname);
  };
}

// ---------------------------------------------------------------- partida
navegar(); // depois de todas as declarações (rotas usam o estado da IA)

// ---------------------------------------------------------------- offline
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const havia = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (havia && !recarregou) { recarregou = true; location.reload(); } // versão nova assumiu: recarrega uma vez
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch((e) => console.warn("Service worker:", e));
}
