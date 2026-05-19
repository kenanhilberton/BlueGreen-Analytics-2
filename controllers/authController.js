const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


exports.register = async (req, res) => {
  try {
    const { email, password, companyName, userId } = req.body;

    
    const existingId = await User.findOne({ userId });
    if (existingId) {
      return res.status(400).json({ message: 'Bu Müəssisə ID artıq sistemdə mövcuddur.' });
    }

    
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Bu e-poçt ünvanı artıq qeydiyyatdan keçib.' });
    }

    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    
    const newUser = new User({
      userId,
      companyName,
      email,
      password: hashedPassword
    });

    await newUser.save();
    res.status(201).json({ message: 'Müəssisə uğurla qeydiyyatdan keçdi!' });

  } catch (error) {
    res.status(500).json({ message: 'Server xətası baş verdi.', error: error.message });
  }
 };


exports.login = async (req, res) => {
  try {
    const { email, password, userId } = req.body;

    
    const user = await User.findOne({ email, userId });
    if (!user) {
      return res.status(400).json({ message: 'E-poçt, Şifrə və ya Müəssisə ID-si yanlışdır.' });
    }

    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'E-poçt, Şifrə və ya Müəssisə ID-si yanlışdır.' });
    }

    
    const token = jwt.sign(
      { id: user._index, userId: user.userId, companyName: user.companyName },
      process.env.JWT_SECRET || 'gizli_acar_soz',
      { expiresIn: '1d' }
    );

    
    res.status(200).json({
      token,
      user: {
        email: user.email,
        companyName: user.companyName,
        userId: user.userId
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server xətası baş verdi.' });
  }
};