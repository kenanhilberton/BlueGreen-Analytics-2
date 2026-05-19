const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');


router.post('/register', async (req, res) => {
  const { companyName, email, password } = req.body;

  try {
    
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'Bu e-poçt ünvanı ilə artıq qeydiyyatdan keçilib.' });
    }

    
    user = new User({
      companyName,
      email,
      password
    });

    
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    
    await user.save();

    
    const payload = { user: { id: user.id } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'bluegreen_secret_key',
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({
          token,
          user: { email: user.email, companyName: user.companyName }
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server xətası baş verdi.');
  }
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'E-poçt və ya şifrə yanlışdır.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'E-poçt və ya şifrə yanlışdır.' });
    }

    const payload = { user: { id: user.id } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'bluegreen_secret_key',
      { expiresIn: '24h' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: { email: user.email, companyName: user.companyName }
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server xətası baş verdi.');
  }
});


router.put('/profile/update', auth, async (req, res) => {
  const { companyName, email, password } = req.body;
  const updateFields = {};

  if (companyName) updateFields.companyName = companyName;
  if (email) updateFields.email = email.toLowerCase();

  try {
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateFields.password = await bcrypt.hash(password, salt);
    }

    let user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server xətası baş verdi.');
  }
});

module.exports = router;