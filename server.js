const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { put, get } = require('@vercel/blob');
const { getAiStatus, chatWithAi, allowAiRequest } = require('./ai');

const app = express();

// CORS - frontend hansı domendən açılsa da işləsin
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// JWT açarı. Vercel/Render-də JWT_SECRET env dəyişəni təyin edilə bilər.
const JWT_SECRET = process.env.JWT_SECRET || 'bluegreen_analitika_gizli_acar_2026';

/* ------------------------------------------------------------------ */
/*  VERİLƏNLƏR BAZASI                                                  */
/*  Vercel-də: Vercel Blob (daimi, bütün instanslar üçün ortaq)          */
/*  Render/lokalda: data/db.json faylı                                 */
/* ------------------------------------------------------------------ */

const USE_BLOB = Boolean(process.env.BLOB_STORE_ID);
const BLOB_PATHNAME = 'bluegreen/db.json';

const DATA_DIR = process.env.DATA_DIR
  || (process.env.VERCEL ? path.join('/tmp', 'bluegreen-data') : path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');

function emptyDb() {
  return { users: [], sensorData: [] };
}

function normalizeDb(parsed) {
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sensorData: Array.isArray(parsed.sensorData) ? parsed.sensorData : []
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readFileDb() {
  try {
    ensureDataDir();
    if (!fs.existsSync(DB_FILE)) {
      writeFileDb(emptyDb());
      return emptyDb();
    }

    const raw = fs.readFileSync(DB_FILE, 'utf8');
    if (!raw.trim()) return emptyDb();

    return normalizeDb(JSON.parse(raw));
  } catch (err) {
    console.error('DB fayl oxunma xətası:', err.message);
    return emptyDb();
  }
}

function writeFileDb(db) {
  ensureDataDir();
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

async function readDb() {
  if (USE_BLOB) {
    const blob = await get(BLOB_PATHNAME, { access: 'private', useCache: false });
    if (!blob) return emptyDb();

    const raw = await new Response(blob.stream).text();
    if (!raw.trim()) return emptyDb();

    return normalizeDb(JSON.parse(raw));
  }

  return readFileDb();
}

async function writeDb(db) {
  if (USE_BLOB) {
    await put(BLOB_PATHNAME, JSON.stringify(db), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });
    return;
  }

  writeFileDb(db);
}

// Eyni instansdakı paralel yazmaları növbəyə salır.
let writeQueue = Promise.resolve();

function updateDb(mutator) {
  const job = async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  };

  const next = writeQueue.then(job, job);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
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

// Göstəriciləri təsadüfi sıçrayışlarla deyil, yumşaq dalğa + kiçik səs-küylə
// dəyişdiririk. Dəyərlər zamana bağlı olduğu üçün bütün server instansları
// eyni trendi göstərir və 20-30 saniyə ərzində kəskin dəyişmir.
function pseudoNoise(now, bucketMs, key) {
  const bucket = Math.floor(now / bucketMs);
  const keyHash = [...key].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  let h = bucket * 374761393 + keyHash * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function wave(now, periodMs, amplitude, phase = 0) {
  return Math.sin((now / periodMs) * Math.PI * 2 + phase) * amplitude;
}

function getLiveReading() {
  const now = Date.now();

  const co2 = 46 + wave(now, 12 * 60 * 1000, 4.5, 0.4) + pseudoNoise(now, 30000, 'co2') * 0.6;
  const energy = 57 + wave(now, 9 * 60 * 1000, 6, 1.7) + pseudoNoise(now, 30000, 'energy') * 0.8;
  const water = 3200 + wave(now, 15 * 60 * 1000, 240, 2.2) + pseudoNoise(now, 30000, 'water') * 35;
  const waste = 76 + wave(now, 25 * 60 * 1000, 2.5, 0.9) + pseudoNoise(now, 30000, 'waste') * 0.4;
  const hse = 324 + wave(now, 6 * 60 * 60 * 1000, 3, 0.2) + pseudoNoise(now, 60000, 'hse') * 0.5;
  const training = 18 + wave(now, 40 * 60 * 1000, 1.2, 2.6) + pseudoNoise(now, 60000, 'training') * 0.25;

  return {
    _id: 'live-' + Math.floor(now / 30000),
    co2Emission: Number(co2.toFixed(2)),
    energyConsumption: Number(energy.toFixed(2)),
    waterUsage: Math.round(water),
    wasteRecycled: Number(waste.toFixed(1)),
    hseIncidents: Math.round(hse),
    trainingHours: Number(training.toFixed(1)),
    timestamp: new Date(now).toISOString()
  };
}

/* ------------------------------------------------------------------ */
/*  API MARŞRUTLARI                                                   */
/* ------------------------------------------------------------------ */

app.get('/', (req, res) => {
  res.send('✅ BlueGreen ESG Backend Server aktivdir!');
});

app.get('/api/health', async (req, res) => {
  try {
    const db = await readDb();
    res.json({
      status: 'ok',
      storage: USE_BLOB ? 'vercel-blob' : 'file',
      users: db.users.length,
      savedSensorReadings: db.sensorData.length
    });
  } catch (err) {
    res.status(500).json({ status: 'error', storage: USE_BLOB ? 'vercel-blob' : 'file', message: err.message });
  }
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

    const db = await readDb();
    const duplicate = db.users.find(
      (u) => u.email === email || String(u.userId).toLowerCase() === userId.toLowerCase()
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

    const created = await updateDb((store) => {
      const exists = store.users.find(
        (u) => u.email === email || String(u.userId).toLowerCase() === userId.toLowerCase()
      );
      if (exists) return false;
      store.users.push(newUser);
      return true;
    });

    if (!created) {
      return res.status(400).json({ message: 'Bu e-poçt və ya Müəssisə ID artıq qeydiyyatdan keçib!' });
    }

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

    const db = await readDb();
    const user = db.users.find(
      (u) => u.email === email && String(u.userId).toLowerCase() === userId.toLowerCase()
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

// AI STATUS — frontend real LLM-in qoşulub-qoşulmadığını bilir
app.get('/api/ai/status', authenticateToken, (req, res) => {
  return res.json(getAiStatus());
});

// AI CHAT — real LLM cavabı. Açar yoxsa frontend lokal köməkçiyə keçir.
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  try {
    const status = getAiStatus();

    if (!status.configured) {
      return res.status(503).json({
        message: 'AI API açarı hələ konfiqurasiya edilməyib.',
        configured: false
      });
    }

    if (!allowAiRequest(req.user.id)) {
      return res.status(429).json({
        message: 'Çox sayda sorğu göndərdiniz. Bir neçə saniyə sonra yenidən cəhd edin.',
        configured: true
      });
    }

    const message = String(req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ message: 'Sual boşdur.', configured: true });
    }
    if (message.length > 2000) {
      return res.status(400).json({ message: 'Sual maksimum 2000 simvol ola bilər.', configured: true });
    }

    const lang = ['az', 'en', 'ru'].includes(req.body.lang) ? req.body.lang : 'az';
    const context =
      req.body.context && typeof req.body.context === 'object' && !Array.isArray(req.body.context)
        ? req.body.context
        : {};

    const result = await chatWithAi({ message, lang, context });

    return res.json({
      answer: result.answer,
      provider: result.provider,
      model: result.model
    });
  } catch (err) {
    const notConfigured = err.code === 'AI_API_NOT_CONFIGURED';
    console.error('AI XƏTASI:', err.message);
    return res.status(notConfigured ? 503 : 502).json({
      message: notConfigured
        ? 'AI API açarı hələ konfiqurasiya edilməyib.'
        : 'AI xidməti cavab vermədi. Zəhmət olmasa yenidən cəhd edin.',
      configured: !notConfigured
    });
  }
});

// CANLI SENSOR DATALARI
// Hər sorğuda yeni göstərici qaytarılır. Bu, Blob-a yazma sayını azaldır.
app.get('/api/sensors/live', authenticateToken, (req, res) => {
  try {
    return res.json(getLiveReading());
  } catch (err) {
    console.error('SENSOR XƏTASI:', err.message);
    return res.status(500).json({ message: 'Sensor məlumatları götürülərkən xəta baş verdi.' });
  }
});

// SENSOR DATASI YAZMAQ (lazım olarsa xarici cihazlar üçün)
app.post('/api/sensors/data', async (req, res) => {
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

    await updateDb((db) => {
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

    const db = await readDb();
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

    await updateDb((store) => {
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
  app.listen(PORT, () => {
    console.log(`✅ Server ${PORT} portunda aktivdir. Baza: ${USE_BLOB ? 'Vercel Blob' : DB_FILE}`);
  });
}

module.exports = app;
