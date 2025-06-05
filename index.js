require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const connectDB = require('./db/connection');
const Website = require('./models/Website');
const User = require('./models/User');
const { checkAllWebsites, checkWebsite } = require('./services/monitorService');

// Подключение к базе данных
connectDB();

// Создание экземпляра бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Список админ ID из переменных окружения
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];

// Функция для проверки прав администратора
function isAdmin(chatId) {
    return ADMIN_IDS.includes(chatId.toString());
}

// Функция для регистрации/обновления пользователя
async function registerUser(ctx) {
    const chatId = ctx.chat.id.toString();
    const userInfo = {
        chatId: chatId,
        username: ctx.from.username || '',
        firstName: ctx.from.first_name || '',
        lastName: ctx.from.last_name || '',
        lastActivity: Date.now()
    };

    try {
        await User.findOneAndUpdate(
            { chatId: chatId },
            userInfo,
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('Ошибка при регистрации пользователя:', error);
    }
}

// Функция для создания главного меню с кнопками
function getMainMenu() {
    return Markup.keyboard([
        ['🆕 Добавить сайт', '📋 Список сайтов'],
        ['🔄 Проверить сейчас', '📊 Статус'],
        ['❓ Помощь']
    ]).resize();
}

// Функция для создания админского меню
function getAdminMenu() {
    return Markup.keyboard([
        ['🆕 Добавить сайт', '📋 Список сайтов'],
        ['🔄 Проверить сейчас', '📊 Статус'],
        ['👥 Пользователи', '📈 Статистика'],
        ['❓ Помощь']
    ]).resize();
}

// Функция для получения правильного меню в зависимости от роли пользователя
function getUserMenu(chatId) {
    return isAdmin(chatId) ? getAdminMenu() : getMainMenu();
}

// Обработчик команды /start
bot.start(async (ctx) => {
    await registerUser(ctx);
    const chatId = ctx.chat.id.toString();
    const menu = getUserMenu(chatId);
    
    await ctx.reply(
        'Привет! Я бот для мониторинга доступности сайтов.\n' +
        'Используйте кнопки ниже или следующие команды:\n' +
        '/add - добавить новый сайт для мониторинга\n' +
        '/list - просмотреть список отслеживаемых сайтов\n' +
        '/check - немедленно проверить все сайты\n' +
        '/help - показать справку',
        menu
    );
});

// Обработчик команды /help
bot.help((ctx) => {
    ctx.reply(
        'Список доступных команд:\n' +
        '/add - добавить новый сайт для мониторинга\n' +
        '/list - просмотреть список отслеживаемых сайтов\n' +
        '/edit <id> - редактировать сайт\n' +
        '/delete <id> - удалить сайт из мониторинга\n' +
        '/check - немедленно проверить все сайты\n' +
        '/status - показать текущий статус всех сайтов',
        getMainMenu()
    );
});

// Админская команда help
bot.command('admin_help', (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.reply('У вас нет прав для выполнения этой команды.');
    }
    
    ctx.reply(
        '🔧 Админские команды:\n\n' +
        '📊 Просмотр данных:\n' +
        '• 👥 Пользователи - список всех пользователей\n' +
        '• 📈 Статистика - общая статистика системы\n' +
        '/users - список пользователей (команда)\n' +
        '/stats - статистика (команда)\n\n' +
        '🔍 Управление:\n' +
        '/user_info <chatId> - информация о пользователе\n' +
        '/sync_users - синхронизация счетчиков пользователей\n\n' +
        'ℹ️ Настройка:\n' +
        'Для назначения админов добавьте их chat ID в переменную окружения ADMIN_IDS через запятую',
        getAdminMenu()
    );
});

// Обработчики текстовых кнопок
bot.hears('🆕 Добавить сайт', (ctx) => {
    ctx.reply('Введите URL сайта для мониторинга (с http:// или https://):');
    const chatId = ctx.chat.id.toString();
    userSessions[chatId] = { state: 'ADD_WAITING_URL' };
});

bot.hears('📋 Список сайтов', async (ctx) => {
    await listWebsites(ctx);
});

bot.hears('🔄 Проверить сейчас', async (ctx) => {
    await checkNow(ctx);
});

bot.hears('📊 Статус', async (ctx) => {
    await showStatus(ctx);
});

