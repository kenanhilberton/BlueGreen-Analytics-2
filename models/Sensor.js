const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  
  userId: {
    type: String,
    required: [true, 'Müəssisə ID (userId) mütləq qeyd olunmalıdır'],
    trim: true
  },
  
  co2Emission: {
    type: Number, 
    required: true
  },
  energyConsumption: {
    type: Number, 
    required: true
  },
  waterUsage: {
    type: Number, 
    required: true
  },
  wasteRecycled: {
    type: Number, 
    default: 0
  },
  
  hseIncidents: {
    type: Number, 
    default: 0
  },
  trainingHours: {
    type: Number, 
    default: 0
  },
  
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });


sensorSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Sensor', sensorSchema);