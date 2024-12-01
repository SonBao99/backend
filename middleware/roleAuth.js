const requireRole = (role) => {
    return (req, res, next) => {
        console.log('Checking role:', role);
        console.log('User role:', req.user?.role);
        
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (req.user.role !== role) {
            return res.status(403).json({ 
                message: 'Access denied',
                details: `Required role: ${role}, User role: ${req.user.role}`
            });
        }

        next();
    };
};

module.exports = { requireRole };