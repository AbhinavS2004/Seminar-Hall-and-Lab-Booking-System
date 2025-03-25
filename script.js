// Connect to the WebSocket server
const socket = io(); // Automatically connects to the same server

// Global array to hold selected slots for multi booking.
let selectedSlots = [];

// --- Utility Functions ---
function toggleForm(type) {
    clearMessages();
    if (type === 'register') {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    } else {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    }
}

function showSuccessMessage(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';
}

function showErrorMessage(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function clearMessages() {
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('successMessage').style.display = 'none';
}

// --- Function to open the purpose popup for multi-slot booking ---
function openPurposeForSelection() {
    clearMessages();
    showPurposePopup();
}

// --- Purpose Popup Handling ---
let selectedRoom = null;
let selectedDate = null;
let selectedPeriod = null;

function showPurposePopup() {
    document.getElementById('purposePopup').classList.remove('hidden');
}

function hidePurposePopup() {
    document.getElementById('purposePopup').classList.add('hidden');
    document.getElementById('purposeInput').value = '';
    selectedRoom = null;
    selectedDate = null;
    selectedPeriod = null;
}

function cancelPurpose() {
    hidePurposePopup();
}

// --- Confirm Purpose for Multi-Slot Booking ---
async function confirmPurpose() {
    const purpose = document.getElementById('purposeInput').value.trim();
    if (!purpose) {
        showErrorMessage('Purpose is required for booking.');
        return;
    }
    // Loop through each selected slot and send the booking request.
    for (const slot of selectedSlots) {
        await bookPeriod(slot.room, slot.date, slot.period, purpose);
    }
    hidePurposePopup();
    // Clear the selection after processing.
    selectedSlots = [];
    document.getElementById('bookSelectedBtn').classList.add('hidden');
    loadPeriods();
}

// --- Authentication Functions ---
async function login() {
    clearMessages();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    console.log("Login response:", data);
    
    if (res.ok) {
        // Save token, userId and username in sessionStorage so they persist only for the session.
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('userId', data.userId);
        sessionStorage.setItem('username', username);

        // Redirect HOD users to hod.html
        if (data.role && data.role.toUpperCase() === 'HOD') {
            window.location.href = '/hod.html';
        } else {
            // Hide login and registration forms and show booking dashboard.
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.add('hidden');

            // Display the username on top.
            const userDisplay = document.getElementById('userDisplay');
            userDisplay.textContent = "Username : " + username;
            userDisplay.classList.remove('hidden');

            document.getElementById('bookingSection').classList.remove('hidden');
            showSuccessMessage('Login successful!');
            loadPeriods();

            // Register user with socket for real-time updates.
            socket.emit('registerUser', data.userId);
        }
    } else {
        showErrorMessage(data.message || 'Login failed');
    }
}

async function register() {
    clearMessages();
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (res.ok) {
        showSuccessMessage('Registration successful! Please login.');
        toggleForm('login');
    } else {
        showErrorMessage(data.message || 'Registration failed');
    }
}

// --- User Logout Function ---
function userLogout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userId');
    sessionStorage.removeItem('username');
    window.location.href = '/';
}
window.userLogout = userLogout;

// --- Event Listeners for Room and Date Changes ---
document.getElementById('room').addEventListener('change', () => {
    // Clear any selected slots when room changes.
    selectedSlots = [];
    document.getElementById('bookSelectedBtn').classList.add('hidden');
    loadPeriods();
    hidePurposePopup();
});

document.getElementById('date').addEventListener('change', () => {
    // Clear any selected slots when date changes.
    selectedSlots = [];
    document.getElementById('bookSelectedBtn').classList.add('hidden');
    loadPeriods();
    hidePurposePopup();
});

