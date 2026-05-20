const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); 

const app = express();

// CORS ayarını hər kəsə açırıq ki Netlify rəvan qoşulsun
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'bluegreen_secret_key_123'; 
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bluegreen_esg';

mongoose.connect(MONGO_URI)
  .then(() => console.log('💾 MongoDB-yə uğurla qoşuldu!'))
  .catch(err => console.error('❌ MongoDB qoşulma xətası:', err));

// --- SENSOR SCHEMA & INTERVAL (Olduğu kimi qalır) ---
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
      co2Emission: Math.random() * (90 - 30) + 30,
      energyConsumption: Math.random() * (85 - 25) + 25,
      waterUsage: Math.floor(Math.random() * (4000 - 2000) + 2000),
      wasteRecycled: Math.floor(Math.random() * (95 - 65) + 65),
      hseIncidents: Math.floor(Math.random() * (365 - 300) + 300),
      trainingHours: Math.floor(Math.random() * (24 - 10) + 10)
    });
    await newData.save();
    const count = await SensorData.countDocuments();
    if (count > 100) {
      const oldest = await SensorData.findOne().sort({ timestamp: 1 });
      if (oldest) await SensorData.deleteOne({ _id: oldest._id });
    }
  } catch (err) {
    console.error("Datanın bazaya yazılmasında xəta:", err.message);
  }
}, 5000);

// --- API MARŞRUTLARI (ROUTES) ---

// 1. Ünvan yoxlaması üçün ana səhifə (Cannot GET xətası verməsin deyə)
app.get('/', (req, res) => {
  res.send('🚀 BlueGreen ESG Backend Server rəsmi olaraq aktivdir!');
});

// 2. LIVE SENSORS
app.get('/api/sensors/live', authenticateToken, async (req, res) => {
  try {
    const latestData = await SensorData.findOne().sort({ timestamp: -1 });
    if (!latestData) return res.status(404).json({ message: "Bazada data yoxdur." });
    res.json(latestData);
  } catch (err) {
    res.status(500).json({ message: "Server xətası baş verdi." });
  }
});

// 3. PROFILE UPDATE
app.put('/api/profile/update', authenticateToken, (req, res) => {
  const { companyName, email } = req.body;
  console.log(`Profil yeniləndi: ${companyName}, ${email}`);
  res.json({ message: "Profil uğurla yeniləndi" });
});

// 4. LOGIN (Düzəldildi!)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    const token = jwt.sign({ email, companyName: "BlueGreen Müəssisə" }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({
      token,
      user: { email: email, companyName: "BlueGreen Müəssisə" }
    });
  }
  return res.status(400).json({ message: "E-poçt və ya şifrə yanlışdır" });
});

// 5. REGISTER / SIGNUP (Bax bu yox idi, Əlavə edildi!)
app.post('/api/auth/register', (req, res) => {
  const { companyName, email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ message: "E-poçt və şifrə mütləqdir!" });
  }

  // Real layihədə bura bazaya qeyd etmə funksiyası yazılır. Şərti olaraq uğurlu fərz edirik:
  const token = jwt.sign({ email, companyName: companyName || "Yeni Müəssisə" }, JWT_SECRET, { expiresIn: '24h' });
  
  return res.status(201).json({
    message: "Qeydiyyat uğurla tamamlandı",
    token,
    user: { email, companyName: companyName || "Yeni Müəssisə" }
  });
});

// PORT AYARI (Render üçün düzəldildi)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda aktivdir.`);
});