// Browser detection only tailors guidance; the native event decides prompt availability.
export function installationSteps(nav) {
  const ua = nav.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  if (ios) return ['Open the browser’s Share menu (you may find it inside the menu button).', 'Choose Add to Home Screen, enable Open as Web App if offered, then tap Add.', 'If that option is missing, open this address in Safari and use Share → Add to Home Screen.'];
  if (/Android/.test(ua)) {
    if (/Firefox\//.test(ua)) return ['Open Firefox’s three-dot menu and tap Install.', 'Confirm Add to Home Screen or Add automatically.'];
    return ['Open the browser menu and choose Install app or Add to Home screen.', 'Confirm installation. If neither option appears, try Chrome or Firefox for Android.'];
  }
  if (/Firefox\//.test(ua)) {
    if (/Windows/.test(ua)) return ['Some Firefox versions on Windows offer an Install this site as an app button in the address bar.', 'If that button is missing, this Firefox setup has no built-in installation option. You can keep using Verdant here, or install it through Chrome or Edge.'];
    return ['Firefox on this desktop does not offer built-in app installation.', 'Keep using Verdant in Firefox, or open this address in Chrome or Edge to install it. On macOS, recent Safari versions also offer Add to Dock.'];
  }
  if (/Edg\//.test(ua)) return ['Open Edge’s three-dot menu → More tools → Apps → Install this site as an app.', 'You can also use the app installation icon in the address bar, if shown.'];
  if (/Chrome\/|Chromium\//.test(ua)) return ['Open Chrome’s three-dot menu → Cast, save, and share → Install page as app.', 'You can also use the install icon in the address bar, if shown.'];
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)) return ['In Safari on a recent macOS version, choose File → Add to Dock (also available in Share).', 'If that option is missing, try a current version of Safari, Chrome or Edge.'];
  return ['Look for an install icon in the address bar, or Install app in the browser menu (sometimes under Apps or Save and share).', 'If no installation option is available, try a current version of Chrome or Edge. You can also keep using Verdant in this browser.'];
}

export function setupInstallHelper(win, doc) {
  let pendingPrompt = null;
  let installed = false;
  let prompting = false;
  let activeDialog = null;
  const preferenceKey = 'verdant-install-offer-v1';
  let offeredThisSession = false;
  const remember = value => { try { win.localStorage.setItem(preferenceKey, value); } catch { /* Storage may be blocked. */ } };
  const displays = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].map(mode => win.matchMedia(`(display-mode: ${mode})`));
  const inApp = () => installed || win.navigator.standalone === true || displays.some(query => query.matches);
  const button = () => doc.querySelector('[data-action="install-app"]');
  const update = () => { if (button()) button().hidden = inApp(); };
  // Register before the main application loads so an early prompt is retained.
  win.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (!inApp()) pendingPrompt = event;
  });
  win.addEventListener('appinstalled', () => { installed = true; pendingPrompt = null; update(); });
  for (const query of displays) query.addEventListener('change', update);

  function openDialog(content) {
    if (activeDialog) return null;
    const previousFocus = doc.activeElement;
    const dialog = doc.createElement('dialog');
    activeDialog = dialog;
    dialog.className = 'install-dialog';
    dialog.setAttribute('aria-labelledby', 'install-title');
    dialog.innerHTML = content;
    dialog.addEventListener('close', () => {
      if (activeDialog === dialog) activeDialog = null;
      dialog.remove();
      if (!activeDialog && previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    }, {once:true});
    return dialog;
  }

  function showInstructions() {
    const dialog = openDialog('<h2 id="install-title">Install Verdant</h2><p>Add Verdant to your home screen or desktop for quick access.</p><ol></ol><p class="muted">Menu names vary by browser and version.</p><p class="muted">Your garden stays in this browser. Before switching browsers, export a backup in Settings and restore it in the new browser.</p><div class="install-actions"><button type="button" class="btn btn-primary" data-install-close>Got it</button></div>');
    if (!dialog) return;
    // Explicit close avoids the application's delegated form-submit handler.
    dialog.querySelector('[data-install-close]').onclick = () => dialog.close();
    for (const step of installationSteps(win.navigator)) {
      const item = doc.createElement('li');
      item.textContent = step;
      dialog.querySelector('ol').append(item);
    }
    doc.body.append(dialog);
    dialog.showModal();
  }

  async function install() {
    if (inApp() || prompting) return;
    if (!pendingPrompt) { showInstructions(); return; }
    const event = pendingPrompt;
    pendingPrompt = null; // Each event may only be used once, including after dismissal.
    prompting = true;
    try {
      await event.prompt();
      await event.userChoice;
      // Acceptance isn't proof of completion; appinstalled hides the action.
    } catch {
      if (!inApp()) showInstructions();
    } finally {
      prompting = false;
    }
  }
  function offerOnce() {
    if (offeredThisSession || inApp() || doc.querySelector('dialog[open], .modal-backdrop')) return;
    offeredThisSession = true;
    try { if (win.localStorage.getItem(preferenceKey)) return; } catch { /* Still offer once this session. */ }
    const dialog = openDialog('<h2 id="install-title">Install Verdant?</h2><p>Add Verdant to your home screen or desktop for quick access. Would you like installation help?</p><div class="install-actions"><button type="button" class="btn btn-outline" data-install-no>No thanks</button><button type="button" class="btn btn-primary" data-install-yes>Show me how</button></div>');
    if (!dialog) return;
    const decline = () => { remember('declined'); dialog.close(); };
    dialog.querySelector('[data-install-no]').onclick = decline;
    dialog.addEventListener('cancel', event => { event.preventDefault(); decline(); });
    dialog.querySelector('[data-install-yes]').onclick = () => {
      remember('accepted');
      dialog.close();
      // close events are queued: release the old dialog before opening instructions.
      // Keep the native prompt in this click handler to retain user activation.
      if (activeDialog === dialog) activeDialog = null;
      install();
    };
    doc.body.append(dialog);
    dialog.showModal();
  }
  return {update, install, offerOnce};
}