bot.hears('❓ Помощь', (ctx) => {
    const chatId = ctx.chat.id.toString();
    const menu = getUserMenu(chatId);
    
    let helpMessage = 'Список доступных команд:\n' +
        '• 🆕 Добавить сайт - добавить новый сайт для мониторинга\n' +
        '• 📋 Список сайтов - просмотреть список отслеживаемых сайтов\n' +
        '• 🔄 Проверить сейчас - немедленно проверить все сайты\n' +
        '• 📊 Статус - показать текущий статус всех сайтов\n\n' +
        'Дополнительные команды:\n' +
        '/edit <id> - редактировать сайт\n' +
        '/delete <id> - удалить сайт из мониторинга';
    
    if (isAdmin(chatId)) {
        helpMessage += '\n\n🔧 Админские команды:\n' +
            '• 👥 Пользователи - список всех пользователей\n' +
            '• 📈 Статистика - статистика системы\n' +
            '/admin_help - подробная справка для админов';
    }
    
    ctx.reply(helpMessage, menu);
});

// Админские обработчики кнопок
bot.hears('👥 Пользователи', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.reply('У вас нет прав для выполнения этой команды.');
    }
    await showUsers(ctx);
});

bot.hears('📈 Статистика', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.reply('У вас нет прав для выполнения этой команды.');
    }
    await showStatistics(ctx);
});

// Состояния пользовательских сессий
const userSessions = {};

// Обработчик команды /add
bot.command('add', (ctx) => {
    const chatId = ctx.chat.id.toString();
    userSessions[chatId] = { state: 'ADD_WAITING_URL' };

    ctx.reply('Введите URL сайта для мониторинга (с http:// или https://):');
});

// Обработчик для ввода URL при добавлении сайта
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const text = ctx.message.text;

    // Если это не команда, не кнопка меню и пользователь находится в одном из состояний
    if (!text.startsWith('/') && !['🆕 Добавить сайт', '📋 Список сайтов', '🔄 Проверить сейчас', '📊 Статус', '❓ Помощь'].includes(text) && userSessions[chatId]) {
        const session = userSessions[chatId];

        // Обработка добавления нового сайта
        if (session.state === 'ADD_WAITING_URL') {
            // Проверка валидности URL
            if (!text.match(/^https?:\/\/.+/)) {
                return ctx.reply('Пожалуйста, введите корректный URL с http:// или https://', getMainMenu());
            }

            session.url = text;
            session.state = 'ADD_WAITING_NAME';
            return ctx.reply('Теперь введите название для этого сайта:');
        }

        // Обработка ввода названия сайта
        if (session.state === 'ADD_WAITING_NAME') {
            session.name = text;

            try {
                // Проверяем, не отслеживается ли уже этот URL
                const existingWebsite = await Website.findOne({ url: session.url });

                if (existingWebsite) {
                    // Если сайт уже отслеживается, добавляем chatId в список, если его там нет
                    if (!existingWebsite.chatIds.includes(chatId)) {
                        existingWebsite.chatIds.push(chatId);
                        await existingWebsite.save();
                        ctx.reply(`Сайт "${existingWebsite.name}" уже отслеживается, вы добавлены к списку получателей уведомлений.`, getMainMenu());
                    } else {
                        ctx.reply(`Вы уже отслеживаете сайт "${existingWebsite.name}"`, getMainMenu());
                    }
                } else {
                    // Создаем новый сайт для отслеживания
                    const newWebsite = new Website({
                        url: session.url,
                        name: session.name,
                        chatIds: [chatId]
                    });

                    await newWebsite.save();

                    // Обновляем счетчик сайтов пользователя
                    await User.findOneAndUpdate(
                        { chatId: chatId },
                        { $inc: { websiteCount: 1 } }
                    );

                    // Сразу проверяем сайт
                    const result = await checkWebsite(newWebsite);
                    await ctx.reply(
                        `Сайт "${session.name}" добавлен для мониторинга!\n` +
                        `Текущий статус: ${result.status === 'online' ? '✅ Онлайн' : '❌ Офлайн'}\n` +
                        `Время ответа: ${result.responseTime}ms`,
                        getMainMenu()
                    );
                }

                // Сбрасываем сессию
                delete userSessions[chatId];
            } catch (error) {
                console.error('Ошибка при добавлении сайта:', error);
                ctx.reply('Произошла ошибка при добавлении сайта. Пожалуйста, попробуйте еще раз.', getMainMenu());
                delete userSessions[chatId];
            }
        }

        // Обработка редактирования сайта
        if (session.state === 'EDIT_WAITING_NAME' && session.websiteId) {
            try {
                await Website.findByIdAndUpdate(session.websiteId, { name: text });
                ctx.reply(`Название сайта обновлено на "${text}"`, getMainMenu());
                delete userSessions[chatId];
            } catch (error) {
                console.error('Ошибка при обновлении сайта:', error);
                ctx.reply('Произошла ошибка при обновлении сайта. Пожалуйста, попробуйте еще раз.', getMainMenu());
                delete userSessions[chatId];
            }
        }

        if (session.state === 'EDIT_WAITING_URL' && session.websiteId) {
            // Проверка валидности URL
            if (!text.match(/^https?:\/\/.+/)) {
                return ctx.reply('Пожалуйста, введите корректный URL с http:// или https://');
            }

            try {
                await Website.findByIdAndUpdate(session.websiteId, { url: text });
                ctx.reply(`URL сайта обновлен на "${text}"`, getMainMenu());
                delete userSessions[chatId];
            } catch (error) {
                console.error('Ошибка при обновлении сайта:', error);
                ctx.reply('Произошла ошибка при обновлении сайта. Пожалуйста, попробуйте еще раз.', getMainMenu());
                delete userSessions[chatId];
            }
        }
    }
});

