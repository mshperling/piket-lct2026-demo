/* Portable inference for fitted PIKET models. No data leaves the browser. */
(function (root) {
  'use strict';
  let activeModel;
  const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
  const number = x => x === null || x === undefined || x === '' ? NaN : Number(x);
  function numericVector(row, model) {
    return model.features.map(f => f === 'grp' ? model.groups.indexOf(row.grp) : number(row[f]));
  }
  function leaf(tree, values) {
    while (Array.isArray(tree)) {
      let x = values[tree[0]], goLeft;
      if (Array.isArray(tree[1])) {
        goLeft = Number.isFinite(x) && x >= 0 && tree[1].includes(Math.trunc(x));
      } else {
        if (Number.isNaN(x) && tree[3] === 'None') x = 0;
        const missing = Number.isNaN(x) || (tree[3] === 'Zero' && Math.abs(x) <= 1e-35);
        goLeft = missing ? Boolean(tree[2]) : x <= tree[1];
      }
      tree = tree[goLeft ? 4 : 5];
    }
    return tree;
  }
  function baseScore(row, model) {
    if (model.kind === 'lightgbm') {
      const values = numericVector(row, model);
      return sigmoid(model.trees.reduce((sum, tree) => sum + leaf(tree, values), 0));
    }
    if (model.kind === 'catboost') {
      const floats = model.float_names.map(f => {
        const x = number(row[f]);
        return Math.fround(Number.isFinite(x) ? x : -9999);
      });
      const bins = model.float_borders.map((borders, i) => {
        const x = floats[model.float_indices[i]];
        return borders.reduce((n, border) => n + (x > border ? 1 : 0), 0);
      });
      const key = model.projection_indices.map(i => bins[i]).join(',');
      const ctr = model.ctr_tables[row.grp] || model.ctr_tables.__UNKNOWN__;
      bins.push(...ctr[key]);
      let split = 0, offset = 0, sum = 0;
      for (const depth of model.tree_depth) {
        let index = 0;
        for (let d = 0; d < depth; d++, split++) {
          const value = bins[model.split_feature[split]] ^ model.split_xor[split];
          if (value >= model.split_border[split]) index |= 1 << d;
        }
        sum += model.leaves[offset + index];
        offset += 1 << depth;
      }
      return sigmoid(model.scale * sum + model.bias);
    }
    const values = numericVector(row, model).map((v, i) => Number.isFinite(v) ? v : model.impute[i]);
    if (model.kind === 'logistic') {
      return sigmoid(model.intercept + values.reduce((sum, x, i) => sum + model.coef[i] * (x - model.mean[i]) / model.scale[i], 0));
    }
    if (model.kind === 'extra_trees') {
      const x = values.map(Math.fround);
      return model.trees.reduce((sum, tree) => {
        let i = 0;
        while (tree.left[i] !== -1) i = x[tree.feature[i]] <= tree.threshold[i] ? tree.left[i] : tree.right[i];
        return sum + tree.value[i];
      }, 0) / model.trees.length;
    }
    throw new Error('Неизвестный формат модели.');
  }
  async function loadModel(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Не удалось загрузить модель. Повторите попытку.');
    const model = await response.json();
    if (!model.version || !Array.isArray(model.models) || model.models.length !== 8) throw new Error('Файл модели повреждён.');
    activeModel = model;
    return model;
  }
  function parseCSV(text) {
    if (typeof text !== 'string' || text.length > 15000000) throw new Error('Максимальный размер CSV: 15 МБ.');
    text = text.replace(/^\uFEFF/, '');
    const headerLine = text.split(/\r?\n/, 1)[0];
    const delimiter = (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : ',';
    const records = [];
    let record = [], value = '', quoted = false, closedQuote = false;
    const saveRecord = () => {
      record.push(value); value = ''; closedQuote = false;
      if (record.some(v => v.trim() !== '')) records.push(record);
      record = [];
      if (records.length > 10001) throw new Error('В одном файле допускается до 10 000 строк.');
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { value += '"'; i++; }
          else { quoted = false; closedQuote = true; }
        } else value += ch;
      } else if (ch === '"' && value === '' && !closedQuote) quoted = true;
      else if (ch === delimiter) { record.push(value); value = ''; closedQuote = false; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; saveRecord(); }
      else if (closedQuote && ch.trim()) throw new Error('Некорректные кавычки в CSV.');
      else if (ch === '"') throw new Error('Некорректные кавычки в CSV.');
      else value += ch;
    }
    if (quoted) throw new Error('В CSV не закрыты кавычки.');
    if (value !== '' || record.length || closedQuote) saveRecord();
    if (records.length < 2) throw new Error('В CSV нет строк данных. Скачайте пример или заполните шаблон.');
    const headers = records.shift().map(v => v.trim());
    if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Заголовки столбцов должны быть заполнены и не повторяться.');
    return records.map((values, i) => {
      if (values.length !== headers.length) throw new Error(`Строка ${i + 2}: число полей не совпадает с заголовком.`);
      const row = Object.create(null);
      headers.forEach((h, j) => { row[h] = values[j].trim(); });
      return row;
    });
  }
  function validateRows(rows, model) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('Допускается от 1 до 10 000 строк.');
    const required = ['d', ...model.features];
    const missing = required.filter(f => !Object.hasOwn(rows[0], f));
    if (missing.length) throw new Error(`Нужна таблица подготовленных признаков. Не хватает полей: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}. Скачайте шаблон.`);
    const keys = new Set(), unknown = new Set();
    const normalized = rows.map((row, i) => {
      if (required.some(f => !Object.hasOwn(row, f))) throw new Error(`Строка ${i + 2}: не хватает обязательных полей.`);
      const clean = Object.create(null);
      clean.grp = String(row.grp || '').trim(); clean.d = String(row.d || '').trim();
      if (!/^[A-Za-zА-Яа-яЁё0-9_.-]{1,80}$/.test(clean.grp)) throw new Error(`Строка ${i + 2}: некорректный идентификатор группы.`);
      const stamp = Date.parse(clean.d + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.d) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== clean.d) throw new Error(`Строка ${i + 2}: дата должна быть в формате ГГГГ-ММ-ДД.`);
      if (clean.d < model.model_cutoff) throw new Error(`Строка ${i + 2}: эта версия модели применяется с ${model.model_cutoff}.`);
      const key = clean.grp + '/' + clean.d;
      if (keys.has(key)) throw new Error(`Повтор группы и даты: ${clean.grp}, ${clean.d}.`);
      keys.add(key);
      if (!model.groups.includes(clean.grp)) unknown.add(clean.grp);
      for (const f of model.features) if (f !== 'grp') {
        const raw = row[f];
        const value = raw === null || raw === undefined ? '' : String(raw).trim();
        if (/^(?:|NA|NaN|null)$/i.test(value)) clean[f] = null;
        else {
          if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error(`Строка ${i + 2}, ${f}: требуется число или пустое значение.`);
          clean[f] = Number(value);
        }
      }
      return clean;
    });
    return {normalized, unknown};
  }
  function predictRows(rows, model = activeModel) {
    if (!model) throw new Error('Сначала загрузите модель.');
    const {normalized, unknown} = validateRows(rows, model);
    const results = normalized.map(row => {
      const base = model.models.map(m => baseScore(row, m));
      const score = base.reduce((s,x) => s+x,0) / base.length;
      if (!Number.isFinite(score)) throw new Error('Не удалось рассчитать прогноз. Проверьте исходные данные.');
      const plus = days => new Date(Date.parse(row.d + 'T00:00:00Z') + days * 86400000).toISOString().slice(0,10);
      return {grp:row.grp,d:row.d,score,threshold:model.threshold,above_threshold:score >= model.threshold,
              alert:false,window_start:plus(2),window_end:plus(15),model_version:model.version};
    });
    const last = new Map();
    [...results].sort((a,b) => a.d.localeCompare(b.d) || a.grp.localeCompare(b.grp)).forEach(row => {
      const day = Date.parse(row.d + 'T00:00:00Z') / 86400000;
      if (row.above_threshold && (!last.has(row.grp) || day-last.get(row.grp) >= model.cooldown_days)) {
        row.alert = true; last.set(row.grp,day);
      }
    });
    const warnings = ['Повторные заявки ограничены в пределах файла. Заявки до первой загруженной даты не учтены.'];
    if (unknown.size) warnings.push(`Новые для модели группы: ${[...unknown].slice(0,5).join(', ')}. Качество для них отдельно не проверено.`);
    const empty = normalized.filter(row => model.features.filter(f => f !== 'grp').every(f => row[f] === null)).length;
    if (empty) warnings.push(`Строк без числовых наблюдений: ${empty}. Их балл основан на обработке пропусков и не подтверждает исправность объекта.`);
    return {rows:results,warnings,model_version:model.version};
  }
  const api = {loadModel,parseCSV,predictRows,baseScore};
  root.PiketInference = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