// --- Load Booking Slots ---
async function loadPeriods() {
    const room = document.getElementById('room').value;
    const date = document.getElementById('date').value;
    if (!room || !date) return;
    
    clearMessages();
    const token = sessionStorage.getItem('token');
    const response = await fetch(`/api/bookings/availability?room=${room}&date=${date}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
        showErrorMessage('Failed to fetch availability data.');
        return;
    }
    
    const periods = await response.json();
    const periodsDiv = document.getElementById('periods');
    periodsDiv.innerHTML = '';
    
    for (let i = 0; i < periods.length; i++) {
        const periodDiv = document.createElement('div');
        periodDiv.className = 'period';
        periodDiv.textContent = i + 1;
        
        if (periods[i].booked) {
            let status = periods[i].status;
            if (status === 'pending') {
                periodDiv.classList.add('pending');
                if (periods[i].purpose) {
                    periodDiv.setAttribute('data-purpose', periods[i].purpose);
                }
                periodDiv.onclick = () => showErrorMessage('Booking request is pending approval.');
            } else if (status === 'booked') {
                periodDiv.classList.add('booked');
                if (periods[i].purpose) {
                    periodDiv.setAttribute('data-purpose', periods[i].purpose);
                }
                periodDiv.onclick = () => showErrorMessage('This period is already booked.');
            }
        } else {
            periodDiv.classList.add('available');
            // Set custom data attributes for multi selection.
            periodDiv.setAttribute('data-room', room);
            periodDiv.setAttribute('data-date', date);
            periodDiv.setAttribute('data-period', i + 1);
            periodDiv.onclick = () => handlePeriodClick(room, date, i + 1);
            
            // If this slot is already selected, add the "selected" style.
            if (selectedSlots.find(slot => slot.room === room && slot.date === date && slot.period === i + 1)) {
                periodDiv.classList.add('selected');
            }
        }
        periodsDiv.appendChild(periodDiv);
    }
}

// --- Slot Click Handler for Multi-Selection ---
function handlePeriodClick(room, date, period) {
    clearMessages();
    // Toggle selection: check if the slot is already selected.
    const slotIndex = selectedSlots.findIndex(slot => slot.room === room && slot.date === date && slot.period === period);
    if (slotIndex > -1) {
        // If already selected, remove from selection.
        selectedSlots.splice(slotIndex, 1);
        const slotElem = document.querySelector(`[data-room="${room}"][data-date="${date}"][data-period="${period}"]`);
        if (slotElem) {
            slotElem.classList.remove('selected');
        }
    } else {
        // Add the slot to the selection.
        selectedSlots.push({ room, date, period });
        const slotElem = document.querySelector(`[data-room="${room}"][data-date="${date}"][data-period="${period}"]`);
        if (slotElem) {
            slotElem.classList.add('selected');
        }
    }
    // Toggle the visibility of the "Book Selected Slots" button based on selection count.
    document.getElementById('bookSelectedBtn').classList.toggle('hidden', selectedSlots.length === 0);
}

// --- Book a Period (Send Request) ---
async function bookPeriod(room, date, period, purpose) {
    clearMessages();
    const token = sessionStorage.getItem('token');
    const userId = sessionStorage.getItem('userId');

    const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ room, date, period, purpose })
    });

    if (response.ok) {
        showSuccessMessage('Booking request sent for HOD approval.');
        socket.emit('bookingRequestMade', { userId, room, date, period });
        await loadPeriods();
    } else {
        const errorData = await response.json();
        console.error(errorData);
        showErrorMessage(errorData.message || 'Booking request failed');
    }
}

// --- Socket.IO Real-Time Updates ---
socket.on('slotPending', ({ room, date, period }) => {
    const currentRoom = document.getElementById('room').value;
    const currentDate = document.getElementById('date').value;
    if (room === currentRoom && date === currentDate) {
        const slot = document.querySelector(`[data-room="${room}"][data-date="${date}"][data-period="${period}"]`);
        if (slot) {
            slot.classList.add('pending'); // Turn yellow for requesting user.
            slot.classList.remove('available');
        }
    }
});

socket.on('pendingRequestUpdate', () => {
    loadPeriods();
});

// --- Check for Token on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    const token = sessionStorage.getItem('token');
    if (token) {
        // User is logged in; hide login and registration forms.
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.add('hidden');

        // Display username if available.
        const username = sessionStorage.getItem('username');
        if (username) {
            const userDisplay = document.getElementById('userDisplay');
            userDisplay.textContent = "Username : " + username;
            userDisplay.classList.remove('hidden');
        }

        // Show the booking dashboard.
        document.getElementById('bookingSection').classList.remove('hidden');
        loadPeriods();

        // Register with Socket.IO.
        const userId = sessionStorage.getItem('userId');
        if (userId) {
            socket.emit('registerUser', userId);
        }
    } else {
        // No token: show login form.
        document.getElementById('loginForm').classList.remove('hidden');
    }
});
