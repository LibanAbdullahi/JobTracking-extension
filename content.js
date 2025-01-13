// Job board configurations
const JOB_BOARDS = {
  linkedin: {
    selectors: {
      title: '.jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title, .jobs-search__job-details--title',
      company: '.jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary',
      location: '.jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__subtitle-primary-grouping .jobs-unified-top-card__bullet',
      description: '.jobs-description__content, .jobs-box__html-content',
      buttonContainer: '.jobs-unified-top-card__actions, .jobs-unified-top-card__button-container, .jobs-s-apply'
    }
  }
};

let lastUrl = null;
let buttonInjectionAttempts = 0;
const MAX_ATTEMPTS = 10;

// Initialize extension
function initializeExtension() {
  const currentUrl = window.location.href;
  console.log('Initializing extension...', currentUrl);
  
  // Reset attempts if URL changed
  if (currentUrl !== lastUrl) {
    buttonInjectionAttempts = 0;
    lastUrl = currentUrl;
  }

  // Check if we're on a job details page
  if (!isJobPage()) {
    console.log('Not a job details page');
    return;
  }

  // Try to inject immediately first
  if (tryInjectButton()) {
    console.log('Button injected immediately');
    return;
  }

  // If immediate injection fails, set up an observer
  if (buttonInjectionAttempts < MAX_ATTEMPTS) {
    console.log('Setting up mutation observer, attempt:', buttonInjectionAttempts + 1);
    setupButtonObserver();
  }
}

function isJobPage() {
  const url = window.location.href;
  return url.includes('/jobs/view/') || 
         (url.includes('/jobs/collections/') && document.querySelector(JOB_BOARDS.linkedin.selectors.buttonContainer)) ||
         (url.includes('/jobs/search/') && document.querySelector(JOB_BOARDS.linkedin.selectors.buttonContainer));
}

function tryInjectButton() {
  buttonInjectionAttempts++;
  console.log('Attempting to inject button, attempt:', buttonInjectionAttempts);

  const buttonContainer = findButtonContainer();
  if (!buttonContainer) {
    console.log('Button container not found');
    return false;
  }

  if (document.getElementById('save-to-notion-btn')) {
    console.log('Save button already exists');
    return true;
  }

  console.log('Found button container:', buttonContainer);
  injectSaveButton(buttonContainer);
  return true;
}

function findButtonContainer() {
  const selectors = JOB_BOARDS.linkedin.selectors.buttonContainer.split(', ');
  for (const selector of selectors) {
    const container = document.querySelector(selector);
    if (container) return container;
  }
  return null;
}

function setupButtonObserver() {
  const observer = new MutationObserver((mutations, obs) => {
    if (buttonInjectionAttempts >= MAX_ATTEMPTS) {
      console.log('Max injection attempts reached, disconnecting observer');
      obs.disconnect();
      return;
    }

    if (tryInjectButton()) {
      console.log('Button injected via observer');
      obs.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function injectSaveButton(buttonContainer) {
  console.log('Injecting save button');
  
  const saveButton = document.createElement('button');
  saveButton.id = 'save-to-notion-btn';
  saveButton.className = 'artdeco-button artdeco-button--2 artdeco-button--primary';
  saveButton.style.marginLeft = '8px';
  saveButton.innerHTML = `
    <span class="artdeco-button__text">
      Save to Notion
    </span>
  `;
  
  saveButton.addEventListener('click', handleSaveJob);
  buttonContainer.appendChild(saveButton);
  console.log('Save button injected successfully');
}

function findContent(selectors) {
  console.log('Finding content for selectors:', selectors);
  const elements = selectors.split(', ').map(s => {
    const el = document.querySelector(s);
    console.log(`Trying selector "${s}":`, el ? 'Found' : 'Not found');
    return el;
  });
  
  const element = elements.find(el => el && el.textContent.trim());
  if (!element) {
    console.log('No element found with content for any selector');
    return '';
  }
  
  const content = element.textContent.trim();
  console.log('Found content:', content);
  return content;
}

async function handleSaveJob() {
  const selectors = JOB_BOARDS.linkedin.selectors;
  const saveButton = document.getElementById('save-to-notion-btn');
  
  try {
    saveButton.disabled = true;
    saveButton.innerHTML = '<span class="artdeco-button__text">Saving...</span>';

    // Extract title with extra logging
    const title = findContent(selectors.title);
    console.log('Extracted title:', title);
    if (!title) {
      console.log('Title not found, trying alternative method...');
      // Try to find title in the URL
      const jobId = window.location.href.match(/view\/(\d+)/);
      if (jobId) {
        const jobTitleElement = document.querySelector(`[data-job-id="${jobId[1]}"] .job-card-list__title`);
        if (jobTitleElement) {
          title = jobTitleElement.textContent.trim();
          console.log('Found title from job card:', title);
        }
      }
    }

    const jobData = {
      title: title || 'No Title',
      company: findContent(selectors.company),
      location: findContent(selectors.location),
      url: window.location.href,
      description: findContent(selectors.description)
    };

    console.log('Final job data to be saved:', jobData);

    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      throw new Error('Chrome runtime is not available. Please check your extension setup.');
    }

    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_JOB',
      data: jobData
    });

    console.log('Save response:', response);

    if (response.success) {
      showNotification('success', 'Job saved to Notion!');
      saveButton.innerHTML = '<span class="artdeco-button__text">✓ Saved to Notion</span>';
    } else {
      throw new Error(response.error || 'Failed to save job');
    }
  } catch (error) {
    console.error('Error saving job:', error);
    showNotification('error', error.message);
    saveButton.disabled = false;
    saveButton.innerHTML = '<span class="artdeco-button__text">Save to Notion</span>';
  }
}

function showNotification(type, message) {
  const notification = document.createElement('div');
  notification.className = `notion-save-notification ${type}`;
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.padding = '12px 20px';
  notification.style.borderRadius = '4px';
  notification.style.backgroundColor = type === 'success' ? '#2ecc71' : '#e74c3c';
  notification.style.color = 'white';
  notification.style.zIndex = '9999';
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Initialize on page load and URL changes
document.addEventListener('DOMContentLoaded', initializeExtension);
window.addEventListener('load', initializeExtension);
window.addEventListener('popstate', initializeExtension);

// Handle LinkedIn's dynamic navigation
let lastCheckedUrl = window.location.href;
setInterval(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastCheckedUrl) {
    console.log('URL changed:', currentUrl);
    lastCheckedUrl = currentUrl;
    buttonInjectionAttempts = 0;
    initializeExtension();
  } else if (isJobPage() && !document.getElementById('save-to-notion-btn')) {
    console.log('Periodic check: trying to inject button');
    tryInjectButton();
  }
}, 1000);
