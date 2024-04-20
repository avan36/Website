// Load embedded content from LinkedInPost.html
fetch('LinkedInPost.html')
    .then(response => response.text())
    .then(data => {
        document.getElementById('embeddedContent').innerHTML = data;
    });

// Enhanced Image transition effects with smooth blurring
var images = [
    "https://images.unsplash.com/photo-1604079628040-94301bb21b91?q=80&w=2731&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1604076913837-52ab5629fba9?q=80&w=2731&auto=format&fit=crop"
];

let currentImageIndex = 0;
const headerImage = document.getElementById('header-image');

const changeImage = function () {
    // Begin transition to blur
    headerImage.style.transition = 'none';  // Disable transitions during source change
    headerImage.style.filter = 'blur(8px) brightness(50%)'; // Increase blur

    setTimeout(() => {
        headerImage.src = images[currentImageIndex];
        headerImage.style.transition = 'filter 3s'; // Slow transition for filter
        headerImage.style.filter = 'blur(0px) brightness(50%)'; // Reapply darkening and remove blur slowly
        currentImageIndex = (currentImageIndex + 1) % images.length;
    }, 50); // Short delay before changing the source to allow for blur application

};

setInterval(changeImage, 10000); // Change image every 10 seconds

