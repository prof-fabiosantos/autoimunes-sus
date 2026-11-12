// Configuração central. Para um piloto institucional, hospede os modelos num
// servidor no Brasil (hostModelos) ou junto com o app (modelosLocais) e
// desligue permitirModelosRemotos.
export const CONFIG = {
  versaoConsentimento: "2026-11-v1",

  // Geradores LFM (Liquid AI), os mesmos testados no rag-lfm/cliente.
  modelos: [
    { id: "LiquidAI/LFM2.5-230M-ONNX", dtype: "q4", rotulo: "LFM2.5-230M · leve (~200 MB) · celulares", leve: true },
    { id: "LiquidAI/LFM2.5-1.2B-Instruct-ONNX", dtype: "q4", rotulo: "LFM2.5-1.2B · melhor (~850 MB) · computador com GPU", leve: false },
  ],

  // De onde vêm os pesos. Por padrão, Hugging Face (só download de arquivos; nada é enviado).
  hostModelos: null,              // ex.: "https://modelos.exemplo.ufam.edu.br/"
  modelosLocais: null,            // ex.: "modelos/" (pasta ao lado do index.html com cópias dos modelos)
  permitirModelosRemotos: true,

  rag: {
    topK: 3,
    scoreMinimo: 1.5,   // abaixo disso a pergunta é considerada fora da cartilha
    maxTokens: 320,
  },
};