// Функция для отображения списка сайтов
async function listWebsites(ctx) {
    const chatId = ctx.chat.id.toString();

    try {
        const websites = await Website.find({ chatIds: chatId });

        if (websites.length === 0) {
            return ctx.reply('У вас нет отслеживаемых сайтов. Используйте кнопку "🆕 Добавить сайт" для добавления сайта.', getMainMenu());
        }

        let message = 'Список отслеживаемых сайтов:\n\n';

        websites.forEach((site, index) => {
            const statusEmoji = site.status === 'online' ? '✅' : (site.status === 'offline' ? '❌' : '⚠️');
            const lastChecked = site.lastChecked ? new Date(site.lastChecked).toLocaleString() : 'Никогда';

            message += `${index + 1}. ${statusEmoji} ${site.name}\n`;
            message += `   ID: ${site._id}\n`;
            message += `   URL: ${site.url}\n`;
            message += `   Статус: ${site.status}\n`;
            message += `   Последняя проверка: ${lastChecked}\n`;
            if (site.responseTime) {
                message += `   Время ответа: ${site.responseTime}ms\n`;
            }
            message += '\n';
        });

        // Создаем инлайн-кнопки для каждого сайта
        const inlineKeyboard = [];
        for (const site of websites) {
            inlineKeyboard.push([
                Markup.button.callback(`✏️ Редакт. ${site.name}`, `edit_site_${site._id}`),
                Markup.button.callback(`🗑️ Удалить ${site.name}`, `delete_site_${site._id}`)
            ]);
        }

        message += 'Выберите сайт для редактирования или удаления:';

        // Отправляем сообщение с инлайн-кнопками
        await ctx.reply(message, {
            ...Markup.inlineKeyboard(inlineKeyboard),
            ...getMainMenu()
        });
    } catch (error) {
        console.error('Ошибка при получении списка сайтов:', error);
        ctx.reply('Произошла ошибка при получении списка сайтов.', getMainMenu());
    }
}

// Обработчик команды /list
bot.command('list', async (ctx) => {
    await listWebsites(ctx);
});

// Обработчик инлайн-кнопок для редактирования и удаления сайтов из списка
bot.action(/edit_site_(.+)/, async (ctx) => {
    const websiteId = ctx.match[1];
    const chatId = ctx.chat.id.toString();

    try {
        const website = await Website.findOne({ _id: websiteId, chatIds: chatId });

        if (!website) {
            return ctx.answerCbQuery('Сайт не найден или вы не имеете прав на его редактирование.');
        }

        await ctx.reply(
            `Редактирование сайта "${website.name}":\n` +
            `URL: ${website.url}\n\n` +
            'Что вы хотите изменить?',
            Markup.inlineKeyboard([
                Markup.button.callback('✏️ Название', `edit_name_${websiteId}`),
                Markup.button.callback('🔗 URL', `edit_url_${websiteId}`)
            ])
        );
        ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при редактировании сайта:', error);
        ctx.answerCbQuery('Произошла ошибка при редактировании сайта.');
    }
});

