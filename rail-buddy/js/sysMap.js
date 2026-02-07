// Dark Mode Image Switching
function updateImagesForDarkMode() {
  const isDarkMode = document.body.classList.contains('dark-mode');
  
  // Get all images with data-light and data-dark attributes
  const images = document.querySelectorAll('img[data-light][data-dark]');
  images.forEach(img => {
    if (isDarkMode) {
      img.src = img.getAttribute('data-dark');
      img.alt = img.getAttribute('data-dark-alt') || img.alt;
    } else {
      img.src = img.getAttribute('data-light');
      img.alt = img.getAttribute('data-light-alt') || img.alt;
    }
  });
}

// Listen for dark mode changes
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      updateImagesForDarkMode();
    }
  });
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  updateImagesForDarkMode();

  // Observe body for class changes (dark mode toggle)
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Handle map link clicks to open correct PDF based on dark mode
  const mapLink = document.querySelector('.sys-map a');
  if (mapLink) {
    mapLink.addEventListener('click', function(e) {
      e.preventDefault();
      const isDarkMode = document.body.classList.contains('dark-mode');
      const lightHref = 'assets/system-map-lta.pdf';
      const darkHref = 'assets/system-map-lta-dark.pdf';
      const href = isDarkMode ? darkHref : lightHref;
      window.open(href, '_blank');
    });
  }
});