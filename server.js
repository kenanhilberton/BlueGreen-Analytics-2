const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

// CORS - frontend hansı domendən açılsa da işləsin
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// JWT açarı. Render/Vercel-də JWT_SECRET env dəyişəni təyin edilə bilər.
const JWT_SECRET = process.env.JWT_SECRET || 'bluegreen_analitika_gizli_acar_2026';

/* ------------------------------------------------------------------ */
/*  FAYL ƏSASLI VERİLƏNLƏR BAZASI                                      */
/*  Xarici MongoDB-yə ehtiyac yoxdur. Bütün məlumat db.json faylında    */
/*  saxlanılır. Render-də repo qovluğunda, Vercel-də isə /tmp-də.       */
/* ------------------------------------------------------------------ */

const DATA_DIR = process.env.DATA_DIR
  || (process.env.VERCEL ? path.join('/tmp', 'bluegreen-data') : path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const EMPTY_DB = { users: [], sensorData: [] };

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readDb() {
  try {
    ensureDataDir();
    if (!fs.existsSync(DB_FILE)) {
      writeDb(EMPTY_DB);
      return { ...EMPTY_DB };
    }

    const raw = fs.readFileSync(DB_FILE, 'utf8');
    if (!raw.trim()) return { ...EMPTY_DB };

    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sensorData: Array.isArray(parsed.sensorData) ? parsed.sensorData : []
    };
  } catch (err) {
    console.error('DB oxunma xətası:', err.message);
    return { ...EMPTY_DB };
  }
}

function writeDb(db) {
  ensureDataDir();
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

// Kiçik bazada sinxron yazma kifayətdir və paralel sorğularda məlumat itmir.
function updateDb(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

/* ------------------------------------------------------------------ */
/*  KÖMƏKÇİ FUNKSİYALAR                                               */
/* ------------------------------------------------------------------ */

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    companyName: user.companyName,
    userId: user.userId
  };
}

function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      companyName: user.companyName,
      userId: user.userId
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token tapılmadı. Yenidən daxil olun.' });
  }

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(403).json({ message: 'Token etibarsızdır. Yenidən daxil olun.' });
    }
    req.user = payload;
    next();
  });
}

function randomReading() {
  return {
    _id: crypto.randomUUID(),
    co2Emission: Number((Math.random() * 60 + 30).toFixed(2)),
    energyConsumption: Number((Math.random() * 60 + 25).toFixed(2)),
    waterUsage: Math.floor(Math.random() * 2000 + 2000),
    wasteRecycled: Math.floor(Math.random() * 30 + 65),
    hseIncidents: Math.floor(Math.random() * 65 + 300),
    trainingHours: Math.floor(Math.random() * 14 + 10),
    timestamp: new Date().toISOString()
  };
}

// Hər dəfə canlı data istənəndə 4 saniyədən köhnə məlumat varsa yenisi yaradılır.
function getOrCreateLiveReading() {
  return updateDb((db) => {
    const last = db.sensorData[db.sensorData.length - 1];
    const lastTime = last ? new Date(last.timestamp).getTime() : 0;
    const isStale = !last || !Number.isFinite(lastTime) || Date.now() - lastTime > 4000;

    if (isStale) {
      db.sensorData.push(randomReading());
      if (db.sensorData.length > 100) {
        db.sensorData = db.sensorData.slice(-100);
      }
      return db.sensorData[db.sensorData.length - 1];
    }

    return last;
  });
}

/* ------------------------------------------------------------------ */
/*  API MARŞRUTLARI                                                   */
/* ------------------------------------------------------------------ */

app.get('/', (req, res) => {
  res.send('✅ BlueGreen ESG Backend Server aktivdir və fayl əsaslı bazaya qoşulub!');
});

app.get('/api/health', (req, res) => {
  const db = readDb();
  res.json({
    status: 'ok',
    storage: 'file',
    dbFile: DB_FILE,
    users: db.users.length,
    sensorReadings: db.sensorData.length
  });
});

