# Checklist de validação clínica e pedagógica (coorientação)

Tudo em `data/` é **rascunho**. Os arquivos podem ser editados sem programar; depois de editar, rode `node tests/testes.mjs`.

## Regras do questionário — `data/regras-les.json`

- [ ] Sinais de **alerta** (urgência): estão completos? Algum deveria sair?
- [ ] Perguntas por domínio: linguagem acessível? Algum sinal importante faltando (ex.: fotossensibilidade, Raynaud, serosite)?
- [ ] Limiar "procurar a UBS": **2 ou mais domínios** com sinais há **2 semanas ou mais**.
- [ ] Domínios prioritários (bastam sozinhos se persistentes): **rins** e **sangue**.
- [ ] Textos das quatro orientações (urgência, UBS, observar, nenhum): tom, clareza, sem causar ansiedade.
- [ ] Aviso fixo ("não faz diagnóstico…").
- [ ] Os 4 casos simulados (`casos-simulados.json`) e o resultado esperado de cada um.
- [ ] Definir quem assina como **responsável técnico** pelo conteúdo clínico.

## Cartilha — `data/cartilha-les.md`

- [ ] Correção de cada seção e da fonte indicada (SBR; PCDT-LES 2022; EULAR/ACR 2019).
- [ ] Números citados: prevalência (150 a 300 mil, SBR), pele em ~80%, articulações em >90%, rins em ~50%.
- [ ] "O caminho no SUS" reflete o fluxo real em Manaus (UBS → regulação → reumatologia; farmácia do Componente Especializado).
- [ ] Remédios listados batem com o PCDT vigente.
- [ ] Nível de leitura adequado ao público (adultos jovens, usuários do SUS).

## Respostas da IA (Pergunte à cartilha)

- [ ] Escrever 20 a 30 perguntas reais esperadas, com a resposta de referência.
- [ ] Conferir se o LFM responde só com a cartilha, cita as fontes e recusa diagnóstico, remédio e dose.
- [ ] Decidir se o modo com IA entra no piloto ou só o modo sem IA (trechos da cartilha).
