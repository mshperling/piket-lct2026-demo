/* Public, read-only historical snapshot. Dispatcher decisions stay in this browser. */
window.PiketArchive = true;
window.PiketDemo = (() => {
  const storageKey = 'piket-replay-decisions-v1';
  let decisions = {};
  try { decisions = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
  const snapshot = fetch('./replay-data.json').then(async response => {
    if (!response.ok) throw new Error('Не удалось загрузить исторический срез');
    return response.json();
  });
  async function read(path, query = {}) {
    const data = await snapshot;
    if (path === '/api/models') return data.models;
    if (path === '/api/ingest/status') return {history_end: data.snapshot_date, stream_last_ts: null};
    if (path === '/api/risks') return data.risks;
    if (path === '/api/segments_all') return data.segments_all || {date:data.snapshot_date,objects:{}};
    if (path === '/api/segments') return data.segments?.[query.grp] || {grp:query.grp,date:data.snapshot_date,n_segments:0,segments:[]};
    if (path.startsWith('/api/groups/')) {
      const group = decodeURIComponent(path.split('/').pop());
      if (!data.groups[group]) throw new Error('Для этой группы нет сохранённого среза');
      return data.groups[group];
    }
    if (path === '/api/work_orders') return {...data.work_orders, items:data.work_orders.items.map(item => ({...item,status:decisions[item.id]?.decision || item.status,comment:decisions[item.id]?.comment || ''}))};
    if (path === '/api/journal') return {...data.journal,items:data.journal.items.map(item => {
      const id = item.id || `${data.risks.model}:${item.grp}:${item.d.slice(0,10)}`;
      return {...item,decision:decisions[id]?.decision || item.decision || null};
    })};
    if (path === '/api/backtest') {
      const response = await fetch('./evaluation.json');
      if (!response.ok) throw new Error('Результат оценки пока недоступен');
      return response.json();
    }
    throw new Error('Раздел не включён в исторический срез');
  }
  function decide(id,decision,comment) {
    const next = {...decisions,[id]:{decision,comment,updated_at:new Date().toISOString()}};
    try { localStorage.setItem(storageKey,JSON.stringify(next)); }
    catch { throw new Error('Браузер не разрешил сохранить решение. Разрешите локальное хранение данных.'); }
    decisions = next;
    return {decision};
  }
  return {enabled:true,read,decide};
})();
