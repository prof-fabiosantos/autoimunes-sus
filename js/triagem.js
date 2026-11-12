// Motor de regras da triagem (sistema especialista, sem aprendizado de máquina).
// Função pura: recebe as regras (data/regras-les.json) e as respostas, devolve a
// orientação e a lista de motivos que levaram a ela (transparência algorítmica).
// Não guarda nada e não acessa a rede.

/**
 * @param {object} regras   conteúdo de data/regras-les.json
 * @param {object} respostas { [idPergunta]: true|false, duracao: "menos_2_semanas"|... }
 * @returns {{nivel:string, titulo:string, texto:string, secao_cartilha:string,
 *            motivos:string[], marcados:{dominio:string, sinais:string[]}[],
 *            alertas:string[], duracao:string|null}}
 */
export function avaliar(regras, respostas) {
  const r = respostas || {};
  const L = regras.limiares;
  const motivos = [];

  const alertas = regras.alertas.filter((a) => r[a.id] === true).map((a) => a.texto);

  const marcados = regras.dominios
    .map((d) => ({
      id: d.id,
      dominio: d.nome,
      sinais: d.perguntas.filter((p) => r[p.id] === true).map((p) => p.texto),
    }))
    .filter((d) => d.sinais.length > 0);

  const duracao = r[regras.duracao.id] ?? null;
  const duracaoRotulo = regras.duracao.opcoes.find((o) => o.valor === duracao)?.rotulo ?? null;
  const persistente = duracao !== null && L.duracao_que_reforca.includes(duracao);
  const nDominios = marcados.length;
  const prioritarios = marcados.filter((d) => L.dominios_prioritarios.includes(d.id));

  const saida = (chave, extra) => ({
    ...regras.orientacoes[chave],
    texto: extra ? `${regras.orientacoes[chave].texto} ${extra}` : regras.orientacoes[chave].texto,
    motivos,
    marcados: marcados.map(({ dominio, sinais }) => ({ dominio, sinais })),
    alertas,
    duracao: duracaoRotulo,
  });

  // Regra 1: qualquer sinal de alerta decide sozinho.
  if (alertas.length > 0) {
    motivos.push(`Sinal de alerta marcado (${alertas.length}).`);
    return saida("urgencia");
  }

  if (nDominios === 0) {
    motivos.push("Nenhum sinal marcado.");
    return saida("nenhum");
  }

  // Regra 2: sinais em vários domínios que persistem.
  if (nDominios >= L.dominios_para_procurar_ubs && persistente) {
    motivos.push(`Sinais em ${nDominios} partes do corpo (${marcados.map((d) => d.dominio).join(", ")}).`);
    motivos.push(`Duração: ${duracaoRotulo}.`);
    return saida("ubs");
  }

  // Regra 3: rins e sangue podem ser silenciosos e graves; persistência basta.
  if (prioritarios.length > 0 && persistente) {
    motivos.push(`Sinal em ${prioritarios.map((d) => d.dominio).join(" e ")}, que merece exame mesmo sozinho.`);
    motivos.push(`Duração: ${duracaoRotulo}.`);
    return saida("ubs");
  }

  // Regra 4: vários domínios, mas há pouco tempo ou duração não informada.
  if (nDominios >= L.dominios_para_procurar_ubs) {
    motivos.push(`Sinais em ${nDominios} partes do corpo, mas ${duracao ? "há menos de 2 semanas" : "sem duração informada"}.`);
    return saida("observar", "Se os sinais continuarem por mais de 2 semanas, procure a UBS.");
  }

  motivos.push(`Sinais em uma parte do corpo (${marcados[0].dominio}).`);
  return saida("observar");
}

/** Texto simples do resumo, para levar à UBS (impresso ou compartilhado pela pessoa). */
export function resumoTexto(regras, res, data = new Date()) {
  const linhas = [
    `Resumo do questionário educativo — ${regras.doenca}`,
    `Data: ${data.toLocaleDateString("pt-BR")}`,
    "",
    `Orientação: ${res.titulo}`,
  ];
  if (res.alertas.length) {
    linhas.push("", "Sinais de alerta marcados:");
    res.alertas.forEach((a) => linhas.push(`- ${a}`));
  }
  if (res.marcados.length) {
    linhas.push("", "Sinais marcados:");
    res.marcados.forEach((d) => {
      linhas.push(`${d.dominio}:`);
      d.sinais.forEach((s) => linhas.push(`  - ${s}`));
    });
  }
  if (res.duracao) linhas.push("", `Duração informada: ${res.duracao}`);
  linhas.push("", regras.aviso_fixo, `Regras versão ${regras.versao}.`);
  return linhas.join("\n");
}
