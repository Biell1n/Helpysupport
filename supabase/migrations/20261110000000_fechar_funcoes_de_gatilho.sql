-- Funções de gatilho não são chamáveis pela API (só rodam como gatilho).
revoke execute on function public.helpy_contar_conversa() from public, anon, authenticated;
revoke execute on function public.helpy_contar_mensagem() from public, anon, authenticated;
revoke execute on function public.helpy_nome_da_resposta() from public, anon, authenticated;
revoke execute on function public.helpy_trava_conversa() from public, anon, authenticated;
