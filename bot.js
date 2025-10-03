
const { Bot, session, InputFile } = require('grammy');

const token = '8059173409:AAGDCaC3YWFVARizM-shzllGyyGC0Vj8GuY';
const groupId = '-4883402981'; // Например: -1001234567890


const bot = new Bot(token);

// Состояния анкеты
const STATES = {
  IDLE: 'idle',
  WAITING_NAME: 'waiting_name',
  WAITING_CITY: 'waiting_city',
  WAITING_SOCIAL: 'waiting_social',
  WAITING_VIDEO: 'waiting_video',
  WAITING_VOICE: 'waiting_voice',
  WAITING_PHOTO: 'waiting_photo'
};

// Middleware для сессий (хранение данных пользователя)
bot.use(session({
  initial: () => ({
    state: STATES.IDLE,
    data: {
      name: '',
      city: '',
      social: '',
      videoLinks: [],
      voiceOrVideo: null,
      photo: null
    }
  })
}));

// Команда /start
bot.command('start', async (ctx) => {
  ctx.session.state = STATES.WAITING_NAME;
  ctx.session.data = {
    name: '',
    city: '',
    social: '',
    videoLinks: [],
    voiceOrVideo: null,
    photo: null
  };
  
  await ctx.reply(
    'Привет! Мы ищем bboys для съёмок первого художественного фильма про брейкинг.\n\n' +
    'Как тебя зовут? Имя/Никнейм'
  );
});

// Обработка текстовых сообщений
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  const session = ctx.session;
  
  switch (session.state) {
    case STATES.WAITING_NAME:
      session.data.name = text;
      session.state = STATES.WAITING_CITY;
      await ctx.reply('Из какого ты города?');
      break;
      
    case STATES.WAITING_CITY:
      session.data.city = text;
      session.state = STATES.WAITING_SOCIAL;
      await ctx.reply('Твоя ссылка на любые соцсети:');
      break;
      
    case STATES.WAITING_SOCIAL:
      session.data.social = text;
      session.state = STATES.WAITING_VIDEO;
      await ctx.reply(
        'Теперь пришли видео или ссылки на свои выступления/записи\n\n' +
        '(Можешь отправить несколько сообщений. Когда закончишь, напиши "готово")'
      );
      break;
      
    case STATES.WAITING_VIDEO:
      if (text.toLowerCase() === 'готово') {
        session.state = STATES.WAITING_VOICE;
        await ctx.reply(
          'Отлично. Дальше нужно записать кружок или видео. Важно сказать:\n\n' +
          '— Имя\n' +
          '— Возраст\n' +
          '— Рост\n' +
          '— Размер одежды/обуви\n' +
          '— Опыт в брейкинге\n' +
          '— Любые факты о себе.\n\n' +
          'Летсго!'
        );
      } else {
        session.data.videoLinks.push(text);
        await ctx.reply('Принял! Можешь отправить ещё ссылки или напиши "готово"');
      }
      break;
      
    default:
      // Игнорируем сообщения в других состояниях
      break;
  }
});

// Обработка видео
bot.on('message:video', async (ctx) => {
  const session = ctx.session;
  
  if (session.state === STATES.WAITING_VIDEO) {
    const fileId = ctx.message.video.file_id;
    session.data.videoLinks.push(`video:${fileId}`);
    await ctx.reply('Видео получил! Можешь отправить ещё или напиши "готово"');
  } else if (session.state === STATES.WAITING_VOICE) {
    session.data.voiceOrVideo = { type: 'video', fileId: ctx.message.video.file_id };
    session.state = STATES.WAITING_PHOTO;
    await ctx.reply('И последнее. Твоя фотография в полный рост:');
  }
});

// Обработка видео как документа (файла)
bot.on('message:document', async (ctx) => {
  const session = ctx.session;
  const document = ctx.message.document;
  
  // Проверяем, что это видео файл
  const isVideo = document.mime_type && document.mime_type.startsWith('video/');
  
  if (session.state === STATES.WAITING_VIDEO && isVideo) {
    const fileId = document.file_id;
    session.data.videoLinks.push(`document:${fileId}`);
    await ctx.reply('Видео получил! Можешь отправить ещё или напиши "готово"');
  } else if (session.state === STATES.WAITING_VOICE && isVideo) {
    session.data.voiceOrVideo = { type: 'document', fileId: document.file_id };
    session.state = STATES.WAITING_PHOTO;
    await ctx.reply('И последнее. Твоя фотография в полный рост:');
  }
});

