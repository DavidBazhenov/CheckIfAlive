# CheckAlive - Бот для мониторинга сайтов

Телеграм бот для мониторинга доступности сайтов с уведомлениями о сбоях и восстановлении.

## Возможности

### Для всех пользователей:
- Добавление сайтов для мониторинга
- Редактирование данных сайтов (URL, название)
- Немедленная проверка доступности сайтов
- Уведомления при падении или восстановлении работы сайта
- Просмотр текущего статуса всех отслеживаемых сайтов
- Автоматическая проверка доступности каждые 5 минут
- Удобный интерфейс с кнопками для основных действий

### Для администраторов:
- Просмотр списка всех пользователей системы
- Получение подробной статистики использования
- Просмотр информации о конкретном пользователе
- Синхронизация счетчиков сайтов пользователей
- Расширенное меню с админскими функциями

## Технологии

- Node.js
- MongoDB (с Mongoose)
- Telegraf (для создания бота)
- Axios (для HTTP-запросов)
- Node-cron (для планирования заданий)

## Установка

1. Клонируйте репозиторий:

```bash
git clone https://github.com/yourusername/checkalive.git
cd checkalive
```

2. Установите зависимости:

```bash
npm install
```

3. Создайте файл `.env` с следующими параметрами:

```
BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=mongodb://localhost:27017/checkalive
CHECK_INTERVAL=300000
ADMIN_IDS=123456789,987654321
```

4. Получите токен для Telegram бота у [@BotFather](https://t.me/BotFather).

5. Запустите MongoDB или используйте MongoDB Atlas.

6. Запустите бота:

```bash
npm start
```

## Настройка администраторов

Для назначения администраторов:

1. Узнайте chat ID пользователей (отображается в логах при первом обращении к боту)
2. Добавьте их в переменную окружения `ADMIN_IDS` через запятую без пробелов
3. Перезапустите бота

Пример:
```
ADMIN_IDS=123456789,987654321,555666777
```

## Интерфейс бота

### Обычные пользователи
Бот имеет удобный интерфейс с кнопками для основных действий:

- 🆕 **Добавить сайт** - добавление нового сайта для мониторинга
- 📋 **Список сайтов** - просмотр списка отслеживаемых сайтов
- 🔄 **Проверить сейчас** - немедленная проверка всех сайтов
- 📊 **Статус** - показать текущий статус всех сайтов
- ❓ **Помощь** - показать справку по командам

### Администраторы
Администраторы видят расширенное меню с дополнительными кнопками:

- 👥 **Пользователи** - список всех пользователей системы
- 📈 **Статистика** - общая статистика использования

При просмотре списка сайтов доступны удобные кнопки редактирования и удаления для каждого сайта.

## Текстовые команды бота

### Основные команды (для всех):

- `/start` - Начало работы с ботом
- `/help` - Показать справку по командам
- `/add` - Добавить новый сайт для мониторинга
- `/list` - Просмотреть список отслеживаемых сайтов
- `/edit <id>` - Редактировать сайт
- `/delete <id>` - Удалить сайт из мониторинга
- `/check` - Немедленно проверить все сайты
- `/status` - Показать текущий статус всех сайтов

### Админские команды:

- `/admin_help` - Подробная справка для администраторов
- `/users` - Список всех пользователей
- `/stats` - Статистика системы
- `/user_info <chatId>` - Информация о конкретном пользователе
- `/sync_users` - Синхронизация счетчиков сайтов пользователей

## Как работает мониторинг

Бот отправляет HTTP-запросы к сайтам каждые 5 минут (настраивается переменной CHECK_INTERVAL). Если статус сайта меняется (с доступного на недоступный или наоборот), бот отправляет уведомление всем пользователям, подписанным на этот сайт.

Сайт считается доступным, если он отвечает HTTP-статусом в диапазоне 200-399.

## Структура данных

### Пользователи
Система автоматически регистрирует пользователей при первом обращении и отслеживает:
- Chat ID и основную информацию
- Роль (user/admin)
- Статус активности
- Количество отслеживаемых сайтов
- Время последней активности

### Сайты
Каждый сайт может отслеживаться несколькими пользователями одновременно, система хранит:
- URL и название сайта
- Текущий статус (online/offline/unknown)
- Время последней проверки
- Время ответа
- Список подписанных пользователей
