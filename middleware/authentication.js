const jwt = require('jsonwebtoken');
const User = require('../model/user');
const {SECRET} = require("../consts")

module.exports.requireLogin = async (req, res, next) => {
    const token = req.cookies.auth;
    
    if (!token) {
        console.log('No auth token found in cookies');
        return res.status(401).json({
            message: "error", 
            code: "unauthenticated-access",
            details: "No authentication token found"
        });
    }

    try {
        const decoded = jwt.verify(token, SECRET);
        const user = await User.findById(decoded.payload);
        
        if (!user) {
            console.log('User not found for token:', decoded.payload);
            return res.status(401).json({
                message: "error", 
                code: "user-not-found",
                details: "User associated with token not found"
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                message: "error", 
                code: "token-expired",
                details: "Authentication token has expired"
            });
        }
        
        return res.status(401).json({
            message: "error", 
            code: "invalid-token",
            details: error.message
        });
    }
};