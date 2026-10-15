import { supabase } from '@/lib/supabase';

const BUCKET = 'fotos';
const LADO = 512; // a foto é guardada quadrada, no máximo 512 × 512

/** Corta no centro, reduz e converte para WebP (fica leve e sem os dados escondidos da foto original). */
async function prepararImagem(arquivo) {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  if (arquivo.size > 15 * 1024 * 1024) throw new Error('A imagem passa de 15 MB. Escolha uma menor.');
  const bitmap = await createImageBitmap(arquivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const saida = Math.min(LADO, lado);
  const c = document.createElement('canvas');
  c.width = saida;
  c.height = saida;
  c.getContext('2d').drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, saida, saida);
  bitmap.close?.();
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.88));
  if (!blob) throw new Error('Não deu para ler essa imagem.');
  return blob;
}

/** Caminho dentro do bucket a partir do endereço público (para apagar a foto antiga). */
const caminhoDe = (url) => url?.split(`/object/public/${BUCKET}/`)[1] ?? null;

/**
 * Sobe a foto na pasta do usuário e devolve o endereço público.
 * "nome" identifica de quem é (perfil, assistente-<id>); "anterior" é apagada depois de trocar.
 */
export async function enviarFoto(userId, nome, arquivo, anterior) {
  const blob = await prepararImagem(arquivo);
  const caminho = `${userId}/${nome}-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, blob, { contentType: 'image/webp', cacheControl: '31536000' });
  if (error) throw new Error('Não deu para enviar a foto. Tente de novo.');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  if (anterior) await apagarFoto(anterior);
  return data.publicUrl;
}

export async function apagarFoto(url) {
  const c = caminhoDe(url);
  if (c) await supabase.storage.from(BUCKET).remove([c]).catch(() => {});
}
