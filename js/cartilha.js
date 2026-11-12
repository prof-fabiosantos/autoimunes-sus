// Leitura da cartilha em Markdown simples:
//   ## Título {#id}
//   Fonte: SBR; PCDT-LES 2022
//   parágrafos...
// Só cabeçalhos de nível 2, parágrafos e citações (>) são usados.

export function parseCartilha(md) {
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  let titulo = "";
  const intro = [];
  const secoes = [];
  let atual = null;
  for (const l of linhas) {
    const h1 = l.match(/^#\s+(.+)/);
    const h2 = l.match(/^##\s+(.+?)\s*\{#([\w-]+)\}\s*$/);
    if (h1 && !l.startsWith("##")) { titulo = h1[1].trim(); continue; }
    if (h2) {
      atual = { id: h2[2], titulo: h2[1], fonte: "", paragrafos: [] };
      secoes.push(atual);
      continue;
    }
    if (!atual) { if (l.startsWith(">")) intro.push(l.replace(/^>\s?/, "")); continue; }
    const f = l.match(/^Fonte:\s*(.*)$/);
    if (f && !atual.fonte && atual.paragrafos.length === 0) { atual.fonte = f[1].trim(); continue; }
    if (l.trim() === "") { atual._quebra = true; continue; }
    if (atual._quebra || atual.paragrafos.length === 0) atual.paragrafos.push(l.trim());
    else atual.paragrafos[atual.paragrafos.length - 1] += " " + l.trim();
    atual._quebra = false;
  }
  secoes.forEach((s) => delete s._quebra);
  return { titulo, intro: intro.join(" "), secoes };
}

/** Trechos para a busca: um por seção; seções longas viram mais de um trecho. */
export function trechosDaCartilha(cartilha, maxChars = 900) {
  const trechos = [];
  for (const s of cartilha.secoes) {
    if (s.id === "referencias") continue;
    let buf = [];
    let tam = 0;
    const flush = () => {
      if (!buf.length) return;
      trechos.push({ secao: s.id, titulo: s.titulo, fonte: s.fonte, texto: buf.join(" ") });
      buf = []; tam = 0;
    };
    for (const p of s.paragrafos) {
      if (tam + p.length > maxChars && buf.length) flush();
      buf.push(p); tam += p.length;
    }
    flush();
  }
  return trechos;
}
