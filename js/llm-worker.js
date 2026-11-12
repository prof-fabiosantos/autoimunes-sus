// Web Worker do gerador LFM (Transformers.js + WebGPU), para não travar a interface.
// Recebe {tipo:"carregar", modelo, dtype} e {tipo:"gerar", mensagens, maxTokens}.
// Responde {tipo:"progresso"|"pronto"|"token"|"fim"|"erro", ...}.
// Nada do que a pessoa digita sai do aparelho: o worker só baixa os pesos do modelo.
import { AutoTokenizer, AutoModelForCausalLM, TextStreamer, env }
  from "../vendor/transformers/transformers.min.js";
import { CONFIG } from "./config.js";

env.allowLocalModels = !!CONFIG.modelosLocais;     // cópias servidas junto com o app
if (CONFIG.modelosLocais) env.localModelPath = new URL(`../${CONFIG.modelosLocais}`, import.meta.url).href;
env.allowRemoteModels = CONFIG.permitirModelosRemotos;
if (CONFIG.hostModelos) env.remoteHost = CONFIG.hostModelos; // espelho próprio (ex.: servidor da UFAM)
env.useBrowserCache = true;                           // pesos ficam no Cache Storage do aparelho
env.backends.onnx.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href; // sem CDN

let gerador = null; // { id, tokenizer, model }

async function temWebGPU() {
  try { return !!(await navigator.gpu?.requestAdapter?.()); } catch { return false; }
}

async function carregar(id, dtype) {
  if (gerador?.id === id) return gerador;
  await gerador?.model?.dispose?.();
  gerador = null;
  const arquivos = {};
  const progress_callback = (p) => {
    if (p.status === "progress" && p.total) {
      arquivos[p.file] = p;
      const l = Object.values(arquivos).reduce((a, f) => a + f.loaded, 0);
      const t = Object.values(arquivos).reduce((a, f) => a + f.total, 0);
      postMessage({ tipo: "progresso", carregado: l, total: t });
    }
  };
  const gpu = await temWebGPU();
  const tokenizer = await AutoTokenizer.from_pretrained(id, { progress_callback });
  const model = await AutoModelForCausalLM.from_pretrained(id, {
    device: gpu ? "webgpu" : "wasm", dtype, progress_callback,
  });
  gerador = { id, tokenizer, model, device: gpu ? "webgpu" : "wasm" };
  return gerador;
}

onmessage = async ({ data }) => {
  try {
    if (data.tipo === "carregar") {
      const g = await carregar(data.modelo, data.dtype);
      postMessage({ tipo: "pronto", device: g.device });
    } else if (data.tipo === "gerar") {
      if (!gerador) throw new Error("Modelo não carregado.");
      const { tokenizer, model } = gerador;
      const inputs = tokenizer.apply_chat_template(data.mensagens, { add_generation_prompt: true, return_dict: true });
      let n = 0, t0 = 0;
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true, skip_special_tokens: true,
        callback_function: (texto) => postMessage({ tipo: "token", texto }),
        token_callback_function: () => { if (!t0) t0 = performance.now(); n++; },
      });
      await model.generate({
        ...inputs, max_new_tokens: data.maxTokens ?? 320,
        do_sample: false, repetition_penalty: 1.05, streamer,
      });
      const dt = (performance.now() - t0) / 1000;
      postMessage({ tipo: "fim", tokens: n, tokPorSeg: dt > 0 ? n / dt : 0 });
    }
  } catch (e) {
    postMessage({ tipo: "erro", mensagem: String(e?.message || e) });
  }
};
