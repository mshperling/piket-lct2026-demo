'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model, result, currentFile = '', page = 0;
const perPage = 100;
let pending = null;
const worker = new Worker('./worker.js');
const ready = new Promise((resolve, reject) => {
  worker.onmessage = event => {
    if (event.data.type === 'ready') {
      model = event.data.model;
      $('model-version').textContent = `${model.label} · ${model.version} · с ${model.model_cutoff}`;
      $('status').textContent = 'Модель готова. CSV остаётся на вашем устройстве.';
      resolve(model);
    } else if (event.data.type === 'result' && pending) {
      pending.resolve(event.data.result); pending = null;
    } else if (event.data.type === 'error') {
      const error = new Error(event.data.message);
      if (pending) { pending.reject(error); pending = null; }
      else { $('status').textContent = 'Модель не загрузилась.'; showError(error.message); reject(error); }
    }
  };
  worker.onerror = () => {
    const error = new Error('Не удалось запустить расчёт. Обновите страницу и попробуйте снова.');
    if (pending) { pending.reject(error); pending = null; }
    showError(error.message); reject(error);
  };
});
ready.catch(() => {});
function showError(message) {
  $('error').textContent = message;
  $('error').hidden = !message;
}
function renderRows() {
  const start = page * perPage;
  const rows = [...result.rows].sort((a, b) => Number(b.alert) - Number(a.alert) || b.score - a.score).slice(start, start + perPage);
  $('results-body').innerHTML = rows.map(row => `<tr><td>${esc(row.grp)}</td><td>${esc(row.d)}</td><td class="score">${Number(row.score).toFixed(4).replace('.', ',')}</td><td><span class="signal ${row.alert ? 'yes' : ''}">${row.alert ? 'Проверить' : row.above_threshold ? 'Повторный сигнал' : 'Ниже порога'}</span></td></tr>`).join('');
  let pager = $('pager');
  if (!pager) {
    pager = document.createElement('div'); pager.id = 'pager'; pager.className = 'pager';
    $('results-body').closest('.table-wrap').after(pager);
  }
  pager.innerHTML = result.rows.length > perPage ? `<button id="prev-page" ${page === 0 ? 'disabled' : ''}>← Назад</button><span>${start + 1}–${Math.min(start + perPage, result.rows.length)} из ${result.rows.length}</span><button id="next-page" ${start + perPage >= result.rows.length ? 'disabled' : ''}>Далее →</button>` : '';
  if ($('prev-page')) $('prev-page').onclick = () => { page--; renderRows(); };
  if ($('next-page')) $('next-page').onclick = () => { page++; renderRows(); };
}
async function calculate(text, name) {
  $('sample').disabled = true;
  $('csv-file').disabled = true;
  $('export').disabled = true;
  $('results').hidden = true;
  result = null;
  showError('');
  $('file-name').textContent = name;
  $('status').textContent = 'Проверяем таблицу и рассчитываем прогноз…';
  try {
    await ready;
    const started = performance.now();
    result = await new Promise((resolve, reject) => { pending = {resolve,reject}; worker.postMessage({text}); });
    page = 0;
    currentFile = name;
    const alerts = result.rows.filter(row => row.alert).length;
    $('row-count').textContent = result.rows.length.toLocaleString('ru-RU');
    renderRows();
    $('result-note').textContent = [`Порог: ${Number(model.threshold).toFixed(4).replace('.', ',')}. Горизонт: 2–15 дней.`, model.score_note, ...(result.warnings || []), 'Окно прогноза и версия модели включены в выгрузку.'].filter(Boolean).join(' ');
    $('results').hidden = false;
    $('status').textContent = `${name} · ${result.rows.length} строк · к проверке: ${alerts} · ${((performance.now() - started) / 1000).toFixed(2)} с`;
  } catch (error) {
    $('status').textContent = 'Файл не принят. Исправьте данные и загрузите снова.';
    showError(error.message || 'Не удалось рассчитать прогноз.');
  } finally {
    $('sample').disabled = false;
    $('csv-file').disabled = false;
    $('export').disabled = !result;
  }
}
async function acceptFile(file) {
  if (!file || $('csv-file').disabled) return;
  $('results').hidden = true; result = null;
  if (!/\.csv$/i.test(file.name)) { showError('Нужен CSV с подготовленными признаками. Скачайте шаблон ниже.'); return; }
  if (file.size > 15 * 1024 * 1024) { showError('Файл больше 15 МБ. Разделите таблицу на меньшие части.'); return; }
  await calculate(await file.text(), file.name);
}
$('csv-file').addEventListener('change', event => acceptFile(event.target.files[0]));
$('sample').addEventListener('click', async () => {
  $('sample').disabled = true;
  showError('');
  try {
    const response = await fetch('../inference/example.csv');
    if (!response.ok) throw new Error('Не удалось загрузить архивный пример.');
    await calculate(await response.text(), 'Архив · 01.06.2026');
  } catch(error) { showError(error.message); }
  finally { $('sample').disabled = false; }
});
const drop = document.querySelector('.upload-area');
for (const name of ['dragenter','dragover']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add('drag-over'); });
for (const name of ['dragleave','drop']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('drag-over'); });
drop.addEventListener('drop', event => {
  const files = event.dataTransfer.files;
  if ($('csv-file').disabled) return;
  if (files.length !== 1) { showError('Загрузите один CSV за раз.'); return; }
  acceptFile(files[0]);
});
$('export').addEventListener('click', () => {
  if (!result) return;
  const columns = ['grp','d','score','threshold','above_threshold','alert','window_start','window_end','model_version'];
  const cell = value => {
    let s = String(value ?? '');
    if (typeof value === 'string' && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '\uFEFF' + [columns.join(','), ...result.rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'piket-predictions.csv'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