// Обработка видеокружков
bot.on('message:video_note', async (ctx) => {
  const session = ctx.session;
  
  if (session.state === STATES.WAITING_VOICE) {
    session.data.voiceOrVideo = { type: 'video_note', fileId: ctx.message.video_note.file_id };
    session.state = STATES.WAITING_PHOTO;
    await ctx.reply('И последнее. Твоя фотография в полный рост:');
  }
});

// Обработка голосовых сообщений
bot.on('message:voice', async (ctx) => {
  const session = ctx.session;
  
  if (session.state === STATES.WAITING_VOICE) {
    session.data.voiceOrVideo = { type: 'voice', fileId: ctx.message.voice.file_id };
    session.state = STATES.WAITING_PHOTO;
    await ctx.reply('И последнее. Твоя фотография в полный рост:');
  }
});

// Обработка фотографий
bot.on('message:photo', async (ctx) => {
  const session = ctx.session;
  
  if (session.state === STATES.WAITING_PHOTO) {
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1]; // Берём фото в лучшем качестве
    session.data.photo = photo.file_id;
    
    // Отправляем анкету в группу
    await sendApplicationToGroup(ctx, session.data);
    
    // Благодарим пользователя
    await ctx.reply(
      'Спасибо! Это общий шаг для брейкинга и твой первый шаг в кино. ' +
      'Мы вернемся к тебе в скором времени.'
    );
    
    // Сбрасываем сессию
    session.state = STATES.IDLE;
  }
});

// Функция отправки анкеты в группу
async function sendApplicationToGroup(ctx, data) {
  try {
    const userId = ctx.from.id;
    const username = ctx.from.username ? `@${ctx.from.username}` : 'без username';
    
    // Формируем текст анкеты
    let message = '📋 НОВАЯ АНКЕТА\n\n';
    message += `👤 Имя: ${data.name}\n`;
    message += `🏙 Город: ${data.city}\n`;
    message += `📱 Соцсети: ${data.social}\n`;
    message += `🎥 Видео/Ссылки:\n`;
    
    data.videoLinks.forEach((link, index) => {
      if (link.startsWith('video:') || link.startsWith('document:')) {
        message += `${index + 1}. [Видео прикреплено]\n`;
      } else {
        message += `${index + 1}. ${link}\n`;
      }
    });
    
    message += `\n👤 ID: ${userId}\n`;
    message += `📧 Username: ${username}`;
    
    // Отправляем текст
    await bot.api.sendMessage(groupId, message);
    
    // Отправляем видео файлы если есть
    for (const link of data.videoLinks) {
      if (link.startsWith('video:')) {
        const fileId = link.replace('video:', '');
        await bot.api.sendVideo(groupId, fileId, { 
          caption: 'Видео выступления' 
        });
      } else if (link.startsWith('document:')) {
        const fileId = link.replace('document:', '');
        await bot.api.sendDocument(groupId, fileId, { 
          caption: 'Видео выступления (файл)' 
        });
      }
    }
    
    // Отправляем голосовое/видео с представлением
    if (data.voiceOrVideo) {
      const caption = 'Видео-представление с информацией';
      if (data.voiceOrVideo.type === 'video') {
        await bot.api.sendVideo(groupId, data.voiceOrVideo.fileId, { caption });
      } else if (data.voiceOrVideo.type === 'video_note') {
        await bot.api.sendVideoNote(groupId, data.voiceOrVideo.fileId);
      } else if (data.voiceOrVideo.type === 'voice') {
        await bot.api.sendVoice(groupId, data.voiceOrVideo.fileId, { caption });
      } else if (data.voiceOrVideo.type === 'document') {
        await bot.api.sendDocument(groupId, data.voiceOrVideo.fileId, { caption });
      }
    }
    
    // Отправляем фото
    if (data.photo) {
      await bot.api.sendPhoto(groupId, data.photo, { 
        caption: 'Фото в полный рост' 
      });
    }
    
    console.log('✅ Анкета успешно отправлена в группу');
  } catch (error) {
    console.error('❌ Ошибка при отправке анкеты в группу:', error);
  }
}

// Обработка ошибок
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`❌ Ошибка при обработке обновления ${ctx.update.update_id}:`);
  const e = err.error;
  console.error('Error:', e);
});

// Запуск бота
bot.start({
  onStart: (botInfo) => {
    console.log('🚀 Бот запущен:', botInfo.username);
  }
});