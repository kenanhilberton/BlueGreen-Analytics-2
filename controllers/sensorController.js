const Sensor = require('../models/Sensor');


exports.getLiveData = async (req, res) => {
  try {
    
    const { userId } = req.user; 

    
    const latestData = await Sensor.findOne({ userId })
                                   .sort({ timestamp: -1 });

    if (!latestData) {
      return res.status(404).json({ message: 'Bu müəssisə üçün hələ heç bir sensor məlumatı tapılmadı.' });
    }

    res.status(200).json(latestData);
  } catch (error) {
    res.status(500).json({ message: 'Sensor məlumatları gətirilərkən xəta baş verdi.', error: error.message });
  }
};


exports.saveSensorData = async (req, res) => {
  try {
    const { userId, co2Emission, energyConsumption, waterUsage, wasteRecycled, hseIncidents, trainingHours } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'Müəssisə ID (userId) mütləq göndərilməlidir.' });
    }

    const newSensorData = new Sensor({
      userId,
      co2Emission,
      energyConsumption,
      waterUsage,
      wasteRecycled,
      hseIncidents,
      trainingHours
    });

    await newSensorData.save();
    res.status(201).json({ message: 'Sensor məlumatı uğurla bazaya yazıldı!', data: newSensorData });
  } catch (error) {
    res.status(500).json({ message: 'Sensor məlumatı qeyd edilərkən xəta baş verdi.', error: error.message });
  }
};