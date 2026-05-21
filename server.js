const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); 
const bcrypt = require('bcryptjs');

const app = express();

// CORS Ayarları - Frontend ilə problemsiz əlaqə üçün
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// SƏNİN REAL AÇARLARIN - Birbaşa koda yazıldı ki, Render problemsiz oxusun
const JWT_SECRET = 'bluegreen_analitika_gizli_acar_2026'; 
const MONGO_URI = 'mongodb+srv://kenanalisov29_db_user:GWehppXLvdwEK9De@cluster0.79bqhp6.mongodb.net/bluegreen_esg?retryWrites=true&w=majority';

// MONGODB-YƏ QOŞULMA STRATEQİYASI
mongoose.connect(MONGO_URI)
  .then(() => console.log('💾 MongoDB-yə UĞURLA QOŞULDU!'))
  .catch(err => console.error('❌ MONGODB QOŞULMA XƏTASI:', err.message));

// --- 1. İSTİFADƏÇİ MODELİ ---
const UserSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  userId: { type: String, required: true, unique: true }, 
  email: { type: String, required: true, unique: true },   
  password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// --- 2. SENSOR MODELİ VƏ AVTOMATİK DATA GENERATORU ---
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

// Süni Data Generatoru (Hər 5 saniyədən bir)
setInterval(async () => {
  try {
    if (mongoose.connection.readyState !== 1) return; // Bazaya qoşulma yoxdursa işləməsin
    
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
    console.error("Sensor datasının yazılmasında kiçik xəta:", err.message);
  }
}, 5000);

// --- 3. API ROUTES ---

app.get('/', (req, res) => {
  res.send('🚀 BlueGreen ESG Backend Server 100% aktivdir və bazaya bağlıdır!');
});

// QEYDİYYAT MARŞRUTU
app.post('/api/auth/register', async (req, res) => {
  try {
    const { companyName, email, password, userId } = req.body;
    
    if (!email || !password || !userId || !companyName) {
      return res.status(400).json({ message: "Bütün xanaları doldurun!" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { userId }] });
    if (existingUser) {
      return res.status(400).json({ message: "Bu e-poçt və ya Müəssisə ID artıq qeydiyyatdan keçib!" });
    }

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
    console.error("❌ QEYDİYYAT XƏTASI:", err.message);
    res.status(500).json({ message: "Qeydiyyat xətası: " + err.message });
  }
});

// GİRİŞ MARŞRUTU
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, userId } = req.body;

    if (!email || !password || !userId) {
      return res.status(400).json({ message: "Müəssisə ID, E-poçt və Şifrə mütləqdir!" });
    }

    const user = await User.findOne({ email, userId });
    if (!user) {
      return res.status(400).json({ message: "Müəssisə ID və ya E-poçt yanlışdır!" });
    }

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (bcryptErr) {
      isMatch = (password === user.password);
    }

    if (!isMatch) {
      return res.status(400).json({ message: "Şifrə yanlışdır!" });
    }

    // Təhlükəsiz Token Yaradılması
    const token = jwt.sign(
      { id: user._id, email: user.email, companyName: user.companyName }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    return res.json({
      token,
      user: {
        email: user.email,
        companyName: user.companyName,
        userId: user.userId
      }
    });

  } catch (err) {
    console.error("❌ GİRİŞ XƏTASI:", err.message);
    return res.status(500).json({ message: "Giriş zamanı server xətası: " + err.message });
  }
});

// CANLI SENSOR DATALARI
app.get('/api/sensors/live', authenticateToken, async (req, res) => {
  try {
    const latestData = await SensorData.findOne().sort({ timestamp: -1 });
    if (!latestData) return res.status(404).json({ message: "Bazada data yoxdur." });
    res.json(latestData);
  } catch (err) {
    res.status(500).json({ message: "Server xətası baş verdi." });
  }
});

// PROFİL YENİLƏMƏ
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { companyName, email, password } = req.body;
    const userId = req.user.id; 

    const updateData = {};
    if (companyName) updateData.companyName = companyName;
    if (email) updateData.email = email;
    
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
    if (!updatedUser) {
      return res.status(404).json({ message: "İstifadəçi tapılmadı." });
    }

    res.json({ message: "Profil uğurla yeniləndi!" });
  } catch (err) {
    res.status(500).json({ message: "Profil yenilənərkən daxili server xətası baş verdi." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server ${PORT} portunda aktivdir.`));