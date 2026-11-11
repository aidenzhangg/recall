const code = document.getElementById('pair');
code.value = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
document.getElementById('upload').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('send');
  const status = document.getElementById('status');
  const file = document.getElementById('file').files[0];
  if (!file || file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png'].includes(file.type)) {
    status.textContent = 'Choose a JPEG or PNG under 5 MB.'; return;
  }
  button.disabled = true; status.textContent = 'Sending...';
  const body = new FormData(); body.append('file', file); body.append('notes', document.getElementById('notes').value);
  try {
    const response = await fetch('/api/connect/upload', {method:'POST',headers:{'X-Recall-Pair':code.value.trim()},body,signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(response.status === 401 ? 'Pairing expired or already used. Generate a new code in Recall.' : response.status === 429 ? 'Inbox full. Remove an upload on your computer.' : 'Upload rejected. Check the image type and size.');
    status.textContent = 'Sent. Open Connect in Recall on your computer to import it.';
    document.getElementById('upload').reset();
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not send. Try again.'; button.disabled = false; }
});
