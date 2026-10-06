import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { chamar, supabase } from '@/lib/supabase';
import { computeState, EMPTY_CONFIG, normalizeConfig, semNoItem } from '@/lib/documento';
import { lerArquivo } from '@/lib/planilha';

const Ctx = createContext(null);
export const useBuilder = () => useContext(Ctx);

const AUTOSAVE_MS = 800;
const clone = (x) => JSON.parse(JSON.stringify(x));

export const ANEXO_ACEITA = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,.xlsx';
const MAX_ARQUIVO = 6 * 1024 * 1024;

const base64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const textoEmBase64 = (t) => base64(new TextEncoder().encode(t));

/** Prepara o arquivo para ir junto da mensagem. Planilha do Excel vira CSV aqui mesmo. */
export async function prepararAnexo(arquivo) {
  const nome = arquivo.name;
  const ext = nome.toLowerCase().split('.').pop();
  if (arquivo.size > MAX_ARQUIVO) throw new Error(`"${nome}" passa de 6 MB.`);
  if (ext === 'xlsx') {
    const abas = await lerArquivo(arquivo);
    const csv = abas
      .map((a) => `# Aba: ${a.nome}\n${a.linhas.map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\n')}`)
      .join('\n\n');
    return { nome, tipo: 'text/csv', dados: textoEmBase64(csv) };
  }
  const tipos = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown' };
  const tipo = tipos[ext];
  if (!tipo) throw new Error(`"${nome}": mande PDF, imagem, planilha (.xlsx, .csv) ou texto. Documento do Word: salve como PDF.`);
  return { nome, tipo, dados: base64(await arquivo.arrayBuffer()) };
}

/**
 * Estado do builder. O progresso é calculado aqui a cada mudança, então
 * editar um campo à mão mexe no medidor na hora.
 * Com assistantId, abre em modo edição: salvar atualiza em vez de criar.
 */
