// Notion API configuration
const NOTION_API_VERSION = '2022-06-28';

// Authentication state check
async function checkAuthState() {
  const { notionToken, databaseId } = await chrome.storage.local.get(['notionToken', 'databaseId']);
  return { isAuthenticated: !!(notionToken && databaseId), notionToken, databaseId };
}

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(() => {
  // Open options page for initial setup
  chrome.runtime.openOptionsPage();
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.type);
  
  if (request.action === 'CHECK_AUTH') {
    checkAuthState().then(authState => {
      if (!authState.isAuthenticated) {
        // Redirect to options page if not authenticated
        chrome.runtime.openOptionsPage();
      }
      sendResponse(authState);
    });
    return true; // Keep the message channel open for async response
  }
  
  switch (request.type) {
    case 'SAVE_JOB':
      saveJobToNotion(request.data)
        .then(response => {
          console.log('Save job response:', response);
          sendResponse({ success: true, data: response });
        })
        .catch(error => {
          console.error('Save job error:', error);
          if (error.message.includes('unauthorized')) {
            // Redirect to options page if token is invalid
            chrome.runtime.openOptionsPage();
          }
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'UPDATE_STATUS':
      updateJobStatus(request.jobId, request.status)
        .then(response => {
          console.log('Update status response:', response);
          sendResponse({ success: true, data: response });
        })
        .catch(error => {
          console.error('Update status error:', error);
          if (error.message.includes('unauthorized')) {
            chrome.runtime.openOptionsPage();
          }
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'FETCH_JOBS':
      fetchJobsFromNotion()
        .then(jobs => {
          console.log('Fetch jobs response:', jobs);
          sendResponse({ success: true, data: jobs });
        })
        .catch(error => {
          console.error('Fetch jobs error:', error);
          if (error.message.includes('unauthorized')) {
            chrome.runtime.openOptionsPage();
          }
          sendResponse({ success: false, error: error.message });
        });
      return true;
  }
});

// Helper function to get credentials
async function getCredentials() {
  const { notionToken, databaseId } = await chrome.storage.local.get(['notionToken', 'databaseId']);
  if (!notionToken || !databaseId) {
    throw new Error('Notion credentials not configured. Please set up the extension.');
  }
  return { notionToken, databaseId };
}

// Check if Notion credentials are valid
async function checkNotionAuth() {
  try {
    const { notionToken, databaseId } = await getCredentials();
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': NOTION_API_VERSION
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Notion API functions
async function saveJobToNotion(jobData) {
  try {
    console.log('Saving job to Notion:', jobData);
    const { notionToken, databaseId } = await getCredentials();
    
    console.log('Job title before saving:', jobData.title);
    
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          'Company name': { 
            title: [{ text: { content: jobData.company } }] 
          },
          'Job title': { 
            multi_select: Array.isArray(jobData.title) ? jobData.title.map(title => ({ name: title })) : [{ name: jobData.title || 'No Title' }]
          },
          'Date': { 
            date: { start: new Date().toISOString().split('T')[0] }
          },
          'Type of contract': { 
            multi_select: Array.isArray(jobData.type) ? jobData.type.map(type => ({ name: type })) : [{ name: jobData.type || 'Not Specified' }]
          },
          'Offer or spontaneous': { 
            multi_select: Array.isArray(jobData.offer) ? jobData.offer.map(offer => ({ name: offer })) : [{ name: jobData.offer || 'Not Specified' }]
          },
          'Job Link': { 
            rich_text: [{ text: { content: 'Job Ref', link: { url: jobData.url } } }]
          },
          'Status': { 
            status: { name: jobData.status || 'Not started' }
          }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Notion API error:', errorData);
      throw new Error(errorData.message || 'Failed to save to Notion');
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving to Notion:', error);
    throw error;
  }
}

async function updateJobStatus(jobId, status) {
  try {
    console.log('Updating job status:', { jobId, status });
    const { notionToken } = await getCredentials();
    
    const response = await fetch(`https://api.notion.com/v1/pages/${jobId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          'Status': { select: { name: status } }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Notion API error:', errorData);
      throw new Error(errorData.message || 'Failed to update status in Notion');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating status:', error);
    throw error;
  }
}

async function fetchJobsFromNotion() {
  try {
    console.log('Fetching jobs from Notion');
    const { notionToken, databaseId } = await getCredentials();
    
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Notion API error:', errorData);
      throw new Error(errorData.message || 'Failed to fetch jobs from Notion');
    }

    const data = await response.json();
    console.log('Fetched jobs data:', data);
    return data.results;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
}
