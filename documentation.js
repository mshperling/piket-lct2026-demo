'use strict';
const toc = document.querySelector('.toc-panel');
if (matchMedia('(max-width:740px)').matches) toc.open = false;
const navLinks = [...document.querySelectorAll('.doc-toc a')];
const sections = [...document.querySelectorAll('.doc-section')];
let active = '';
function updateCurrent() {
  let current = sections[0]?.id;
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= 180) current = section.id;
  }
  if (current === active) return;
  active = current;
  navLinks.forEach(link => {
    if (link.dataset.section === active) link.setAttribute('aria-current','true');
    else link.removeAttribute('aria-current');
  });
}
let scheduled = false;
addEventListener('scroll', () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { updateCurrent(); scheduled = false; });
}, {passive:true});
updateCurrent();
navLinks.forEach(link => link.addEventListener('click', () => {
  if (matchMedia('(max-width:740px)').matches) toc.open = false;
}));
let messageTimer;
document.querySelectorAll('.copy-code').forEach(button => button.addEventListener('click', async () => {
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(button.closest('.code-block').querySelector('code').textContent);
    status.textContent = 'Скопировано';
  } catch {
    status.textContent = 'Выделите фрагмент и скопируйте вручную';
  }
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { status.textContent = ''; }, 2200);
}));
