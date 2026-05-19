const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  
  userId: { 
    type: String, 
    required: [true, 'Müəssisə ID sahəsi məcburidir'], 
    unique: true, 
    trim: true 
  },
  companyName: { 
    type: String, 
    required: [true, 'Müəssisə adı məcburidir'] 
  },
  email: { 
    type: String, 
    required: [true, 'E-poçt məcburidir'], 
    unique: true, 
    lowercase: true 
  },
  password: { 
    type: String, 
    required: [true, 'Şifrə məcburidir'] 
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);