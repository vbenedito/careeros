// Placeholder popup for the build pipeline (#4). The real popup (React, EXT-UI) arrives in #20.
const root = document.getElementById("root");
if (root) {
  root.textContent = `CareerOS ${chrome.runtime.getManifest().version}`;
}