bot.action(/delete_site_(.+)/, async (ctx) => {
    const websiteId = ctx.match[1];
    const chatId = ctx.chat.id.toString();

    try {
        const website = await Website.findOne({ _id: websiteId, chatIds: chatId });

        if (!website) {
            return ctx.answerCbQuery('Сайт не найден или вы не имеете прав на его удаление.');
        }

        // Подтверждение удаления
        await ctx.reply(
            `Вы уверены, что хотите удалить сайт "${website.name}"?`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Да, удалить', `confirm_delete_${websiteId}`),
                Markup.button.callback('❌ Отмена', 'cancel_delete')
            ])
        );
    } catch (error) {
        console.error('Ошибка при удалении сайта:', error);
        ctx.answerCbQuery('Произошла ошибка при удалении сайта.');
    }
});

bot.action(/confirm_delete_(.+)/, async (ctx) => {
    const websiteId = ctx.match[1];
    const chatId = ctx.chat.id.toString();

    try {
        const website = await Website.findOne({ _id: websiteId, chatIds: chatId });

        if (!website) {
            return ctx.answerCbQuery('Сайт не найден или вы не имеете прав на его удаление.');
        }

        // Если chatIds содержит только текущий chatId, удаляем сайт полностью
        if (website.chatIds.length === 1) {
            await Website.findByIdAndDelete(websiteId);
            
            // Обновляем счетчик сайтов пользователя
            await User.findOneAndUpdate(
                { chatId: chatId },
                { $inc: { websiteCount: -1 } }
            );
            
            ctx.reply(`Сайт "${website.name}" полностью удален из мониторинга.`, getMainMenu());
        } else {
            // Иначе удаляем только текущий chatId из списка
            website.chatIds = website.chatIds.filter(id => id !== chatId);
            await website.save();
            
            // Обновляем счетчик сайтов пользователя
            await User.findOneAndUpdate(
                { chatId: chatId },
                { $inc: { websiteCount: -1 } }
            );
            
            ctx.reply(`Вы отписались от уведомлений сайта "${website.name}".`, getMainMenu());
        }
        ctx.answerCbQuery('Сайт успешно удален.');
    } catch (error) {
        console.error('Ошибка при удалении сайта:', error);
        ctx.answerCbQuery('Произошла ошибка при удалении сайта.');
        ctx.reply('Произошла ошибка при удалении сайта.', getMainMenu());
    }
});

bot.action('cancel_delete', (ctx) => {
    ctx.reply('Удаление отменено.', getMainMenu());
    ctx.answerCbQuery();
});

// Обработчик команды /edit
bot.command('edit', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const parts = ctx.message.text.split(' ');

    if (parts.length < 2) {
        return ctx.reply('Пожалуйста, укажите ID сайта: /edit <id>', getMainMenu());
    }

    const websiteId = parts[1];

    try {
        const website = await Website.findOne({ _id: websiteId, chatIds: chatId });

        if (!website) {
            return ctx.reply('Сайт с указанным ID не найден или вы не имеете прав на его редактирование.', getMainMenu());
        }

        await ctx.reply(
            `Редактирование сайта "${website.name}":\n` +
            `URL: ${website.url}\n\n` +
            'Что вы хотите изменить?',
            Markup.inlineKeyboard([
                Markup.button.callback('✏️ Название', `edit_name_${websiteId}`),
                Markup.button.callback('🔗 URL', `edit_url_${websiteId}`)
            ])
        );
    } catch (error) {
        console.error('Ошибка при редактировании сайта:', error);
        ctx.reply('Произошла ошибка при редактировании сайта.', getMainMenu());
    }
});

// Обработчики инлайн-кнопок для редактирования
bot.action(/edit_name_(.+)/, (ctx) => {
    const websiteId = ctx.match[1];
    const chatId = ctx.chat.id.toString();

    userSessions[chatId] = {
        state: 'EDIT_WAITING_NAME',
        websiteId: websiteId
    };

    ctx.reply('Введите новое название для сайта:');
    ctx.answerCbQuery();
});