// QEYDİYYAT
app.post('/api/auth/register', async (req, res) => {
  try {
    const companyName = normalizeText(req.body.companyName);
    const userId = normalizeText(req.body.userId);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!companyName || !userId || !email || !password) {
      return res.status(400).json({ message: 'Bütün xanaları doldurun!' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Şifrə ən azı 6 simvoldan ibarət olmalıdır!' });
    }

    const db = readDb();
    const duplicate = db.users.find(
      (u) => u.email === email || u.userId.toLowerCase() === userId.toLowerCase()
    );

    if (duplicate) {
      return res.status(400).json({ message: 'Bu e-poçt və ya Müəssisə ID artıq qeydiyyatdan keçib!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      _id: crypto.randomUUID(),
      companyName,
      userId,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    updateDb((store) => {
      // Paralel qeydiyyat sorğusu üçün son yoxlama
      const exists = store.users.find(
        (u) => u.email === email || u.userId.toLowerCase() === userId.toLowerCase()
      );
      if (!exists) store.users.push(newUser);
    });

    return res.status(201).json({
      message: 'Qeydiyyat uğurla tamamlandı!',
      user: publicUser(newUser)
    });
  } catch (err) {
    console.error('QEYDİYYAT XƏTASI:', err.message);
    return res.status(500).json({ message: 'Qeydiyyat zamanı server xətası: ' + err.message });
  }
});

// GİRİŞ
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const userId = normalizeText(req.body.userId);
    const password = String(req.body.password || '');

    if (!email || !password || !userId) {
      return res.status(400).json({ message: 'Müəssisə ID, e-poçt və şifrə mütləqdir!' });
    }

    const db = readDb();
    const user = db.users.find(
      (u) => u.email === email && u.userId.toLowerCase() === userId.toLowerCase()
    );

    if (!user) {
      return res.status(400).json({ message: 'Müəssisə ID və ya e-poçt yanlışdır!' });
    }

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (bcryptErr) {
      // Köhnə bazadan qalan açıq mətnli şifrələr üçün geriyə uyğunluq
      isMatch = password === user.password;
    }

    if (!isMatch) {
      return res.status(400).json({ message: 'Şifrə yanlışdır!' });
    }

    return res.json({
      token: signToken(user),
      user: publicUser(user)
    });
  } catch (err) {
    console.error('GİRİŞ XƏTASI:', err.message);
    return res.status(500).json({ message: 'Giriş zamanı server xətası: ' + err.message });
  }
});

// CANLI SENSOR DATALARI
app.get('/api/sensors/live', authenticateToken, (req, res) => {
  try {
    const reading = getOrCreateLiveReading();
    return res.json(reading);
  } catch (err) {
    console.error('SENSOR XƏTASI:', err.message);
    return res.status(500).json({ message: 'Sensor məlumatları götürülərkən xəta baş verdi.' });
  }
});

// SENSOR DATASI YAZMAQ (lazım olarsa xarici cihazlar üçün)
app.post('/api/sensors/data', (req, res) => {
  try {
    const {
      co2Emission,
      energyConsumption,
      waterUsage,
      wasteRecycled,
      hseIncidents,
      trainingHours
    } = req.body;

    const reading = {
      _id: crypto.randomUUID(),
      co2Emission: Number(co2Emission) || 0,
      energyConsumption: Number(energyConsumption) || 0,
      waterUsage: Number(waterUsage) || 0,
      wasteRecycled: Number(wasteRecycled) || 0,
      hseIncidents: Number(hseIncidents) || 0,
      trainingHours: Number(trainingHours) || 0,
      timestamp: new Date().toISOString()
    };

    updateDb((db) => {
      db.sensorData.push(reading);
      if (db.sensorData.length > 100) db.sensorData = db.sensorData.slice(-100);
    });

    return res.status(201).json({ message: 'Sensor məlumatı uğurla yazıldı!', data: reading });
  } catch (err) {
    console.error('SENSOR YAZMA XƏTASI:', err.message);
    return res.status(500).json({ message: 'Sensor məlumatı qeyd edilərkən xəta baş verdi.' });
  }
});

// PROFİL YENİLƏMƏ
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const companyName = req.body.companyName !== undefined ? normalizeText(req.body.companyName) : null;
    const email = req.body.email !== undefined ? normalizeEmail(req.body.email) : null;
    const password = req.body.password ? String(req.body.password) : null;

    const db = readDb();
    const user = db.users.find((u) => u._id === req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'İstifadəçi tapılmadı.' });
    }

    if (email && email !== user.email) {
      const emailTaken = db.users.some((u) => u._id !== user._id && u.email === email);
      if (emailTaken) {
        return res.status(400).json({ message: 'Bu e-poçt artıq başqa hesabda istifadə olunur!' });
      }
    }

    let hashedPassword = null;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Şifrə ən azı 6 simvoldan ibarət olmalıdır!' });
      }
      hashedPassword = await bcrypt.hash(password, 10);
    }

    updateDb((store) => {
      const target = store.users.find((u) => u._id === req.user.id);
      if (!target) return;
      if (companyName) target.companyName = companyName;
      if (email) target.email = email;
      if (hashedPassword) target.password = hashedPassword;
    });

    return res.json({ message: 'Profil uğurla yeniləndi!' });
  } catch (err) {
    console.error('PROFİL XƏTASI:', err.message);
    return res.status(500).json({ message: 'Profil yenilənərkən daxili server xətası baş verdi.' });
  }
});

// JSON parse xətaları üçün
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Göndərilən JSON düzgün deyil.' });
  }
  console.error('ÜMUMİ XƏTA:', err.message);
  return res.status(500).json({ message: 'Daxili server xətası.' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Marşrut tapılmadı.' });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`✅ Server ${PORT} portunda aktivdir.`));
}

module.exports = app;
