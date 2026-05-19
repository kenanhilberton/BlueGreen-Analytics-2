const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); 

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'bluegreen_secret_key_123'; 


const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bluegreen_esg';

mongoose.connect(MONGO_URI)
  .then(() => console.log('💾 MongoDB-yə uğurla qoşuldu!'))
  .catch(err => console.error('❌ MongoDB qoşulma xətası:', err));


const SensorDataSchema = new mongoose.Schema({
  co2Emission: Number,
  energyConsumption: Number,
  waterUsage: Number,
  wasteRecycled: Number,
  hseIncidents: Number,
  trainingHours: Number,
  timestamp: { type: Date, default: Date.now }
});

const SensorData = mongoose.model('SensorData', SensorDataSchema);


const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token tapılmadı' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token etibarsızdır' });
    req.user = user;
    next();
  });
};


setInterval(async () => {
  try {
    const newData = new SensorData({
      co2Emission: Math.random() * (90 - 30) + 30,       // 30 - 90 arası tCO2e
      energyConsumption: Math.random() * (85 - 25) + 25, // 25 - 85 arası kWh
      waterUsage: Math.floor(Math.random() * (4000 - 2000) + 2000),
      wasteRecycled: Math.floor(Math.random() * (95 - 65) + 65),
      hseIncidents: Math.floor(Math.random() * (365 - 300) + 300),
      trainingHours: Math.floor(Math.random() * (24 - 10) + 10)
    });

    await newData.save();
    // Verilənlər bazası çox şişməsin deyə sadəcə son 100 datanı saxlayıb köhnələri silə bilərik (Könüllü)
    const count = await SensorData.countDocuments();
    if (count > 100) {
      const oldest = await SensorData.findOne().sort({ timestamp: 1 });
      if (oldest) await SensorData.deleteOne({ _id: oldest._id });
    }
  } catch (err) {
    console.error("Datanın bazaya yazılmasında xəta:", err.message);
  }
}, 5000);




app.get('/api/sensors/live', authenticateToken, async (req, res) => {
  try {
    
    const latestData = await SensorData.findOne().sort({ timestamp: -1 });
    
    if (!latestData) {
      return res.status(404).json({ message: "Bazada hələ heç bir sensor datası yoxdur." });
    }
    
    res.json(latestData);
  } catch (err) {
    res.status(500).json({ message: "Server xətası baş verdi." });
  }
});


app.put('/api/profile/update', authenticateToken, (req, res) => {
  const { companyName, email, password } = req.body;
  console.log(`Profil yeniləndi: ${companyName}, ${email}`);
  res.json({ message: "Profil uğurla yeniləndi" });
});


const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 BlueGreen ESG Backend Server ${PORT} portunda aktivdir.`);
});


app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  
  if (email && password) {
    
    const token = jwt.sign({ email, companyName: "BlueGreen Müəssisə" }, JWT_SECRET, { expiresIn: '24h' });
    
    return res.json({
      token,
      user: {
        email: email,
        companyName: "BlueGreen Müəssisə"
      }
    });
  }

  return res.status(400).json({ message: "E-poçt və ya şifrə yanlışdır" });
});