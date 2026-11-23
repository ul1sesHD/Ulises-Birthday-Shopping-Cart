// Genera el HTML del calendario de diciembre de 2026. El diseno vive en css/calendario.css.

const DIAS = [['Dom', 'Domingo'], ['Lun', 'Lunes'], ['Mar', 'Martes'], ['Mié', 'Miércoles'], ['Jue', 'Jueves'], ['Vie', 'Viernes'], ['Sáb', 'Sábado']];
const CUMPLE = 6;
const ANIO = 2026;
const MES = 11; // diciembre

const foto = (clase = 'cal__mini') => `<span class="${clase}" aria-hidden="true"><img src="./assets/img/foto-uli-mini.webp" alt="" width="120" height="120" loading="lazy"></span>`;

export function htmlCalendario(hoy = new Date()) {
  const primerDia = new Date(ANIO, MES, 1).getDay(); // 2 = martes
  const diasMes = new Date(ANIO, MES + 1, 0).getDate();
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const celdas = [];
  for (let i = 0; i < primerDia; i++) celdas.push('<li class="cal__dia cal__dia--vacio" aria-hidden="true"></li>');
  for (let d = 1; d <= diasMes; d++) {
    const fecha = new Date(ANIO, MES, d);
    const semana = fecha.getDay();
    const pasado = fecha < hoySinHora;
    const clases = ['cal__dia'];
    if (semana === 0 || semana === 6) clases.push('cal__dia--fin');
    if (pasado) clases.push('cal__dia--pasado');
    if (d === CUMPLE) {
      clases.push('cal__dia--cumple');
      celdas.push(`<li class="${clases.join(' ')}" aria-label="Domingo 6 de diciembre, cumpleaños de Uli"><span>${d}</span><i class="fa-solid fa-cake-candles cal__pastel" aria-hidden="true"></i>${foto()}</li>`);
      continue;
    }
    const falta = CUMPLE - d;
    const cuenta = d < CUMPLE && !pasado ? `<span class="cal__falta">faltan ${falta}</span>` : '';
    celdas.push(`<li class="${clases.join(' ')}"><span>${d}</span>${cuenta}</li>`);
  }

  const grande = (d, cumple = false) => {
    const fecha = new Date(ANIO, MES, d);
    const nombre = DIAS[fecha.getDay()][0];
    if (cumple) {
      return `<div class="cal__grande cal__grande--cumple"><span class="cal__grande-dia">${nombre}</span><span class="cal__grande-num">${d}</span><i class="fa-solid fa-cake-candles cal__pastel" aria-hidden="true"></i>${foto()}</div>`;
    }
    return `<div class="cal__grande" aria-hidden="true"><span class="cal__grande-dia">${nombre}</span><span class="cal__grande-num">${d}</span></div>`;
  };

  const faltan = Math.round((new Date(ANIO, MES, CUMPLE) - hoySinHora) / 86400000);
  const contador = faltan > 1 ? `<span class="cal__num-faltan">${faltan}</span><span>días para mi cumple</span>`
    : faltan === 1 ? '<span class="cal__num-faltan">1</span><span>día para mi cumple</span>'
    : faltan === 0 ? '<span>Hoy es mi cumple</span>' : '';

  return `
    <div class="cal__hoja">
      <div class="cal__espiral" aria-hidden="true"></div>
      <header class="cal__cabeza">
        <h2 class="cal__mes">Diciembre</h2>
        <span class="cal__anio">2026</span>
      </header>
      <div class="cal__destacado">${grande(5)}${grande(6, true)}${grande(7)}</div>
      ${contador ? `<p class="cal__contador">${contador}</p>` : ''}
      <div class="cal__semana" aria-hidden="true">${DIAS.map(([c, l]) => `<abbr title="${l}">${c}</abbr>`).join('')}</div>
      <ol class="cal__grid" aria-label="Días de diciembre de 2026">${celdas.join('')}</ol>
    </div>`;
}
