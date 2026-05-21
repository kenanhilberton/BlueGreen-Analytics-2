const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); 
const bcrypt = require('bcryptjs'); // Yeni yüklədiyimiz şifrələmə paketi

const app = express();

// Netlify-dan gələn sorğuları bloklamamaq üçün CORS ayarı
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'bluegreen_secret_key_123'; 
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bluegreen_esg';

mongoose.connect(MONGO_URI)
  .then(() => console.log('💾 MongoDB-yə uğurla qoşuldu!'))
  .catch(err => console.error('❌ MongoDB qoşulma xətası:', err));

// --- 1. REAL İSTİFADƏÇİ MODELİ ---
const UserSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  userId: { type: String, required: true, unique: true }, // Unikal Müəssisə ID
  email: { type: String, required: true, unique: true },   // Unikal E-poçt
  password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// --- 2. SENSOR MODELİ VƏ İNTERVAL ---
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

// --- 3. API MARŞRUTLARI (ROUTES) ---

app.get('/', (req, res) => {
  res.send('🚀 BlueGreen ESG Backend Server rəsmi olaraq aktivdir!');
});

// QEYDİYYAT ROUTE-U (Şifrəni gizlədir və bazaya yazır)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { companyName, email, password, userId } = req.body;
    
    if (!email || !password || !userId || !companyName) {
      return res.status(400).json({ message: "Bütün xanaları doldurun!" });
    }

    // Eyni mail və ya ID varammı yoxlayırıq
    const existingUser = await User.findOne({ $or: [{ email }, { userId }] });
    if (existingUser) {
      return res.status(400).json({ message: "Bu e-poçt və ya Müəssisə ID artıq qeydiyyatdan keçib!" });
    }

    // Şifrəni bazaya yazmazdan əvvəl rəsmən şifrləyirik (Hash edirik)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      companyName,
      email,
      userId,
      password: hashedPassword
    });

    await newUser.save();
    res.status(201).json({ message: "Qeydiyyat uğurla tamamlandı!" });

  } catch (err) {
    res.status(500).json({ message: "Qeydiyyat zamanı server xətası baş verdi." });
  }
});

// GİRİŞ ROUTE-U (Artıq təsadüfi mailləri bloklayır, bazadan yoxlayır)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, userId } = req.body;

    if (!email || !password || !userId) {
      return res.status(400).json({ message: "Bütün xanaları doldurun!" });
    }

    // İstifadəçini bazadan axtarırıq
    const user = await User.findOne({ email, userId });
    if (!user) {
      return res.status(400).json({ message: "Müəssisə ID və ya E-poçt yanlışdır!" });
    }

    // Şifrənin düzgünlüyünü yoxlayırıq
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Şifrə yanlışdır!" });
    }

    // Hər şey düzdürsə, token yaradırıq
    const token = jwt.sign({ id: user._id, email: user.email, companyName: user.companyName }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({
      token,
      user: {
        email: user.email,
        companyName: user.companyName,
        userId: user.userId
      }
    });

  } catch (err) {
    res.status(500).json({ message: "Giriş zamanı server xətası baş verdi." });
  }
});

// LIVE SENSORS
app.get('/api/sensors/live', authenticateToken, async (req, res) => {
  try {
    const latestData = await SensorData.findOne().sort({ timestamp: -1 });
    if (!latestData) return res.status(404).json({ message: "Bazada data yoxdur." });
    res.json(latestData);
  } catch (err) {
    res.status(500).json({ message: "Server xətası baş verdi." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda aktivdir.`));