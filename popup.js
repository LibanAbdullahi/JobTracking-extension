// DOM Elements
const jobsContainer = document.getElementById('jobs-container');
const statusFilter = document.getElementById('status-filter');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refresh-btn');
const settingsBtn = document.getElementById('settings-btn');
const jobTemplate = document.getElementById('job-template');

// State
let jobs = [];
let filteredJobs = [];

// Check authentication before initializing
async function checkAuthentication() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'CHECK_AUTH' });
    if (!response.isAuthenticated) {
      // Show setup required message
      document.getElementById('jobs-container').innerHTML = `
        <div class="setup-required">
          <h2>Setup Required</h2>
          <p>Please configure your Notion integration first.</p>
          <button id="setup-btn" class="primary-button">Setup Integration</button>
        </div>
      `;
      
      document.getElementById('setup-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Authentication check failed:', error);
    return false;
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  const isAuthenticated = await checkAuthentication();
  if (isAuthenticated) {
    await initializePopup();
  }
});

async function initializePopup() {
  setupEventListeners();
  await loadJobs();
}

function setupEventListeners() {
  statusFilter.addEventListener('change', filterJobs);
  searchInput.addEventListener('input', filterJobs);
  refreshBtn.addEventListener('click', loadJobs);
  settingsBtn.addEventListener('click', openOptions);
}

async function loadJobs() {
  showLoading();
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_JOBS'
    });
    
    if (response.success) {
      jobs = response.data;
      console.log('Loaded jobs:', jobs);
      filteredJobs = [...jobs];
      renderJobs();
    } else {
      showError('Failed to load jobs');
    }
  } catch (error) {
    showError('Error communicating with extension');
  }
}

function filterJobs() {
  const status = statusFilter.value;
  const searchTerm = searchInput.value.toLowerCase();
  
  filteredJobs = jobs.filter(job => {
    // Safely get status
    const jobStatus = job.properties?.Status?.select?.name || '';
    const jobTitle = job.properties?.['Job title']?.rich_text?.[0]?.text?.content || '';
    const companyName = job.properties?.['Company name']?.title?.[0]?.text?.content || '';
    
    const matchesStatus = status === 'all' || 
      jobStatus.toLowerCase().replace(' ', '-') === status;
    
    const matchesSearch = 
      jobTitle.toLowerCase().includes(searchTerm) ||
      companyName.toLowerCase().includes(searchTerm);
    
    return matchesStatus && matchesSearch;
  });
  
  renderJobs();
}

function renderJobs() {
  jobsContainer.innerHTML = '';
  
  if (filteredJobs.length === 0) {
    showEmptyState();
    return;
  }
  
  filteredJobs.forEach(job => {
    console.log('Rendering job:', job);
    const jobElement = createJobElement(job);
    jobsContainer.appendChild(jobElement);
  });
}

function createJobElement(job) {
  const clone = jobTemplate.content.cloneNode(true);
  
  // Safely get job properties with fallbacks
  const title = job.properties?.['Job title']?.multi_select?.map(item => item.name).join(', ') || 'No Title';
  const company = job.properties?.['Company name']?.title?.[0]?.text?.content || 'No Company';
  const date = job.properties?.['Date']?.date?.start ? 
    new Date(job.properties.Date.date.start).toLocaleDateString() : 
    'No Date';
  const type = job.properties?.['Type of contract']?.multi_select?.map(item => item.name).join(', ') || 'Not Specified';
  const status = job.properties?.Status?.status?.name || 'To Apply';
  const url = job.properties?.['Job Link']?.rich_text?.[0]?.text?.content || '#';
  
  // Fill in job details
  clone.querySelector('.job-title').textContent = title;
  clone.querySelector('.job-company').textContent = company;
  clone.querySelector('.job-date').textContent = date;
  clone.querySelector('.job-type').textContent = type;
  
  // Setup status select
  const statusSelect = clone.querySelector('.status-select');
  statusSelect.value = status.toLowerCase().replace(' ', '-');
  statusSelect.addEventListener('change', () => updateJobStatus(job.id, statusSelect.value));
  
  // Setup view button
  const viewBtn = clone.querySelector('.view-btn');
  viewBtn.addEventListener('click', () => openInNotion(url));
  
  return clone;
}

async function updateJobStatus(jobId, status) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_STATUS',
      jobId,
      status
    });
    
    if (!response.success) {
      showError('Failed to update status');
    }
  } catch (error) {
    showError('Error communicating with extension');
  }
}

function openInNotion(url) {
  chrome.tabs.create({ url });
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function showLoading() {
  jobsContainer.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading jobs...</p>
    </div>
  `;
}

function showEmptyState() {
  jobsContainer.innerHTML = `
    <div class="empty-state">
      <p>No jobs found matching your filters</p>
    </div>
  `;
}

function showError(message) {
  jobsContainer.innerHTML = `
    <div class="error-state">
      <p>${message}</p>
      <button onclick="loadJobs()" class="retry-btn">Retry</button>
    </div>
  `;
} 