document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('token'); // Use sessionStorage here
  if (!token) {
    window.location.href = '/';
    return;
  }
  loadPendingRequests();

  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('token'); // And remove from sessionStorage on logout
    window.location.href = '/';
  });
});


async function loadPendingRequests() {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch('/api/bookings/pending', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch pending requests.');
    }
    const requests = await response.json();
    console.log("Total pending requests:", requests.length);
    displayPendingRequests(requests);
  } catch (error) {
    document.getElementById('pendingRequests').innerHTML = `<p>${error.message}</p>`;
  }
}

function displayPendingRequests(requests) {
  const container = document.getElementById('pendingRequests');
  container.innerHTML = '';

  if (!requests.length) {
    container.innerHTML = '<p>No pending requests.</p>';
    return;
  }

  requests.forEach(request => {
    console.log("Displaying request:", request.id);
    const div = document.createElement('div');
    div.className = 'pending-request';

    // Convert UTC date to local date correctly
    const localDate = new Date(request.date);
    const formattedDate = localDate.toLocaleDateString('en-GB');

    div.innerHTML = `
      <p><strong>Username:</strong> ${request.username}</p>
      <p><strong>Room:</strong> ${request.room}</p>
      <p><strong>Date:</strong> ${formattedDate}</p>
      <p><strong>Period:</strong> ${request.period}</p>
      <p><strong>Purpose:</strong> ${request.purpose}</p>
      <button onclick="approveRequest(${request.id})" class="approve">Approve</button>
      <button onclick="rejectRequest(${request.id})" class="reject">Reject</button>
      <hr/>
    `;
    container.appendChild(div);
  });
}

async function approveRequest(requestId) {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch('/api/bookings/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ requestId })
    });
    if (!response.ok) {
      throw new Error('Failed to approve request.');
    }
    loadPendingRequests();
  } catch (error) {
    alert(error.message);
  }
}

async function rejectRequest(requestId) {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch('/api/bookings/reject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ requestId })
    });
    if (!response.ok) {
      throw new Error('Failed to reject request.');
    }
    loadPendingRequests();
  } catch (error) {
    alert(error.message);
  }
}

// Set up real-time updates for pending requests using Socket.IO.
const socket = io();
socket.on('pendingRequestUpdate', () => {
  loadPendingRequests();
});
