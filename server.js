const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server and bind Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
    }
});

// MySQL Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password', // Change as per your MySQL setup
    database: 'bookingSystem',
});

db.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL database');
});

// Set up Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail', // You can change this to your preferred service
    auth: {
        user: process.env.EMAIL_USER,    // Your email address from .env file
        pass: process.env.EMAIL_PASS     // Your email password or app-specific password
    }
});

// =================== API ROUTES ===================

// Register API
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    if (password.length < 4) {
        return res.status(400).json({ message: 'Password must be at least 4 characters long' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword],
            (err) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ message: 'Username already exists' });
                    }
                    return res.status(500).json({ message: 'Database error' });
                }
                res.status(201).json({ message: 'User registered successfully' });
            }
        );
    } catch (error) {
        res.status(500).json({ message: 'Error processing registration' });
    }
});

// Login API (returns token and role)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '2h' });
        res.status(200).json({ token, role: user.role, userId: user.id });
    });
});

// Booking API (JWT Protected)
app.post('/api/bookings', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });

        const { room, date, period, purpose } = req.body;
        const periodEndTimes = ["09:40", "10:30", "11:40", "12:30", "14:20", "15:10", "16:00"];
        if (!room || !date || period < 1 || period > 7 || !purpose) {
            return res.status(400).json({ message: 'Invalid booking data' });
        }
        const endTime = new Date(`${date}T${periodEndTimes[period - 1]}:00`);
        const currentTime = new Date();
        if (endTime < currentTime) {
            return res.status(400).json({ message: 'Cannot book for past times' });
        }

        const userId = decoded.userId;

        // Check if there is an approved booking for this slot.
        db.query(
            'SELECT id FROM bookings WHERE room = ? AND date = ? AND period = ? AND status = ?',
            [room, date, period, 'booked'],
            (err, results) => {
                if (err) return res.status(500).json({ message: 'Database error' });

                if (results.length > 0) {
                    // If slot is already approved/booked, do not allow another booking.
                    return res.status(409).json({ message: 'This slot is already booked.' });
                }

                // Insert the pending booking request
                db.query(
                    'INSERT INTO bookings (userId, room, date, period, endTime, purpose, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [userId, room, date, period, endTime, purpose, 'pending'],
                    (err) => {
                        if (err) {
                            console.error("Booking Error:", err);
                            return res.status(500).json({ message: 'Booking failed (server error)' });
                        }

                        // Emit event only to the requesting user
                        io.to(userId.toString()).emit('slotPending', { room, date, period });

                        // Notify HOD about new request
                        io.emit('pendingRequestUpdate');

                        res.status(201).json({ message: 'Booking request sent for HOD approval' });
                    }
                );
            }
        );
    });
});

// API to get all pending booking requests
app.get('/api/bookings/pending', (req, res) => {
    db.query(
        'SELECT bookings.id, users.username, bookings.room, bookings.date, bookings.period, bookings.purpose FROM bookings JOIN users ON bookings.userId = users.id WHERE bookings.status = "pending"',
        (err, results) => {
            if (err) {
                console.error('Database Error:', err);
                return res.status(500).json({ message: 'Database error' });
            }
            res.json(results);
        }
    );
});

// HOD Approval API with email notification
app.post('/api/bookings/approve', (req, res) => {
    const { requestId } = req.body;
    db.query(
        'UPDATE bookings SET status = ? WHERE id = ? AND status = ?',
        ['booked', requestId, 'pending'],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'Server error' });
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Request not found or already processed' });
            
            // Retrieve the booking details and user email (username)
            db.query(
                'SELECT u.username, b.room, b.date, b.period, b.purpose FROM bookings b JOIN users u ON b.userId = u.id WHERE b.id = ?',
                [requestId],
                (err, results) => {
                    if (err || results.length === 0) {
                        console.error('Error fetching booking/user details:', err);
                    } else {
                        const { username, room, date, period, purpose } = results[0];
                        // Format the date to remove time info
                        const formattedDate = new Date(date).toLocaleDateString('en-GB'); // e.g., "21/03/2025"
                        const mailOptions = {
                            from: process.env.EMAIL_USER,
                            to: username, // Assuming username is the email address
                            subject: 'Booking Approved',
                            text: `Your booking for ${room} on ${formattedDate} during period ${period} (Purpose: ${purpose}) has been approved.`
                        };

                        transporter.sendMail(mailOptions, (error, info) => {
                            if (error) {
                                console.error('Error sending email:', error);
                            } else {
                                console.log('Email sent: ' + info.response);
                            }
                        });
                    }
                }
            );

            io.emit('pendingRequestUpdate', { requestId });
            res.json({ message: 'Booking approved' });
        }
    );
});


// HOD Rejection API
app.post('/api/bookings/reject', (req, res) => {
    const { requestId } = req.body;
    db.query(
        'DELETE FROM bookings WHERE id = ? AND status = ?',
        [requestId, 'pending'],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'Server error' });
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Request not found or already processed' });

            // Optionally, you can also send an email notification for rejection
            io.emit('pendingRequestUpdate', { requestId });
            res.json({ message: 'Booking request rejected and removed' });
        }
    );
});

// Get available booking slots for a room on a specific date
app.get('/api/bookings/availability', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        
        const currentUserId = decoded.userId;
        const { room, date } = req.query;
        if (!room || !date) {
            return res.status(400).json({ message: 'Room and date are required' });
        }
        
        db.query(
            'SELECT period, status, purpose, userId FROM bookings WHERE room = ? AND date = ?',
            [room, date],
            (err, results) => {
                if (err) {
                    console.error('Database Error:', err);
                    return res.status(500).json({ message: 'Database error' });
                }
                
                // Initialize all 7 periods as available
                const periods = Array(7).fill().map(() => ({
                    booked: false,
                    status: null,
                    purpose: null
                }));
                
                results.forEach((booking) => {
                    const periodIndex = booking.period - 1;
                    if (periodIndex >= 0 && periodIndex < 7) {
                        if (booking.status === 'pending' && booking.userId !== currentUserId) {
                            return; // Keep available for other users
                        }
                        periods[periodIndex] = {
                            booked: true,
                            status: booking.status,
                            purpose: booking.purpose
                        };
                    }
                });
                
                res.json(periods);
            }
        );
    });
});

// Socket.IO Connection
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('registerUser', (userId) => {
        socket.join(userId.toString());
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Start Server
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
