const jwt = require('jsonwebtoken');
const User = require('../model/user');
const {SECRET} = require("../consts")

module.exports.requireLogin = async (req, res, next) => {
    const token = req.cookies.auth;
    
    if (!token) {
        return res.status(401).json({message: "error", code: "unauthenticated-access"});
    }

    try {
        // Verify the token
        const decoded = jwt.verify(token, SECRET);
        
        // Find the user
        const user = await User.findById(decoded.payload);
        
        if (!user) {
            return res.status(401).json({message: "error", code: "user-not-found"});
        }

        // Attach user to the request object
        req.user = user;
        
        // Continue to the next middleware/route handler
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({message: "error", code: "token-expired"});
        }
        
        console.log(error);
        return res.status(401).json({message: "error", code: "invalid-token"});
    }
};