export function BuilderProvider({ assistantId = null, children }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [ramo, setRamo] = useState(null);
  const [modelo, setModelo] = useState(null);
  const [schema, setSchema] = useState({ sections: [] });
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [messages, setMessages] = useState([]);
  const [plano, setPlano] = useState(null);
  const [publico, setPublico] = useState(null);
  const [sending, setSending] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [fresh, setFresh] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [podeDesfazer, setPodeDesfazer] = useState(0);

  const sessionRef = useRef(null);
  const configRef = useRef(EMPTY_CONFIG);
  const timer = useRef(null);
  const pendente = useRef(null);

  const absorb = useCallback((d) => {
    if (!d) return;
    if (d.session_id) {
      setSessionId(d.session_id);
      sessionRef.current = d.session_id;
    }
    if (d.business_type !== undefined) setRamo(d.business_type);
    if (d.business_model !== undefined) setModelo(d.business_model);
    if (d.schema?.sections) setSchema(d.schema);
    if (d.config) {
      const c = normalizeConfig(d.config);
      configRef.current = c;
      setConfig(c);
    }
    if (d.plano) setPlano(d.plano);
    if (d.publico !== undefined) setPublico(d.publico);
    if (Array.isArray(d.materiais)) setMateriais(d.materiais);
    if (typeof d.desfazer === 'number') setPodeDesfazer(d.desfazer);
  }, []);

  // ---- carga ----
  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const d = await chamar('assistant-builder-chat', { action: 'load', assistant_id: assistantId });
        if (!vivo) return;
        absorb(d);
        setMessages(d.messages ?? []);
        setLoadError(null);
      } catch (e) {
        if (vivo) setLoadError(e.message);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
      clearTimeout(timer.current);
    };
  }, [assistantId, absorb]);

  // ---- gravação ----
  const gravar = useCallback(async (cfg) => {
    const id = sessionRef.current;
    if (!id) return;
    setSaveState('saving');
    const { error } = await supabase.from('builder_sessions').update({ config: cfg }).eq('id', id);
    setSaveState(error ? 'error' : 'saved');
    if (!error) setPodeDesfazer((n) => Math.max(n, 1));
  }, []);

  /** Grava agora o que estiver pendente. Chamado antes de qualquer ação no servidor. */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (pendente.current) {
      const cfg = pendente.current;
      pendente.current = null;
      await gravar(cfg);
    }
  }, [gravar]);

  const mutate = useCallback(
    (fn) => {
      const next = fn(clone(configRef.current));
      configRef.current = next;
      setConfig(next);
      pendente.current = next;
      setSaveState('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  // ---- conversa ----
  const sendMessage = useCallback(
    async (text, arquivos = []) => {
      const content = String(text || '').trim();
      if ((!content && !arquivos.length) || sending) return;
      const nomes = arquivos.map((a) => a.name);
      setMessages((p) => [...p, { role: 'user', content: content || 'Segue o arquivo.', ...(nomes.length ? { anexos: nomes } : {}) }]);
      setSending(true);
      try {
        const anexos = await Promise.all(arquivos.map(prepararAnexo));
        await flush();
        const d = await chamar('assistant-builder-chat', { action: 'message', message: content, anexos, assistant_id: assistantId });
        absorb(d);
        const keys = (d.ops ?? []).map((o) => o.key);
        setFresh(keys);
        setTimeout(() => setFresh([]), 2600);
        setMessages((p) => [...p, { role: 'assistant', content: d.message }]);
      } catch (e) {
        setMessages((p) => [...p, { role: 'system', content: e.message }]);
      } finally {
        setSending(false);
      }
    },
    [sending, flush, absorb, assistantId],
  );

  const escolherModelo = useCallback(
    async (m, r) => {
      await flush();
      const d = await chamar('assistant-builder-chat', { action: 'set_model', modelo: m, ramo: r, assistant_id: assistantId });
      absorb(d);
    },
    [flush, absorb, assistantId],
  );

  const criarCampo = useCallback(
    async ({ section, label, type }) => {
      await flush();
      const d = await chamar('assistant-builder-chat', { action: 'add_field', section, label, type, assistant_id: assistantId });
      absorb(d);
    },
    [flush, absorb, assistantId],
  );

  const publicar = useCallback(async () => {
    await flush();
    const d = await chamar('assistant-builder-chat', { action: 'finalize', assistant_id: assistantId });
    return d.assistant;
  }, [flush, assistantId]);

  const desfazer = useCallback(async () => {
    await flush();
    const d = await chamar('assistant-builder-chat', { action: 'undo', assistant_id: assistantId });
    absorb(d);
  }, [flush, absorb, assistantId]);

  const removerMaterial = useCallback(
    async (id) => {
      await flush();
      const d = await chamar('assistant-builder-chat', { action: 'remove_material', material_id: id, assistant_id: assistantId });
      absorb(d);
    },
    [flush, absorb, assistantId],
  );

  const recomecar = useCallback(async () => {
    clearTimeout(timer.current);
    pendente.current = null;
    setLoading(true);
    try {
      const d = await chamar('assistant-builder-chat', { action: 'reset', assistant_id: assistantId });
      absorb({ ...d, config: d.config ?? EMPTY_CONFIG });
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [absorb, assistantId]);

  // ---- edição do documento ----
  const acoes = useMemo(
    () => ({
      setField: (key, value) =>
        mutate((c) => {
          c.fields[key] = { value, status: value ? 'confirmado' : 'vazio' };
          return c;
        }),
      skipField: (key) =>
        mutate((c) => {
          c.fields[key] = { value: '', status: 'ignorado' };
          return c;
        }),
      restoreField: (key) =>
        mutate((c) => {
          c.fields[key] = { value: '', status: 'vazio' };
          return c;
        }),
      addItem: (col) =>
        mutate((c) => {
          c.collections[col] = [...(c.collections[col] || []), {}];
          c.declined.collections = c.declined.collections.filter((k) => k !== col);
          return c;
        }),
      setItemField: (col, i, key, value) =>
        mutate((c) => {
          const list = [...(c.collections[col] || [])];
          list[i] = { ...list[i], [key]: value };
          c.collections[col] = list;
          return c;
        }),
      removeItem: (col, i) =>
        mutate((c) => {
          const list = [...(c.collections[col] || [])];
          list.splice(i, 1);
          c.collections[col] = list;
          return c;
        }),
      skipCollection: (col) =>
        mutate((c) => {
          if (!c.declined.collections.includes(col)) c.declined.collections.push(col);
          return c;
        }),
      restoreCollection: (col) =>
        mutate((c) => {
          c.declined.collections = c.declined.collections.filter((k) => k !== col);
          return c;
        }),
      /** "não informar" este atributo só neste item */
      skipItemAttr: (col, i, key) =>
        mutate((c) => {
          const list = [...(c.collections[col] || [])];
          const sem = new Set(semNoItem(list[i]));
          sem.add(key);
          list[i] = { ...list[i], [key]: '', _sem: [...sem].join(',') };
          c.collections[col] = list;
          return c;
        }),
      restoreItemAttr: (col, i, key) =>
        mutate((c) => {
          const list = [...(c.collections[col] || [])];
          const sem = semNoItem(list[i]).filter((k) => k !== key);
          const item = { ...list[i] };
          if (sem.length) item._sem = sem.join(',');
          else delete item._sem;
          list[i] = item;
          c.collections[col] = list;
          return c;
        }),
      /** volta a pedir um atributo que tinha sido dispensado na lista toda */
      restoreListAttr: (col, key) =>
        mutate((c) => {
          c.declined.item_fields[col] = (c.declined.item_fields[col] || []).filter((k) => k !== key);
          return c;
        }),
    }),
    [mutate],
  );

  const estado = useMemo(() => computeState(schema, config), [schema, config]);

  const value = {
    assistantId,
    editando: !!assistantId,
    loading,
    loadError,
    sessionId,
    ramo,
    modelo,
    schema,
    config,
    messages,
    plano,
    publico,
    sending,
    saveState,
    fresh,
    materiais,
    podeDesfazer,
    ...estado,
    ...acoes,
    sendMessage,
    escolherModelo,
    criarCampo,
    publicar,
    recomecar,
    desfazer,
    removerMaterial,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
