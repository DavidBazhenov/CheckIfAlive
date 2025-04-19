const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB подключена');
    } catch (error) {
        console.error('Ошибка подключения к MongoDB:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB; 