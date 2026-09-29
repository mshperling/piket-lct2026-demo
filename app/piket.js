
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let token = sessionStorage.getItem('piket-token') || '';
const DEMO = window.PiketDemo.enabled;
async function api(p,q={}) {
  if(DEMO)return PiketDemo.read(p,q);
  const r=await fetch(p+'?'+new URLSearchParams(q),{headers:token?{Authorization:'Bearer '+token}:{}});
  if(!r.ok){let m='';try{m=(await r.json()).detail}catch(e){}if(r.status===401&&!$('#login-dialog').open)$('#login-dialog').showModal();throw new Error(typeof m==='string'?m:'Сервис временно недоступен ('+r.status+')')}
  return r.json();
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x==null?'·':(+x).toFixed(2).replace('.',','),pct=x=>x==null?'·':(100*x).toFixed(1).replace('.',',')+'%';
const LVL={high:'высокий',medium:'средний',low:'низкий',nodata:'нет данных'};const badge=l=>`<span class="badge ${l}"><i></i>${LVL[l]||l}</span>`;
const dS=s=>new Date(String(s).slice(0,10)+'T00:00:00').toLocaleDateString('ru-RU');
const plural=(n,a,b,c)=>{const m=n%10,M=n%100;return(m===1&&M!==11)?a:(m>=2&&m<=4&&(M<10||M>=20))?b:c};
const lvl4=r=>r<0.03?0:r<0.08?1:r<0.15?2:r<0.3?3:4;
const objLabel=(objs,fallback)=>{if(!objs||!objs.length)return 'объект '+fallback;const o=objs[0];const more=objs.length>1?` +${objs.length-1}`:'';return esc(o.name.replace(/^объект\s+/i,''))+more};
let MODELS={},M='',RISKS=null,SEGS=null,WO={items:[]},SEL=null,FILTER='all',WOSEL=null,WOFILTER='all',REQ=0,GROUP_REQ=0,JOURNAL_REQ=0,QUALITY_REQ=0,WOERROR=false;
const modelName=k=>{const m=MODELS[k];return m.family==='power'?'Проблемы электропитания (фазы, ИБП)':m.target==='yB'?'Групповой сбой дымовых датчиков':'Нагрузка сбоев дымовых датчиков'};

/* tabs */
$$('nav[role=tablist] button').forEach(b=>b.addEventListener('click',()=>showTab(b.id)));
function showTab(id){$('#page-name').textContent=({'tab-overview':'Обзор','tab-wo':'Заявки','tab-journal':'Журнал прогнозов','tab-quality':'Качество модели'})[id];$$('nav[role=tablist] button').forEach(x=>(x.setAttribute('aria-selected',x.id===id),x.tabIndex=x.id===id?0:-1));$$('[role=tabpanel]').forEach(p=>p.hidden=p.getAttribute('aria-labelledby')!==id);
  location.hash=id.replace('tab-','');if(id==='tab-wo')renderWO();if(id==='tab-journal')loadJournal();if(id==='tab-quality')loadQuality()}
$$('#ov .seg button').forEach(b=>b.addEventListener('click',()=>{FILTER=b.dataset.f;$$('#ov .seg button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderQueue()}));
$('#q').addEventListener('input',renderQueue);
$$('#wo-filter button').forEach(b=>b.addEventListener('click',()=>{WOFILTER=b.dataset.f;$$('#wo-filter button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderWO()}));
function backToQueue(which){const el=which==='wo'?$('#wo'):$('#ov');el.classList.remove('mobile-card');el.classList.add('mobile-list');const row=el.querySelector('.row[aria-selected=true]');if(row){row.focus();row.scrollIntoView({block:'center'})}}

async function init(){$$('nav[role=tablist] button').forEach(b=>b.disabled=b.id!=='tab-overview');
  $('#connection').textContent=DEMO?'Исторический срез':'Подключение';
  $('#demo-banner').hidden=!DEMO;if(DEMO&&location.pathname.startsWith('/static/'))$('#demo-banner a').hidden=true;
  try{MODELS=await api('/api/models');
    const keys=Object.keys(MODELS).filter(k=>!MODELS[k].level||MODELS[k].level==='2').sort();
    if(!keys.length)throw new Error('Витрины прогнозов ещё не подключены');
    $$('nav[role=tablist] button').forEach(b=>b.disabled=false);const sel=$('#model');sel.replaceChildren();keys.forEach(k=>sel.add(new Option(modelName(k),k)));
    sel.value=MODELS['smoke_yB_w14']?'smoke_yB_w14':keys[0];
    sel.onchange=()=>{$('#date').value=MODELS[sel.value].snapshot_date;loadAll(true)};
    $('#date').value=MODELS[sel.value].snapshot_date;
    if(DEMO){$('#date').min=MODELS[sel.value].snapshot_date;$('#date').max=MODELS[sel.value].snapshot_date;$('#date').disabled=true;$('#session-label').textContent='Личный кабинет диспетчера';$('#account-button').hidden=true;}
    await loadAll(true);
    const tab=location.hash.slice(1);if(['wo','journal','quality'].includes(tab))showTab('tab-'+tab);
  }catch(e){
    $('#connection').textContent='Нет данных';$('#connection').className='connection error';
    $('#ctx').innerHTML='<span>Прогноз недоступен</span>';
    $('#snapshot-label').textContent='Подключите витрины, чтобы увидеть прогноз';
    $('#queue').innerHTML=`<div class="loading-state error-state"><span class="eyebrow">НУЖНЫ ДАННЫЕ</span><h2>Начнём с подключения</h2><p class="muted">${esc(e.message)}.<br>Можно изучить интерфейс на учебном сценарии.</p><a class="btn accent" href="./">Открыть демоверсию →</a><button class="btn ghost" onclick="init()">Проверить подключение</button></div>`;
    $('#card').innerHTML='<p class="empty">Когда появятся прогнозы, здесь будет разбор выбранной группы.</p>';
  }
}
function toLatest(){$('#date').value=MODELS[M].snapshot_date;loadAll(true)}

async function loadAll(autoselect){M=$('#model').value;if(!MODELS[M])return;const d=$('#date').value,meta=MODELS[M],my=++REQ;if(!d)return;SEL=null;GROUP_REQ++;WOSEL=null;$('#wo-detail').innerHTML='<p class="empty">Выберите заявку.</p>';$('#card').innerHTML='<p class="empty">Загружаем новый срез данных…</p>';$('#connection').textContent='Обновляем';$('#connection').className='connection';
  if(RISKS&&RISKS.date!==d){SEL=null;$('#card').innerHTML='<p class="empty">Дата изменена · выберите группу.</p>'}
  $('#ctx').innerHTML=`<span><b>${modelName(M)}</b></span><span>снимок <b>${dS(meta.snapshot_date)}</b></span><span>упреждение <b>${meta.lead_hours} ч</b></span><span>окно <b>${meta.window_days} дн</b></span><span id="ctx-stream"></span><details><summary>Что прогнозируем</summary><div class="small">${esc(meta.target_definition)}. ${meta.threshold_red?`Рабочий порог заявки ${fmt(meta.threshold)} (бюджет ${pct(meta.budget)} группо-дней на калибровке), высокий уровень · от ${fmt(meta.threshold_red)} (${pct(meta.budget_red)}).`:`Порог ${fmt(meta.threshold)}.`} Балл модели · не вероятность поломки: в данных нет подтверждённых отказов, прогнозируются диагностические события СМВУ.</div></details>`;
  const isArchive=d<meta.snapshot_date;$('#archive').hidden=!isArchive;if(isArchive)$('#archive-text').textContent=` · прогноз на ${dS(d)}. Исход в окне уже известен и показывается отдельно от прогноза.`;
  $('#queue').innerHTML='<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  let r,s,wo;try{[r,s,wo]=await Promise.all([api('/api/risks',{model:M,date:d}),api('/api/segments_all',{date:d}).catch(()=>null),api('/api/work_orders',{model:M,date:d}).catch(()=>({items:[],unavailable:true}))])}catch(e){if(my!==REQ)return;RISKS=null;WO={items:[]};$('#counts').innerHTML='';$('#network').innerHTML='';$('#nav-count').textContent='·';$('#nav-orders').textContent='·';$('#connection').textContent='Ошибка загрузки';$('#connection').className='connection error';$('#card').innerHTML='<p class="empty">Нет прогноза для выбранной даты.</p>';$('#queue').innerHTML=`<p class="error">Не удалось загрузить прогноз: ${esc(e.message)}</p> <button class="btn ghost sm" onclick="loadAll()">Повторить</button>`;return}
  if(my!==REQ)return;RISKS=r;SEGS=s;WO=wo;WOERROR=Boolean(wo.unavailable);$('#connection').textContent=DEMO?'Исторический срез':'Снимок загружен';$('#connection').className='connection ready';$('#snapshot-label').textContent='Данные на '+dS(r.date);$('#date').value=r.date;
  api('/api/ingest/status').then(st=>{if(my===REQ&&st&&st.history_end)$('#ctx-stream').innerHTML=`данные СМВУ до <b>${dS(st.history_end)}</b>${st.stream_last_ts?`, поток до <b>${dS(st.stream_last_ts)}</b>`:''}`}).catch(()=>{});
  const it=r.items,hi=it.filter(x=>x.level==='high').length,md=it.filter(x=>x.level==='medium').length,nd=it.filter(x=>x.data_quality&&x.data_quality!=='ok').length,open=(wo.items||[]).filter(x=>x.status==='draft').length;
  const stats=[
    ['high','Проверить в первую очередь',hi,'группы','Высокий уровень приоритета'],
    ['medium','Под наблюдением',md,'группы','Выше рабочего порога'],
    ['','Всего в прогнозе',it.length,'групп',nd?`${nd} без свежих данных`:'По выбранной модели'],
    ['','Ждут решения',WOERROR?'?':open,'заявки',WOERROR?'Не удалось загрузить заявки':'Автоматически созданные черновики']
  ];
  $('#counts').innerHTML=stats.map(([cls,label,n,unit,foot])=>`<div class="summary-stat ${cls}"><div class="stat-label">${cls?`<i class="dot ${cls}"></i>`:''}${label}</div><strong>${n}</strong><small>${unit.startsWith("групп")?plural(n,"группа","группы","групп"):unit.startsWith("заяв")?plural(n,"заявка","заявки","заявок"):unit}</small><div class="stat-foot">${foot}</div></div>`).join('');
  $('#nav-count').textContent=hi+md;$('#nav-orders').textContent=WOERROR?'?':open;
  renderNetwork();renderQueue();
  if(it.length){const first=it.slice().sort(cmpRow)[0];await openGroup(first.grp,{silent:true})}
  const active=$('nav [aria-selected=true]')?.id;if(active==='tab-wo')renderWO();if(active==='tab-journal')loadJournal();if(active==='tab-quality')loadQuality();
}
function renderNetwork(){
  $('#network').innerHTML=RISKS.items.map(x=>{const level=x.data_quality&&x.data_quality!=='ok'?'nodata':x.level;return `<button class="network-node ${esc(level)}" data-grp="${esc(x.grp)}" aria-label="Группа ${esc(x.grp)}, ${LVL[level]}" aria-pressed="${SEL===x.grp}"><i></i><span>${esc(x.grp)}</span></button>`}).join('');
  $$('#network button').forEach(b=>b.onclick=()=>{openGroup(b.dataset.grp);$('#ov').scrollIntoView({block:'start',behavior:'auto'})});
}

const ORDER={high:0,medium:1,low:2};const cmpRow=(a,b)=>(ORDER[a.level]??3)-(ORDER[b.level]??3)||b.risk-a.risk||a.grp.localeCompare(b.grp);

function renderQueue(){if(!RISKS)return;const q=$('#q').value.trim().toLowerCase();
  let it=RISKS.items.filter(x=>FILTER==='all'||x.level===FILTER).filter(x=>!q||x.grp.toLowerCase().includes(q)||String(x.object_id).includes(q)||(x.objects||[]).some(o=>(o.name||'').toLowerCase().includes(q))).slice().sort(cmpRow);
  const woBy=new Set((WO.items||[]).map(x=>x.grp));
  $('#queue').innerHTML=it.length?it.map(x=>{const segs=((SEGS&&SEGS.objects&&SEGS.objects[x.object_id])||[]).filter(s=>s.km!=null);const nod=x.data_quality&&x.data_quality!=='ok';
    const trace=segs.length?`<div class="trace" aria-hidden="true">${segs.map(s=>`<i data-l="${lvl4(s.risk)}"></i>`).join('')}</div>`:`<div class="trace none" aria-hidden="true"></div>`;
    return `<div class="row" role="option" tabindex="0" aria-selected="${SEL===x.grp}" data-grp="${esc(x.grp)}"><div class="id">${esc(x.grp)}<small>${objLabel(x.objects,esc(x.object_id))}</small></div><div class="status">${nod?badge('nodata'):badge(x.level)}<span class="score num">${nod?'·':fmt(x.risk)}</span></div>${trace}<div class="meta"><span>${x.grp_size} каналов</span><span>эпизодов 7 дн: <b class="num">${x.ep_7d}</b> · 30 дн: <b class="num">${x.ep_30d}</b></span>${woBy.has(x.grp)?'<span style="color:var(--accent)">есть заявка</span>':''}${x.actual!=null?`<span style="color:${x.actual?'var(--high)':'var(--ink-3)'}">исход: ${x.actual?'сбой был':'сбоя не было'}</span>`:''}</div></div>`}).join(''):'<p class="empty">Нет групп по этому фильтру.</p>';
  $$('#queue .row').forEach(el=>{el.addEventListener('click',()=>openGroup(el.dataset.grp));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openGroup(el.dataset.grp)}})})}

async function openGroup(g,opt={}){const d=$('#date').value,meta=MODELS[M],my=++GROUP_REQ,context=REQ;SEL=g;$$('#network button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.grp===g));$$('#queue .row').forEach(el=>el.setAttribute('aria-selected',el.dataset.grp===g));
  if(!opt.silent&&innerWidth<=700){$('#ov').classList.add('mobile-card');$('#ov').classList.remove('mobile-list');$('#ov .card-wrap').scrollIntoView({block:'start'})}
  $('#card').innerHTML=`<span class="detail-eyebrow">РАЗБОР ГРУППЫ · ${dS(d)}</span><div class="addr"><h2 class="num">${esc(g)}</h2><span class="muted">загружаем…</span></div><div class="skeleton"></div><div class="skeleton"></div>`;
  let c,s;try{[c,s]=await Promise.all([api('/api/groups/'+g,{model:M,date:d}),api('/api/segments',{grp:g,date:d,top:999}).catch(()=>({unavailable:true}))])}catch(e){if(my!==GROUP_REQ||context!==REQ)return;$('#card').innerHTML=`<p class="error">Не удалось загрузить группу ${esc(g)}: ${esc(e.message)}</p>`;return}
  if(SEL!==g||my!==GROUP_REQ||context!==REQ)return;const item=(RISKS.items.find(x=>x.grp===g))||{};const lv=item.data_quality&&item.data_quality!=='ok'?'nodata':item.level||'low';const wo=(WO.items||[]).find(x=>x.grp===g);
  const smoke=Object.entries(c.channel_types).filter(([k])=>/дым|Тепловой|Ручной|УИР/.test(k)).reduce((a,[,v])=>a+v,0);
  const isArch=d<meta.snapshot_date;const fact=isArch&&c.episodes_in_window_actual!=null?`<div class="note ${c.channels_in_window_actual>=3?'bad':''}">Исход в окне (архив): ${c.episodes_in_window_actual} ${plural(c.episodes_in_window_actual,'эпизод','эпизода','эпизодов')} на ${c.channels_in_window_actual} ${plural(c.channels_in_window_actual,'канале','каналах','каналах')}${item.actual!=null?(item.actual?' · групповой сбой был':' · группового сбоя не было'):''}.</div>`:'';
  const why=lv==='nodata'?'Свежих данных нет. Сначала проверьте поступление телеметрии. Балл не подтверждает исправность оборудования.':lv==='low'?`Балл ${fmt(c.risk)} ниже рабочего порога ${fmt(c.threshold)}. За 30 дней · ${item.ep_30d??'·'} эпизодов «Неисправен».`:`Балл ${fmt(c.risk)} выше порога ${fmt(c.threshold)}: за 7 дней ${item.ep_7d} эпизодов, за 30 дней ${item.ep_30d}. Прогноз учитывает длительную историю группы. План проверки уточняет специалист.`;
  const action=WOERROR?'<span class="error">Заявки не загрузились. Обновите снимок, чтобы проверить их наличие.</span>':wo?`<button class="btn accent" type="button" data-open-order="${esc(wo.id)}">Заявка от ${dS(wo.created)} · ${statusRu(wo.status)} →</button>`:`<span class="muted small">Заявка для этой даты не сформирована${lv==='low'?' · балл ниже порога':''}.</span>`;
  const segs=(s&&s.segments||[]);const allSegs=((SEGS&&SEGS.objects&&SEGS.objects[c.grp.split('-')[0]])||[]).filter(x=>x.km!=null).sort((a,b)=>a.km-b.km);
  const segRows=segs.slice(0,5).map(x=>`<tr class="${x.km==null||x.km==='dp'?'':'link'}" data-km="${x.km}" tabindex="0"><td>${x.km==null||x.km==='dp'?'без привязки к пикетам':esc(x.pk_range)}</td><td class="n">${fmt(x.risk)}</td><td class="n">${x.ep_7d} / ${x.ep_30d}</td><td class="n">${x.n_smoke??'·'}</td>${isArch?`<td>${x.actual==null?'·':x.actual?'<b style="color:var(--high)">был</b>':'не был'}</td>`:''}</tr>`).join('');
  const cand=c.channel_candidates.slice(0,5).map(x=>`<tr><td>${esc(x.name||x.channel_id)}<span class="muted small"> · ${x.channel_id}</span></td><td class="n">${fmt(x.score)}</td><td class="n">${x.ep_30d}</td><td class="n">${x.days_since_ep>5000?'·':x.days_since_ep}</td></tr>`).join('');
  const candMore=c.channel_candidates.slice(5,15).map(x=>`<tr><td>${esc(x.name||x.channel_id)}</td><td class="n">${fmt(x.score)}</td><td class="n">${x.ep_30d} / ${x.ep_90d} / ${x.ep_365d}</td><td class="n">${x.days_since_ep>5000?'·':x.days_since_ep}</td></tr>`).join('');
  const doms=(c.fault_domains||[]).map(x=>`<tr><td class="num">#${x.id}</td><td class="n">${x.in_group}</td><td class="n">${x.active_30d?`<b>${x.active_30d}</b> · ${x.episodes_30d} эп.`:'·'}</td><td class="small muted">${esc(x.sample.join(', '))}</td></tr>`).join('');
  const eps=c.episodes_last_30d.slice(0,10).map(x=>`<tr><td class="num">${esc(x.t0).replace('T',' ').slice(0,16)}</td><td>${esc(x.name||x.channel_id)}</td><td class="n">${x.span_min==null?'открыт':Math.round(x.span_min)+' мин'}</td></tr>`).join('');
  const types=Object.entries(c.channel_types).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('');
  const n=c.risk_history.length;
  $('#card').innerHTML=`<span class="detail-eyebrow">РАЗБОР ГРУППЫ · ${dS(d)}</span><div class="addr"><h2 class="num">${esc(c.grp)}</h2><span class="obj">${(c.official_objects||[]).length?(c.official_objects.slice(0,3).map(o=>`${esc(o.name)} <span class="small">(${esc(o.kind)}, ${o.n_channels})</span>`).join(' · ')+((c.official_objects.length>3)?` · ещё ${c.official_objects.length-3}`:'')):'объект '+c.grp.split('-')[0]} · ${c.n_channels} каналов${smoke?`, дымовых ${smoke}`:''}</span><div class="right">${badge(lv)}<span class="score num">${lv==='nodata'?'н/д':fmt(c.risk)}</span><span class="muted small">порог ${fmt(c.threshold)}</span></div></div>
    <div class="action">${action}<span class="why"><b>Почему группа в очереди</b>${why}</span></div>${fact}
    ${s?.unavailable?'<p class="note warn">Не удалось загрузить участки. Повторно откройте группу, чтобы попробовать ещё раз.</p>':''}<section class="blk"><h3>Участки коллектора <small>${allSegs.length?`${allSegs.length} км-участков по пикетам · нажмите участок`:'без привязки к пикетам'}</small></h3>
      ${allSegs.length?`<div class="axis" id="axis"><span class="lab">ПК ${allSegs[0].km*10}</span><span class="lab r">ПК ${allSegs[allSegs.length-1].km*10+9}</span><div class="rail">${allSegs.map(x=>`<i data-km="${x.km}" data-l="${lvl4(x.risk)}" class="${isArch&&x.actual===1?'hit':''}" data-tip="ПК ${x.km*10}–${x.km*10+9}: балл участка ${fmt(x.risk)}, эпизодов за 7 дн ${x.ep_7d}" tabindex="0" role="button" aria-label="участок ПК ${x.km*10}–${x.km*10+9}, балл ${fmt(x.risk)}"></i>`).join('')}</div><div class="brace" id="brace" hidden><span></span></div></div>
      <div class="legend"><span><i style="background:var(--score-0)"></i>&lt;0,03</span><span><i style="background:var(--score-1)"></i>0,03–0,08</span><span><i style="background:var(--score-2)"></i>0,08–0,15</span><span><i style="background:var(--score-3)"></i>0,15–0,30</span><span><i style="background:var(--score-4)"></i>≥0,30 балл участковой модели</span>${isArch?'<span><i style="background:var(--score-0);box-shadow:inset 0 -4px 0 var(--high)"></i>исход: сбой на участке</span>':''}</div>
      <table style="margin-top:var(--s3)"><thead><tr><th>Участок</th><th class="n">Балл</th><th class="n">Эп. 7 / 30 дн</th><th class="n">Дымовых</th>${isArch?'<th>Исход</th>':''}</tr></thead><tbody id="segtable">${segRows}</tbody></table>${segs.length>5?`<p class="small muted" style="margin:6px 0 0">Показаны 5 из ${segs.length} по убыванию балла.</p>`:''}`:'<p class="muted small" style="margin:0">В публичном срезе нет привязки к пикетам. Локализация по участкам недоступна. Проверка по списку датчиков ниже.</p>'}
    </section>
    <section class="blk"><h3>Датчики для первичной проверки <small>порядок по повторяемости прошлых эпизодов</small></h3>
      <table><thead><tr><th>Датчик</th><th class="n">Приоритет</th><th class="n">Эп. 30 дн</th><th class="n">Дней после эп.</th></tr></thead><tbody>${cand||'<tr><td colspan="4" class="muted">нет оценённых датчиков</td></tr>'}</tbody></table>
      ${candMore?`<details class="more" style="border:0"><summary>Ещё ${Math.min(10,c.channel_candidates.length-5)} датчиков</summary><table><thead><tr><th>Датчик</th><th class="n">Приоритет</th><th class="n">Эп. 30 / 90 / 365</th><th class="n">Дней после эп.</th></tr></thead><tbody>${candMore}</tbody></table></details>`:''}
    </section>
    <section class="blk"><h3>История балла <small>${c.risk_history.length} дней до даты прогноза</small></h3><figure><div id="chart"></div><figcaption>Пунктир показывает рабочий порог${meta.threshold_red?', точечный · высокий уровень':''}. Метки под осью · дни, когда у группы были эпизоды «Неисправен» за предыдущие 7 дней.</figcaption></figure><div class="scrub"><label for="scrub">Дата</label><input type="range" id="scrub" min="0" max="${Math.max(n-1,0)}" value="${Math.max(n-1,0)}"><output id="scrub-out"></output></div></section>
    <details class="more"><summary>Совместные отказы · датчики, которые исторически сбоят вместе</summary><table><thead><tr><th>Домен</th><th class="n">В группе</th><th class="n">Активно за 30 дн</th><th>Например</th></tr></thead><tbody>${doms||'<tr><td colspan="4" class="muted">доменов не выделено</td></tr>'}</tbody></table></details>
    <details class="more"><summary>Последние эпизоды «Неисправен» (30 дней)</summary><table><thead><tr><th>Начало</th><th>Датчик</th><th class="n">Длительность</th></tr></thead><tbody>${eps||'<tr><td colspan="3" class="muted">за 30 дней эпизодов не было</td></tr>'}</tbody></table></details>
    <details class="more"><summary>Состав каналов группы</summary><table><tbody>${types}</tbody></table></details>`;
  drawChart(c.risk_history,c.threshold,meta.threshold_red);bindAxis(allSegs,segs);bindTips();if(!opt.silent&&innerWidth<=700){$('#card').tabIndex=-1;$('#card').focus({preventScroll:true})}}

function bindAxis(all,ranked){const rail=$('#axis .rail');if(!rail)return;const brace=$('#brace');
  const pick=km=>{km=Number(km);if(!Number.isFinite(km))return;$$('#axis .rail i').forEach(i=>i.classList.toggle('sel',+i.dataset.km===km));const idx=all.findIndex(x=>x.km===km);if(idx<0)return;const w=100/all.length;brace.hidden=false;brace.style.left=(idx*w)+'%';brace.style.width=`calc(${w}% - 1px)`;brace.querySelector('span').textContent=`ПК ${km*10}–${km*10+9}`;
    $$('#segtable tr').forEach(tr=>tr.setAttribute('aria-selected',+tr.dataset.km===km))};
  $$('#axis .rail i').forEach(i=>{i.addEventListener('click',()=>pick(+i.dataset.km));i.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(+i.dataset.km)}})});
  $$('#segtable tr').forEach(tr=>{tr.addEventListener('click',()=>pick(+tr.dataset.km));tr.addEventListener('keydown',e=>{if(e.key==='Enter')pick(+tr.dataset.km)})});
  const first=ranked.find(x=>x.km!=null&&x.km!=='dp');if(first)pick(first.km)}
function bindTips(){const t=$('#tip');$$('[data-tip]').forEach(el=>{const show=()=>{t.textContent=el.dataset.tip;t.hidden=false;const b=el.getBoundingClientRect();t.style.left=(b.left+b.width/2+scrollX)+'px';t.style.top=(b.top+scrollY)+'px'};el.addEventListener('mouseenter',show);el.addEventListener('focus',show);el.addEventListener('mouseleave',()=>t.hidden=true);el.addEventListener('blur',()=>t.hidden=true)})}

function drawChart(h,thr,thrRed){const W=680,H=190,pl=44,pr=10,pt=12,pb=28,box=$('#chart');if(!h||!h.length){box.innerHTML='<p class="muted small">История не передана.</p>';return}
  const mx=Math.max((thrRed||thr)*1.2,...h.map(x=>x.risk),0.05),n=h.length;const X=i=>n>1?pl+i/(n-1)*(W-pl-pr):(pl+W-pr)/2,Y=v=>pt+(1-v/mx)*(H-pt-pb);
  const grid=[0,mx/2,mx].map(v=>`<text x="${pl-6}" y="${Y(v)+4}" text-anchor="end" font-size="12" fill="#5D6862">${v.toFixed(2)}</text><line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E9E7E1"/>`).join('');
  const line=n>1?`<path d="${h.map((x,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(x.risk).toFixed(1)).join(' ')}" fill="none" stroke="#075E52" stroke-width="2" stroke-linejoin="round"/>`:`<circle cx="${X(0)}" cy="${Y(h[0].risk)}" r="4" fill="#075E52"/>`;
  const marks=h.map((x,i)=>x.ep_7d>0?`<rect x="${X(i)-1.5}" y="${H-pb+8}" width="3" height="6" fill="#805315"/>`:'').join('');
  const thrLines=`<line x1="${pl}" x2="${W-pr}" y1="${Y(thr)}" y2="${Y(thr)}" stroke="#A52C22" stroke-dasharray="4 4"/>${thrRed?`<line x1="${pl}" x2="${W-pr}" y1="${Y(thrRed)}" y2="${Y(thrRed)}" stroke="#A52C22" stroke-dasharray="1 3"/>`:''}`;
  const dl=[...new Set([0,Math.floor((n-1)/2),n-1])].map(i=>`<text x="${X(i)}" y="${H-4}" font-size="12" fill="#5D6862" text-anchor="${i===0?'start':i===n-1?'end':'middle'}">${dS(h[i].d)}</text>`).join('');
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="История балла группы">${grid}${thrLines}${line}${marks}${dl}<g id="xh"></g></svg>`;
  const svg=box.querySelector('svg'),t=$('#tip'),out=$('#scrub-out'),sc=$('#scrub');
  const showI=i=>{i=Math.max(0,Math.min(n-1,Math.round(i)));$('#xh').innerHTML=`<line x1="${X(i)}" x2="${X(i)}" y1="${pt}" y2="${H-pb}" stroke="#202724" stroke-opacity=".35"/><circle cx="${X(i)}" cy="${Y(h[i].risk)}" r="4.5" fill="#075E52" stroke="#fff" stroke-width="2"/>`;out.textContent=`${dS(h[i].d)} · балл ${fmt(h[i].risk)}${h[i].alert?' · выше порога':''}`;sc.value=i;return i};
  svg.addEventListener('mousemove',e=>{const b=svg.getBoundingClientRect();const i=showI(((e.clientX-b.left)/b.width*W-pl)/(W-pl-pr)*(n-1));t.textContent=out.textContent;t.hidden=false;t.style.left=(b.left+X(i)/W*b.width+scrollX)+'px';t.style.top=(b.top+Y(h[i].risk)/H*b.height+scrollY)+'px'});
  svg.addEventListener('mouseleave',()=>{t.hidden=true;showI(n-1)});sc.addEventListener('input',()=>showI(+sc.value));showI(n-1)}

/* work orders */
const statusRu=s=>({draft:'черновик',confirmed:'проверка подтверждена',monitor:'под наблюдением',false_alarm:'отклонена',done:'выполнена'})[s]||s;
function renderWO(){if(WOERROR){$('#wo-list').innerHTML='<p class="error">Заявки недоступны. Обновите снимок, чтобы повторить запрос.</p>';return}const items=(WO.items||[]).filter(x=>WOFILTER==='all'||(WOFILTER==='draft'?x.status==='draft':x.status!=='draft'));
  $('#wo-counts').innerHTML=`<span><b>${(WO.items||[]).length}</b> на ${dS(WO.date||$('#date').value)}</span><span><b>${(WO.items||[]).filter(x=>x.status==='draft').length}</b> черновиков</span>`;
  $('#wo-list').innerHTML=items.length?items.map(x=>`<div class="row" role="option" tabindex="0" aria-selected="${WOSEL===x.id}" data-id="${esc(x.id)}"><div class="id">${esc(x.grp)}<small>${dS(x.created)}</small></div><div class="status"><span class="badge ${x.status==='draft'?'medium':'low'}"><i></i>${statusRu(x.status)}</span><span class="score num">${fmt(x.risk)}</span></div><div class="meta"><span>${esc(x.title)}</span></div></div>`).join(''):'<p class="empty">На эту дату заявок нет.</p>';
  $$('#wo-list .row').forEach(el=>{el.addEventListener('click',()=>selectWO(el.dataset.id));el.addEventListener('keydown',e=>{if(e.key==='Enter')selectWO(el.dataset.id)})});
  if(WOSEL&&(WO.items||[]).some(x=>x.id===WOSEL))selectWO(WOSEL,true)}
function selectWO(id,keep){const x=(WO.items||[]).find(w=>w.id===id);if(!x)return;WOSEL=id;$$('#wo-list .row').forEach(el=>el.setAttribute('aria-selected',el.dataset.id===id));
  if(!keep&&innerWidth<=700){$('#wo').classList.add('mobile-card');$('#wo').classList.remove('mobile-list')}
  const win=Array.isArray(x.window)?x.window:[x.window.from,x.window.to];const arch=$('#date').value<MODELS[M].snapshot_date;
  $('#wo-detail').innerHTML=`<div class="addr"><h2 class="num">${esc(x.grp)}</h2><span class="obj">объект ${x.object_id}</span><div class="right"><span class="badge ${x.status==='draft'?'medium':'low'}"><i></i>${statusRu(x.status)}</span></div></div>
    <dl><dt>Заявка</dt><dd class="num">${esc(x.id)}</dd><dt>Сформирована</dt><dd>${dS(x.created)}</dd><dt>Окно прогноза</dt><dd>${dS(win[0])} · ${dS(win[1])}</dd><dt>Балл модели</dt><dd class="num">${fmt(x.risk)}</dd><dt>Основание</dt><dd>${esc(x.title)}</dd><dt>Рекомендация</dt><dd>${esc(x.recommendation)}</dd><dt>Датчики-кандидаты</dt><dd>${esc(x.channel_candidates.map(c=>c.name||c.channel_id).join(', '))||'·'}</dd></dl>
    <button class="btn ghost sm" type="button" data-open-group="${esc(x.grp)}">Открыть разбор группы →</button>
    ${arch?'<p class="note warn">Архивный просмотр · решения по прошлым заявкам доступны только для чтения.</p>':`<label style="display:block;margin-top:var(--s4)" for="wo-comment">Комментарий диспетчера</label><textarea id="wo-comment" placeholder="Что проверено, что найдено">${esc(x.comment||"")}</textarea>
    <div class="acts"><button class="btn accent" type="button" data-decision="confirmed" data-order="${esc(x.id)}">Подтвердить проверку</button><button class="btn ghost" type="button" data-decision="monitor" data-order="${esc(x.id)}">Наблюдать</button><button class="btn ghost" type="button" data-decision="done" data-order="${esc(x.id)}">Отметить выполненной</button><button class="btn ghost" type="button" data-decision="false_alarm" data-order="${esc(x.id)}">Отклонить заявку</button></div><p class="small muted" id="wo-msg" role="status" style="margin:8px 0 0">Подтверждая проверку, вы не подтверждаете наличие сбоя. Решение сохраняется в этом браузере.</p>`}`}
async function decide(id,decision,btn){
  const context=REQ,msg=$('#wo-msg'),buttons=$$('.acts button');buttons.forEach(b=>b.disabled=true);msg.textContent='Сохраняем…';
  const comment=($('#wo-comment')||{}).value||'';
  try{
    if(DEMO)PiketDemo.decide(id,decision,comment);
    else {const r=await fetch('/api/work_orders/'+encodeURIComponent(id)+'/decision',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({decision,comment})});if(!r.ok)throw new Error((await r.json()).detail||('HTTP '+r.status));}
    const result=await api('/api/work_orders',{model:M,date:$('#date').value});if(context!==REQ)return;WO=result;renderWO();renderQueue();if(SEL)openGroup(SEL,{silent:true});$('#nav-orders').textContent=WO.items.filter(x=>x.status==='draft').length;const stat=$$('#counts .summary-stat strong')[3];if(stat)stat.textContent=$('#nav-orders').textContent;toast(DEMO?'Решение сохранено в этом браузере':'Решение сохранено');
    if($('#wo-msg'))$('#wo-msg').textContent=DEMO?'Решение сохранено в этом браузере. Бригаде не отправлено.':'Решение сохранено в журнале.';
  }catch(e){if(context!==REQ)return;msg.innerHTML=`<span class="error">Не удалось сохранить: ${esc(e.message)}</span>`;buttons.forEach(b=>b.disabled=false)}
}

/* journal */
async function loadJournal(){if(!MODELS[M])return;const context=REQ,my=++JOURNAL_REQ;$('#journal').innerHTML='<tr><td colspan="5" class="muted">Загружаем…</td></tr>';let j;try{j=await api('/api/journal',{model:M,to:$('#date').value,limit:300})}catch(e){if(context!==REQ||my!==JOURNAL_REQ)return;$('#journal').innerHTML=`<tr><td colspan="5" class="error">${esc(e.message)}</td></tr>`;return}
  if(context!==REQ||my!==JOURNAL_REQ)return;const its=j.items.filter(x=>x.work_order);$('#j-counts').innerHTML=`<span><b>${its.length}</b> заявок до ${dS($('#date').value)}</span><span><b>${its.filter(x=>x.outcome==='confirmed').length}</b> подтвердились сбоем</span><span><b>${its.filter(x=>x.outcome==='pending').length}</b> исход ещё неизвестен</span>`;
  $('#journal').innerHTML=its.length?its.map(x=>`<tr data-grp="${esc(x.grp)}" data-d="${x.d.slice(0,10)}"><td class="num">${dS(x.d)}</td><td><b>${esc(x.grp)}</b></td><td class="n">${fmt(x.risk)}</td><td>${x.outcome==='confirmed'?'<b style="color:var(--high)">сбой в окне</b>':x.outcome==='not_confirmed'?'<span class="muted">сбоя не было</span>':'<span class="muted">исход ещё неизвестен</span>'}</td><td>${x.decision?esc(statusRu(x.decision)):'·'}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">До выбранной даты записей нет.</td></tr>';
  if(window.PiketArchive)return;$$('#journal tr.link').forEach(tr=>{const go=async()=>{$('#date').value=tr.dataset.d;showTab('tab-overview');await loadAll();openGroup(tr.dataset.grp)};tr.addEventListener('click',go);tr.addEventListener('keydown',e=>{if(e.key==='Enter')go()})})}

/* quality */
async function loadQuality(){if(!MODELS[M])return;const context=REQ,my=++QUALITY_REQ;let b;try{b=await api('/api/backtest',{model:M})}catch(e){if(context!==REQ||my!==QUALITY_REQ)return;$('#quality').innerHTML=`<h1>Качество модели</h1><p class="empty">Бэктест для этой модели недоступен: ${esc(e.message)}</p>`;return}
  if(context!==REQ||my!==QUALITY_REQ)return;const ev=b.event_eval||[],work=ev.find(r=>r.score==='p_model'&&r.budget===0.05)||ev.find(r=>r.score==='p_model');const rules=ev.filter(r=>r.score!=='p_model');
  const ok=work&&work.event_P>0.7&&work.event_R>0.5;const meanAP=b.folds.length?b.folds.reduce((a,f)=>a+f.AP_model,0)/b.folds.length:null,meanPrior=b.folds.length?b.folds.reduce((a,f)=>a+(f.AP_grp_prior_180||0),0)/b.folds.length:null;
  const cmp=r=>`<tr><td>${r.label?esc(r.label):r.score==='p_model'?'<b>Модель</b>':r.score==='grp_prior_180'?'Историческая частота группы':'Правило: дни с эпизодами за 30 дн'}</td><td class="n">${r.alerts}</td><td class="n">${r.tp} из ${r.incidents}</td><td class="n">${pct(r.event_P)}${r.event_P_ci?` <span class="muted">(${pct(r.event_P_ci[0])}–${pct(r.event_P_ci[1])})</span>`:''}</td><td class="n">${pct(r.event_R)}${r.event_R_ci?` <span class="muted">(${pct(r.event_R_ci[0])}–${pct(r.event_R_ci[1])})</span>`:''}</td><td class="n">${r.lead_med_h==null?'·':Math.round(r.lead_med_h/24)+' дн'}</td></tr>`;
  $('#quality').innerHTML=`<div class="grid2"><div><h1>${work?(ok?'Модель выполняет формальные требования.':'Результаты исторической проверки'):'Оценка на уровне инцидентов не рассчитана.'}</h1>
      ${work&&!ok?'<p class="note warn">Целевые precision > 70% и recall > 50% пока не достигнуты одновременно.</p>':''}${b.source_note?`<p class="note">${esc(b.source_note)}<br>Источник: <code>${esc(b.source)}</code></p>`:''}${work?`<p class="small muted" style="margin:var(--s3) 0 0">Оценка на уровне инцидентов: один алерт засчитывается одному началу группового сбоя, упреждение ≥ 24 ч, повтор по группе не раньше чем через ${work.cooldown} дней; ${esc(b.policy_note||'Порог подобран на калибровочном периоде')}; период ${b.event_level.period[0]} · ${b.event_level.period[1]}. ${work.event_P_ci?'В скобках приведены 95 % доверительные интервалы.':'Доверительные интервалы для этого прогона не переданы.'}</p>
      <div class="metrics"><div class="metric"><b>${pct(work.event_P)}</b><span>precision заявок</span></div><div class="metric"><b>${pct(work.event_R)}</b><span>recall инцидентов</span></div><div class="metric"><b>${work.lead_med_h==null?'·':(work.lead_med_h/24).toFixed(1).replace('.',',')+' дн'}</b><span>медианное упреждение</span></div><div class="metric"><b>${work.alerts}</b><span>заявок за период, ${work.incidents} инцидентов</span></div></div>`:''}
      <h3>Оценка на уровне инцидентов</h3><table style="margin-top:var(--s2)"><thead><tr><th>Метод</th><th class="n">Заявок</th><th class="n">Поймано</th><th class="n">Precision</th><th class="n">Recall</th><th class="n">Упреждение</th></tr></thead><tbody>${[work,...rules].filter(Boolean).map(cmp).join('')}</tbody></table>
      ${ev.filter(r=>r.score==='p_model').length>1?`<details class="more" style="margin-top:var(--s3);border:0"><summary>Все бюджеты алертов</summary><table><thead><tr><th>Бюджет</th><th class="n">Заявок</th><th class="n">Поймано</th><th class="n">Precision</th><th class="n">Recall</th><th class="n">Упреждение</th></tr></thead><tbody>${ev.filter(r=>r.score==='p_model').map(r=>`<tr><td>${pct(r.budget)} группо-дней</td><td class="n">${r.alerts}</td><td class="n">${r.tp} из ${r.incidents}</td><td class="n">${pct(r.event_P)}</td><td class="n">${pct(r.event_R)}</td><td class="n">${r.lead_med_h==null?'·':Math.round(r.lead_med_h/24)+' дн'}</td></tr>`).join('')}</tbody></table></details>`:''}
${b.folds.length?`      <h3 style="margin-top:var(--s5)">Ранжирование по периодам (rolling backtest)${DEMO?' · предыдущая версия base + nb':''}</h3><p class="small muted" style="margin:4px 0 var(--s2)">Обучение только на данных до начала периода. AP · average precision; «историческая частота группы» · что известно без модели.</p>
      <table><thead><tr><th>Период</th><th class="n">Группо-дней</th><th class="n">База</th><th class="n">AP модели</th><th class="n">AP частоты группы</th><th class="n">AP правила</th></tr></thead><tbody>${b.folds.map(f=>`<tr><td class="num">${f.fold.replace('..',' · ')}</td><td class="n">${f.n}</td><td class="n">${pct(f.base)}</td><td class="n"><b>${fmt(f.AP_model)}</b></td><td class="n">${fmt(f.AP_grp_prior_180)}</td><td class="n">${fmt(f.AP_epdays_30d)}</td></tr>`).join('')}</tbody></table>
      ${meanAP!=null?`<p class="small muted">Среднее по периодам: AP модели ${fmt(meanAP)} против ${fmt(meanPrior)} у исторической частоты.</p>`:''}`:''}</div>
    <aside><h3>Ограничения</h3><ul class="small" style="padding-left:18px;color:var(--ink-2);margin:var(--s2) 0"><li>Прогнозируются диагностические события СМВУ (переходы датчиков в «Неисправен»), а не поломки, подтверждённые ремонтом: в данных нет актов проверок.</li><li>За период оценки · ${work?work.incidents:'·'} инцидентов; один пойманный инцидент меняет recall примерно на ${work?(100/work.incidents).toFixed(1):'·'} п.п.</li><li>Модель использует историю группы, повторяемость эпизодов и изменения состояний датчиков.</li><li>Решения сохранены локально. Для дообучения потребуется подтверждённый журнал осмотров.</li></ul>
      <h3 style="margin-top:var(--s4)">Что считается инцидентом</h3><p class="small" style="color:var(--ink-2)">${esc(MODELS[M].target_definition)}.</p></aside></div>`}
let toastTimer;
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500)}
$('#help-button').onclick=()=>$('#help-dialog').showModal();
$('#forecast-form').onsubmit=e=>{e.preventDefault();loadAll(true)};
$('#account-button').onclick=()=>$('#login-dialog').showModal();
$('#login-form').onsubmit=async e=>{e.preventDefault();const button=$('#login-form button[type=submit]');button.disabled=true;$('#login-error').textContent='';try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:$('#login').value,password:$('#password').value})});const result=await r.json();if(!r.ok)throw new Error(result.detail||'Не удалось войти');token=result.token||'';if(token)sessionStorage.setItem('piket-token',token);else sessionStorage.removeItem('piket-token');$('#password').value='';$('#session-label').textContent=$('#login').value;$('#login-dialog').close();await init()}catch(error){$('#login-error').textContent=error.message}finally{button.disabled=false}};
document.addEventListener('click',e=>{const order=e.target.closest('[data-open-order]'),group=e.target.closest('[data-open-group]'),decision=e.target.closest('[data-decision]');if(order){showTab('tab-wo');selectWO(order.dataset.openOrder)}if(group){showTab('tab-overview');openGroup(group.dataset.openGroup)}if(decision)decide(decision.dataset.order,decision.dataset.decision,decision)});
$$('nav[role=tablist] button').forEach((button,i,buttons)=>{button.tabIndex=i===0?0:-1;button.addEventListener('keydown',e=>{let next;if(['ArrowDown','ArrowRight'].includes(e.key))next=(i+1)%buttons.length;if(['ArrowUp','ArrowLeft'].includes(e.key))next=(i+buttons.length-1)%buttons.length;if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;if(next!==undefined){e.preventDefault();buttons[next].focus();showTab(buttons[next].id)}})});
init();
