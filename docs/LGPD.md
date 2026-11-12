# Privacidade por design (LGPD) — MVP Lúpus

> Documento técnico para apoiar a conversa com o encarregado de dados (DPO) da UFAM e o CEP. Não é parecer jurídico.

## Princípio adotado

**Não coletar.** Dados de saúde são dados pessoais sensíveis (LGPD, art. 5º, II, e art. 11). Em vez de tratá-los com segurança num servidor, o MVP **não os envia a lugar nenhum**: todo o processamento acontece no aparelho da pessoa, sob o controle dela.

## Mapa de dados

| Dado | Onde fica | Quanto tempo | Sai do aparelho? |
|---|---|---|---|
| Respostas do questionário | Memória da tela | Até fechar ou refazer | Não |
| Resumo do questionário | localStorage, **só se a pessoa tocar em "Guardar"** | Até ela apagar (máx. 20) | Não. Compartilhar ou imprimir é ação explícita da pessoa |
| Perguntas à cartilha e respostas | Memória da tela | Até fechar o app | Não |
| Confirmação do aviso inicial (versão + data) | localStorage | Até apagar | Não |
| Arquivos do app e pesos dos modelos | Cache Storage | Até apagar | Não (são só baixados) |

Não há: cadastro, login, nome, idade, sexo, endereço, CPF, cartão SUS, geolocalização, analytics, cookies de terceiros, fontes ou scripts de CDN.

## Única conexão externa

O download dos pesos do LFM (Hugging Face, EUA), **só** quando a pessoa escolhe o modo "com IA". O servidor vê o IP e o navegador, como em qualquer download; nenhum conteúdo do usuário é transmitido. A Content-Security-Policy em `index.html` limita as conexões a `'self'` e aos domínios do Hugging Face.

Para eliminar até isso: hospedar os modelos num servidor da UFAM (`hostModelos` em `js/config.js`) e ajustar o `connect-src` da CSP.

## Direitos do titular (art. 18)

Acesso e exclusão estão na tela **Privacidade**: mostra o que está guardado e oferece "Apagar resumos", "Apagar modelos" e "Apagar tudo" (localStorage, caches e service worker).

## Teste-piloto

- Usar os **casos simulados** do app (`data/casos-simulados.json`) ou cenários escritos pela coorientação, como prevê o projeto.
- Os instrumentos de usabilidade (SUS Scale, NPS, CSAT, CES) devem ficar **fora do app** ou ser exportados como arquivo anônimo, com TCLE aprovado pelo CEP.
- Se for necessário registrar uso (logs), isso muda o enquadramento: haverá tratamento de dados pela UFAM, com base legal e RIPD.

## Pontos para o DPO e o NIT

1. Confirmar que, sem dados recebidos pela UFAM, o app não configura tratamento pela universidade fora do piloto.
2. Texto do aviso inicial e da tela de privacidade.
3. Enquadramento ANVISA: o app é educativo, não emite diagnóstico e não deve ser divulgado como ferramenta clínica.
