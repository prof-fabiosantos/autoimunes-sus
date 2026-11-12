// Testes das partes sem modelo: regras da triagem, leitura da cartilha e busca.
// Rodar: node tests/testes.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { avaliar, resumoTexto } from "../js/triagem.js";
import { parseCartilha, trechosDaCartilha } from "../js/cartilha.js";
import { BM25, urgencia, pedeDiagnostico } from "../js/busca.js";

const raiz = new URL("..", import.meta.url);
const regras = JSON.parse(readFileSync(new URL("data/regras-les.json", raiz), "utf8"));
const casos = JSON.parse(readFileSync(new URL("data/casos-simulados.json", raiz), "utf8"));
const md = readFileSync(new URL("data/cartilha-les.md", raiz), "utf8");

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("ok -", nome); };

// ---- regras ----
const ids = new Set([...regras.alertas.map((a) => a.id), ...regras.dominios.flatMap((d) => d.perguntas.map((p) => p.id)), regras.duracao.id]);
t("ids de perguntas são únicos", () => {
  const todos = [...regras.alertas.map((a) => a.id), ...regras.dominios.flatMap((d) => d.perguntas.map((p) => p.id))];
  assert.equal(new Set(todos).size, todos.length);
});
t("nenhuma resposta → nenhum", () => assert.equal(avaliar(regras, {}).nivel, "nenhum"));
t("alerta vence tudo", () => assert.equal(avaliar(regras, { u_convulsao: true }).nivel, "urgencia"));
t("1 domínio → observar", () => assert.equal(avaliar(regras, { a_dor: true, a_inchaco: true, duracao: "mais_6_semanas" }).nivel, "observar"));
t("2 domínios persistentes → ubs", () => assert.equal(avaliar(regras, { a_dor: true, p_sol: true, duracao: "2_a_6_semanas" }).nivel, "ubs"));
t("2 domínios recentes → observar com aviso", () => {
  const r = avaliar(regras, { a_dor: true, p_sol: true, duracao: "menos_2_semanas" });
  assert.equal(r.nivel, "observar");
  assert.match(r.texto, /mais de 2 semanas/);
});
t("rins persistente sozinho → ubs", () => assert.equal(avaliar(regras, { r_espuma: true, duracao: "mais_6_semanas" }).nivel, "ubs"));
t("textos de orientação não falam em risco de doença", () => {
  for (const o of Object.values(regras.orientacoes)) assert.doesNotMatch(o.texto + o.titulo, /risco|probabilidade|voc[eê] tem l[uú]pus/i);
});
t("resumo inclui aviso e sinais", () => {
  const r = avaliar(regras, { a_dor: true, p_sol: true, duracao: "mais_6_semanas" });
  const s = resumoTexto(regras, r, new Date(2026, 10, 12));
  assert.match(s, /não faz diagnóstico/);
  assert.match(s, /Articulações/);
});
t("casos simulados batem com o esperado", () => {
  for (const c of casos.casos) {
    for (const k of Object.keys(c.respostas)) assert.ok(ids.has(k), `${c.id}: id desconhecido ${k}`);
    assert.equal(avaliar(regras, c.respostas).nivel, c.esperado, c.id);
  }
});

// ---- cartilha ----
const cart = parseCartilha(md);
const trechos = trechosDaCartilha(cart);
t("cartilha tem seções com fonte", () => {
  assert.ok(cart.secoes.length >= 15);
  for (const s of cart.secoes) { assert.ok(s.fonte, s.id); assert.ok(s.paragrafos.length, s.id); }
});
t("seções citadas pelas regras existem", () => {
  const sids = new Set(cart.secoes.map((s) => s.id));
  for (const o of Object.values(regras.orientacoes)) assert.ok(sids.has(o.secao_cartilha), o.secao_cartilha);
});

// ---- busca ----
const bm = new BM25(trechos);
const top = (q) => bm.buscar(q, 3).map((r) => r.secao);
const perguntas = [
  ["lúpus é contagioso?", "o-que-e"],
  ["minhas juntas doem e incham", "articulacoes"],
  ["o que é o exame FAN", "diagnostico"],
  ["posso engravidar tendo lúpus", "gravidez"],
  ["preciso usar protetor solar?", "sol"],
  ["xixi com espuma", "rins"],
  ["quais remédios o SUS oferece", "tratamento"],
  ["posso tomar vacina da febre amarela", "vacinas"],
  ["mancha no rosto em forma de borboleta", "pele"],
  ["quando devo ir ao posto de saúde", "quando-ubs"],
  // perguntas feitas só com palavras comuns (casam com o título da seção)
  ["Quem pode ter lúpus?", "quem"],
  ["O que é o lúpus?", "o-que-e"],
  ["Por que o lúpus acontece?", "causas"],
  ["Como é feito o diagnóstico?", "diagnostico"],
  ["Lúpus tem cura?", "tratamento"],
  ["quando procurar urgência", "urgencia"],
];
let acertos = 0;
for (const [q, esperado] of perguntas) {
  const r = top(q);
  const hit = r.includes(esperado);
  acertos += hit;
  console.log(`${hit ? "  ✓" : "  ✗"} ${q} → ${r.join(", ")}`);
}
t(`busca recupera a seção certa no top-3 (${acertos}/${perguntas.length})`, () => assert.ok(acertos >= perguntas.length - 1));
t("pergunta fora do tema não recupera nada forte", () => {
  const r = bm.buscar("qual a capital da França", 3);
  assert.ok(r.length === 0 || r[0].score < 2, String(r[0]?.score));
});
t("urgência detectada", () => {
  assert.equal(urgencia("estou com dor no peito e falta de ar"), "clinica");
  assert.equal(urgencia("tive uma convulsão ontem"), "clinica");
  assert.equal(urgencia("não quero mais viver"), "crise");
  assert.equal(urgencia("lúpus tem cura?"), null);
});
t("pedido de diagnóstico detectado", () => {
  assert.ok(pedeDiagnostico("será que eu tenho lúpus?"));
  assert.ok(!pedeDiagnostico("o que é FAN?"));
});

console.log(`\n${ok} testes passaram.`);
