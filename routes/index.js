const { Router } = require("express");
const User = require("../model/user");
const jwt = require("jsonwebtoken");
const { SECRET, MAX_AGE } = require("../consts")
const { requireLogin } = require("../middleware/authentication");
const Quiz = require("../model/quizModel");
const { requireRole } = require('../middleware/roleAuth');
const router = Router();

const createJwt = (payload) => {
    return jwt.sign({ payload }, SECRET, { expiresIn: MAX_AGE });
}
const multer = require('multer');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/avatars')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage });

// Update user profile
router.put("/users/profile", requireLogin, upload.single('avatar'), async (req, res) => {
    try {
        const { username, currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Handle password change if provided
        if (currentPassword && newPassword) {
            // Verify current password
            const isValidPassword = await user.comparePassword(currentPassword);
            if (!isValidPassword) {
                return res.status(400).json({ message: "Current password is incorrect" });
            }

            // Validate new password
            if (newPassword.length < 8) {
                return res.status(400).json({ message: "New password must be at least 8 characters long" });
            }

            user.password = newPassword;
            await user.save(); // This will trigger the password hashing middleware
        }

        // Handle username and avatar updates
        if (username) user.username = username;
        if (req.file) {
            user.avatar = `/uploads/avatars/${req.file.filename}`;
        }

        await user.save();

        // Return user without password
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(200).json({
            message: "success",
            data: userResponse
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "failed", error: error.message });
    }
});
/**
 * @route POST api/users/register
 * @desc Register new user
 * @access Private
 */
router.post("/users/register", async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        // Validate required fields
        if (!username || !email || !password) {
            return res.status(400).json({
                message: "failed",
                error: "All fields are required"
            });
        }

        // Validate role if provided
        if (role && !['student', 'teacher'].includes(role)) {
            return res.status(400).json({
                message: "failed",
                error: "Invalid role specified"
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                message: "failed",
                error: "Email already registered"
            });
        }

        // Check if username already exists
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({
                message: "failed",
                error: "Username already taken"
            });
        }

        // Create new user with role
        const user = new User({
            username,
            email,
            password,
            role: role || 'student' // Default to student if not specified
        });

        await user.save();

        return res.status(200).json({ message: "success" });
    } catch (error) {
        console.error('Registration error:', error);
        return res.status(400).json({
            message: "failed",
            error: error.message
        });
    }
});

/**
 * @route POST api/users/login
 * @desc Login user
 * @access Public
 */
router.post("/users/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                message: "failed",
                error: "user-not-found",
                details: "Email not found. Please check your email or register."
            });
        }

        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({
                message: "failed",
                error: "invalid-password",
                details: "Invalid password. Please try again."
            });
        }

        const maxAge = 3 * 24 * 60 * 60;
        const token = createJwt(user._id, maxAge);
        res.cookie("auth", token, { 
            httpOnly: true, 
            maxAge: maxAge * 1000,
            sameSite: 'none',
            secure: true,
            domain: '.onrender.com'  // Your Render domain
        });

        const userResponse = user.toObject();
        delete userResponse.password;

        return res.status(200).json({ message: "success", data: userResponse });
    } catch (err) {
        return res.status(500).json({
            message: "failed",
            error: "server-error",
            details: "An unexpected error occurred. Please try again later."
        });
    }
});


/**
 * @route POST api/users/logout
 * @desc Log user out
 * @access Public
 */
router.post("/users/logout", (req, res) => {
    res.clearCookie("auth");
    return res.status(200).json({ message: "success" })
});

/**
 * @route GET api/users
 * @desc Get authenticated user
 * @access Private
 */
router.get("/users", requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('attempts.quizId', 'title') // Populate quiz titles
            .lean();

        return res.status(200).json({
            message: "success",
            data: user
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        return res.status(500).json({
            message: "failed",
            error: error.message
        });
    }
});


// Get all quizzes
router.get('/quizzes', async (req, res) => {
    try {
        const quizzes = await Quiz.find();

        // Calculate statistics for each quiz
        const quizzesWithStats = await Promise.all(quizzes.map(async (quiz) => {
            const stats = await quiz.calculateStats();
            const quizObj = quiz.toObject();
            return {
                ...quizObj,
                attempts: stats.attempts,
                averageScore: stats.averageScore
            };
        }));

        res.json(quizzesWithStats);
    } catch (err) {
        console.error('Error fetching quizzes:', err);
        res.status(500).json({ message: 'Error fetching quizzes' });
    }
});

