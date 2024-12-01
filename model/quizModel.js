const mongoose = require('mongoose');
const User = require('./user');
const quizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    questions: [{
        question: String,
        options: [String],
        correctAnswer: Number
    }],
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for attempts
quizSchema.virtual('attempts', {
    ref: 'User',
    localField: '_id',
    foreignField: 'attempts.quizId',
    count: true
});

// Method to calculate average score
quizSchema.methods.calculateStats = async function() {
    const users = await User.find({
        'attempts.quizId': this._id
    });

    const attempts = users.reduce((acc, user) => {
        return acc.concat(user.attempts.filter(attempt => 
            attempt.quizId.toString() === this._id.toString()
        ));
    }, []);

    const totalAttempts = attempts.length;
    const totalScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    
    return {
        attempts: totalAttempts,
        averageScore: totalAttempts ? +(totalScore / totalAttempts).toFixed(1) : 0
    };
};

const Quiz = mongoose.model('Quiz', quizSchema);
module.exports = Quiz;