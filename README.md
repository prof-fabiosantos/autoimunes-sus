# Lúpus: conhecer para cuidar cedo — MVP

Protótipo do projeto **PIB-S/0055/2026 (PIBITI-PROTEC 2026/2027, UFAM)**: plataforma digital para triagem precoce e educação em doenças autoimunes no SUS. O MVP cobre **só o lúpus eritematoso sistêmico (LES)**, seguindo a recomendação do resumo executivo (1 ou 2 doenças, com o LES na APS como modelo).

É um **PWA offline**: um app web instalável no celular, sem backend. Tudo roda no aparelho da pessoa: a triagem, a busca na cartilha e o modelo de linguagem LFM.

| Módulo | O que faz | Como |
|---|---|---|
| Questionário de sinais | Orienta: urgência, procurar a UBS ou observar | Sistema especialista com regras explícitas (`data/regras-les.json`), sem ML |
| Cartilha digital | 20 seções em linguagem simples, com fontes | Markdown (`data/cartilha-les.md`), índice e busca |
| Pergunte à cartilha | Responde dúvidas só com o conteúdo da cartilha | RAG: BM25 em português + gerador LFM2.5 via WebGPU (Transformers.js) |
| Privacidade | Mostra o que fica no aparelho e apaga tudo | localStorage + Cache Storage, sem servidor |

## Rodar

```powershell
cd autoimunes-sus
python -m http.server 8000
# abra http://localhost:8000 no Chrome ou Edge
```

- Use `http://localhost` ou HTTPS: o service worker e o WebGPU exigem contexto seguro.
- No celular, publique em HTTPS (Vercel, GitHub Pages, servidor da UFAM) ou use um túnel (`cloudflared tunnel --url http://localhost:8000`).
- Testes das partes sem modelo: `node tests/testes.mjs` (16 testes: regras, casos simulados, cartilha, busca, detecção de urgência).

## Arquitetura do RAG

```
Pergunta ──► detecção de urgência (regex) ──► 192 / CVV 188, sem chamar o modelo
         └─► BM25 (js/busca.js) sobre os trechos da cartilha
               ├─ score < 1,5 → "Não encontrei isso na cartilha"  (sem modelo)
               ├─ modo sem IA → mostra o trecho mais relacionado, com a fonte
               └─ modo com IA → prompt (trechos numerados) ──► LFM2.5 no Web Worker
                                                              (WebGPU, ou WASM sem GPU)
                    resposta em streaming + links [n] para as seções da cartilha
```

Por que BM25 e não o LFM2.5-Embedding-350M do `rag-lfm`: a cartilha é pequena (~25 trechos) e o modelo de embedding tem 557 MB e roda na CPU, pesado demais para celulares de entrada como o Galaxy A15. O BM25 recupera a seção certa no top-3 em 10 de 10 perguntas de teste, com zero download. O embedding pode entrar depois como reordenação no desktop (veja "Próximos passos").

Geradores (os mesmos testados no `rag-lfm/cliente`), em `js/config.js`:

- `LiquidAI/LFM2.5-230M-ONNX` q4 (~200 MB): sugerido para celulares.
- `LiquidAI/LFM2.5-1.2B-Instruct-ONNX` q4 (~850 MB): computador com GPU.

O prompt de sistema proíbe diagnóstico, indicação de remédio, dose ou exame, e manda citar os trechos. Perguntas do tipo "será que eu tenho lúpus?" recebem um aviso fixo antes da resposta, gerado sem o modelo.

## Diferenças em relação ao projeto escrito

- **Firebase saiu.** Sem servidor e sem banco, não há dado pessoal sob tratamento da UFAM nem transferência internacional (ver `docs/LGPD.md`).
- **"Algoritmo IA" virou sistema especialista declarado.** A triagem é um conjunto de regras com explicação ("Por que esta orientação?"). A IA generativa fica só na cartilha, restrita ao conteúdo validado.
- **A saída fala em orientação, nunca em risco de doença.** Os testes verificam isso.
- **Dashboard preditivo ficou para a fase 2**, como sugere o resumo executivo.

## Estrutura

```
index.html, manifest.webmanifest, sw.js   casca do PWA e cache offline
css/app.css                                estilos (sem fontes externas)
js/app.js                                  telas e navegação
js/triagem.js                              motor de regras (função pura, testável)
js/cartilha.js, js/busca.js                leitura da cartilha, BM25, detecção de urgência
js/llm-worker.js, js/config.js             gerador LFM em Web Worker e configuração
data/regras-les.json                       perguntas, limiares e textos de orientação
data/cartilha-les.md                       conteúdo da cartilha (editável sem programar)
data/casos-simulados.json                  casos fictícios para o teste-piloto
vendor/                                    Transformers.js 4.3.2 e runtime ONNX (sem CDN)
docs/LGPD.md, docs/VALIDACAO_CLINICA.md    privacidade e checklist da coorientação
tests/testes.mjs                           testes em Node
```

## Próximos passos

1. **Validação clínica** de `regras-les.json` e `cartilha-les.md` pela coorientação (`docs/VALIDACAO_CLINICA.md`). Nada vai para pessoas antes disso.
2. **Hospedar os modelos no Brasil** (servidor da UFAM) e configurar `hostModelos` em `js/config.js`, para que nem o download passe por terceiros.
3. **Instrumentos do piloto** (SUS Scale, NPS, CSAT, CES): formulário separado e anônimo, ou tela no app que exporte um arquivo, após aprovação do CEP.
4. **Avaliar as respostas do LFM** com um conjunto de perguntas e respostas de referência escrito pela coorientação (fidelidade aos trechos, recusa de diagnóstico).
5. Reordenação por embedding (LFM2.5-Embedding) no desktop, se o BM25 falhar com perguntas reais do piloto.
6. Segunda doença (artrite reumatoide) reaproveitando o mesmo formato de regras e cartilha.

## Licenças

Código do projeto: definir com o NIT/UFAM antes do registro no INPI. Transformers.js (Apache-2.0) e onnxruntime-web (MIT) estão em `vendor/`. Os modelos LFM usam a LFM Open License v1.0.
