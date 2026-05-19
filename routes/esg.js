const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const EsgData = require('../models/EsgData');


router.get('/data', auth, async (req, res) => {
  try {
    
    let data = await EsgData.find({ userId: req.user.id });

    
    if (data.length === 0) {
      const defaultMonths = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyun', 'İyul', 'Avq', 'Sen', 'Okt', 'Nov', 'Dek'];
      
      const initialData = defaultMonths.map((m, index) => ({
        userId: req.user.id,
        month: m,
        
        scope1: 50 + Math.floor(Math.random() * 20),
        scope2: 60 + Math.floor(Math.random() * 25),
        waterConsumption: 3000 + (index * 120),
        greenEnergyShare: 15 + Math.floor(Math.random() * 10),
        hseDays: 30,
        trainingHours: 15,
        staffTurnover: 1.5,
        employeeSatisfaction: 80 + Math.floor(Math.random() * 10),
        griCompliance: 90 + Math.floor(Math.random() * 8),
        transparencyDegree: 95,
        cyberSecurityTraining: 100,
        lawViolations: 0
      }));

      data = await EsgData.insertMany(initialData);
    }

    res.json(data);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server xətası baş verdi.');
  }
});

module.exports = router;