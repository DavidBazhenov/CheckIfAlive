const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['online', 'offline', 'unknown'],
        default: 'unknown'
    },
    lastChecked: {
        type: Date,
        default: null
    },
    responseTime: {
        type: Number,
        default: null
    },
    chatIds: [{
        type: String,
        required: true
    }]
}, { timestamps: true });

module.exports = mongoose.model('Website', websiteSchema); 