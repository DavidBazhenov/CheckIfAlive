const axios = require('axios');
const Website = require('../models/Website');

// Функция проверки одного сайта
async function checkWebsite(website) {
    const startTime = Date.now();
    try {
        const response = await axios.get(website.url, {
            timeout: 10000,
            validateStatus: false
        });

        const responseTime = Date.now() - startTime;
        const isOnline = response.status >= 200 && response.status < 400;
        const newStatus = isOnline ? 'online' : 'offline';
        const oldStatus = website.status;

        // Обновляем информацию о сайте
        await Website.findByIdAndUpdate(website._id, {
            status: newStatus,
            lastChecked: new Date(),
            responseTime: responseTime
        });

        // Если статус изменился с online на offline, возвращаем информацию
        if (oldStatus === 'online' && newStatus === 'offline') {
            return {
                changed: true,
                website: website,
                status: newStatus,
                responseTime: responseTime,
                statusCode: response.status
            };
        }

        // Если статус изменился с offline/unknown на online, тоже отправляем уведомление
        if ((oldStatus === 'offline' || oldStatus === 'unknown') && newStatus === 'online') {
            return {
                changed: true,
                website: website,
                status: newStatus,
                responseTime: responseTime,
                statusCode: response.status
            };
        }

        return { changed: false };
    } catch (error) {
        const responseTime = Date.now() - startTime;
        const oldStatus = website.status;

        // Обновляем информацию о сайте при ошибке
        await Website.findByIdAndUpdate(website._id, {
            status: 'offline',
            lastChecked: new Date(),
            responseTime: responseTime
        });

        // Если статус изменился с online на offline, возвращаем информацию
        if (oldStatus === 'online') {
            return {
                changed: true,
                website: website,
                status: 'offline',
                responseTime: responseTime,
                error: error.message
            };
        }

        return { changed: false };
    }
}

// Основная функция для проверки всех сайтов
async function checkAllWebsites() {
    try {
        const websites = await Website.find({});
        const results = [];

        for (const website of websites) {
            const result = await checkWebsite(website);
            if (result.changed) {
                results.push(result);
            }
        }

        return results;
    } catch (error) {
        console.error('Ошибка при проверке сайтов:', error);
        return [];
    }
}

module.exports = {
    checkWebsite,
    checkAllWebsites
}; 