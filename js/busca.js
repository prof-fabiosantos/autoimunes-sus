// Busca lexical BM25 em português, sem modelo e sem rede.
// Funciona em qualquer celular e é a primeira etapa do RAG da cartilha.

const STOP = new Set(`a o e é de da do das dos em no na nos nas um uma uns umas para por pra pro com sem
que se ao aos à às ou mas mais menos como quando onde qual quais quem ja já não nao sim muito muita muitos
muitas pouco isso isto esse essa este esta esses essas estes estas ele ela eles elas eu voce você vocês voces
me te lhe nos meu minha meus minhas seu sua seus suas ser ter tem tenho tinha estar esta está estou foi são sao
pode posso podem fazer faz preciso precisa precisam precisar devo deve usar uso quanto há ha também tambem só so até ate depois antes entre sobre lupus lúpus`.split(/\s+/));

// Sinônimos leigos → termo usado na cartilha (já normalizados, sem acento).
const SINONIMOS = {
  junta: "articulacao", juntas: "articulacao", xixi: "urina", mijo: "urina",
  cansado: "cansaco", cansada: "cansaco", fadiga: "cansaco", fraqueza: "cansaco",
  inchado: "inchaco", inchada: "inchaco", inchou: "inchaco",
  vermelhidao: "mancha", manchas: "mancha", afta: "ferida", aftas: "ferida",
  gravida: "gravidez", gestacao: "gravidez", engravidar: "gravidez",
  remedio: "tratamento", remedios: "tratamento", medicamento: "tratamento", medicamentos: "tratamento",
  exame: "diagnostico", exames: "diagnostico", contagioso: "contagioso", pega: "contagioso",
  posto: "ubs", "postinho": "ubs", reumato: "reumatologista",
  protetor: "sol", solar: "sol", praia: "sol",
};

export function normalizar(t) {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Radicalização leve (sufixos comuns do português), suficiente para plural e gênero.
function radical(w) {
  if (w.length <= 3) return w;
  for (const suf of ["coes", "soes", "mente", "acoes", "icas", "icos", "eis", "ais", "oes", "aes", "res", "zes", "es", "as", "os", "s", "a", "o", "e"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      const base = w.slice(0, -suf.length);
      if (suf === "oes" || suf === "aes") return base + "a";
      if (suf === "coes" || suf === "soes") return base;
      return base;
    }
  }
  return w;
}

export function tokens(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => SINONIMOS[w] ?? w)
    .map(radical);
}

const ARTIGOS = new Set(["o", "a", "os", "as", "e", "de", "do", "da", "no", "na", "um", "uma", "com"]);
function palavrasTitulo(texto) {
  return new Set(normalizar(texto).split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !ARTIGOS.has(w))
    .map((w) => radical(SINONIMOS[w] ?? w)));
}

export class BM25 {
  constructor(docs, campo = (d) => `${d.titulo} ${d.titulo} ${d.texto}`, k1 = 1.4, b = 0.75) {
    this.docs = docs; this.k1 = k1; this.b = b;
    this.tf = docs.map((d) => {
      const m = new Map();
      for (const t of tokens(campo(d))) m.set(t, (m.get(t) || 0) + 1);
      return m;
    });
    this.len = this.tf.map((m) => [...m.values()].reduce((a, v) => a + v, 0));
    this.avg = this.len.reduce((a, v) => a + v, 0) / Math.max(1, docs.length);
    this.df = new Map();
    for (const m of this.tf) for (const t of m.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    // Palavras do título SEM remover stopwords: perguntas como "Quem pode ter lúpus?"
    // só têm stopwords, mas batem com o título da seção.
    this.titulo = docs.map((d) => palavrasTitulo(d.titulo ?? ""));
  }
  bonusTitulo(qPal, i) {
    const t = this.titulo[i];
    if (!t.size || !qPal.size) return 0;
    let comum = 0;
    for (const w of t) if (qPal.has(w)) comum++;
    const cobertura = comum / t.size;          // quanto do título a pergunta cobre
    return cobertura >= 0.5 && comum >= 2 ? 4 * cobertura : 0;
  }
  idf(t) {
    const n = this.docs.length, df = this.df.get(t) || 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }
  buscar(consulta, k = 3) {
    const q = [...new Set(tokens(consulta))];
    const qPal = palavrasTitulo(consulta);
    const res = this.docs.map((d, i) => {
      let s = this.bonusTitulo(qPal, i);
      for (const t of q) {
        const f = this.tf[i].get(t);
        if (!f) continue;
        s += this.idf(t) * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[i] / this.avg));
      }
      return { ...d, score: s };
    });
    return res.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }
}

// Detecção de urgência na pergunta, antes de qualquer modelo.
const URGENTE = [
  /dor no peito.*(falta de ar|nao consigo respirar)|(falta de ar|nao consigo respirar).*dor no peito/,
  /convuls/, /desmai/, /confus(ao|a) mental/,
  /(nao|parou de) (estou )?urinar|sem urinar|nao faz xixi/,
  /sangramento (que )?nao para/, /vomit(o|ando) sangue/,
];
const CRISE = /suicid|me matar|tirar (a )?minha (propria )?vida|nao quero mais viver|acabar com tudo/;

/** @returns {null | "crise" | "clinica"} */
export function urgencia(texto) {
  const n = normalizar(texto);
  if (CRISE.test(n)) return "crise";
  return URGENTE.some((re) => re.test(n)) ? "clinica" : null;
}

// Pergunta pessoal de diagnóstico ("eu tenho lúpus?") → lembrete fixo.
export function pedeDiagnostico(texto) {
  const n = normalizar(texto);
  return /\b(eu|sera que|acho que)\b.*\b(tenho|estou com|to com)\b/.test(n) || /\btenho (lupus|isso)\b/.test(n);
}
