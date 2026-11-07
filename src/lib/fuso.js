// Horários da agenda sempre no fuso da empresa (agenda_config.fuso), e não no
// do aparelho de quem abre: um funcionário em outro estado vê e marca a mesma hora.

export const FUSO_PADRAO = 'America/Sao_Paulo';

/** Relógio do fuso naquele instante, como "AAAA-MM-DDTHH:MM:SS" (sem Z). new Date() dele dá esse relógio. */
export function paredeIso(instante, fuso = FUSO_PADRAO) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instante));
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Agora, no relógio do fuso. */
export const agoraNoFuso = (fuso) => new Date(paredeIso(Date.now(), fuso));

/** Data de hoje no fuso, "AAAA-MM-DD". */
export const hojeNoFuso = (fuso) => paredeIso(Date.now(), fuso).slice(0, 10);

/** Um Date com o relógio do fuso (vindo de paredeIso ou de dia + hora digitados) → o instante real. */
export function paraInstante(parede, fuso = FUSO_PADRAO) {
  const utc = Date.UTC(parede.getFullYear(), parede.getMonth(), parede.getDate(), parede.getHours(), parede.getMinutes(), parede.getSeconds());
  const visto = new Date(`${paredeIso(utc, fuso)}Z`).getTime();
  return new Date(utc - (visto - utc));
}
