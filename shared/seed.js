// Демо-данные: студия, четыре приглашения на разных шаблонах, гости и ответы.
import { uid, defaultData, addDays } from './model.js';

const GUESTS = [
  ['Ольга и Сергей Петровы', 2, 'Семья невесты', 'Дорогие'], ['Бабушка Валя', 1, 'Семья невесты', 'Дорогая'],
  ['Игорь Смирнов', 1, 'Друзья жениха', 'Дорогой'], ['Катя и Дима', 2, 'Друзья', 'Дорогие'],
  ['Марина Ковалёва', 1, 'Коллеги', 'Дорогая'], ['Семья Орловых', 4, 'Семья жениха', 'Дорогие'],
  ['Никита', 1, 'Друзья жениха', 'Дорогой'], ['Алёна и Паша', 2, 'Друзья', 'Дорогие'],
  ['Татьяна Ивановна', 1, 'Семья жениха', 'Уважаемые'], ['Лёша Громов', 1, 'Друзья', 'Дорогой'],
  ['Юля и Антон', 2, 'Друзья невесты', 'Дорогие'], ['Дядя Коля и тётя Лена', 2, 'Семья невесты', 'Дорогие'],
  ['Света Белова', 1, 'Коллеги', 'Дорогая'], ['Рома и Настя', 2, 'Друзья', 'Дорогие'],
  ['Виктор Павлович', 1, 'Семья жениха', 'Уважаемые'], ['Даша', 1, 'Друзья невесты', 'Дорогая'],
];
const WISHES = ['Ждём не дождёмся! Поставьте, пожалуйста, «Мумий Тролль» 💃', 'Будем обязательно, спасибо за приглашение!', 'Любим вас и уже выбираем наряды', '', 'Без орехов, пожалуйста', 'Счастья вам!', ''];

export async function seedDemo({ store, core, hashPassword }) {
  const db = store.data;
  if (db.users.some(u => u.email === 'demo@wednello.ru')) return;
  const user = { id: uid(), email: 'demo@wednello.ru', name: 'Анна', passwordHash: await hashPassword('demo123'), createdAt: new Date().toISOString() };
  db.users.push(user);
  const ws = core.createWorkspace({ name: 'Анна', ownerId: user.id, planId: 'premium' });
  ws.planUntil = new Date(Date.now() + 365 * 864e5).toISOString();

  const mk = (templateId, o) => {
    const d = defaultData(templateId);
    Object.assign(d.couple, o.couple);
    Object.assign(d.event, o.event);
    d.venues.ceremony = { ...d.venues.ceremony, ...o.ceremony };
    d.venues.party = { ...d.venues.party, ...o.party };
    if (o.photos) d.photos = o.photos.map(src => ({ id: uid(8), src, x: 50, y: 40, caption: '' }));
    if (o.music) d.music = { enabled: true, src: '@demo/music.mp3', name: 'Наша песня' };
    d.rsvp.deadline = addDays(d.event.date, -35);
    if (o.questions) d.rsvp.questions = o.questions;
    const p = core.createProject(ws, { title: o.title, templateId, client: o.client, data: d });
    p.createdAt = p.updatedAt = new Date(Date.now() - (o.ago || 0) * 864e5).toISOString();
    return p;
  };

  const p1 = mk('cinema', {
    title: 'Анна и Михаил', couple: { a: 'Анна', b: 'Михаил' }, event: { date: '2027-06-12', time: '16:00', city: 'Москва' },
    ceremony: { name: 'Усадьба «Архангельское»', address: 'Красногорск, Ильинское ш., 1', time: '16:00' },
    party: { name: 'Ресторан «Белый сад»', address: 'Москва, Садовая ул., 12', time: '18:00' },
    photos: ['@demo/couple-1.jpg', '@demo/couple-2.jpg'], music: true, ago: 12,
    client: { names: 'Анна Белкина и Михаил Орлов', phone: '+7 916 123-45-67', email: 'anna@example.com' },
    questions: [{ id: 'transfer', label: 'Нужен ли трансфер из города?', type: 'choice', options: ['Да, туда и обратно', 'Только обратно', 'Нет, доберусь сам'], required: false }],
  });
  const p2 = mk('ivory', {
    title: 'Вариант в светлом стиле', couple: { a: 'Анна', b: 'Михаил' }, event: { date: '2027-06-12', time: '16:00', city: 'Москва' },
    ceremony: { name: 'Усадьба «Архангельское»', address: 'Красногорск, Ильинское ш., 1', time: '16:00' },
    party: { name: 'Ресторан «Белый сад»', address: 'Москва, Садовая ул., 12', time: '18:00' },
    photos: ['@demo/couple-1.jpg', '@demo/couple-2.jpg'], music: true, ago: 1,
  });
  const publish = (p, slug) => {
    p.slug = slug; p.status = 'published'; p.published = { templateId: p.templateId, data: JSON.parse(JSON.stringify(p.data)) };
    p.publishedRev = p.rev; p.publishedAt = new Date(Date.now() - 4 * 864e5).toISOString();
  };
  publish(p1, 'anna-i-mikhail');

  const fillGuests = (p, n, answered) => {
    const gs = core.addGuests(p, GUESTS.slice(0, n).map(([name, seats, group, salutation]) => ({ name, seats, group, salutation })), ws);
    gs.forEach((g, i) => {
      g.invitedAt = new Date(Date.now() - (6 - (i % 4)) * 864e5).toISOString();
      if (i < answered + 3) { g.openedAt = g.invitedAt; g.opens = 1 + (i % 3); }
      if (i < answered) {
        const yes = i % 5 !== 3;
        db.responses.push({
          id: uid(), projectId: p.id, guestId: g.id, name: g.name.replace(/^(Семья|Бабушка|Дядя) /, '$1 '), attending: yes,
          guests: yes ? g.seats : 0, food: i === 4 ? 'Вегетарианское меню' : i === 7 ? 'Аллергия на орехи' : '',
          wish: yes ? WISHES[i % WISHES.length] : 'Очень жаль, будем в отъезде. Обнимаем!',
          answers: p.data.rsvp.questions.length && yes ? { [p.data.rsvp.questions[0].label]: p.data.rsvp.questions[0].options[i % 3] } : {},
          createdAt: new Date(Date.now() - (i * 7 + 2) * 3600e3).toISOString(),
        });
      }
    });
  };
  fillGuests(p1, 16, 11);
  store.save();
}
