// Real-world calendar: holy days and festivals, and the phase of the moon.
// Scripture lines are from the King James Version (public domain).

// Anonymous Gregorian algorithm for Easter Sunday
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// Fourth Sunday before Christmas
function adventStart(year) { const xmas = new Date(year, 11, 25); const back = xmas.getDay() || 7; return addDays(xmas, -back - 21); }
function thanksgiving(year) { const d = new Date(year, 10, 1); const first = (4 - d.getDay() + 7) % 7; return new Date(year, 10, 1 + first + 21); }

// peace: no raids or hostile events. gift: multiplier on the day's tribute. xp: bonus experience.
const HOLY = {
  christmas: { name: 'Christmas Day', verse: '"For unto you is born this day in the city of David a Saviour, which is Christ the Lord." Luke 2:11', desc: 'The birth of Christ. Peace over the realm: no raids today. The daily tribute is tripled and every soldier receives a gift of experience.', peace: true, gift: 3, xpGift: 120, snow: true, glow: true, colour: 'gold' },
  christmasEve: { name: 'Christmas Eve', verse: '"Glory to God in the highest, and on earth peace, good will toward men." Luke 2:14', desc: 'The realm keeps watch on the holy night. No raids tonight, and every window glows.', peace: true, gift: 1.5, snow: true, glow: true, colour: 'gold' },
  epiphany: { name: 'Epiphany', verse: '"We have seen his star in the east, and are come to worship him." Matthew 2:2', desc: 'Remembering the wise men who followed the star. A merchant arrives bearing rare gifts, and gold flows freely.', gift: 2, merchant: true, colour: 'gold' },
  advent: { name: 'Advent Sunday', verse: '"Prepare ye the way of the Lord." Mark 1:3', desc: 'A Sunday of Advent, waiting for Christmas. Candles burn in every window and the daily tribute is doubled.', gift: 2, glow: true, colour: 'purple' },
  palmSunday: { name: 'Palm Sunday', verse: '"Hosanna to the Son of David: Blessed is he that cometh in the name of the Lord." Matthew 21:9', desc: 'Christ enters Jerusalem. Your people line the paths: pawns work 20% faster today.', gather: 0.2, colour: 'blue' },
  goodFriday: { name: 'Good Friday', verse: '"For God so loved the world, that he gave his only begotten Son." John 3:16', desc: 'A solemn day remembering the crucifixion. No raids or celebrations. Fallen soldiers are honoured in the Hall.', peace: true, solemn: true, colour: 'black' },
  easter: { name: 'Easter Sunday', verse: '"He is not here: for he is risen, as he said." Matthew 28:6', desc: 'Christ is risen. New life across the realm: peace all day, lambs are born, the daily tribute is tripled, and every soldier is healed and blessed with experience.', peace: true, gift: 3, xpGift: 150, lambs: 6, spring: true, glow: true, colour: 'gold' },
  ascension: { name: 'Ascension Day', verse: '"He was taken up; and a cloud received him out of their sight." Acts 1:9', desc: 'Christ ascends. Clear skies over the realm and doubled tribute.', gift: 2, clear: true, colour: 'blue' },
  pentecost: { name: 'Pentecost', verse: '"And they were all filled with the Holy Ghost." Acts 2:4', desc: 'The coming of the Holy Spirit. Every soldier gains experience, and abilities recharge twice as fast today.', gift: 2, xpGift: 80, abilityHaste: true, colour: 'red' },
  allSaints: { name: "All Saints' Day", verse: '"Precious in the sight of the LORD is the death of his saints." Psalm 116:15', desc: 'The realm remembers its fallen. Living soldiers gain experience in their honour.', xpGift: 60, colour: 'purple' },
};
const FESTIVALS = {
  newYear: { name: "New Year's Day", desc: 'Fireworks over the castle at night and a doubled daily tribute.', gift: 2, fireworks: true, colour: 'gold' },
  thanksgiving: { name: 'Thanksgiving', desc: 'A harvest feast. Shepherds bring back double meat, every soldier is healed, and the tribute is doubled.', gift: 2, meat: 1, feast: true, colour: 'gold' },
  midsummer: { name: 'Midsummer Tournament', desc: 'The longest days of the year. Soldiers earn 50% more experience and a merchant visits.', xp: 0.5, merchant: true, colour: 'yellow' },
  harvest: { name: 'Harvest Moon Fair', desc: 'Autumn fair: woodcutters and miners bring back 25% more.', gather: 0.25, colour: 'yellow' },
};

export function holidayFor(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const easter = easterSunday(y);
  const pick = (k, src) => ({ key: k, ...(src[k]) });
  if (m === 11 && d === 25) return pick('christmas', HOLY);
  if (m === 11 && d === 24) return pick('christmasEve', HOLY);
  if (m === 0 && d === 6) return pick('epiphany', HOLY);
  if (same(date, addDays(easter, -7))) return pick('palmSunday', HOLY);
  if (same(date, addDays(easter, -2))) return pick('goodFriday', HOLY);
  if (same(date, easter)) return pick('easter', HOLY);
  if (same(date, addDays(easter, 39))) return pick('ascension', HOLY);
  if (same(date, addDays(easter, 49))) return pick('pentecost', HOLY);
  if (m === 10 && d === 1) return pick('allSaints', HOLY);
  const adv = adventStart(y);
  for (let i = 0; i < 4; i++) if (same(date, addDays(adv, i * 7))) return { ...pick('advent', HOLY), name: `${['First', 'Second', 'Third', 'Fourth'][i]} Sunday of Advent` };
  if (m === 0 && d === 1) return pick('newYear', FESTIVALS);
  if (same(date, thanksgiving(y))) return pick('thanksgiving', FESTIVALS);
  if (m === 5 && d >= 21 && d <= 24) return pick('midsummer', FESTIVALS);
  if (m === 8 && d >= 22 && d <= 23) return pick('harvest', FESTIVALS);
  return null;
}
// The next few holidays, for the Chronicle
export function upcomingHolidays(n = 4, from = new Date()) {
  const out = [];
  for (let i = 0; i < 400 && out.length < n; i++) { const d = addDays(from, i); const h = holidayFor(d); if (h) out.push({ date: d, ...h }); }
  return out;
}

// ------------------------------------------------------------ moon
const SYNODIC = 29.530588853;
const KNOWN_NEW = Date.UTC(2000, 0, 6, 18, 14);
export function moonAge(t = Date.now()) { return (((t - KNOWN_NEW) / 86400000) % SYNODIC + SYNODIC) % SYNODIC; }
export function moonPhase(t = Date.now()) {
  const a = moonAge(t), f = a / SYNODIC;
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  const idx = Math.floor((f * 8) + 0.5) % 8;
  return { age: a, fraction: f, name: names[idx], full: Math.abs(a - SYNODIC / 2) < 1.1, dark: a < 1.1 || a > SYNODIC - 1.1, light: (1 - Math.cos(2 * Math.PI * f)) / 2 };
}
