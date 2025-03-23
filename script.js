// Connect to the WebSocket server
const socket = io(); // Automatically connects to the same server

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

async function confirmPurpose() {
    const purpose = document.getElementById('purposeInput').value.trim();
    if (!purpose) {
        showErrorMessage('Purpose is required for booking.');
        return;
    }
    await bookPeriod(selectedRoom, selectedDate, selectedPeriod, purpose);
    hidePurposePopup();
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
    console.log("Login response:", data); // Debug output
    
    if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId); // Store userId for socket communication

        // Redirect HOD users to hod.html
        if (data.role && data.role.toUpperCase() === 'HOD') {
            window.location.href = '/hod.html';
        } else {
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('bookingSection').classList.remove('hidden');
            showSuccessMessage('Login successful!');
            loadPeriods();

            // Register user with socket for real-time updates
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

// --- Event Listeners for Room and Date Changes ---
document.getElementById('room').addEventListener('change', () => {
    loadPeriods();
    hidePurposePopup(); // Hide popup if room changes
});

document.getElementById('date').addEventListener('change', () => {
    loadPeriods();
    hidePurposePopup(); // Hide popup if date changes
});

// --- Load Booking Slots ---
async function loadPeriods() {
    const room = document.getElementById('room').value;
    const date = document.getElementById('date').value;
    if (!room || !date) return;
    
    clearMessages();
    const token = localStorage.getItem('token');
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
            periodDiv.onclick = () => handlePeriodClick(room, date, i + 1);
        }
        periodsDiv.appendChild(periodDiv);
    }
}

function handlePeriodClick(room, date, period) {
    clearMessages();
    selectedRoom = room;
    selectedDate = date;
    selectedPeriod = period;
    showPurposePopup();
}

// --- Book a Period (Send Request) ---
async function bookPeriod(room, date, period, purpose) {
    clearMessages();
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId'); // Retrieve userId for real-time updates

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
        loadPeriods();
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
            slot.classList.add('pending'); // Turn yellow for requesting user
            slot.classList.remove('available');
        }
    }
});

socket.on('pendingRequestUpdate', () => {
    loadPeriods();
});

// Attach functions to global scope so inline handlers can find them.
window.login = login;
window.register = register;
window.toggleForm = toggleForm;
window.confirmPurpose = confirmPurpose;
window.cancelPurpose = cancelPurpose;
