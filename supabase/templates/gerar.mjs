// Gera os e-mails do login (Supabase Auth) com a cara do Helpy.
//
//   node supabase/templates/gerar.mjs
//
// Cada arquivo .html sai pronto para colar em Authentication → Emails →
// Templates (o assunto de cada um está em ASSUNTOS, e também no
// supabase/config.toml). Só tabelas e estilo em linha: é o que funciona
// em Gmail, Outlook e Apple Mail. A carinha é feita de HTML, sem imagem,
// para aparecer mesmo com imagens bloqueadas.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const AZUL = '#1F66F4';
const MARINHO = '#0B1A2C';
const CINZA = '#5B6878';
const PAPEL = '#F2F6FA';
const FONTE = "'Archivo', 'Segoe UI', Helvetica, Arial, sans-serif";

// a carinha: o balão azul com os dois olhinhos
const carinha = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
  <tr>
    <td width="40" height="34" align="center" valign="middle" bgcolor="${AZUL}" style="width:40px;height:34px;background:${AZUL};border-radius:11px;line-height:0;font-size:0;">
      <span style="display:inline-block;width:6px;height:15px;background:#ffffff;border-radius:3px;margin:0 2px;"></span><span style="display:inline-block;width:6px;height:15px;background:#ffffff;border-radius:3px;margin:0 2px;"></span>
    </td>
    <td style="padding-left:9px;font-family:${FONTE};font-size:22px;font-weight:800;letter-spacing:-0.6px;color:${MARINHO};">helpy</td>
  </tr>
</table>`;

const botao = (texto, url = '{{ .ConfirmationURL }}') => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td bgcolor="${MARINHO}" style="border-radius:999px;background:${MARINHO};">
      <a href="${url}" style="display:inline-block;padding:15px 28px;font-family:${FONTE};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${texto} &rarr;</a>
    </td>
  </tr>
</table>`;

const codigo = (rotulo) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px;">
  <tr>
    <td style="padding:16px 22px;border:1px dashed #C8D6E4;border-radius:14px;background:${PAPEL};font-family:'DM Mono', 'SFMono-Regular', Menlo, Consolas, monospace;font-size:28px;letter-spacing:6px;color:${MARINHO};">{{ .Token }}</td>
  </tr>
</table>
<p style="margin:0;font-family:${FONTE};font-size:13px;color:${CINZA};">${rotulo}</p>`;

const oi = '{{ if .Data.full_name }}Oi, {{ .Data.full_name }}!{{ else }}Oi!{{ end }}';

function pagina({ preview, titulo, texto, acao, rodape }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:${PAPEL};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPEL}" style="background:${PAPEL};">
  <tr>
    <td align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr><td style="padding:0 6px 20px;">${carinha}</td></tr>
        <tr>
          <td bgcolor="#ffffff" style="background:#ffffff;border-radius:22px;padding:36px 34px 32px;border:1px solid #E1E9F1;">
            <p style="margin:0 0 6px;font-family:${FONTE};font-size:14px;color:${CINZA};">${oi}</p>
            <h1 style="margin:0 0 14px;font-family:${FONTE};font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.6px;color:${MARINHO};">${titulo}</h1>
            <p style="margin:0;font-family:${FONTE};font-size:15px;line-height:1.6;color:#4A5C71;">${texto}</p>
            ${acao}
            <p style="margin:22px 0 0;padding-top:18px;border-top:1px solid #E1E9F1;font-family:${FONTE};font-size:12.5px;line-height:1.6;color:#8394A8;">${rodape}</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 10px 0;font-family:${FONTE};font-size:12px;line-height:1.6;color:#8394A8;">
            Helpy &middot; o atendente virtual do seu negócio<br>
            Você recebeu este e-mail porque ele foi usado no Helpy.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}

const linkManual = 'Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="{{ .ConfirmationURL }}" style="color:' + AZUL + ';word-break:break-all;">{{ .ConfirmationURL }}</a>';

export const MODELOS = {
  confirmacao: {
    assunto: 'Confirme seu e-mail no Helpy',
    html: pagina({
      preview: 'Falta um clique para ativar sua conta.',
      titulo: 'Confirme seu e-mail',
      texto: 'Que bom ter você aqui. Confirme que este e-mail é seu para ativar a conta e começar a montar o seu atendente.',
      acao: botao('Confirmar e-mail'),
      rodape: `Não criou uma conta no Helpy? Pode ignorar este e-mail.<br><br>${linkManual}`,
    }),
  },
  convite: {
    assunto: 'Você foi convidado para o Helpy',
    html: pagina({
      preview: 'Aceite o convite e entre na equipe.',
      titulo: 'Você foi convidado',
      texto: 'Uma empresa chamou você para atender os clientes dela pelo Helpy. Aceite o convite para criar sua senha e entrar.',
      acao: botao('Aceitar convite'),
      rodape: `Não esperava este convite? É só ignorar.<br><br>${linkManual}`,
    }),
  },
  link_magico: {
    assunto: 'Seu link para entrar no Helpy',
    html: pagina({
      preview: 'Entre na sua conta com um clique.',
      titulo: 'Seu link para entrar',
      texto: 'Use o botão abaixo para entrar na sua conta. O link vale por pouco tempo e só funciona uma vez.',
      acao: botao('Entrar no Helpy'),
      rodape: `Não pediu para entrar? Ignore este e-mail: ninguém entra sem este link.<br><br>${linkManual}`,
    }),
  },
  troca_email: {
    assunto: 'Confirme o novo e-mail da sua conta',
    html: pagina({
      preview: 'Confirme a troca de e-mail da sua conta Helpy.',
      titulo: 'Confirme o novo e-mail',
      texto: 'Recebemos um pedido para trocar o e-mail da sua conta de <b style="color:#0B1A2C;">{{ .Email }}</b> para <b style="color:#0B1A2C;">{{ .NewEmail }}</b>. Confirme para concluir.',
      acao: botao('Confirmar troca'),
      rodape: `Não pediu essa troca? Não clique no botão e troque sua senha.<br><br>${linkManual}`,
    }),
  },
  nova_senha: {
    assunto: 'Redefina sua senha do Helpy',
    html: pagina({
      preview: 'Crie uma senha nova para a sua conta.',
      titulo: 'Redefinir sua senha',
      texto: 'Alguém (esperamos que você) pediu para trocar a senha da sua conta. Toque no botão para criar uma nova.',
      acao: botao('Criar nova senha'),
      rodape: `Não pediu? Ignore este e-mail: sua senha continua a mesma.<br><br>${linkManual}`,
    }),
  },
  codigo: {
    assunto: 'Seu código de confirmação do Helpy',
    html: pagina({
      preview: 'Use este código para confirmar que é você.',
      titulo: 'Confirme que é você',
      texto: 'Para continuar, digite este código no Helpy:',
      acao: codigo('O código vale por poucos minutos.'),
      rodape: 'Não pediu este código? Troque sua senha: alguém pode estar tentando entrar na sua conta.',
    }),
  },
};

for (const [nome, m] of Object.entries(MODELOS)) writeFileSync(path.join(AQUI, `${nome}.html`), m.html);
writeFileSync(path.join(AQUI, 'assuntos.json'), JSON.stringify(Object.fromEntries(Object.entries(MODELOS).map(([k, m]) => [k, m.assunto])), null, 2) + '\n');
console.log('pronto:', Object.keys(MODELOS).join(', '));
