const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['student', 'teacher'],
        default: 'student'
    },
    registrationDate: {
        type: Date,
        required: true,
        default: Date.now()
    },
    avatar: {
        type: String,
        default: null
    },
    attempts: [{
        quizId: {
            type: Schema.Types.ObjectId,
            ref: 'Quiz', 
            required: true
        },
        score: {
            type: Number,
            required: true
        },
        dateTaken: {
            type: Date,
            default: Date.now
        }
    }]
});

// Add password comparison method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

const User = mongoose.model("User", userSchema);
module.exports = User;