// DOM Elements
const notionTokenInput = document.getElementById('notion-token');
const databaseIdInput = document.getElementById('database-id');
const saveButton = document.getElementById('save-btn');
const statusElement = document.getElementById('status');

// Initialize
document.addEventListener('DOMContentLoaded', loadSettings);

// Event Listeners
saveButton.addEventListener('click', saveSettings);

async function loadSettings() {
  const { notionToken, databaseId } = await chrome.storage.local.get(['notionToken', 'databaseId']);
  
  if (notionToken) {
    // Only show last 4 characters of the token for security
    notionTokenInput.value = '•'.repeat(20) + notionToken.slice(-4);
    notionTokenInput.dataset.masked = 'true';
  }
  
  if (databaseId) {
    databaseIdInput.value = databaseId;
  }
}

async function saveSettings() {
  const notionToken = getNotionToken();
  const databaseId = extractDatabaseId(databaseIdInput.value.trim());
  
  if (!notionToken || !databaseId) {
    showStatus('error', 'Please fill in all fields');
    return;
  }
  
  if (!notionToken.startsWith('ntn_')) {
    showStatus('error', 'Invalid Notion token format. Token should start with "ntn_"');
    return;
  }
  
  if (!isValidUUID(databaseId)) {
    showStatus('error', 'Could not find a valid database ID. Please make sure you\'ve copied the correct URL or ID');
    return;
  }
  
  try {
    // Validate the token and database access
    const isValid = await validateNotionCredentials(notionToken, databaseId);
    if (!isValid) {
      showStatus('error', 'Could not access the Notion database. Please check your credentials and database permissions.');
      return;
    }
    
    // Save settings
    await chrome.storage.local.set({
      notionToken,
      databaseId
    });
    
    showStatus('success', 'Settings saved successfully!');
    
    // Update input with cleaned database ID
    databaseIdInput.value = databaseId;
  } catch (error) {
    showStatus('error', `Error: ${error.message}`);
  }
}

function getNotionToken() {
  const value = notionTokenInput.value.trim();
  
  // If the input is masked, return the original token from storage
  if (notionTokenInput.dataset.masked === 'true') {
    return chrome.storage.local.get('notionToken').then(result => result.notionToken);
  }
  
  return value;
}

function extractDatabaseId(input) {
  // Try to extract UUID from various formats
  const patterns = [
    // Full Notion URL format
    /notion\.so\/[^/]+\/([a-f0-9]{32})/i,
    // Just the UUID with dashes
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
    // Just the UUID without dashes
    /([a-f0-9]{32})/i
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      // Remove any dashes from the match
      return match[1].replace(/-/g, '');
    }
  }

  return input; // Return original input if no pattern matches
}

async function validateNotionCredentials(token, databaseId) {
  try {
    console.log('Validating credentials for database:', databaseId);
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Notion API error:', errorData);
      
      if (response.status === 404) {
        showStatus('error', `Database not found or not accessible. Please follow these steps:
          1. Open your database in Notion
          2. Click "..." in the top right
          3. Select "Add connections"
          4. Find and select "${document.title.replace(' - Setup', '')}"
          5. Try saving again`);
        return false;
      }
      
      if (errorData.code === 'unauthorized') {
        showStatus('error', 'Invalid integration token. Please check your token and try again.');
        return false;
      }
      
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error validating credentials:', error);
    showStatus('error', 'Failed to validate credentials. Please check your connection and try again.');
    return false;
  }
}

function isValidUUID(str) {
  // Accept both with and without dashes
  return /^[0-9a-f]{32}$/i.test(str) || 
         /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function showStatus(type, message) {
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  
  // Clear status after 5 seconds
  setTimeout(() => {
    statusElement.className = 'status';
  }, 5000);
}

// Handle input events
notionTokenInput.addEventListener('focus', function() {
  if (this.dataset.masked === 'true') {
    this.value = '';
    this.dataset.masked = 'false';
  }
});

notionTokenInput.addEventListener('blur', async function() {
  if (!this.value) {
    await loadSettings();
  }
}); 