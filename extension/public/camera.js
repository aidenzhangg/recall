// Asks for camera permission in a normal tab. Once granted for the extension, the side panel can use the camera too.
const title = document.getElementById('title');
const text = document.getElementById('text');
const button = document.getElementById('ask');

async function ask() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    title.textContent = 'Camera allowed';
    text.textContent = 'Go back to Recall. Camera focus turns on by itself. You can close this tab.';
    button.hidden = true;
    setTimeout(() => window.close(), 2500);
  } catch (error) {
    const name = error && error.name;
    title.textContent = name === 'NotFoundError' ? 'No camera found' : 'Camera is blocked';
    text.textContent = name === 'NotFoundError'
      ? 'Plug in or enable a camera, then press Ask again.'
      : 'Click the camera or lock icon at the left of the address bar, set Camera to Allow, then press Ask again.';
  }
}
button.addEventListener('click', ask);
ask();
