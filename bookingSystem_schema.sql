CREATE DATABASE IF NOT EXISTS bookingSystem;
USE bookingSystem;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    INDEX idx_username (username)
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    period INT NOT NULL,
    endTime DATETIME NOT NULL,
    purpose VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL,
    userId INT NOT NULL,

    CONSTRAINT fk_user
        FOREIGN KEY (userId)
        REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
