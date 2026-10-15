// ============================================================
// canais — conectar o assistente ao WhatsApp, ao Instagram e ao Discord
//
//   conectar     → dono confere o token no serviço e liga o canal
//   testar       → confere de novo se o token ainda vale
//   pausar       → { ativo: false } o assistente para de responder por lá
//   desconectar  → apaga o canal e o token
//   enviar       → resposta da equipe (painel) vai para o cliente pelo canal
// ============================================================

import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, profileOf, requireUser } from '../_shared/db.ts';
import { planOf } from '../_shared/plans.ts';
import {
  type Canal,
  conferirDiscord,
  conferirInstagram,
  conferirWhatsApp,
  enviarPeloCanal,
  ErroDoCanal,
  guardarSegredo,
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
        .select('id, role, content, conversation_id, conversations!inner(owner_id, canal_id, contato_externo)')
        .eq('id', id).maybeSingle();
      const conv = (m as unknown as { conversations?: { owner_id: string; canal_id: string | null; contato_externo: string | null } })?.conversations;
      if (!m || !conv || conv.owner_id !== conta) throw new UserError('Mensagem não encontrada.', 404);
      if (m.role !== 'agent') throw new UserError('Só respostas da equipe vão pelo canal.');
      if (!conv.canal_id || !conv.contato_externo) return json({ ok: true, canal: null });
      const canal = await canalDaConta(conv.canal_id, conta);
      if (canal.status === 'pausado') throw new UserError(`O ${NOMES[canal.tipo]} está pausado. Retome em Canais para enviar.`);
      await enviarPeloCanal(admin, canal, conv.contato_externo, String(m.content));
      return json({ ok: true, canal: canal.tipo });
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

      // WhatsApp e Instagram: do Profissional em diante, com limite de contas
      if (tipo !== 'discord') {
        const plan = planOf(await profileOf(conta));
        if (!plan.canaisMeta) throw new UserError('WhatsApp e Instagram fazem parte do plano Profissional em diante.', 402);
        const { count } = await admin.from('canais').select('id', { count: 'exact', head: true })
          .eq('owner_id', conta).in('tipo', ['whatsapp', 'instagram']);
        if ((count ?? 0) >= plan.canaisMeta) {
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

      const { data: existente } = await admin.from('canais').select('id, owner_id').eq('tipo', tipo).eq('externo_id', dados.externo_id).maybeSingle();
      if (existente && existente.owner_id !== conta) throw new UserError('Esta conta já está conectada ao Helpy por outra empresa.', 409);

      const linha = {
        owner_id: conta,
        assistant_id: assistantId,
        tipo,
        status: 'ativo',
        nome: dados.nome.slice(0, 120),
        externo_id: dados.externo_id,
        config: dados.config ?? {},
        erro: null,
      };
      const { data: canal, error } = existente
        ? await admin.from('canais').update(linha).eq('id', existente.id).select('*').single()
        : await admin.from('canais').insert(linha).select('*').single();
      if (error) throw error;
      await guardarSegredo(admin, canal.id, { token, ...(appSecret ? { app_secret: appSecret } : {}) });
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
      const { token } = await segredoDo(admin, canal.id);
      try {
        if (canal.tipo === 'whatsapp') await conferirWhatsApp(canal.externo_id, token);
        else if (canal.tipo === 'instagram') await conferirInstagram(token);
        else await conferirDiscord(token);
      } catch (e) {
        const erro = (e as Error).message.slice(0, 500);
        await admin.from('canais').update({ status: 'erro', erro }).eq('id', canal.id);
        return json({ ok: false, erro });
      }
      await admin.from('canais').update({ status: canal.status === 'pausado' ? 'pausado' : 'ativo', erro: null }).eq('id', canal.id);
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
