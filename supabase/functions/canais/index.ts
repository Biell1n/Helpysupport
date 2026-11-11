// ============================================================
// canais — conectar o assistente ao WhatsApp, ao Instagram e ao Discord
//
//   conectar     → dono confere o token no serviço e liga o canal
//   testar       → confere de novo se o token ainda vale
//   pausar       → { ativo: false } o assistente para de responder por lá
//   desconectar  → apaga o canal e o token
//   enviar       → resposta da equipe (painel) vai para o cliente pelo canal,
//                  com o nome de quem respondeu
//   sincronizar  → a equipe mudou o status da conversa no painel; no ticket
//                  do Discord isso aparece no tópico (assumiu, encerrou…)
//   discord_status → o servidor ligado no Discord está no ar?
// ============================================================

import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, profileOf, requireUser } from '../_shared/db.ts';
import { planOf } from '../_shared/plans.ts';
import {
  type Canal,
  conferirDiscord,
  conferirInstagram,
  conferirWhatsApp,
  fotoDoWhatsApp,
  enviarPeloCanal,
  ErroDoCanal,
  guardarSegredo,
  ativarEGravar,
  ESPERA_META,
  statusDoErro,
  NOMES,
  segredoDo,
  type TipoCanal,
  vestirBotDiscord,
  apelidarBotHelpy,
  botNoServidor,
  discordHelpyPronto,
  ehBotDoHelpy,
  prepararBotHelpy,
  sairDoServidor,
  servidorDoCodigo,
  urlAdicionarBot,
} from '../_shared/canais.ts';
import { gatewayLigado, sincronizarConversa } from '../_shared/discord-tickets.ts';

const TIPOS: TipoCanal[] = ['whatsapp', 'instagram', 'discord'];
const UUID = /^[0-9a-f-]{36}$/i;

/** Conta (dono) de quem chamou: o próprio dono ou a empresa do funcionário. */
async function contaDe(userId: string): Promise<{ conta: string; dono: boolean }> {
  const { data: p } = await admin.from('profiles').select('tipo').eq('id', userId).maybeSingle();
  if (p?.tipo === 'funcionario') {
    const { data: eq } = await admin.from('equipe').select('owner_id').eq('user_id', userId).maybeSingle();
    if (!eq) throw new UserError('Você não está mais na equipe desta empresa.', 403);
    return { conta: eq.owner_id, dono: false };
  }
  if (p?.tipo === 'cliente') throw new UserError('Só a empresa mexe nos canais.', 403);
  return { conta: userId, dono: true };
}

async function canalDaConta(id: unknown, conta: string): Promise<Canal> {
  if (typeof id !== 'string' || !UUID.test(id)) throw new UserError('Canal inválido.');
  const { data } = await admin.from('canais').select('*').eq('id', id).maybeSingle();
  if (!data || data.owner_id !== conta) throw new UserError('Canal não encontrado.', 404);
  return data as Canal;
}

/** Nome que o cliente vê: o "nome do assistente" da ficha ou o nome do cadastro. */
function nomeVisivel(a: { name: string; config?: { fields?: Record<string, { value?: string }> } | null }) {
  return String(a.config?.fields?.nome_assistente?.value ?? '').trim() || a.name;
}

