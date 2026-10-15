// ============================================================
// Helpy · servidor ligado no Discord
//
// O Discord só entrega as mensagens digitadas livremente para um bot que
// fica conectado o tempo todo (o "gateway"). Este programa faz só isso:
// fica conectado e, quando alguém escreve no tópico de um ticket do Helpy,
// repassa a mensagem para o Helpy (a mesma função do chat), que responde
// com o assistente ou registra a resposta da equipe.
//
// Sem dependências: Node 22 ou mais novo.
//
//   HELPY_URL          endereço da função (…/functions/v1/public-chat)
//   HELPY_GATEWAY_KEY  a chave que o Helpy conhece (DISCORD_GATEWAY_KEY)
//
// O token do bot não fica aqui: o programa pede ao Helpy quando liga.
// ============================================================

const URL_HELPY = process.env.HELPY_URL;
const CHAVE = process.env.HELPY_GATEWAY_KEY;
const VERSAO = '1';
if (!URL_HELPY || !CHAVE) {
  console.error('Faltam HELPY_URL e HELPY_GATEWAY_KEY.');
  process.exit(1);
}

// servidores + mensagens dos servidores + conteúdo das mensagens
const INTENCOES = (1 << 0) | (1 << 9) | (1 << 15);
const API = process.env.DISCORD_API ?? 'https://discord.com/api/v10';

