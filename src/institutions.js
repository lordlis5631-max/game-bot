export const POPULAR_INSTITUTIONS = [
  { key:'uunit', label:'УУНиТ', full:'Уфимский университет науки и технологий (УУНиТ)' },
  { key:'ugntu', label:'УГНТУ', full:'Уфимский государственный нефтяной технический университет (УГНТУ)' },
  { key:'bgpu', label:'БГПУ им. М. Акмуллы', full:'Башкирский государственный педагогический университет им. М. Акмуллы' },
  { key:'bgmu', label:'БГМУ', full:'Башкирский государственный медицинский университет (БГМУ)' },
  { key:'bgau', label:'БГАУ', full:'Башкирский государственный аграрный университет (БГАУ)' },
  { key:'ugii', label:'УГИИ', full:'Уфимский государственный институт искусств им. Загира Исмагилова' },
];

const ALIASES = [
  [/\b(уунит|уфимск.*университет.*наук.*технолог)\b/i,'uunit'],
  [/\b(угнту|нефтян.*университет|уфимск.*нефтян)\b/i,'ugntu'],
  [/\b(бгпу|акмулл)\b/i,'bgpu'],
  [/\b(бгму|медицинск.*университет)\b/i,'bgmu'],
  [/\b(бгау|аграрн.*университет)\b/i,'bgau'],
  [/\b(угии|исмагилов|институт.*искусств)\b/i,'ugii'],
];

export function institutionByKey(key) {
  return POPULAR_INSTITUTIONS.find((item)=>item.key===key) || null;
}

export function normalizeInstitution(input='') {
  const display=String(input).replace(/\s+/g,' ').trim();
  if (!display) return {key:'',display:''};
  if (/^(не\s*учусь|не учусь|нет)$/i.test(display)) return {key:'not_studying',display:'Не учусь'};
  for (const [pattern,key] of ALIASES) {
    if (pattern.test(display)) {
      const known=institutionByKey(key);
      return {key,display:known?.full || display};
    }
  }
  const key=display
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/[^a-zа-я0-9]+/gi,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80) || 'other';
  return {key:`custom:${key}`,display};
}
