// Keep the old entry usable for unpacked-extension upgrades. Do not redirect:
// a still-loaded old content script would send the user straight back here.
document.querySelector('#manage').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  } catch {
    document.querySelector('#status').textContent = '请在地址栏输入 chrome://extensions（Edge 使用 edge://extensions），找到专注 B站并重新加载。';
  }
});