bot.action(/edit_url_(.+)/, (ctx) => {
    const websiteId = ctx.match[1];
    const chatId = ctx.chat.id.toString();

    userSessions[chatId] = {
        state: 'EDIT_WAITING_URL',
        websiteId: websiteId
    };

    ctx.reply('Введите новый URL для сайта (с http:// или https://):');
    ctx.answerCbQuery();
});

// Обработчик команды /delete
bot.command('delete', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const parts = ctx.message.text.split(' ');

    if (parts.length < 2) {
        return ctx.reply('Пожалуйста, укажите ID сайта: /delete <id>', getMainMenu());
    }

    const websiteId = parts[1];

    try {
        const website = await Website.findOne({ _id: websiteId, chatIds: chatId });

        if (!website) {
            return ctx.reply('Сайт с указанным ID не найден или вы не имеете прав на его удаление.', getMainMenu());
        }

        // Подтверждение удаления
        await ctx.reply(
            `Вы уверены, что хотите удалить сайт "${website.name}"?`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Да, удалить', `confirm_delete_${websiteId}`),
                Markup.button.callback('❌ Отмена', 'cancel_delete')
            ])
        );
    } catch (error) {
        console.error('Ошибка при удалении сайта:', error);
        ctx.reply('Произошла ошибка при удалении сайта.', getMainMenu());
    }
});

// Функция для проверки всех сайтов пользователя
async function checkNow(ctx) {
    const chatId = ctx.chat.id.toString();

    ctx.reply('Запускаю проверку всех сайтов...');

    try {
        const websites = await Website.find({ chatIds: chatId });

        if (websites.length === 0) {
            return ctx.reply('У вас нет отслеживаемых сайтов. Используйте кнопку "🆕 Добавить сайт" для добавления сайта.', getMainMenu());
        }

        let checkedCount = 0;
        let offlineCount = 0;
        let message = 'Результаты проверки:\n\n';

        for (const website of websites) {
            const result = await checkWebsite(website);
            checkedCount++;

            const statusEmoji = website.status === 'online' ? '✅' : '❌';
            message += `${statusEmoji} ${website.name} (${website.url}): ${website.status.toUpperCase()}\n`;

            if (website.status === 'offline') {
                offlineCount++;
            }
        }

        message += `\nПроверено сайтов: ${checkedCount}`;
        message += `\nНедоступно: ${offlineCount}`;

        ctx.reply(message, getMainMenu());
    } catch (error) {
        console.error('Ошибка при проверке сайтов:', error);
        ctx.reply('Произошла ошибка при проверке сайтов.', getMainMenu());
    }
}

// Обработчик команды /check
bot.command('check', async (ctx) => {
    await checkNow(ctx);
});

// Функция для отображения статуса сайтов
async function showStatus(ctx) {
    const chatId = ctx.chat.id.toString();

    try {
        const websites = await Website.find({ chatIds: chatId });

        if (websites.length === 0) {
            return ctx.reply('У вас нет отслеживаемых сайтов. Используйте кнопку "🆕 Добавить сайт" для добавления сайта.', getMainMenu());
        }

        let message = 'Текущий статус сайтов:\n\n';
        let onlineCount = 0;
        let offlineCount = 0;

        websites.forEach(website => {
            const statusEmoji = website.status === 'online' ? '✅' : (website.status === 'offline' ? '❌' : '⚠️');
            message += `${statusEmoji} ${website.name}: ${website.status.toUpperCase()}\n`;

            if (website.status === 'online') {
                onlineCount++;
            } else if (website.status === 'offline') {
                offlineCount++;
            }
        });

        message += `\nВсего сайтов: ${websites.length}`;
        message += `\nОнлайн: ${onlineCount}`;
        message += `\nОфлайн: ${offlineCount}`;

        ctx.reply(message, getMainMenu());
    } catch (error) {
        console.error('Ошибка при получении статуса сайтов:', error);
        ctx.reply('Произошла ошибка при получении статуса сайтов.', getMainMenu());
    }
}

// Обработчик команды /status
bot.command('status', async (ctx) => {
    await showStatus(ctx);
});

