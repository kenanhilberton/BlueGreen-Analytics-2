const mongoose = require('mongoose');

const EsgDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: String, // Yan, Fev, Mar və s.
    required: true
  },
  // 🍃 Ekoloji Data (Environmental)
  scope1: { type: Number, default: 0 },
  scope2: { type: Number, default: 0 },
  waterConsumption: { type: Number, default: 0 },
  greenEnergyShare: { type: Number, default: 0 },
  
  // 🤝 Sosial Göstəricilər (Social)
  hseDays: { type: Number, default: 0 },
  trainingHours: { type: Number, default: 0 },
  staffTurnover: { type: Number, default: 0 },
  employeeSatisfaction: { type: Number, default: 0 },
  
  // ⚖️ Korporativ İdarəetmə (Governance)
  griCompliance: { type: Number, default: 0 },
  transparencyDegree: { type: Number, default: 0 },
  cyberSecurityTraining: { type: Number, default: 0 },
  lawViolations: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('EsgData', EsgDataSchema);