const express = require('express');
const router = express.Router();
const sensorController = require('../controllers/sensorController');
const auth = require('../middleware/auth'); 


router.get('/live', auth, sensorController.getLiveData);


router.post('/data', sensorController.saveSensorData);

module.exports = router;