// Запуск проверки всех сайтов и отправка уведомлений
async function checkAndNotify() {
    try {
        const results = await checkAllWebsites();

        // Отправляем уведомления только если статус изменился
        for (const result of results) {
            if (result.changed) {
                const website = result.website;
                const statusEmoji = result.status === 'online' ? '✅' : '❌';
                let message = '';

                if (result.status === 'online') {
                    message = `${statusEmoji} Сайт снова доступен: ${website.name} (${website.url})\n`;
                    message += `Время ответа: ${result.responseTime}ms`;
                } else {
                    message = `${statusEmoji} Сайт недоступен: ${website.name} (${website.url})\n`;
                    if (result.error) {
                        message += `Ошибка: ${result.error}`;
                    } else {
                        message += `Статус код: ${result.statusCode}`;
                    }
                }

                // Отправляем уведомления всем подписанным пользователям
                for (const chatId of website.chatIds) {
                    try {
                        await bot.telegram.sendMessage(chatId, message, getMainMenu());
                    } catch (error) {
                        console.error(`Ошибка при отправке уведомления в чат ${chatId}:`, error);
                    }
                }
            }
        }
        console.log('Проверка завершена');
    } catch (error) {
        console.error('Ошибка при проверке и отправке уведомлений:', error);
    }
}

// Настраиваем cron-задачу для запуска проверки каждые 5 минут
cron.schedule('*/5 * * * *', () => {
    console.log('Запуск плановой проверки сайтов...');
    checkAndNotify();
});

// Обрабатываем исключения
bot.catch((err, ctx) => {
    console.error(`Ошибка для ${ctx.updateType}:`, err);
    ctx.reply('Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.', getMainMenu());
});

// Админские функции
async function showUsers(ctx) {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        const totalUsers = users.length;
        const activeUsers = users.filter(user => user.isActive).length;
        
        if (totalUsers === 0) {
            return ctx.reply('Пользователи не найдены.', getAdminMenu());
        }

        let message = `👥 Пользователи (${totalUsers} всего, ${activeUsers} активных):\n\n`;
        
        for (const user of users.slice(0, 20)) { // Показываем первых 20 пользователей
            const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Без имени';
            const status = user.isActive ? '✅' : '❌';
            const lastActivity = new Date(user.lastActivity).toLocaleDateString();
            
            message += `${status} ${name}\n`;
            message += `   ID: ${user.chatId}\n`;
            message += `   Username: @${user.username || 'нет'}\n`;
            message += `   Сайтов: ${user.websiteCount}\n`;
            message += `   Последняя активность: ${lastActivity}\n\n`;
        }
        
        if (totalUsers > 20) {
            message += `... и еще ${totalUsers - 20} пользователей\n`;
        }

        // Создаем инлайн-кнопки для дополнительных действий
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📊 Подробная статистика', 'admin_detailed_stats')],
            [Markup.button.callback('🔄 Обновить', 'admin_refresh_users')]
        ]);

        await ctx.reply(message, keyboard);
    } catch (error) {
        console.error('Ошибка при получении списка пользователей:', error);
        ctx.reply('Произошла ошибка при получении списка пользователей.', getAdminMenu());
    }
}

async function showStatistics(ctx) {
    try {
        const [userStats, websiteStats] = await Promise.all([
            User.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
                        totalWebsites: { $sum: '$websiteCount' }
                    }
                }
            ]),
            Website.aggregate([
                {
                    $group: {
                        _id: null,
                        totalWebsites: { $sum: 1 },
                        onlineWebsites: { $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] } },
                        offlineWebsites: { $sum: { $cond: [{ $eq: ['$status', 'offline'] }, 1, 0] } },
                        totalSubscriptions: { $sum: { $size: '$chatIds' } }
                    }
                }
            ])
        ]);

        const userStat = userStats[0] || { totalUsers: 0, activeUsers: 0, totalWebsites: 0 };
        const websiteStat = websiteStats[0] || { totalWebsites: 0, onlineWebsites: 0, offlineWebsites: 0, totalSubscriptions: 0 };

        const message = `📈 Статистика системы:\n\n` +
            `👥 Пользователи:\n` +
            `• Всего пользователей: ${userStat.totalUsers}\n` +
            `• Активных пользователей: ${userStat.activeUsers}\n\n` +
            `🌐 Сайты:\n` +
            `• Всего сайтов: ${websiteStat.totalWebsites}\n` +
            `• Онлайн: ${websiteStat.onlineWebsites}\n` +
            `• Офлайн: ${websiteStat.offlineWebsites}\n` +
            `• Всего подписок: ${websiteStat.totalSubscriptions}\n\n` +
            `📊 Дополнительно:\n` +
            `• Среднее сайтов на пользователя: ${userStat.totalUsers > 0 ? (websiteStat.totalSubscriptions / userStat.totalUsers).toFixed(1) : 0}`;

        await ctx.reply(message, getAdminMenu());
    } catch (error) {
        console.error('Ошибка при получении статистики:', error);
        ctx.reply('Произошла ошибка при получении статистики.', getAdminMenu());
    }
}

