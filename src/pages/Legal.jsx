import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

const TEXTOS = {
  termos: {
    titulo: 'Termos de uso',
    blocos: [
      ['O serviço', 'O Helpy permite criar atendentes virtuais que conversam com os clientes do seu negócio usando inteligência artificial, consultam dados que você cadastra, marcam horários e abrem chamados para a sua equipe.'],
      ['Sua responsabilidade', 'Você é responsável pelas informações que coloca no assistente e nas tabelas, e por revisar o que ele responde. Respostas de IA podem conter erros; configure o assistente para encaminhar a uma pessoa os assuntos sensíveis.'],
      ['Planos e cobrança', 'Os planos têm cotas mensais de atendimentos. Quando a cota acaba, o atendente passa a registrar recados até a renovação ou a compra de um pacote extra.'],
      ['Uso proibido', 'Não é permitido usar o Helpy para spam, fraude, coleta de dados sensíveis sem consentimento ou qualquer finalidade ilegal.'],
    ],
  },
  privacidade: {
    titulo: 'Política de privacidade',
    blocos: [
      ['O que guardamos', 'Os dados da sua conta, a configuração dos assistentes, as tabelas que você cria e as conversas dos seus clientes com o atendente.'],
      ['Para que usamos', 'Para o atendimento funcionar: as mensagens são processadas por um provedor de inteligência artificial apenas para gerar as respostas.'],
      ['Seus clientes', 'Conversas ficam disponíveis para você no painel. O visitante é identificado por um código salvo no navegador dele, sem cadastro obrigatório.'],
      ['Seus direitos', 'Você pode pedir a exclusão da sua conta e dos dados a qualquer momento, conforme a LGPD.'],
    ],
  },
};

export default function Legal({ tipo }) {
  const t = TEXTOS[tipo];
  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-in row">
          <Link to="/" aria-label="Helpy, início"><Logo size={28} /></Link>
        </div>
      </header>
      <main className="lp-in" style={{ maxWidth: 720, padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 40, marginBottom: 8 }}>{t.titulo}</h1>
        <p className="faint" style={{ marginBottom: 32 }}>Versão resumida. Revise com um advogado antes de cobrar clientes.</p>
        <div className="stack stack-lg">
          {t.blocos.map(([h, p]) => (
            <section key={h}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>{h}</h2>
              <p className="muted">{p}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
