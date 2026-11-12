# Lúpus: conhecer para cuidar cedo — MVP

Protótipo do projeto **PIB-S/0055/2026 (PIBITI-PROTEC 2026/2027, UFAM)**, *Plataforma digital inteligente para triagem precoce, educação e apoio à jornada assistencial de pacientes com doenças autoimunes no SUS*.

O MVP cobre **só o lúpus eritematoso sistêmico (LES)**, como recomenda o resumo executivo do projeto (começar com 1 ou 2 doenças, com o LES na Atenção Primária como modelo).

É um **PWA offline**: um app web que se instala no celular e funciona sem internet. **Não há servidor nem banco de dados.** Questionário, busca na cartilha e modelo de linguagem rodam no aparelho da pessoa, e nenhuma resposta ou pergunta sai dele.

> **Situação do conteúdo:** as regras do questionário e a cartilha são **rascunho** até a validação clínica pela coorientação (`docs/VALIDACAO_CLINICA.md`). Não use com pessoas antes disso.

---

## Sumário

1. [O que o app faz](#1-o-que-o-app-faz)
2. [Como funciona](#2-como-funciona)
3. [Modelos e bibliotecas](#3-modelos-e-bibliotecas)
4. [Requisitos](#4-requisitos)
5. [Rodar no computador](#5-rodar-no-computador)
6. [Fazer o navegador usar a GPU dedicada](#6-fazer-o-navegador-usar-a-gpu-dedicada)
7. [Rodar em smartphones](#7-rodar-em-smartphones)
8. [Publicar no GitHub Pages](#8-publicar-no-github-pages)
9. [Publicar uma versão nova](#9-publicar-uma-versão-nova)
10. [Configuração](#10-configuração)
11. [Editar o conteúdo (sem programar)](#11-editar-o-conteúdo-sem-programar)
12. [Testes](#12-testes)
13. [Privacidade e LGPD](#13-privacidade-e-lgpd)
14. [Onde os dados ficam e como apagar](#14-onde-os-dados-ficam-e-como-apagar)
15. [Problemas conhecidos e soluções](#15-problemas-conhecidos-e-soluções)
16. [Limitações](#16-limitações)
17. [Estrutura da pasta](#17-estrutura-da-pasta)
18. [Próximos passos](#18-próximos-passos)
19. [Licenças e fontes](#19-licenças-e-fontes)

---

## 1. O que o app faz

| Tela | O que faz | Como |
|---|---|---|
| **Questionário** | Dá uma orientação: procurar urgência, procurar a UBS ou observar. Gera um resumo para levar à UBS. | Sistema especialista com regras explícitas, sem aprendizado de máquina |
| **Cartilha** | 20 seções em linguagem simples, com a fonte de cada uma e busca | Arquivo Markdown editável |
| **Pergunte** | Responde dúvidas usando só o conteúdo da cartilha | RAG: busca BM25 + gerador LFM no aparelho (opcional) |
| **Privacidade** | Mostra o que fica guardado e apaga tudo | Armazenamento local do navegador |

O questionário **nunca fala em risco de doença** e nunca diz se a pessoa tem lúpus. Ele só orienta onde buscar atendimento. Cada resultado mostra "Por que esta orientação?", com as regras que levaram a ela.

---

## 2. Como funciona

### 2.1 Questionário (sistema especialista)

```
Passo 1: sinais de alerta (sim/não) ── algum "sim" ──► URGÊNCIA (192 / UPA)
Passo 2: sinais por parte do corpo (marcar)
Passo 3: há quanto tempo
        │
        ▼  js/triagem.js aplica as regras de data/regras-les.json
  2+ partes do corpo e 2+ semanas ............ PROCURAR A UBS
  rins ou sangue, 2+ semanas .................. PROCURAR A UBS
  2+ partes do corpo, menos de 2 semanas ...... OBSERVAR (procurar a UBS se continuar)
  1 parte do corpo ............................ OBSERVAR
  nada marcado ................................ NENHUM SINAL
```

As partes do corpo seguem os domínios dos critérios EULAR/ACR 2019 (articulações, pele, boca, sintomas gerais, pulmão e coração, rins, sangue, sistema nervoso). Os critérios só serviram para escolher os domínios: o app não calcula pontuação de classificação.

### 2.2 Pergunte à cartilha (RAG)

```
Pergunta
  │
  ├─► detecção de urgência (expressões regulares, sem modelo)
  │     ├─ crise emocional → CVV 188 e SAMU 192
  │     └─ sinal clínico grave → SAMU 192 / UPA
  │
  └─► BM25 sobre os trechos da cartilha (js/busca.js)
        ├─ pontuação < 1,5 ............ "Não encontrei isso na cartilha" (sem modelo)
        ├─ modo SEM IA ................ mostra o trecho mais relacionado, com a fonte
        └─ modo COM IA ................ prompt com os trechos numerados [1..3]
                                          │
                                          ▼
                              LFM2.5 num Web Worker (js/llm-worker.js)
                              WebGPU se houver; senão WebAssembly na CPU
                                          │
                                          ▼
                              resposta em streaming + links [n] para a cartilha
```

**Busca BM25 em português** (`js/busca.js`): normaliza acentos, remove palavras muito comuns, reduz plural e gênero e troca termos leigos pelos da cartilha ("junta" → articulação, "xixi" → urina, "posto" → UBS). Também dá um bônus quando a pergunta coincide com o título de uma seção. Isso resolve perguntas formadas só por palavras comuns, como "Quem pode ter lúpus?".

**Por que BM25 e não embeddings:** a cartilha é pequena (cerca de 25 trechos). O LFM2.5-Embedding-350M, usado no projeto `rag-lfm`, tem 557 MB e roda na CPU: é pesado demais para celulares de entrada. O BM25 acerta a seção certa entre as 3 primeiras em 16 de 16 perguntas de teste, sem baixar nada.

**Proteções no texto gerado:**
- O prompt de sistema manda responder só com os trechos, citar as fontes e nunca diagnosticar nem indicar remédio, dose ou exame.
- Perguntas do tipo "será que eu tenho lúpus?" recebem um aviso fixo antes da resposta, escrito pelo app e não pelo modelo.
- Urgências e perguntas fora do tema são tratadas antes de chegar ao modelo.

### 2.3 Gestão de memória da IA

Testado no Galaxy A15: com o modelo carregado, o celular ficou lento. Por isso:

- **Aparelho fraco** (celular, `navigator.deviceMemory` ≤ 4 GB ou navegador sem WebGPU): a tela Pergunte mostra só o modo sem IA. A IA fica em **Opções avançadas → "Quero testar a IA mesmo assim"**, e só com o modelo de 230M.
- O modelo é **descarregado da memória**:
  - ao sair da aba Pergunte;
  - depois de 5 minutos sem perguntas;
  - em aparelho fraco, também ao sair do app ou bloquear a tela;
  - pelo botão **"Desligar IA e liberar memória"**.
- Descarregar libera a RAM, mas os pesos continuam no cache do aparelho. Ligar de novo não baixa tudo outra vez.

### 2.4 Offline (service worker)

O `sw.js` guarda a casca do app (HTML, CSS, JS, dados e ícones) no primeiro acesso. O motor ONNX (`vendor/ort/`) é guardado na primeira vez que a IA é usada, e os pesos do LFM ficam no cache `transformers-cache`, gerenciado pelo Transformers.js. Depois disso o app abre em modo avião.

---

## 3. Modelos e bibliotecas

### Geradores (Liquid AI)

| Modelo | Formato | Download | Onde roda | Uso no app |
|---|---|---|---|---|
| [`LiquidAI/LFM2.5-230M-ONNX`](https://huggingface.co/LiquidAI/LFM2.5-230M-ONNX) | ONNX q4 | ~200 MB | WebGPU ou WASM | Celulares (só em Opções avançadas nos fracos) |
| [`LiquidAI/LFM2.5-1.2B-Instruct-ONNX`](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-ONNX) | ONNX q4 | ~850 MB | WebGPU | Computadores com GPU |

São os mesmos modelos testados no projeto `rag-lfm/cliente`. O LFM2.5-230M é o menor modelo da Liquid AI e não existe versão menor. Rodando nativo (llama.cpp), ele usa cerca de 375 MB num smartphone; no navegador o custo é maior (ver seção 7.4).

Referência medida no `rag-lfm` (Edge, Windows, mesmo prompt):

| GPU usada pelo navegador | LFM2.5-1.2B q4 |
|---|---|
| Intel UHD (integrada) | 7,4 tok/s |
| NVIDIA RTX 2060 | 41,2 tok/s |

### Bibliotecas (todas dentro de `vendor/`, sem CDN)

| Biblioteca | Versão | Arquivos | Uso |
|---|---|---|---|
| Transformers.js (`@huggingface/transformers`) | 4.3.2 | `vendor/transformers/transformers.min.js` (588 KB) | tokenizer e geração |
| onnxruntime-web | 1.31.0-dev.20260914 (a que vem com o Transformers.js 4.3.2) | `vendor/ort/*.wasm` e `*.mjs` (~70 MB no total) | motor de inferência |

As duas versões precisam bater: o `transformers.min.js` traz o JavaScript do onnxruntime embutido e carrega os `.wasm` de `vendor/ort/`. Para atualizar:

```bash
npm i @huggingface/transformers@<versão> --ignore-scripts
cp node_modules/@huggingface/transformers/dist/transformers.min.js vendor/transformers/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.{asyncify,jsep}.{mjs,wasm} vendor/ort/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.{mjs,wasm} vendor/ort/
# confira: grep '"onnxruntime-web"' node_modules/@huggingface/transformers/package.json
```

---

## 4. Requisitos

**Para servir o app localmente:** qualquer servidor HTTP estático. O mais simples é o Python 3 (`python -m http.server`). Não precisa de Node, build nem instalação de pacotes.

**Para usar:**

| Recurso | Requisito |
|---|---|
| Questionário, cartilha, modo sem IA | Qualquer navegador moderno (Chrome, Edge, Firefox, Safari), inclusive celulares simples |
| Modo com IA | Chrome ou Edge recentes com **WebGPU**. Sem WebGPU funciona na CPU, mas fica muito lento |
| Espaço no aparelho | ~250 MB (230M) ou ~900 MB (1.2B) para o cache do modelo |
| Instalação e offline | Página em `http://localhost` ou **HTTPS** |

**Para os testes automáticos:** Node.js 18 ou mais novo.

---

## 5. Rodar no computador

```powershell
cd C:\caminho\para\autoimunes-sus
python -m http.server 8001
```

Abra **http://localhost:8001** no Chrome ou Edge.

- **Use sempre `http://localhost`, nunca `file://`.** O service worker, o WebGPU e o cache de modelos só funcionam em contexto seguro, e `localhost` conta como seguro.
- **Use uma porta diferente da de outros projetos** (por exemplo, não a 8000 do `rag-lfm`). O navegador separa os dados por origem (protocolo + host + porta), e o "Apagar tudo" do app apaga todos os caches dessa origem, inclusive modelos guardados por outro projeto na mesma porta.

**Roteiro de verificação:**
1. **Questionário → "Para o teste-piloto: usar um caso simulado".** Os 4 casos devem dar UBS, observar, urgência e UBS.
2. **Pergunte, modo sem IA:** "Lúpus é contagioso?", "Quem pode ter lúpus?" e "xixi com espuma" devem achar a seção certa; "qual a capital da França" deve dar "não encontrei".
3. **Pergunte, modo com IA, LFM2.5-1.2B:** a primeira vez baixa cerca de 850 MB. A linha de estado deve dizer "rodando na GPU". O rodapé de cada resposta mostra tokens/s.
4. **Offline:** F12 → Network → **Offline** e recarregue. O app deve continuar funcionando.
5. **Console (F12):** não deve haver erros em vermelho.
6. **Versão:** o rodapé da tela Início mostra "App versão x.y.z".

---

## 6. Fazer o navegador usar a GPU dedicada

Em notebooks com GPU integrada (Intel/AMD) e dedicada (NVIDIA), o Windows costuma entregar a **integrada** ao navegador, e a geração fica até 5 vezes mais lenta (ver a tabela da seção 3).

**Como saber qual GPU está em uso:** na tela Pergunte, a linha de estado diz "rodando na GPU" ou "rodando na CPU". Para ver o nome da GPU, abra `edge://gpu` ou `chrome://gpu` e procure a seção **WebGPU**.

Use **uma** das opções abaixo.

**Opção A: flag do navegador (mais rápida)**
- Edge: `edge://flags/#force-high-performance-gpu` → **Enabled** → **Restart**
- Chrome: `chrome://flags/#force-high-performance-gpu` → **Enabled** → **Relaunch**

**Opção B: configuração do Windows**
1. **Configurações → Sistema → Tela → Elementos gráficos**
2. Adicione o navegador se ele não estiver na lista. Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`; Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`.
3. **Opções → Alto desempenho (NVIDIA …)** → Salvar.
4. Feche **todas** as janelas do navegador, inclusive na bandeja do sistema, e abra de novo.

**Linux:** confira em `chrome://gpu` se o WebGPU está habilitado. Em algumas distribuições é preciso ativar `chrome://flags/#enable-unsafe-webgpu` e usar drivers proprietários da NVIDIA.

**macOS (Apple Silicon):** não há escolha de GPU a fazer; Chrome, Edge e Safari 26 usam a GPU integrada, que é forte.

---

## 7. Rodar em smartphones

### 7.1 A regra principal: HTTPS

Abrir pelo IP da rede local (`http://192.168.x.x:8001`) **não funciona direito**: fora do `localhost`, o navegador desliga o service worker, o WebGPU e a instalação. Há três formas de abrir no celular.

**A. GitHub Pages (recomendado: link fixo, funciona com o PC desligado).** Ver seção 8.

**B. Túnel HTTPS (sem cabo, para testes rápidos)**
```powershell
winget install --id Cloudflare.cloudflared      # uma vez; depois reabra o PowerShell
python -m http.server 8001                      # terminal 1
cloudflared tunnel --url http://localhost:8001  # terminal 2
```
Abra no celular o endereço `https://….trycloudflare.com` que aparecer. O link muda a cada execução e qualquer pessoa com ele acessa o app enquanto o túnel estiver aberto; feche com Ctrl+C ao terminar.

**C. Cabo USB (melhor para depurar)**
1. No Android, ative as **Opções do desenvolvedor** (Configurações → Sobre o telefone → Informações do software → toque 7 vezes em "Número de compilação") e depois a **Depuração USB**.
2. No PC, com o [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) instalado:
   ```powershell
   adb devices                     # aceite a autorização no celular
   adb reverse tcp:8001 tcp:8001
   ```
3. No Chrome do celular, abra `http://localhost:8001`, que conta como contexto seguro.
4. No PC, `chrome://inspect` mostra o console e a memória da aba do celular.

### 7.2 Instalar e testar offline

1. Abra o app no **Chrome** do celular (no Android, prefira o Chrome ao navegador da Samsung).
2. Menu **⋮ → Adicionar à tela inicial**.
3. Ative o **modo avião** e abra pelo ícone: o app deve funcionar.
4. Confira o rodapé da tela Início: **App versão x.y.z**.

### 7.3 Verificar o WebGPU no celular

Abra `chrome://gpu` no Chrome do celular e procure a linha de WebGPU. Sem WebGPU, o app considera o aparelho fraco e deixa a IA só em Opções avançadas.

### 7.4 O que esperar por aparelho

| Aparelho | Questionário, cartilha, sem IA | IA no navegador |
|---|---|---|
| Computador com GPU dedicada | ✅ | ✅ LFM2.5-1.2B, ~40 tok/s na RTX 2060 |
| Computador só com GPU integrada | ✅ | ⚠️ 1.2B lento (~7 tok/s); prefira o 230M |
| Celular topo de linha (12 GB, Snapdragon recente) | ✅ | ⚠️ provável com o 230M (estimativa, não testado) |
| **Galaxy A15** (Mali-G57) | ✅ **testado** | ❌ **testado:** o 230M deixou o celular lento; use o modo sem IA |
| Celulares de entrada em geral | ✅ | ❌ use o modo sem IA |

O LFM2.5-230M é leve quando roda nativo (cerca de 375 MB num smartphone, segundo a Liquid AI). No navegador somam-se o motor ONNX em WebAssembly, cópias temporárias dos pesos durante o carregamento, o limite de memória por aba e a GPU fraca para WebGPU.

**Se o celular ficar lento depois de ativar a IA:** feche o app (botão de recentes ▢ → arraste para cima). Se continuar, vá em Configurações → Aplicativos → Chrome → **Forçar parada**, ou reinicie o celular. Para liberar espaço: no app, **Privacidade → Apagar modelos de IA baixados**.

### 7.5 IA em qualquer celular (fora deste MVP)

Duas alternativas, ambas para avaliar depois do piloto:
- **App Android nativo** com o mesmo app web e o modelo rodando por llama.cpp (GGUF Q4_K_M do 230M) ou Google LiteRT-LM (há conversão `litert-community/LFM2.5-230M`). Deve ficar bem mais leve e rápido que no navegador.
- **Servidor institucional** (Ollama com o LFM na UFAM) para celulares fracos. A pergunta passaria a sair do aparelho, o que exige rever a parte de LGPD e o TCLE.

---

## 8. Publicar no GitHub Pages

A pasta já vem pronta para o Pages:
- `.nojekyll`: publica os arquivos como estão.
- `robots.txt` e `<meta name="robots" content="noindex">`: mantêm o protótipo fora dos buscadores.
- `.gitignore`: exclui `node_modules/`, `modelos/` e zips.

**Passo a passo**
```powershell
cd C:\caminho\para\autoimunes-sus
git init
git add .
git commit -m "MVP Lúpus SUS"
git branch -M main
# com GitHub CLI:
gh repo create autoimunes-sus --public --source . --push
# ou crie o repositório vazio em github.com/new e:
git remote add origin https://github.com/USUARIO/autoimunes-sus.git
git push -u origin main
```

Depois, no repositório, vá em **Settings → Pages → Source: Deploy from a branch → Branch: `main`, pasta `/ (root)` → Save**. Em 1 ou 2 minutos o app fica em `https://USUARIO.github.io/autoimunes-sus/`. O andamento da publicação aparece em **Actions** como "pages build and deployment".

**Push bloqueado por "Mistral AI API Key"?** É falso positivo. O scanner de segredos do GitHub confunde o nome de classe `Mistral3ForConditionalGeneration` (32 caracteres) em `vendor/transformers/transformers.min.js` com uma chave da Mistral. Abra o link que aparece no erro, escolha **"It's a false positive"**, permita o push e rode `git push` de novo.

**Observações**
- O Pages gratuito exige **repositório público**: o código e a cartilha em rascunho ficam visíveis no GitHub, mas fora do Google.
- O maior arquivo tem 28 MB (`vendor/ort/*.jsep.wasm`), dentro do limite de 100 MB do GitHub. O push inicial é de cerca de 70 MB.
- Outras hospedagens estáticas com HTTPS também servem (Vercel, Netlify, servidor da UFAM).

---

## 9. Publicar uma versão nova

O service worker mantém os arquivos em cache. Para os celulares receberem a versão nova:

1. Mude a versão em **dois lugares**, com o mesmo número:
   - `sw.js` → `const VERSAO = "app-v0.1.4";`
   - `js/config.js` → `versaoApp: "0.1.4",`
2. Rode `git add . && git commit -m "v0.1.4: ..." && git push`.
3. Ao abrir o app, o navegador detecta o `sw.js` novo, baixa os arquivos ignorando o cache HTTP e recarrega a página **uma vez** sozinho. Confira no rodapé da tela Início.

**Durante o desenvolvimento**, para não brigar com o cache: F12 → **Application → Service workers → Update on reload**.

**Se um aparelho ficou preso numa versão antiga** (por exemplo, instalada antes da v0.1.3, que trouxe a atualização automática): no Chrome, ícone à esquerda do endereço → **Configurações do site → Excluir dados**, e abra o link de novo.

---

## 10. Configuração

Tudo fica em `js/config.js`:

| Campo | Padrão | Para que serve |
|---|---|---|
| `versaoApp` | `"0.1.3"` | Versão exibida no app; mude junto com `VERSAO` no `sw.js` |
| `versaoConsentimento` | `"2026-11-v1"` | Mude para mostrar o aviso inicial de novo a todos (por exemplo, quando o texto mudar) |
| `modelos` | 230M e 1.2B | Lista de geradores: `id` no Hugging Face, `dtype` (`q4`), `rotulo` e `leve` (se aparece para aparelhos fracos) |
| `hostModelos` | `null` (Hugging Face) | Espelho próprio dos modelos, por exemplo `"https://modelos.ufam.edu.br/"`, com a mesma estrutura de pastas do Hugging Face |
| `modelosLocais` | `null` | Pasta com cópias dos modelos servidas junto com o app, por exemplo `"modelos/"` |
| `permitirModelosRemotos` | `true` | Mude para `false` para nunca baixar da internet (exige `modelosLocais`) |
| `rag.topK` | `3` | Quantos trechos vão para o prompt |
| `rag.scoreMinimo` | `1.5` | Abaixo disso, a pergunta é considerada fora da cartilha |
| `rag.maxTokens` | `320` | Tamanho máximo da resposta |

Outras constantes em `js/app.js`:
- `OCIOSO_MS`: tempo até descarregar o modelo (5 min).
- `aparelhoFraco`: critério de aparelho fraco (celular, pouca memória ou sem WebGPU).
- `SISTEMA`: o prompt de sistema do gerador.

**Hospedar os modelos sem depender do Hugging Face:** baixe as pastas dos repositórios (`LiquidAI/LFM2.5-230M-ONNX` etc.), coloque-as no espelho ou em `modelos/LiquidAI/<nome>/`, ajuste `hostModelos` ou `modelosLocais`, e troque os domínios do Hugging Face no `connect-src` da Content-Security-Policy em `index.html`.

---

## 11. Editar o conteúdo (sem programar)

**Cartilha: `data/cartilha-les.md`**
```markdown
## Título da seção {#id-da-secao}
Fonte: SBR; PCDT-LES 2022

Primeiro parágrafo...

Segundo parágrafo...
```
- O `{#id}` deve ser único e sem acentos; ele é usado nos links e nas orientações do questionário.
- A linha `Fonte:` aparece no rodapé da seção.
- A busca e o RAG usam este arquivo automaticamente; não há índice para regenerar.

**Questionário: `data/regras-les.json`**
- `alertas`: perguntas de urgência; qualquer "sim" leva à urgência.
- `dominios`: partes do corpo e suas perguntas (cada `id` deve ser único).
- `limiares`: número de domínios, durações que contam como persistentes e domínios prioritários.
- `orientacoes`: títulos e textos das quatro saídas, e a seção da cartilha ligada a cada uma.

**Casos do piloto: `data/casos-simulados.json`**: casos fictícios com o resultado esperado. Os testes conferem se as regras dão esse resultado.

Depois de editar qualquer um desses arquivos, rode os testes (seção 12) e publique uma versão nova (seção 9).

---

## 12. Testes

```powershell
node tests/testes.mjs
```

São 16 testes sobre as partes que não usam modelo:
- **Regras:** ids únicos, as quatro orientações, ausência de linguagem de risco de doença, conteúdo do resumo e os casos simulados.
- **Cartilha:** todas as seções têm fonte, e as seções citadas pelas regras existem.
- **Busca:** 16 perguntas, incluindo as feitas só com palavras comuns, devem achar a seção certa no top-3; perguntas fora do tema não devem achar nada.
- **Detecção:** urgência clínica, crise emocional e pedido de diagnóstico.

As respostas da IA não têm teste automático: veja a avaliação sugerida em `docs/VALIDACAO_CLINICA.md`.

---

## 13. Privacidade e LGPD

Princípio adotado: **não coletar**. Detalhes em `docs/LGPD.md`.

- Sem cadastro, login, nome, idade, endereço, documento ou localização.
- Sem analytics, cookies de terceiros, fontes ou scripts de CDN.
- A Content-Security-Policy (`index.html`) só permite conexões com o próprio site e com o Hugging Face (download dos pesos).
- O questionário e as perguntas são processados no aparelho e não são enviados a lugar nenhum.
- O download do modelo só acontece se a pessoa escolher o modo com IA. O servidor vê o IP, como em qualquer download, mas não recebe nenhum conteúdo da pessoa.
- A tela Privacidade mostra o que está guardado e apaga tudo (direitos do titular, art. 18).

---

## 14. Onde os dados ficam e como apagar

| O quê | Onde | Observação |
|---|---|---|
| Aviso inicial aceito (versão e data) | `localStorage` → `les.consentimento` | |
| Resumos guardados (só se a pessoa tocar em "Guardar") | `localStorage` → `les.historico` | máx. 20 |
| Casca do app | Cache Storage → `app-v<versão>` | versões antigas são apagadas sozinhas |
| Motor ONNX (`vendor/ort/`) | Cache Storage → `app-runtime` | |
| Pesos do LFM | Cache Storage → `transformers-cache` | |
| Respostas do questionário e conversa | só na memória da página | somem ao fechar |

Os dados são **por origem**: `localhost:8001`, `localhost:8000` e o endereço do GitHub Pages têm caches separados, e cada navegador e perfil tem o seu.

**Como apagar:**
- **No app:** Privacidade → "Apagar resumos guardados", "Apagar modelos de IA baixados" ou "Apagar tudo deste aplicativo".
- **No navegador do computador:** F12 → Application → Storage → **Clear site data**.
- **No Chrome do celular:** ícone à esquerda do endereço → Configurações do site → **Excluir dados**.

---

## 15. Problemas conhecidos e soluções

| Sintoma | Causa | Solução |
|---|---|---|
| Celular fica lento depois de ativar a IA | Modelo carregado na memória da aba; GPU fraca | Fechar o app ou forçar a parada do Chrome. No uso normal, fique no modo sem IA (seção 7.4) |
| Celular continua com a versão antiga | Service worker com arquivos antigos (versões < 0.1.3) | Excluir os dados do site uma vez (seção 9) |
| Mudanças no código não aparecem no PC | Cache do service worker | F12 → Application → Service workers → **Update on reload** |
| `git push` bloqueado: "Mistral AI API Key" | Falso positivo em `transformers.min.js` | Liberar pelo link do erro (seção 8) |
| "Não foi possível carregar o modelo (Failed to fetch)" | Sem internet, Hugging Face bloqueado na rede, ou CSP sem o domínio do espelho | Testar outra rede; conferir `hostModelos` e o `connect-src` |
| Geração lenta (< 10 tok/s) num PC com GPU dedicada | Navegador usando a GPU integrada | Seção 6 |
| "Este navegador não tem WebGPU" | Navegador antigo, página fora de HTTPS/localhost, ou GPU sem suporte | Atualizar Chrome/Edge; usar HTTPS; conferir `chrome://gpu` |
| Celular não instala o app nem funciona offline | Página aberta por `http://IP` | Usar GitHub Pages, túnel HTTPS ou `adb reverse` (seção 7.1) |
| Pergunta simples dá "Não encontrei" | Palavras não estão na cartilha, ou pontuação baixa | Acrescentar sinônimos em `SINONIMOS` (`js/busca.js`) ou ajustar `rag.scoreMinimo`; incluir a pergunta nos testes |
| "Apagar tudo" sumiu com modelos de outro projeto | Os dois projetos rodam na mesma porta (mesma origem) | Usar portas diferentes (seção 5) |
| Navegador: "Out of Memory" ou cota esgotada | Disco cheio ou cota do site | Liberar disco, apagar modelos não usados; usar Chrome/Edge (o Brave tem cota menor) |

---

## 16. Limitações

- **Conteúdo clínico em rascunho**, sem validação.
- **Só lúpus.** Artrite reumatoide, Sjögren e Hashimoto ficam para a próxima fase, no mesmo formato.
- **IA no navegador não roda bem em celulares de entrada** (testado no Galaxy A15).
- O **LFM2.5-230M** é bom para tarefas curtas e extração de dados, não para raciocínio longo. Compare as respostas dele com as do 1.2B antes de usar no piloto.
- **Sem instrumentos do piloto no app** (SUS Scale, NPS, CSAT, CES): devem ser aplicados à parte, com TCLE aprovado pelo CEP.
- **Sem dashboard analítico:** fica para a fase 2, como recomendado no resumo executivo.

---

## 17. Estrutura da pasta

```
autoimunes-sus/
├── index.html               casca do app, CSP, aviso inicial
├── manifest.webmanifest     dados de instalação (PWA)
├── sw.js                    service worker (offline, versões)
├── robots.txt, .nojekyll    GitHub Pages e fora dos buscadores
├── css/app.css              estilos (sem fontes externas; claro e escuro)
├── js/
│   ├── app.js               telas, navegação, RAG, gestão de memória da IA
│   ├── config.js            configuração central (seção 10)
│   ├── triagem.js           motor de regras (função pura, testável)
│   ├── cartilha.js          leitura do Markdown da cartilha e divisão em trechos
│   ├── busca.js             BM25 em português, detecção de urgência e de pedido de diagnóstico
│   └── llm-worker.js        gerador LFM num Web Worker (Transformers.js)
├── data/
│   ├── regras-les.json      perguntas, limiares e orientações
│   ├── cartilha-les.md      conteúdo da cartilha
│   └── casos-simulados.json casos fictícios do piloto
├── vendor/
│   ├── transformers/        Transformers.js 4.3.2
│   └── ort/                 runtime onnxruntime-web (WASM)
├── icons/                   ícones 192 e 512 px
├── docs/
│   ├── LGPD.md              mapa de dados e pontos para o DPO
│   └── VALIDACAO_CLINICA.md checklist da coorientação
└── tests/testes.mjs         testes em Node
```

---

## 18. Próximos passos

1. **Validação clínica** de `regras-les.json` e `cartilha-les.md` (`docs/VALIDACAO_CLINICA.md`), incluindo uma frase sobre lúpus em crianças.
2. **Conjunto de avaliação das respostas da IA:** 20 a 30 perguntas com respostas de referência; comparar 230M e 1.2B.
3. **Hospedar os modelos no Brasil** (seção 10) para eliminar até o download pelo Hugging Face.
4. **Protótipo Android nativo** com o 230M em llama.cpp ou LiteRT-LM, medido no Galaxy A15.
5. **Instrumentos do piloto** fora do app, depois da aprovação no CEP.
6. **Segunda doença** (artrite reumatoide) reaproveitando o formato de regras e cartilha.

---

## 19. Licenças e fontes

**Código do projeto:** definir com o NIT/UFAM antes do registro no INPI.

**Terceiros:**
- Transformers.js: Apache-2.0 (`vendor/transformers/LICENSE.txt`).
- onnxruntime-web: MIT (`vendor/ort/LICENSE.txt`).
- Modelos LFM: LFM Open License v1.0 (uso livre, inclusive comercial, para organizações com receita anual abaixo de US$ 10 milhões). Ver https://www.liquid.ai/lfm-license.

**Fontes do conteúdo:**
- Sociedade Brasileira de Reumatologia. *Cartilha Lúpus.* https://www.ufpb.br/cras/contents/documentos/cartilhasbr-lupus.pdf
- Brasil. Ministério da Saúde. *Protocolo Clínico e Diretrizes Terapêuticas do Lúpus Eritematoso Sistêmico.* Portaria Conjunta SAES/SCTIE/MS nº 21, de 1º de novembro de 2022. https://www.gov.br/saude/pt-br/assuntos/pcdt/l/lupus-eritematoso-sistemico
- Aringer M. et al. *2019 EULAR/ACR classification criteria for systemic lupus erythematosus.* Arthritis & Rheumatology, 2019.
- Liquid AI. *LFM2.5-230M: Built to Run Anywhere.* https://liquid.ai/blog/lfm2-5-230m