// Обработчики админских инлайн-кнопок
bot.action('admin_detailed_stats', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.answerCbQuery('У вас нет прав для выполнения этой команды.');
    }
    await showStatistics(ctx);
    ctx.answerCbQuery();
});

bot.action('admin_refresh_users', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.answerCbQuery('У вас нет прав для выполнения этой команды.');
    }
    await showUsers(ctx);
    ctx.answerCbQuery('Список обновлен');
});

// Админские команды
bot.command('users', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.reply('У вас нет прав для выполнения этой команды.');
    }
    await showUsers(ctx);
});

bot.command('stats', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.reply('У вас нет прав для выполнения этой команды.');
    }
    await showStatistics(ctx);
});

bot.command('user_info', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.reply('У вас нет прав для выполнения этой команды.');
    }
    
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) {
        return ctx.reply('Пожалуйста, укажите chat ID пользователя: /user_info <chatId>', getAdminMenu());
    }
    
    const targetChatId = parts[1];
    
    try {
        const user = await User.findOne({ chatId: targetChatId });
        if (!user) {
            return ctx.reply('Пользователь с указанным chat ID не найден.', getAdminMenu());
        }
        
        const websites = await Website.find({ chatIds: targetChatId });
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Без имени';
        
        let message = `👤 Информация о пользователе:\n\n`;
        message += `Имя: ${name}\n`;
        message += `Username: @${user.username || 'нет'}\n`;
        message += `Chat ID: ${user.chatId}\n`;
        message += `Роль: ${user.role}\n`;
        message += `Статус: ${user.isActive ? '✅ Активен' : '❌ Неактивен'}\n`;
        message += `Зарегистрирован: ${new Date(user.createdAt).toLocaleString()}\n`;
        message += `Последняя активность: ${new Date(user.lastActivity).toLocaleString()}\n`;
        message += `Сайтов в счетчике: ${user.websiteCount}\n`;
        message += `Реальное количество сайтов: ${websites.length}\n\n`;
        
        if (websites.length > 0) {
            message += `🌐 Отслеживаемые сайты:\n`;
            websites.forEach((site, index) => {
                const statusEmoji = site.status === 'online' ? '✅' : (site.status === 'offline' ? '❌' : '⚠️');
                message += `${index + 1}. ${statusEmoji} ${site.name} (${site.url})\n`;
            });
        }
        
        ctx.reply(message, getAdminMenu());
    } catch (error) {
        console.error('Ошибка при получении информации о пользователе:', error);
        ctx.reply('Произошла ошибка при получении информации о пользователе.', getAdminMenu());
    }
});

bot.command('sync_users', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!isAdmin(chatId)) {
        return ctx.reply('У вас нет прав для выполнения этой команды.');
    }
    
    try {
        ctx.reply('Запускаю синхронизацию счетчиков пользователей...');
        
        const users = await User.find({});
        let syncedCount = 0;
        
        for (const user of users) {
            const websiteCount = await Website.countDocuments({ chatIds: user.chatId });
            if (user.websiteCount !== websiteCount) {
                await User.findByIdAndUpdate(user._id, { websiteCount: websiteCount });
                syncedCount++;
            }
        }
        
        ctx.reply(`✅ Синхронизация завершена. Обновлено пользователей: ${syncedCount}`, getAdminMenu());
    } catch (error) {
        console.error('Ошибка при синхронизации пользователей:', error);
        ctx.reply('Произошла ошибка при синхронизации пользователей.', getAdminMenu());
    }
});

// Запуск бота
bot.launch().then(() => {
    console.log('Бот запущен!');
}).catch(err => {
    console.error('Ошибка при запуске бота:', err);
});

// Включаем плавное завершение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 