const log = (...a) => console.log(new Date().toISOString(), ...a);
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Fala com o Helpy (a função do Supabase). */
async function helpy(corpo, tentativas = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${URL_HELPY}?discord=gateway`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(30000),
      });
      if (r.status === 401) throw Object.assign(new Error('O Helpy recusou a chave (HELPY_GATEWAY_KEY).'), { fatal: true });
      if (!r.ok) throw new Error(`Helpy respondeu ${r.status}`);
      return await r.json();
    } catch (e) {
      if (e.fatal || i >= tentativas) throw e;
      await esperar(1000 * i * i);
    }
  }
}

// ------------------------------------------------------------
// Estado da conexão
// ------------------------------------------------------------
let token = null;
let eu = null; // id do bot
let ws = null;
let sessao = null; // para retomar sem perder mensagens
let urlRetomar = null;
let seq = null;
let batida = null;
let respondeu = true;
let servidores = 0;
/** tópicos criados pelo bot (os tickets) */
const topicos = new Set();

function guardarTopico(t) {
  if (!t?.id) return;
  if (t.owner_id === eu && (t.type === 12 || t.type === 11)) topicos.add(t.id);
}

async function pegarToken() {
  for (;;) {
    try {
      const r = await helpy({ tipo: 'config', info: { versao: VERSAO } });
      if (r.pronto && r.token) return r.token;
      log('Helpy ainda sem o token do bot:', r.motivo ?? '?', '— tento de novo em 1 min');
    } catch (e) {
      log('Não consegui falar com o Helpy:', e.message, e.fatal ? '' : '— tento de novo em 1 min');
    }
    await esperar(60000);
  }
}

async function urlDoGateway() {
  const r = await fetch(`${API}/gateway/bot`, { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(15000) });
  if (r.status === 401) {
    token = null;
    throw new Error('O Discord recusou o token do bot.');
  }
  if (!r.ok) throw new Error(`Discord /gateway/bot respondeu ${r.status}`);
  const d = await r.json();
  return d.url;
}

function mandar(op, d) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op, d }));
}

function pararBatida() {
  if (batida) clearInterval(batida);
  batida = null;
}

/** Conecta (ou reconecta, retomando a sessão quando dá). */
async function conectar(retomar) {
  pararBatida();
  if (!token) token = await pegarToken();
  const base = retomar && urlRetomar ? urlRetomar : await urlDoGateway();
  log(retomar ? 'Retomando a conexão…' : 'Conectando no Discord…');
  ws = new WebSocket(`${base}/?v=10&encoding=json`);

  ws.addEventListener('message', (ev) => {
    let p;
    try {
      p = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (p.s != null) seq = p.s;

    switch (p.op) {
      case 10: { // HELLO
        const intervalo = p.d.heartbeat_interval;
        respondeu = true;
        setTimeout(() => mandar(1, seq), Math.random() * intervalo);
        batida = setInterval(() => {
          if (!respondeu) {
            log('O Discord parou de responder; reconectando.');
            ws.close(4000);
            return;
          }
          respondeu = false;
          mandar(1, seq);
        }, intervalo);
        if (retomar && sessao) mandar(6, { token, session_id: sessao, seq });
        else {
          mandar(2, {
            token, intents: INTENCOES,
            properties: { os: 'linux', browser: 'helpy', device: 'helpy' },
          });
        }
        break;
      }
      case 11: // a batida foi recebida
        respondeu = true;
        break;
      case 1: // o Discord pediu uma batida agora
        mandar(1, seq);
        break;
      case 7: // o Discord pediu para reconectar
        ws.close(4000);
        break;
      case 9: // sessão inválida
        if (!p.d) sessao = null;
        setTimeout(() => ws.close(4000), 1000 + Math.random() * 4000);
        break;
      case 0:
        despachar(p.t, p.d);
        break;
    }
  });

  ws.addEventListener('close', async (ev) => {
    pararBatida();
    const codigo = ev.code;
    // códigos que não adianta repetir do mesmo jeito
    if (codigo === 4004) {
      log('O Discord recusou o token do bot. Pegando de novo no Helpy em 1 min.');
      token = null;
      sessao = null;
      await esperar(60000);
    } else if (codigo === 4014) {
      log('Falta ligar "Message Content Intent" (Intenção de conteúdo da mensagem) na página Bot do Discord Developer Portal. Tento de novo em 5 min.');
      sessao = null;
      await esperar(300000);
    } else if (codigo === 4013) {
      log('Intents inválidas.');
      await esperar(300000);
    } else {
      if ([4007, 4009].includes(codigo)) sessao = null;
      log(`Conexão fechada (${codigo}). Reconectando…`);
      await esperar(1000 + Math.random() * 4000);
    }
    conectar(!!sessao).catch(reconectarDepois);
  });

  ws.addEventListener('error', () => { /* o "close" vem logo depois e reconecta */ });
}

function reconectarDepois(e) {
  log('Falhou ao conectar:', e?.message ?? e, '— tento de novo em 15 s');
  setTimeout(() => conectar(false).catch(reconectarDepois), 15000);
}

// ------------------------------------------------------------
// Eventos do Discord
// ------------------------------------------------------------
function despachar(tipo, d) {
  switch (tipo) {
    case 'READY':
      eu = d.user.id;
      sessao = d.session_id;
      urlRetomar = d.resume_gateway_url;
      servidores = d.guilds?.length ?? 0;
      log(`Conectado como ${d.user.username} em ${servidores} servidor(es).`);
      sinalDeVida();
      break;
    case 'RESUMED':
      log('Conexão retomada.');
      break;
    case 'GUILD_CREATE':
      for (const t of d.threads ?? []) guardarTopico(t);
      break;
    case 'THREAD_CREATE':
    case 'THREAD_UPDATE':
      guardarTopico(d);
      break;
    case 'THREAD_DELETE':
      topicos.delete(d.id);
      break;
    case 'THREAD_LIST_SYNC':
      for (const t of d.threads ?? []) guardarTopico(t);
      break;
    case 'MESSAGE_CREATE':
      recebida(d);
      break;
  }
}

function recebida(m) {
  if (!topicos.has(m.channel_id)) return; // só os tickets
  if (m.author?.bot || m.webhook_id) return; // o próprio bot e as respostas da equipe pelo site
  if (m.type !== 0 && m.type !== 19) return; // mensagem comum ou resposta
  helpy({
    tipo: 'mensagem',
    mensagem: {
      id: m.id,
      channel_id: m.channel_id,
      guild_id: m.guild_id,
      content: m.content ?? '',
      anexos: m.attachments?.length ?? 0,
      author: { id: m.author.id, username: m.author.username, global_name: m.author.global_name ?? null },
      member: m.member ? { nick: m.member.nick ?? null, roles: m.member.roles ?? [] } : undefined,
    },
  }).catch((e) => log('Não consegui repassar a mensagem:', e.message));
}

// ------------------------------------------------------------
// Sinal de vida: o painel e o /helpy-config mostram "ligado"
// ------------------------------------------------------------
async function sinalDeVida() {
  try {
    await helpy({ tipo: 'ping', info: { versao: VERSAO, servidores, tickets: topicos.size, conectado: ws?.readyState === WebSocket.OPEN } }, 1);
  } catch (e) {
    log('Sinal de vida falhou:', e.message);
  }
}
setInterval(sinalDeVida, 120000);

process.on('SIGTERM', () => {
  log('Desligando.');
  try {
    ws?.close(1000);
  } catch { /* já fechado */ }
  process.exit(0);
});

if (typeof WebSocket === 'undefined') {
  console.error('Este Node não tem WebSocket. Use o Node 22 ou mais novo.');
  process.exit(1);
}
conectar(false).catch(reconectarDepois);