// Get a single quiz with its questions
router.get('/quizzes/:id', async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        const stats = await quiz.calculateStats();
        const quizObj = quiz.toObject();

        res.json({
            ...quizObj,
            attempts: stats.attempts,
            averageScore: stats.averageScore
        });
    } catch (err) {
        console.error('Error fetching quiz:', err);
        res.status(500).json({ message: 'Error fetching quiz' });
    }
});

// Create a new quiz with multiple questions
// Create a new quiz
router.post('/quizzes', requireLogin, async (req, res) => {
    try {
        const { title, description, category, questions } = req.body;

        const quiz = new Quiz({
            title,
            description,
            category,
            questions
        });

        await quiz.save();
        res.status(201).json(quiz);
    } catch (err) {
        console.error('Error creating quiz:', err);
        res.status(400).json({ message: 'Error creating quiz' });
    }
});
// Save quiz attempt
router.post('/users/attempts', requireLogin, async (req, res) => {
    try {
        const userId = req.user._id;
        const { quizId, score } = req.body;

        // Add attempt to user's attempts array
        req.user.attempts.push({ quizId, score });
        await req.user.save();

        res.status(200).json({ message: 'Attempt saved successfully' });
    } catch (error) {
        console.error('Error saving attempt:', error);
        res.status(500).json({ message: 'Error saving attempt' });
    }
});

// Get leaderboard datarouter.get('/leaderboard', async (req, res) => {
router.get('/leaderboard', async (req, res) => {
    try {
        const quizzes = await Quiz.find().lean();

        const leaderboardData = await Promise.all(quizzes.map(async (quiz) => {
            const users = await User.find({
                'attempts.quizId': quiz._id
            }).select('username attempts');

            const attempts = users.reduce((acc, user) => {
                return acc.concat(
                    user.attempts
                        .filter(attempt => attempt.quizId.toString() === quiz._id.toString())
                        .map(attempt => ({
                            username: user.username,
                            score: attempt.score,
                            timestamp: attempt.timestamp
                        }))
                );
            }, []);

            // Sort attempts by score (descending) and take top 5
            const topAttempts = attempts
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);

            return {
                _id: quiz._id,
                title: quiz.title,
                category: quiz.category,
                attempts: topAttempts,
                totalAttempts: attempts.length,
                averageScore: attempts.length
                    ? +(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length).toFixed(1)
                    : 0
            };
        }));

        res.json(leaderboardData);
    } catch (err) {
        console.error('Error fetching leaderboard:', err);
        res.status(500).json({ message: 'Error fetching leaderboard data' });
    }
});

router.post('/quizzes/create',
    requireLogin,
    requireRole('teacher'),
    async (req, res) => {
        try {
            const { title, category, description, questions } = req.body;

            const quiz = new Quiz({
                title,
                category,
                description,
                questions,
                creator: req.user._id
            });

            await quiz.save();
            res.status(201).json(quiz);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    });

// Update quiz
router.put('/quizzes/:id',
    requireLogin,
    requireRole('teacher'),
    async (req, res) => {
        try {
            const { title, description, category, questions } = req.body;
            const quiz = await Quiz.findById(req.params.id);

            if (!quiz) {
                return res.status(404).json({ message: 'Quiz not found' });
            }

            // Update quiz fields
            quiz.title = title;
            quiz.description = description;
            quiz.category = category;
            quiz.questions = questions;

            await quiz.save();
            res.json(quiz);
        } catch (error) {
            console.error('Error updating quiz:', error);
            res.status(400).json({ message: 'Error updating quiz' });
        }
    });

// Delete quiz
router.delete('/quizzes/:id',
    requireLogin,
    requireRole('teacher'),
    async (req, res) => {
        try {
            const quizId = req.params.id.trim();
            
            if (!quizId || !/^[0-9a-fA-F]{24}$/.test(quizId)) {
                return res.status(400).json({ 
                    message: 'Invalid quiz ID format',
                    error: 'Invalid ObjectId format'
                });
            }

            const quiz = await Quiz.findById(quizId);
            
            if (!quiz) {
                return res.status(404).json({ message: 'Quiz not found' });
            }

            // Use deleteOne instead of remove
            const result = await Quiz.deleteOne({ _id: quizId });
            
            if (result.deletedCount === 0) {
                return res.status(400).json({ message: 'Failed to delete quiz' });
            }

            res.json({ message: 'Quiz deleted successfully' });
        } catch (error) {
            console.error('Error deleting quiz:', error);
            res.status(500).json({ 
                message: 'Error deleting quiz',
                error: error.message 
            });
        }
    }
);

module.exports = router;