const ENDERECO_BOT_HELPY = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/public-chat?discord=helpy`;

/** A volta do Discord só pode cair na tela de Canais do próprio painel. */
function voltaValida(v: unknown): string {
  const u = typeof v === 'string' ? v : '';
  try {
    const url = new URL(u);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if ((url.protocol === 'https:' || local) && url.pathname === '/painel/canais/discord' && !url.search && !url.hash) return url.toString();
  } catch { /* cai no erro abaixo */ }
  throw new UserError('Endereço de volta inválido.');
}

const enderecoDiscord = (canalId: string) => `${Deno.env.get('SUPABASE_URL')}/functions/v1/public-chat?discord=${canalId}`;

const texto = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Liga os avisos de mensagem nova da conta (quando o serviço pede isso por conta). */
async function assinarAvisos(tipo: TipoCanal, token: string, wabaId: string) {
  try {
    if (tipo === 'instagram') {
      await fetch('https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=messages', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
      });
    } else if (tipo === 'whatsapp' && wabaId) {
      await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(wabaId)}/subscribed_apps`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
      });
    }
  } catch {
    /* dá para ligar pelo painel da Meta também; não impede a conexão */
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    const { conta, dono } = await contaDe(user.id);

    // ---- resposta da equipe: dono e funcionários ----
    if (action === 'enviar') {
      const id = String(body.message_id ?? '');
      if (!UUID.test(id)) throw new UserError('Mensagem inválida.');
      const { data: m } = await admin.from('conversation_messages')
        .select('id, role, content, author_name, conversation_id, conversations!inner(owner_id, canal_id, contato_externo)')
        .eq('id', id).maybeSingle();
      const conv = (m as unknown as { conversations?: { owner_id: string; canal_id: string | null; contato_externo: string | null } })?.conversations;
      if (!m || !conv || conv.owner_id !== conta) throw new UserError('Mensagem não encontrada.', 404);
      if (m.role !== 'agent') throw new UserError('Só respostas da equipe vão pelo canal.');
      if (!conv.canal_id || !conv.contato_externo) return json({ ok: true, canal: null });
      const canal = await canalDaConta(conv.canal_id, conta);
      if (canal.status === 'pausado') throw new UserError(`O ${NOMES[canal.tipo]} está pausado. Retome em Canais para enviar.`);
      const { data: eu } = await admin.from('profiles').select('foto_url').eq('id', user.id).maybeSingle();
      const autor = m.author_name ? { nome: String(m.author_name).slice(0, 60), foto: eu?.foto_url ?? null } : null;
      await enviarPeloCanal(admin, canal, conv.contato_externo, String(m.content), autor);
      return json({ ok: true, canal: canal.tipo });
    }

    // ---- painel → Discord: assumiu, devolveu, encerrou ou reabriu ----
    if (action === 'sincronizar') {
      const id = String(body.conversation_id ?? '');
      if (!UUID.test(id)) throw new UserError('Conversa inválida.');
      const { data: c } = await admin.from('conversations')
        .select('owner_id, canal_id, contato_externo, status, assumido_nome').eq('id', id).maybeSingle();
      if (!c || c.owner_id !== conta) throw new UserError('Conversa não encontrada.', 404);
      if (!c.canal_id) return json({ ok: true, canal: null });
      const canal = await canalDaConta(c.canal_id, conta);
      if (!ehBotDoHelpy(canal)) return json({ ok: true, canal: canal.tipo });
      const feito = await sincronizarConversa(c);
      return json({ ok: true, canal: canal.tipo, ticket: feito });
    }

    if (action === 'discord_status') {
      return json({ gateway: await gatewayLigado() });
    }

    if (!dono) throw new UserError('Só o dono da conta conecta e desconecta canais.', 403);

    // ---- Discord pelo bot do Helpy: 1) ir ao Discord adicionar o bot ----
    if (action === 'discord_iniciar') {
      const { data: a } = await admin.from('assistants').select('id, owner_id').eq('id', String(body.assistant_id ?? '')).maybeSingle();
      if (!a || a.owner_id !== conta) throw new UserError('Escolha um dos seus assistentes.');
      const volta = voltaValida(body.volta);
      if (!discordHelpyPronto()) throw new UserError('O bot do Helpy no Discord está sendo configurado. Tente de novo em alguns minutos.', 503);
      try {
        await prepararBotHelpy(ENDERECO_BOT_HELPY());
      } catch (e) {
        console.error('[discord] preparar', e);
        throw new UserError('O Discord não respondeu agora. Tente de novo em instantes.', 502);
      }
      const state = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
      await admin.from('canal_convites').delete().lt('criado_em', new Date(Date.now() - 864e5).toISOString());
      const { error } = await admin.from('canal_convites').insert({ state, owner_id: conta, assistant_id: a.id });
      if (error) throw error;
      return json({ url: urlAdicionarBot(state, volta) });
    }

    // ---- 2) a volta do Discord: liga o servidor ao assistente escolhido ----
    if (action === 'discord_concluir') {
      const state = String(body.state ?? '');
      const { data: convite } = await admin.from('canal_convites').select('*').eq('state', state).maybeSingle();
      if (!convite || convite.owner_id !== conta) throw new UserError('Este pedido de conexão não é seu ou já foi usado. Comece de novo em Canais.', 403);
      await admin.from('canal_convites').delete().eq('state', state);
      if (Date.now() - new Date(convite.criado_em).getTime() > 30 * 60e3) throw new UserError('O pedido de conexão venceu. Comece de novo em Canais.', 410);
      const volta = voltaValida(body.volta);
      let servidor;
      try {
        servidor = await servidorDoCodigo(String(body.code ?? ''), volta);
      } catch (e) {
        throw new UserError(e instanceof ErroDoCanal ? e.message : (e as Error).message, 502);
      }
      const { data: existente } = await admin.from('canais').select('id, owner_id').eq('tipo', 'discord').eq('externo_id', servidor.id).maybeSingle();
      if (existente && existente.owner_id !== conta) throw new UserError('Este servidor já está ligado a outra empresa no Helpy.', 409);
      const { data: a } = await admin.from('assistants').select('id, name, foto_url, config').eq('id', convite.assistant_id).maybeSingle();
      if (!a) throw new UserError('O assistente escolhido não existe mais.', 404);
      const linha = {
        owner_id: conta, assistant_id: a.id, tipo: 'discord', status: 'ativo', nome: servidor.name.slice(0, 120),
        externo_id: servidor.id, config: { modo: 'helpy' }, erro: null,
      };
      const { data: canal, error } = existente
        ? await admin.from('canais').update(linha).eq('id', existente.id).select('*').single()
        : await admin.from('canais').insert(linha).select('*').single();
      if (error) throw error;
      const visual = await apelidarBotHelpy(servidor.id, nomeVisivel(a), a.foto_url);
      const { segredo: _s, ...publico } = canal;
      return json({ canal: publico, servidor: servidor.name, assistente: nomeVisivel(a), visual });
    }

    if (action === 'conectar') {
      const tipo = String(body.tipo ?? '') as TipoCanal;
      if (!TIPOS.includes(tipo)) throw new UserError('Escolha WhatsApp, Instagram ou Discord.');
      const assistantId = String(body.assistant_id ?? '');
      const { data: a } = await admin.from('assistants').select('id, owner_id, name, foto_url, config').eq('id', assistantId).maybeSingle();
      if (!a || a.owner_id !== conta) throw new UserError('Escolha um dos seus assistentes.');
      const token = texto(body.token, 2000);
      if (token.length < 20) throw new UserError('Cole o token de acesso completo.');
      const appSecret = texto(body.app_secret, 120);

      // WhatsApp e Instagram: todo plano tem um limite de contas
      if (tipo !== 'discord') {
        const plan = planOf(await profileOf(conta));
        if (!plan.canaisMeta) throw new UserError('WhatsApp e Instagram fazem parte do plano Profissional em diante.', 402);
        const { count } = await admin.from('canais').select('id', { count: 'exact', head: true })
          .eq('owner_id', conta).in('tipo', ['whatsapp', 'instagram']);
        // o mesmo número de novo é atualização, não conta nova
        const mesmoNumero = tipo === 'whatsapp' && /^\d{6,30}$/.test(texto(body.phone_number_id, 40))
          ? (await admin.from('canais').select('id').eq('owner_id', conta).eq('tipo', 'whatsapp').eq('externo_id', texto(body.phone_number_id, 40)).maybeSingle()).data
          : null;
        if (!mesmoNumero && (count ?? 0) >= plan.canaisMeta) {
          throw new UserError(`Seu plano conecta até ${plan.canaisMeta} contas de WhatsApp e Instagram. Desconecte uma ou mude de plano.`, 402);
        }
      }

      let dados: { externo_id: string; nome: string; config?: Record<string, string> };
      try {
        if (tipo === 'whatsapp') {
          const numero = texto(body.phone_number_id, 40);
          if (!/^\d{6,30}$/.test(numero)) throw new UserError('Informe o "Identificação do número de telefone" (só números) do painel da Meta.');
          dados = await conferirWhatsApp(numero, token);
          const waba = texto(body.waba_id, 40);
          if (/^\d{6,30}$/.test(waba)) dados.config = { waba_id: waba };
        } else if (tipo === 'instagram') {
          dados = await conferirInstagram(token);
        } else {
          dados = await conferirDiscord(token);
        }
      } catch (e) {
        if (e instanceof UserError) throw e;
        throw new UserError(e instanceof ErroDoCanal ? e.message : `Não deu para conferir o token: ${(e as Error).message}`);
      }

      const { data: existente } = await admin.from('canais').select('id, owner_id, config').eq('tipo', tipo).eq('externo_id', dados.externo_id).maybeSingle();
      if (existente && existente.owner_id !== conta) throw new UserError('Esta conta já está conectada ao Helpy por outra empresa.', 409);

      const linha = {
        owner_id: conta,
        assistant_id: assistantId,
        tipo,
        status: 'ativo',
        nome: dados.nome.slice(0, 120),
        externo_id: dados.externo_id,
        config: { ...(dados.config ?? {}), ...(existente?.config?.registro_apos ? { registro_apos: existente.config.registro_apos } : {}) },
        erro: null,
      };
      const { data: canal, error } = existente
        ? await admin.from('canais').update(linha).eq('id', existente.id).select('*').single()
        : await admin.from('canais').insert(linha).select('*').single();
      if (error) throw error;
      // número novo do WhatsApp: ativa na Meta (senão recebe e não responde)
      let pin: string | undefined;
      if (tipo === 'whatsapp') {
        const { data: velho } = existente ? await admin.rpc('helpy_canal_segredo', { p_canal: canal.id }) : { data: null };
        try { pin = velho ? JSON.parse(String(velho)).pin : undefined; } catch { /* sem PIN guardado */ }
        pin ??= String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        const r = await ativarEGravar(admin, canal, token, pin);
        canal.status = r.status;
        canal.erro = r.erro;
        canal.config = r.config;
      }
      await guardarSegredo(admin, canal.id, { token, ...(appSecret ? { app_secret: appSecret } : {}), ...(pin ? { pin } : {}) });
      await assinarAvisos(tipo, token, dados.config?.waba_id ?? '');
      // Discord: o bot ganha o nome e a foto do assistente e o endereço é cadastrado sozinho
      let discord = null;
      if (tipo === 'discord') {
        const nome = nomeVisivel(a);
        discord = await vestirBotDiscord(token, {
          nome, foto: a.foto_url, endereco: enderecoDiscord(canal.id),
          descricao: `${nome} atende pelo comando /helpy.`,
        });
        if (discord.nome) await admin.from('canais').update({ nome: nome.slice(0, 120) }).eq('id', canal.id);
        canal.config = { ...canal.config, endereco_automatico: discord.endereco ? 'sim' : 'nao' };
        await admin.from('canais').update({ config: canal.config }).eq('id', canal.id);
      }
      const { segredo: _s, ...publico } = canal;
      return json({ canal: publico, discord });
    }

    if (action === 'testar') {
      const canal = await canalDaConta(body.canal_id, conta);
      if (ehBotDoHelpy(canal)) {
        const esta = await botNoServidor(canal.externo_id).catch(() => true);
        const erro = esta ? null : 'O bot do Helpy não está mais neste servidor (alguém removeu pelo Discord). Conecte de novo.';
        await admin.from('canais').update({ status: esta ? (canal.status === 'pausado' ? 'pausado' : 'ativo') : 'erro', erro }).eq('id', canal.id);
        return json(esta ? { ok: true } : { ok: false, erro });
      }
      const segredo = await segredoDo(admin, canal.id);
      const { token } = segredo;
      try {
        if (canal.tipo === 'whatsapp') {
          await conferirWhatsApp(canal.externo_id, token);
          // confere (e faz, se faltar) a ativação do número na Meta
          const pin = segredo.pin ?? String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
          if (!segredo.pin) await guardarSegredo(admin, canal.id, { ...segredo, pin });
          const r = await ativarEGravar(admin, canal, token, pin);
          if (r.erro) return json({ ok: false, erro: r.erro, aguardando: r.status === 'pendente' });
          return json({ ok: true });
        } else if (canal.tipo === 'instagram') await conferirInstagram(token);
        else await conferirDiscord(token);
      } catch (e) {
        const erro = (e as Error).message.slice(0, 500);
        await admin.from('canais').update({ status: statusDoErro(erro), erro }).eq('id', canal.id);
        return json({ ok: false, erro, aguardando: erro === ESPERA_META });
      }
      await admin.from('canais').update({ status: canal.status === 'pausado' ? 'pausado' : 'ativo', erro: null }).eq('id', canal.id);
      return json({ ok: true });
    }

    // foto do assistente no perfil do número do WhatsApp (a imagem já vem em JPEG do painel)
    if (action === 'foto_whatsapp') {
      const canal = await canalDaConta(body.canal_id, conta);
      if (canal.tipo !== 'whatsapp') throw new UserError('Só o WhatsApp usa esta foto.');
      const b64 = String(body.imagem ?? '').replace(/^data:image\/jpeg;base64,/, '');
      if (!b64 || b64.length > 7_000_000) throw new UserError('Foto inválida ou grande demais.');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new UserError('A foto precisa estar em JPEG.');
      const { token } = await segredoDo(admin, canal.id);
      try {
        await fotoDoWhatsApp(canal.externo_id, token, bytes);
      } catch (e) {
        return json({ ok: false, erro: (e as Error).message.slice(0, 300) });
      }
      return json({ ok: true });
    }

    // novo token (e, se vier, nova chave secreta) para um canal que já existe: não conta no limite do plano
    if (action === 'trocar_token') {
      const canal = await canalDaConta(body.canal_id, conta);
      if (ehBotDoHelpy(canal)) throw new UserError('O bot do Helpy não usa token próprio.');
      const token = texto(body.token, 2000);
      if (token.length < 20) throw new UserError('Cole o token de acesso completo.');
      const appSecret = texto(body.app_secret, 120);
      let dados: { externo_id: string; nome: string };
      try {
        if (canal.tipo === 'whatsapp') dados = await conferirWhatsApp(canal.externo_id, token);
        else if (canal.tipo === 'instagram') dados = await conferirInstagram(token);
        else dados = await conferirDiscord(token);
      } catch (e) {
        throw new UserError(e instanceof ErroDoCanal ? e.message : `Não deu para conferir o token: ${(e as Error).message}`);
      }
      if (dados.externo_id !== canal.externo_id) throw new UserError('Este token é de outra conta. Use o token da mesma conta conectada.');
      const antigo = await segredoDo(admin, canal.id).catch(() => null);
      await guardarSegredo(admin, canal.id, { ...(antigo ?? {}), token, ...(appSecret ? { app_secret: appSecret } : {}) });
      await admin.from('canais').update({ status: 'ativo', erro: null, nome: dados.nome.slice(0, 120) }).eq('id', canal.id);
      if (canal.tipo === 'whatsapp') {
        const pin = antigo?.pin ?? String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        if (!antigo?.pin) await guardarSegredo(admin, canal.id, { ...(antigo ?? {}), token, ...(appSecret ? { app_secret: appSecret } : {}), pin });
        await ativarEGravar(admin, { ...canal, status: 'ativo' }, token, pin);
      }
      if (canal.tipo !== 'discord') await assinarAvisos(canal.tipo, token, String(canal.config?.waba_id ?? ''));
      return json({ ok: true });
    }

    if (action === 'pausar') {
      const canal = await canalDaConta(body.canal_id, conta);
      const status = body.ativo ? 'ativo' : 'pausado';
      await admin.from('canais').update({ status }).eq('id', canal.id);
      return json({ ok: true, status });
    }

    if (action === 'trocar_assistente') {
      const canal = await canalDaConta(body.canal_id, conta);
      const { data: a } = await admin.from('assistants').select('id, owner_id, name, foto_url, config').eq('id', String(body.assistant_id ?? '')).maybeSingle();
      if (!a || a.owner_id !== conta) throw new UserError('Escolha um dos seus assistentes.');
      await admin.from('canais').update({ assistant_id: a.id }).eq('id', canal.id);
      // no Discord o bot passa a ter o nome e a foto do assistente novo
      if (ehBotDoHelpy(canal)) {
        const feito = await apelidarBotHelpy(canal.externo_id, nomeVisivel(a), a.foto_url);
        return json({ ok: true, discord: feito });
      }
      if (canal.tipo === 'discord') {
        const { token } = await segredoDo(admin, canal.id);
        const feito = await vestirBotDiscord(token, { nome: nomeVisivel(a), foto: a.foto_url });
        if (feito.nome) await admin.from('canais').update({ nome: nomeVisivel(a).slice(0, 120) }).eq('id', canal.id);
        return json({ ok: true, discord: feito });
      }
      return json({ ok: true });
    }

    if (action === 'desconectar') {
      const canal = await canalDaConta(body.canal_id, conta);
      // bot do Helpy: sai do servidor da empresa
      if (ehBotDoHelpy(canal)) await sairDoServidor(canal.externo_id).catch((e) => console.warn('[discord] sair', e?.message));
      // o gatilho do banco apaga o token do Vault junto
      const { error } = await admin.from('canais').delete().eq('id', canal.id);
      if (error) throw error;
      return json({ ok: true });
    }

    throw new UserError('Ação desconhecida.');
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    if (e instanceof ErroDoCanal) return json({ error: e.message }, 502);
    console.error(e);
    return json({ error: 'Algo deu errado. Tente de novo.' }, 500);
  }
});
