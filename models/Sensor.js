const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  // 🔑 Bu məlumatın hansı müəssisəyə aid olduğunu bilmək üçün əlaqə ID-si
  userId: {
    type: String,
    required: [true, 'Müəssisə ID (userId) mütləq qeyd olunmalıdır'],
    trim: true
  },
  // 🍃 Ekoloji (Environmental) Göstəricilər
  co2Emission: {
    type: Number, // Ton və ya kq ilə
    required: true
  },
  energyConsumption: {
    type: Number, // kWh ilə
    required: true
  },
  waterUsage: {
    type: Number, // m³ ilə
    required: true
  },
  wasteRecycled: {
    type: Number, // % ilə (Geri çevrilən tullantı)
    default: 0
  },
  // 🤝 Sosial (Social) Göstəricilər
  hseIncidents: {
    type: Number, // Əmək təhlükəsizliyi qəza sayı
    default: 0
  },
  trainingHours: {
    type: Number, // İşçilərin ümumi təlim saatı
    default: 0
  },
  // 📅 Məlumatın yazılma vaxtı
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Çoxlu sorğularda performansı artırmaq üçün userId üzərindən indeks yaradırıq
sensorSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Sensor', sensorSchema);