/** Mensagens do Supabase Auth em português, sem jargão. */
export function erroAuth(m = '') {
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered|already exists/i.test(m)) return 'Este e-mail já tem conta. Tente entrar.';
  if (/rate limit|only request this after|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  if (/same.*password|different from the old/i.test(m)) return 'A senha nova precisa ser diferente da atual.';
  if (/weak|at least|characters/i.test(m)) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
  if (/aal2|mfa|factor/i.test(m)) return 'Confirme o código de verificação em duas etapas antes de continuar.';
  if (/expired|invalid.*(token|link|code)|otp/i.test(m)) return 'Este link expirou ou já foi usado. Peça outro.';
  if (/error sending|sending.*email|smtp/i.test(m)) return 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.';
  if (/database error/i.test(m)) return 'Não conseguimos concluir agora. Tente de novo.';
  if (/fetch|network/i.test(m)) return 'Sem conexão. Confira sua internet e tente de novo.';
  return m;
}
