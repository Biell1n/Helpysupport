import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { chamar, supabase } from '@/lib/supabase';
import { computeState, EMPTY_CONFIG, normalizeConfig } from '@/lib/documento';

const Ctx = createContext(null);
export const useBuilder = () => useContext(Ctx);

const AUTOSAVE_MS = 800;
const clone = (x) => JSON.parse(JSON.stringify(x));

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
    async (text) => {
      const content = String(text || '').trim();
      if (!content || sending) return;
      setMessages((p) => [...p, { role: 'user', content }]);
      setSending(true);
      try {
        await flush();
        const d = await chamar('assistant-builder-chat', { action: 'message', message: content, assistant_id: assistantId });
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
    ...estado,
    ...acoes,
    sendMessage,
    escolherModelo,
    criarCampo,
    publicar,
    recomecar,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
