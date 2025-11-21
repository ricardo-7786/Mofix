export function todayKSTYYYYMMDD() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const [y, m, d] = fmt.format(new Date()).split('-');
    return `${y}${m}${d}`;
  }
  