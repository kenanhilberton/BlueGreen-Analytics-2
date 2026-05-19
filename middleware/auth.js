const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  
  const authHeader = req.header('Authorization');
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]; 
  } else {
    
    token = req.header('x-auth-token');
  }

  
  if (!token) {
    return res.status(401).json({ message: 'İcazə verilmədi. Token mövcud deyil.' });
  }

  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gizli_acar_soz');
    
    
    req.user = decoded;
    
    next(); 
  } catch (err) {
    res.status(401).json({ message: 'Token etibarsızdır və ya vaxtı bitib.' });
  }
};