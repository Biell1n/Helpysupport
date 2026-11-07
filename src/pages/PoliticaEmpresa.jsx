import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { chamar } from '@/lib/supabase';
import { EMPRESA } from '@/lib/empresa';

/**
 * Política de privacidade da empresa que usa o Helpy, gerada com os dados dela.
 * Serve de link público (site, bio e o app da Meta, que exige política e
 * instruções de exclusão de dados para publicar o WhatsApp e o Instagram).
 * A empresa é a controladora dos dados; o Helpy é o operador.
 */
export default function PoliticaEmpresa() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    chamar('public-chat', { action: 'politica', token })
      .then(setD)
      .catch((e) => setErro(e.message || 'Página não encontrada.'));
  }, [token]);

  useEffect(() => {
    if (d?.empresa) document.title = `Política de privacidade · ${d.empresa}`;
  }, [d]);

  if (erro) return <main className="politica"><p className="muted">{erro}</p></main>;
  if (!d) return <main className="politica"><div className="skeleton" style={{ height: 240 }} /></main>;

  const contato = d.contatos?.length ? d.contatos.join(' · ') : 'os canais de atendimento da empresa';
  const canais = ['o chat do site', ...(d.canais ?? []).map((c) => ({ whatsapp: 'o WhatsApp', instagram: 'o Instagram (Direct)', discord: 'o Discord' })[c]).filter(Boolean)];
  const listaCanais = canais.length > 1 ? `${canais.slice(0, -1).join(', ')} e ${canais.at(-1)}` : canais[0];
  const operador = `${EMPRESA.responsavel}${EMPRESA.documento ? `, ${EMPRESA.documento}` : ''}`;

  const blocos = [
    ['Quem cuida dos seus dados',
      `${d.empresa} é a responsável (controladora) pelos dados que você passa no atendimento. O atendimento automático é feito pelo assistente virtual ${d.assistente}, que funciona na plataforma Helpy (${operador}), que trata os dados só para prestar esse serviço à ${d.empresa} (operadora).`],
    ['O que é coletado',
      `As mensagens que você manda e recebe por ${listaCanais}; o nome, telefone, e-mail ou usuário que aparecem na conversa ou que você informar${d.vende ? '; os itens, valores, endereço de entrega e a situação dos pedidos' : ''}${d.agenda ? '; os horários que você marcar' : ''}; e dados técnicos de segurança, como data e hora e um código da rede (sem guardar o endereço completo).`],
    ['Para que é usado',
      `Para responder suas dúvidas, ${[d.vende && 'registrar pedidos', d.agenda && 'marcar horários', 'passar o atendimento para alguém da equipe quando você pedir'].filter(Boolean).join(', ')}, evitar abusos e melhorar o atendimento. Seus dados não são vendidos nem usados para propaganda de terceiros.`],
    ['Com quem é compartilhado',
      `Com a equipe da ${d.empresa}; com o Helpy, que guarda e processa as conversas; com o provedor de inteligência artificial que gera as respostas (sem uso dos dados para treinar modelos)${(d.canais ?? []).some((c) => c === 'whatsapp' || c === 'instagram') ? '; com a Meta, quando a conversa é pelo WhatsApp ou Instagram' : ''}${d.vende ? '; e com a instituição de pagamento, quando você paga pelo chat' : ''}. Todos tratam os dados só para essas finalidades.`],
    ['Por quanto tempo',
      'Pelo tempo necessário para o atendimento e para as obrigações legais da empresa. Você pode pedir a exclusão antes disso, como explicado abaixo.'],
    ['Seus direitos (LGPD)',
      `Você pode pedir para ver, corrigir, levar para outro lugar ou apagar seus dados, saber com quem foram compartilhados e retirar um consentimento. Fale com a ${d.empresa} por ${contato}.`],
    ['Como pedir a exclusão dos seus dados',
      `Mande uma mensagem para a ${d.empresa} por ${contato}, ou no próprio atendimento, pedindo para apagar seus dados e dizendo o nome ou o número usado na conversa. A empresa apaga as conversas e os dados de contato em até 15 dias, menos o que a lei obriga a guardar (por exemplo, registros de venda).`],
  ];

  return (
    <main className="politica">
      <h1>Política de privacidade</h1>
      <p className="muted">{d.empresa} · atendimento pelo assistente {d.assistente}</p>
      <div className="stack stack-lg" style={{ marginTop: 28 }}>
        {blocos.map(([h, p]) => (
          <section key={h}>
            <h2>{h}</h2>
            <p className="muted">{p}</p>
          </section>
        ))}
      </div>
      <p className="faint" style={{ marginTop: 36, fontSize: 13 }}>Página gerada pelo Helpy com os dados informados pela {d.empresa}.</p>
    </main>
  );
}
